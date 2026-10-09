from dataclasses import dataclass
from enum import StrEnum


class Method(StrEnum):
    BM25 = "bm25"
    DENSE = "dense"
    HYBRID = "hybrid"
    RERANK = "hybrid_rerank"


# L'évaluation a tranché : avec Gemini Embedding 2, le dense seul dépasse l'hybride et le
# reranking (voir docs/evaluation.md). Les autres méthodes restent comparables à la demande.
PRODUCTION_METHOD = Method.DENSE


@dataclass(frozen=True)
class Hit:
    index: int
    score: float
