import json
import re
import time
from dataclasses import dataclass

import httpx
import numpy as np
from huggingface_hub import InferenceClient
from huggingface_hub.errors import HfHubHTTPError

ROUTER_URL = "https://router.huggingface.co"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models"
GEMINI_DIMENSIONS = 768
TIMEOUT_SECONDS = 30
# Une coupure réseau est souvent passagère : en mode patient, on réessaie après ce délai.
NETWORK_RETRY_SECONDS = 5.0


@dataclass(frozen=True)
class InferenceError:
    reason: str
    quota_exhausted: bool = False
    retry_after: float | None = None


def embed(
    token: str | None,
    model: str,
    provider: str,
    texts: list[str],
    batch_size: int = 32,
    patience_seconds: float = 0,
) -> np.ndarray | InferenceError:
    if not token:
        variable = "SEMANTICA_GEMINI_API_KEY" if provider == "gemini" else "SEMANTICA_HF_TOKEN"
        return InferenceError(f"Aucune clé d'inférence configurée ({variable}).")
    batches: list[np.ndarray] = []
    deadline = time.monotonic() + patience_seconds
    start = 0
    while start < len(texts):
        chunk = texts[start : start + batch_size]
        if provider == "gemini":
            vectors = _embed_gemini(token, model, chunk)
        elif provider == "hf-inference":
            vectors = _embed_hf_inference(token, model, chunk)
        else:
            vectors = _embed_routed(token, model, provider, chunk)
        if isinstance(vectors, InferenceError):
            # Hors ligne (construction de l'index), une limite par minute vaut la peine d'être
            # attendue ; en ligne, la patience est nulle : on rend la main pour le repli.
            wait = vectors.retry_after
            if wait is None or time.monotonic() + wait > deadline:
                return vectors
            time.sleep(wait)
            continue
        batches.append(vectors.reshape(len(chunk), -1))
        start += batch_size
    matrix = np.vstack(batches)
    return matrix / np.linalg.norm(matrix, axis=1, keepdims=True)


def rerank(
    token: str | None, model: str, query: str, passages: list[str], patience_seconds: float = 0
) -> np.ndarray | InferenceError:
    if not token:
        return InferenceError("Aucun token Hugging Face configuré (SEMANTICA_HF_TOKEN).")
    payload = {
        "inputs": [{"text": query, "text_pair": passage} for passage in passages],
        "parameters": {"function_to_apply": "none"},
    }
    deadline = time.monotonic() + patience_seconds
    response = _post(token, f"{ROUTER_URL}/hf-inference/models/{model}", payload)
    while isinstance(response, InferenceError):
        wait = response.retry_after
        if wait is None or time.monotonic() + wait > deadline:
            return response
        time.sleep(wait)
        response = _post(token, f"{ROUTER_URL}/hf-inference/models/{model}", payload)
    # Le pipeline renvoie [[{label, score}, …]] : une liste englobant une entrée par paire.
    items = response[0] if len(response) == 1 and isinstance(response[0], list) else response
    if len(items) != len(passages):
        return InferenceError(f"Réponse du reranker inattendue : {len(items)} scores")
    return np.array([_score(item) for item in items], dtype=np.float32)


def _embed_gemini(api_key: str, model: str, texts: list[str]) -> np.ndarray | InferenceError:
    payload = {
        "requests": [
            {
                "model": f"models/{model}",
                "content": {"parts": [{"text": text}]},
                "outputDimensionality": GEMINI_DIMENSIONS,
            }
            for text in texts
        ]
    }
    response = _post_json(
        f"{GEMINI_URL}/{model}:batchEmbedContents", payload, {"x-goog-api-key": api_key}
    )
    if isinstance(response, InferenceError):
        return response
    return np.array([item["values"] for item in response["embeddings"]], dtype=np.float32)


def _embed_hf_inference(token: str, model: str, texts: list[str]) -> np.ndarray | InferenceError:
    # huggingface_hub refuse « feature-extraction » sur les modèles étiquetés
    # « sentence-similarity » (e5, MiniLM), alors que le pipeline hf-inference l'accepte.
    url = f"{ROUTER_URL}/hf-inference/models/{model}/pipeline/feature-extraction"
    response = _post(token, url, {"inputs": texts})
    if isinstance(response, InferenceError):
        return response
    return np.asarray(response, dtype=np.float32)


def _embed_routed(
    token: str, model: str, provider: str, texts: list[str]
) -> np.ndarray | InferenceError:
    client = InferenceClient(provider=provider, api_key=token, timeout=TIMEOUT_SECONDS)
    try:
        return np.asarray(client.feature_extraction(texts, model=model), dtype=np.float32)
    except HfHubHTTPError as error:
        status = error.response.status_code if error.response is not None else None
        return _http_error(status, str(error))
    except (httpx.HTTPError, OSError) as error:
        return InferenceError(
            f"Réseau indisponible vers Hugging Face : {type(error).__name__}",
            retry_after=NETWORK_RETRY_SECONDS,
        )


def _post(token: str, url: str, payload: dict) -> list | InferenceError:
    return _post_json(url, payload, {"Authorization": f"Bearer {token}"})


def _post_json(url: str, payload: dict, headers: dict[str, str]) -> list | dict | InferenceError:
    try:
        response = httpx.post(url, json=payload, headers=headers, timeout=TIMEOUT_SECONDS)
    except httpx.HTTPError as error:
        return InferenceError(
            f"Réseau indisponible vers l'API d'inférence : {type(error).__name__}",
            retry_after=NETWORK_RETRY_SECONDS,
        )
    if response.status_code != 200:
        return _http_error(response.status_code, response.text)
    return response.json()


def _score(item: dict | list) -> float:
    entry = item[0] if isinstance(item, list) else item
    return float(entry["score"])


def _http_error(status: int | None, detail: str) -> InferenceError:
    if status == 402:
        return InferenceError("Crédits d'inférence épuisés pour ce mois.", quota_exhausted=True)
    if status == 429:
        return InferenceError(
            "Limite de débit de l'API d'inférence atteinte.",
            quota_exhausted=True,
            retry_after=_retry_delay(detail),
        )
    if status in (401, 403):
        return InferenceError("Clé d'inférence invalide ou sans les droits nécessaires.")
    return InferenceError(f"L'API d'inférence a répondu HTTP {status} : {detail[:200]}")


def _retry_delay(detail: str, default: float = 30.0) -> float:
    # Google indique le délai dans error.details[].retryDelay (« 37s ») ; Hugging Face non.
    try:
        details = json.loads(detail).get("error", {}).get("details", [])
    except (json.JSONDecodeError, AttributeError):
        return default
    for item in details:
        match = re.fullmatch(r"([\d.]+)s", str(item.get("retryDelay", "")))
        if match:
            return float(match.group(1)) + 1
    return default
