import json
from collections.abc import AsyncIterator
from dataclasses import dataclass

import httpx

from semantica.settings import Settings

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models"
TIMEOUT = httpx.Timeout(90, connect=10)


@dataclass(frozen=True)
class LlmError:
    reason: str
    retryable: bool = False


Message = dict[str, str]


async def stream_chat(
    settings: Settings, messages: list[Message], temperature: float = 0.2
) -> AsyncIterator[str | LlmError]:
    if not settings.gemini_api_key:
        yield LlmError("Aucune clé Gemini configurée (SEMANTICA_GEMINI_API_KEY).")
        return
    payload = _payload(messages, {"temperature": temperature})
    error = LlmError("Aucun modèle de génération configuré.")
    for model in settings.llm_models:
        url = f"{GEMINI_URL}/{model}:streamGenerateContent?alt=sse"
        produced = False
        try:
            async with (
                httpx.AsyncClient(timeout=TIMEOUT) as client,
                client.stream("POST", url, json=payload, headers=_headers(settings)) as response,
            ):
                if response.status_code != 200:
                    error = _http_error(response.status_code, (await response.aread()).decode())
                    if error.retryable:
                        continue
                    yield error
                    return
                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    text = _text(json.loads(line[6:]))
                    if text:
                        produced = True
                        yield text
                return
        except httpx.HTTPError as exc:
            error = LlmError(f"Erreur réseau vers Gemini : {type(exc).__name__}", retryable=True)
            # Changer de modèle au milieu d'une réponse déjà diffusée la ferait bégayer.
            if produced:
                yield error
                return
    yield error


async def complete_json(
    settings: Settings, messages: list[Message], temperature: float = 0.7
) -> dict | LlmError:
    if not settings.gemini_api_key:
        return LlmError("Aucune clé Gemini configurée (SEMANTICA_GEMINI_API_KEY).")
    payload = _payload(
        messages, {"temperature": temperature, "responseMimeType": "application/json"}
    )
    error = LlmError("Aucun modèle de génération configuré.")
    for model in settings.llm_models:
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                response = await client.post(
                    f"{GEMINI_URL}/{model}:generateContent",
                    json=payload,
                    headers=_headers(settings),
                )
        except httpx.HTTPError as exc:
            error = LlmError(f"Erreur réseau vers Gemini : {type(exc).__name__}", retryable=True)
            continue
        if response.status_code != 200:
            error = _http_error(response.status_code, response.text)
            if error.retryable:
                continue
            return error
        try:
            return json.loads(_text(response.json()))
        except json.JSONDecodeError:
            return LlmError("Réponse JSON invalide du modèle.", retryable=True)
    return error


def _payload(messages: list[Message], generation: dict) -> dict:
    system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
    contents = [
        {"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]}
        for m in messages
        if m["role"] != "system"
    ]
    payload: dict = {"contents": contents, "generationConfig": generation}
    if system:
        payload["systemInstruction"] = {"parts": [{"text": system}]}
    return payload


def _text(chunk: dict) -> str:
    candidates = chunk.get("candidates") or [{}]
    parts = candidates[0].get("content", {}).get("parts", [])
    return "".join(part.get("text", "") for part in parts if not part.get("thought"))


def _headers(settings: Settings) -> dict[str, str]:
    return {"x-goog-api-key": settings.gemini_api_key or ""}


def _http_error(status: int, body: str) -> LlmError:
    if status == 429:
        return LlmError("Quota Gemini atteint, réessayez dans une minute.", retryable=True)
    if status == 503:
        return LlmError("Modèle Gemini saturé, réessayez dans un instant.", retryable=True)
    if status in (401, 403):
        return LlmError("Clé Gemini invalide ou sans accès à ce modèle.")
    return LlmError(f"Gemini a répondu HTTP {status} : {body[:200]}", retryable=status >= 500)
