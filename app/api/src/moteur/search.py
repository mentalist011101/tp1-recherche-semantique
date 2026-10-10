import logging
import re
from dataclasses import dataclass
from typing import Any, Protocol

from langchain_core.documents import Document

from moteur.catalog import Language, Modality

logger = logging.getLogger(__name__)

# Le texte indexé est du Markdown produit par pymupdf4llm : gras, italique en « _ » et
# balises HTML (<sup>, <br>) s'afficheraient tels quels dans les résultats.
MARKDOWN_NOISE_RE = re.compile(r"\*\*|(?<!\w)_|_(?!\w)|<[^>]+>")


class VectorStore(Protocol):
    def similarity_search_with_score(
        self, query: str, k: int, filter: dict[str, Any] | None = None
    ) -> list[tuple[Document, float]]: ...


@dataclass(frozen=True)
class Hit:
    doc_id: str
    score: float
    section: str
    passage: str


@dataclass(frozen=True)
class SearchFailure:
    reason: str


def search_articles(
    store: VectorStore,
    question: str,
    *,
    k_passages: int,
    k_articles: int,
    langue: Language | None = None,
    modalite: Modality | None = None,
) -> list[Hit] | SearchFailure:
    conditions = {
        key: {"$eq": value}
        for key, value in (("langue", langue), ("modalite", modalite))
        if value is not None
    }
    try:
        results = store.similarity_search_with_score(
            question, k=k_passages, filter=conditions or None
        )
    except Exception as error:  # frontière réseau : Pinecone indisponible, quota, clé invalide
        logger.exception("Recherche Pinecone impossible")
        return SearchFailure(f"{type(error).__name__}: {error}")

    hits: dict[str, Hit] = {}
    for doc, score in results:
        doc_id = doc.metadata["doc_id"]
        # Les passages arrivent du plus proche au moins proche : le premier vu pour un article
        # est son meilleur passage, et son score devient celui de l'article.
        if doc_id not in hits:
            hits[doc_id] = Hit(
                doc_id=doc_id,
                score=score,
                section=doc.metadata["section"],
                passage=MARKDOWN_NOISE_RE.sub("", doc.page_content.split("\n\n", 1)[-1]),
            )
    return list(hits.values())[:k_articles]
