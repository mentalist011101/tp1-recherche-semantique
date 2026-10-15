import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any, Literal, Protocol

import numpy as np
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings

from moteur.search import MARKDOWN_NOISE_RE, Hit, SearchFailure

logger = logging.getLogger(__name__)

Sign = Literal["+", "-"]


class VectorSearch(Protocol):
    @property
    def embeddings(self) -> Embeddings: ...

    def similarity_search_by_vector_with_score(
        self, embedding: list[float], *, k: int = 4, **kwargs: Any
    ) -> list[tuple[Document, float]]: ...


@dataclass(frozen=True)
class Term:
    sign: Sign
    text: str


@dataclass(frozen=True)
class Arithmetic:
    results: list[Hit]
    # Meilleur article de chaque terme pris seul : montre d'où part le calcul et où il arrive.
    alone: list[Hit]
    excluded: str | None


def compute(
    store: VectorSearch, terms: list[Term], *, k_passages: int, k_articles: int
) -> Arithmetic | SearchFailure:
    try:
        # Jusqu'à quatre embeddings puis cinq recherches : en série, plusieurs secondes d'attente
        # réseau ; en parallèle, le temps d'un aller-retour.
        with ThreadPoolExecutor() as pool:
            # Mode « requête » de e5 : dans nos essais, il donnait des analogies nettement plus
            # justes que le mode « passage ».
            vectors = list(
                pool.map(lambda term: _unit(store.embeddings.embed_query(term.text)), terms)
            )
            total = _unit(
                sum(
                    (1 if term.sign == "+" else -1) * vector
                    for term, vector in zip(terms, vectors, strict=True)
                )
            )
            searches = list(
                pool.map(
                    lambda vector: _best_articles(store, vector, k_passages), [*vectors, total]
                )
            )
        alone = [hits[0] for hits in searches[:-1]]
        candidates = searches[-1]
    except Exception as error:  # frontière réseau : Pinecone indisponible, quota, clé invalide
        logger.exception("Arithmétique sémantique impossible")
        return SearchFailure(f"{type(error).__name__}: {error}")

    # Dans une analogie (au moins une soustraction), l'article de départ est exclu : sans cela,
    # « speech recognition - audio + image » renverrait surtout l'article d'où l'on part.
    excluded = alone[0].doc_id if any(term.sign == "-" for term in terms) else None
    results = [hit for hit in candidates if hit.doc_id != excluded][:k_articles]
    return Arithmetic(results=results, alone=alone, excluded=excluded)


def _best_articles(store: VectorSearch, vector: np.ndarray, k: int) -> list[Hit]:
    best: dict[str, Hit] = {}
    for doc, score in store.similarity_search_by_vector_with_score(vector.tolist(), k=k):
        best.setdefault(
            doc.metadata["doc_id"],
            Hit(
                doc_id=doc.metadata["doc_id"],
                score=score,
                section=doc.metadata["section"],
                passage=MARKDOWN_NOISE_RE.sub("", doc.page_content.split("\n\n", 1)[-1]),
            ),
        )
    return list(best.values())


def _unit(vector: Any) -> np.ndarray:
    array = np.asarray(vector, dtype=float)
    return array / np.linalg.norm(array)
