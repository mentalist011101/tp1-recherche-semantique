import json
from collections.abc import Iterator
from typing import Any, ClassVar

from fastapi.testclient import TestClient
from langchain_core.documents import Document
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage

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
    with TestClient(create_app(store=FakeStore([("D01", 0.80)]), llm=fake_llm())) as client:
        body = client.get("/api/search", params={"q": "recette du ndolé"}).json()
    assert body["abstained"] is True
    assert body["results"][0]["article"]["doc_id"] == "D01"


def test_search_endpoint_answers_above_threshold() -> None:
    with TestClient(create_app(store=FakeStore([("D21", 0.88)]), llm=fake_llm())) as client:
        body = client.get("/api/search", params={"q": "spoofing"}).json()
    assert body["abstained"] is False
    assert body["results"][0]["rank"] == 1


def test_search_endpoint_reports_unavailability() -> None:
    with TestClient(create_app(store=FakeStore([], fail=True), llm=fake_llm())) as client:
        response = client.get("/api/search", params={"q": "spoofing"})
    assert response.status_code == 503


def test_articles_endpoint_lists_the_corpus() -> None:
    with TestClient(create_app(store=FakeStore([]), llm=fake_llm())) as client:
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


def fake_llm(
    answer: str = "Le spoofing est détecté par une contre-mesure [1].",
) -> GenericFakeChatModel:
    return GenericFakeChatModel(messages=iter([AIMessage(content=answer)]))


class FailingLlm(GenericFakeChatModel):
    def _stream(self, *args: Any, **kwargs: Any) -> Iterator[Any]:
        raise ConnectionError("Gemini injoignable")


def chat_events(store: FakeStore, llm: GenericFakeChatModel) -> list[dict[str, Any]]:
    with TestClient(create_app(store=store, llm=llm)) as client:
        response = client.post("/api/chat", json={"question": "Comment détecter le spoofing ?"})
    return [json.loads(line) for line in response.text.splitlines()]


def test_chat_streams_sources_then_answer() -> None:
    events = chat_events(FakeStore([("D21", 0.88), ("D20", 0.85)]), fake_llm())
    assert events[0]["type"] == "sources"
    assert [p["number"] for p in events[0]["passages"]] == [1, 2]
    answer = "".join(e["text"] for e in events if e["type"] == "token")
    assert answer == "Le spoofing est détecté par une contre-mesure [1]."
    assert events[-1]["type"] == "done"


def test_chat_does_not_call_the_model_below_threshold() -> None:
    events = chat_events(FakeStore([("D01", 0.80)]), FailingLlm(messages=iter([])))
    assert events[0]["abstained"] is True
    assert [e["type"] for e in events] == ["sources", "done"]


def test_chat_reports_generation_failure() -> None:
    events = chat_events(FakeStore([("D21", 0.88)]), FailingLlm(messages=iter([])))
    assert events[-1] == {"type": "error", "message": "La génération de la réponse a échoué."}


class VectorFakeStore(FakeStore):
    # Trois axes : « reconnaissance », « audio », « image ». La reconnaissance de la parole est
    # reconnaissance + audio, l'OCR reconnaissance + image.
    TERMS: ClassVar[dict[str, list[float]]] = {
        "speech recognition": [1, 1, 0],
        "audio": [0, 1, 0],
        "image": [0, 0, 1],
    }
    PASSAGES: ClassVar[dict[str, list[float]]] = {
        "D20": [1, 1, 0],
        "D16": [1, 0, 1],
        "D10": [0, 0.2, 1],
        "D34": [0, 1, 0.1],
    }

    def __init__(self, fail: bool = False) -> None:
        super().__init__([], fail=fail)

    @property
    def embeddings(self) -> "VectorFakeStore":
        return self

    def embed_query(self, text: str) -> list[float]:
        if self.fail:
            raise ConnectionError("Pinecone injoignable")
        return self.TERMS[text]

    def similarity_search_by_vector_with_score(
        self, embedding: list[float], *, k: int = 4, **kwargs: Any
    ) -> list[tuple[Document, float]]:
        def cosine(vector: list[float]) -> float:
            dot = sum(a * b for a, b in zip(embedding, vector, strict=True))
            norm = sum(a * a for a in vector) ** 0.5 * sum(b * b for b in embedding) ** 0.5
            return dot / norm

        ranked = sorted(self.PASSAGES.items(), key=lambda item: cosine(item[1]), reverse=True)
        return [
            (
                Document(
                    page_content=f"T › S\n\n{doc_id}", metadata={"doc_id": doc_id, "section": "S"}
                ),
                cosine(v),
            )
            for doc_id, v in ranked[:k]
        ]


def arithmetic(terms: list[tuple[str, str]], store: VectorFakeStore | None = None) -> Any:
    with TestClient(create_app(store=store or VectorFakeStore(), llm=fake_llm())) as client:
        return client.post(
            "/api/arithmetic", json={"terms": [{"sign": s, "text": t} for s, t in terms]}
        )


def test_analogy_lands_on_the_expected_article_and_excludes_the_start() -> None:
    body = arithmetic([("+", "speech recognition"), ("-", "audio"), ("+", "image")]).json()
    assert body["results"][0]["article"]["doc_id"] == "D16"
    assert body["excluded"]["doc_id"] == "D20"
    assert [t["best"]["article"]["doc_id"] for t in body["alone"]] == ["D20", "D34", "D10"]


def test_pure_addition_excludes_nothing() -> None:
    body = arithmetic([("+", "speech recognition"), ("+", "audio")]).json()
    assert body["excluded"] is None
    assert body["results"][0]["article"]["doc_id"] == "D20"


def test_first_term_must_be_added() -> None:
    assert arithmetic([("-", "audio"), ("+", "image")]).status_code == 422


def test_arithmetic_reports_unavailability() -> None:
    response = arithmetic([("+", "speech recognition"), ("+", "audio")], VectorFakeStore(fail=True))
    assert response.status_code == 503
