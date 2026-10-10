from typing import Any

from fastapi.testclient import TestClient
from langchain_core.documents import Document

from moteur.main import create_app
from moteur.search import SearchFailure, search_articles


class FakeStore:
    def __init__(self, results: list[tuple[str, float]], fail: bool = False) -> None:
        self.results = results
        self.fail = fail
        self.last_filter: dict[str, Any] | None = None

    def similarity_search_with_score(
        self, query: str, k: int, filter: dict[str, Any] | None = None
    ) -> list[tuple[Document, float]]:
        if self.fail:
            raise ConnectionError("Pinecone injoignable")
        self.last_filter = filter
        return [
            (
                Document(
                    page_content=f"Titre › Section\n\ntexte {doc_id}",
                    metadata={"doc_id": doc_id, "section": "Section"},
                ),
                score,
            )
            for doc_id, score in self.results[:k]
        ]


def test_articles_are_ranked_by_their_best_passage() -> None:
    store = FakeStore([("D21", 0.88), ("D21", 0.87), ("D20", 0.81), ("D21", 0.80), ("D35", 0.79)])
    hits = search_articles(store, "spoofing", k_passages=60, k_articles=5)
    assert not isinstance(hits, SearchFailure)
    assert [(h.doc_id, h.score) for h in hits] == [("D21", 0.88), ("D20", 0.81), ("D35", 0.79)]


def test_passage_is_returned_without_its_context_prefix() -> None:
    hits = search_articles(FakeStore([("D01", 0.9)]), "typos", k_passages=60, k_articles=5)
    assert not isinstance(hits, SearchFailure)
    assert hits[0].passage == "texte D01"


def test_filters_are_sent_to_pinecone() -> None:
    store = FakeStore([("D36", 0.9)])
    search_articles(store, "fautes", k_passages=60, k_articles=5, langue="fr", modalite="image")
    assert store.last_filter == {"langue": {"$eq": "fr"}, "modalite": {"$eq": "image"}}


def test_network_failure_is_returned_not_raised() -> None:
    result = search_articles(FakeStore([], fail=True), "q", k_passages=60, k_articles=5)
    assert isinstance(result, SearchFailure)


def test_search_endpoint_abstains_below_threshold() -> None:
    with TestClient(create_app(store=FakeStore([("D01", 0.80)]))) as client:
        body = client.get("/api/search", params={"q": "recette du ndolé"}).json()
    assert body["abstained"] is True
    assert body["results"][0]["article"]["doc_id"] == "D01"


def test_search_endpoint_answers_above_threshold() -> None:
    with TestClient(create_app(store=FakeStore([("D21", 0.88)]))) as client:
        body = client.get("/api/search", params={"q": "spoofing"}).json()
    assert body["abstained"] is False
    assert body["results"][0]["rank"] == 1


def test_search_endpoint_reports_unavailability() -> None:
    with TestClient(create_app(store=FakeStore([], fail=True))) as client:
        response = client.get("/api/search", params={"q": "spoofing"})
    assert response.status_code == 503


def test_articles_endpoint_lists_the_corpus() -> None:
    with TestClient(create_app(store=FakeStore([]))) as client:
        articles = client.get("/api/articles").json()
    assert len(articles) == 50


class SinglePassageStore:
    def __init__(self, text: str) -> None:
        self.text = text

    def similarity_search_with_score(
        self, query: str, k: int, filter: dict[str, Any] | None = None
    ) -> list[tuple[Document, float]]:
        doc = Document(page_content=self.text, metadata={"doc_id": "D01", "section": "S"})
        return [(doc, 0.9)]


def test_passage_markdown_is_cleaned_for_display() -> None:
    store = SinglePassageStore(
        "T › S\n\n**Datasets.** As in (Zhang _et al._, 2023)<sup>1</sup> with snake_case"
    )
    hits = search_articles(store, "q", k_passages=60, k_articles=5)
    assert not isinstance(hits, SearchFailure)
    assert hits[0].passage == "Datasets. As in (Zhang et al., 2023)1 with snake_case"
