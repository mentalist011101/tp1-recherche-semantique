import time
from threading import Lock

from fastapi import HTTPException, Request


class RateLimiter:
    def __init__(self, capacity: int, refill_per_minute: float) -> None:
        self._capacity = capacity
        self._rate = refill_per_minute / 60
        self._buckets: dict[str, tuple[float, float]] = {}
        self._lock = Lock()

    def check(self, request: Request) -> None:
        key = _client_ip(request)
        now = time.monotonic()
        with self._lock:
            tokens, updated = self._buckets.get(key, (self._capacity, now))
            tokens = min(self._capacity, tokens + (now - updated) * self._rate)
            if tokens < 1:
                retry_after = int((1 - tokens) / self._rate) + 1
                raise HTTPException(
                    429,
                    "Trop de recherches à la suite, patientez un instant.",
                    headers={"Retry-After": str(retry_after)},
                )
            self._buckets[key] = (tokens - 1, now)


def _client_ip(request: Request) -> str:
    # Derrière le proxy de Hugging Face Spaces, l'IP du visiteur n'est que dans cet en-tête.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "inconnu"
