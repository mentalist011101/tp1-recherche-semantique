import numpy as np

from semantica.inference import InferenceError, rerank
from semantica.retrieval.types import Hit

RERANKER_MODEL = "BAAI/bge-reranker-v2-m3"


def rerank_hits(
    token: str | None,
    query: str,
    candidates: list[Hit],
    texts: list[str],
    patience_seconds: float = 0,
) -> list[Hit] | InferenceError:
    if not candidates:
        return []
    passages = [texts[c.index] for c in candidates]
    scores = rerank(token, RERANKER_MODEL, query, passages, patience_seconds)
    if isinstance(scores, InferenceError):
        return scores
    order = np.argsort(-scores)
    return [Hit(candidates[i].index, float(scores[i])) for i in order]
