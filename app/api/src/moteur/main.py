import json
import os
import time
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import StreamingResponse
from langchain_core.language_models import BaseChatModel
from langchain_groq import ChatGroq
from langchain_pinecone import PineconeEmbeddings, PineconeVectorStore
from pydantic import BaseModel, Field, field_validator

from moteur.arithmetic import Sign, Term, compute
from moteur.catalog import Article, Language, Modality, Settings, load_articles, load_settings
from moteur.rag import GenerationFailure, stream_answer
from moteur.ratelimit import RateLimiter
from moteur.search import Hit, SearchFailure, VectorStore, search_articles, search_passages


class ArticleHit(BaseModel):
    rank: int
    score: float
    section: str
    passage: str
    article: Article


class SearchResponse(BaseModel):
    query: str
    results: list[ArticleHit]
    best_score: float | None
    threshold: float
    abstained: bool
    elapsed_ms: float


class Stats(BaseModel):
    articles: int
    settings: Settings


class TermIn(BaseModel):
    sign: Sign
    text: str = Field(min_length=1, max_length=80)


class ArithmeticRequest(BaseModel):
    terms: list[TermIn] = Field(min_length=2, max_length=4)

    @field_validator("terms")
    @classmethod
    def starts_with_addition(cls, terms: list[TermIn]) -> list[TermIn]:
        if terms[0].sign != "+":
            raise ValueError("Le premier terme doit être ajouté (+).")
        return terms


class TermResult(BaseModel):
    sign: Sign
    text: str
    best: ArticleHit


class ArithmeticResponse(BaseModel):
    results: list[ArticleHit]
    alone: list[TermResult]
    excluded: Article | None


class ChatRequest(BaseModel):
    question: str = Field(min_length=2, max_length=500)
    langue: Language | None = None
    modalite: Modality | None = None


def create_app(
    store: VectorStore | None = None,
    llm: BaseChatModel | None = None,
    static_dir: Path | None = None,
) -> FastAPI:
    articles = load_articles()
    settings = load_settings()
    # Chaque recherche consomme du quota d'embedding gratuit chez Pinecone, chaque réponse du
    # quota gratuit de Groq.
    limiter = RateLimiter(capacity=20, refill_per_minute=20)
    chat_limiter = RateLimiter(capacity=6, refill_per_minute=6)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # En local, les clés viennent du .env à la racine du dépôt ; sur Vercel, de secrets.
        load_dotenv(Path(__file__).resolve().parents[4] / ".env")
        if store is None:
            embeddings = PineconeEmbeddings(model=settings.embedding_model)
            app.state.store = PineconeVectorStore(index_name=settings.index, embedding=embeddings)
        else:
            app.state.store = store
        if llm is None:
            # Température basse : une synthèse fidèle des passages, pas de la créativité.
            # Raisonnement court : synthétiser des passages n'en demande pas beaucoup. Un seul
            # nouvel essai : en cas de quota épuisé, mieux vaut un échec rapide qu'une attente.
            # La clé est lue dans GROQ_API_KEY.
            app.state.llm = ChatGroq(
                model=settings.llm_model, temperature=0.2, reasoning_effort="low", max_retries=1
            )
        else:
            app.state.llm = llm
        yield

    app = FastAPI(
        title="Moteur de recherche d'articles · INF5101",
        description="Recherche sémantique dans 50 articles scientifiques courts (arXiv et HAL).",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )
    app.add_middleware(GZipMiddleware, minimum_size=1024)

    @app.get("/api/stats")
    def stats() -> Stats:
        return Stats(articles=len(articles), settings=settings)

    @app.get("/api/articles")
    def list_articles() -> list[Article]:
        return list(articles.values())

    @app.get("/api/search", dependencies=[Depends(limiter.check)])
    def search(
        request: Request,
        q: Annotated[str, Query(min_length=2, max_length=300)],
        langue: Language | None = None,
        modalite: Modality | None = None,
        k: Annotated[int, Query(ge=1, le=10)] = 5,
    ) -> SearchResponse:
        start = time.perf_counter()
        hits = search_articles(
            request.app.state.store,
            q,
            k_passages=settings.k_passages,
            k_articles=k,
            langue=langue,
            modalite=modalite,
        )
        if isinstance(hits, SearchFailure):
            raise HTTPException(503, "Le moteur de recherche est momentanément indisponible.")
        best = hits[0].score if hits else None
        return SearchResponse(
            query=q,
            results=[
                ArticleHit(
                    rank=rank,
                    score=round(hit.score, 4),
                    section=hit.section,
                    passage=hit.passage,
                    article=articles[hit.doc_id],
                )
                for rank, hit in enumerate(hits, 1)
            ],
            best_score=best,
            threshold=settings.abstention_threshold,
            abstained=best is None or best < settings.abstention_threshold,
            elapsed_ms=round((time.perf_counter() - start) * 1000, 1),
        )

    @app.post("/api/arithmetic", dependencies=[Depends(limiter.check)])
    def arithmetic(request: Request, body: ArithmeticRequest) -> ArithmeticResponse:
        outcome = compute(
            request.app.state.store,
            [Term(sign=term.sign, text=term.text) for term in body.terms],
            k_passages=settings.k_passages,
            k_articles=5,
        )
        if isinstance(outcome, SearchFailure):
            raise HTTPException(503, "Le moteur de recherche est momentanément indisponible.")

        def to_hit(rank: int, hit: Hit) -> ArticleHit:
            return ArticleHit(
                rank=rank,
                score=round(hit.score, 4),
                section=hit.section,
                passage=hit.passage,
                article=articles[hit.doc_id],
            )

        return ArithmeticResponse(
            results=[to_hit(rank, hit) for rank, hit in enumerate(outcome.results, 1)],
            alone=[
                TermResult(sign=term.sign, text=term.text, best=to_hit(1, hit))
                for term, hit in zip(body.terms, outcome.alone, strict=True)
            ],
            excluded=articles[outcome.excluded] if outcome.excluded else None,
        )

    @app.post("/api/chat", dependencies=[Depends(chat_limiter.check)])
    def chat(request: Request, body: ChatRequest) -> StreamingResponse:
        passages = search_passages(
            request.app.state.store,
            body.question,
            k=settings.rag_passages,
            langue=body.langue,
            modalite=body.modalite,
        )
        if isinstance(passages, SearchFailure):
            raise HTTPException(503, "Le moteur de recherche est momentanément indisponible.")
        best = passages[0].score if passages else None
        abstained = best is None or best < settings.abstention_threshold

        # Une ligne JSON par événement : d'abord les sources, puis la réponse morceau par
        # morceau, pour que le front affiche le texte à mesure qu'il est généré.
        def events() -> Iterator[str]:
            yield _event(
                type="sources",
                abstained=abstained,
                best_score=best,
                threshold=settings.abstention_threshold,
                passages=[
                    {
                        "number": number,
                        "score": round(hit.score, 4),
                        "section": hit.section,
                        "passage": hit.passage,
                        "article": articles[hit.doc_id].model_dump(),
                    }
                    for number, hit in enumerate(passages, 1)
                ],
            )
            # Sous le seuil, le modèle n'est pas appelé : pas de réponse inventée possible.
            if abstained:
                yield _event(type="done")
                return
            for piece in stream_answer(request.app.state.llm, body.question, passages, articles):
                if isinstance(piece, GenerationFailure):
                    yield _event(type="error", message="La génération de la réponse a échoué.")
                    return
                yield _event(type="token", text=piece)
            yield _event(type="done")

        return StreamingResponse(events(), media_type="application/x-ndjson")

    if static_dir is not None:
        # Les routes du front (React Router, ex. /corpus) n'existent pas côté serveur : une
        # navigation vers un chemin inconnu reçoit index.html. Sur Vercel, ces fichiers sont
        # servis par le CDN, sans passer par la fonction.
        app.frontend("/", directory=static_dir, fallback="index.html")
    return app


def build() -> FastAPI:
    static = os.environ.get("MOTEUR_STATIC_DIR")
    return create_app(static_dir=Path(static) if static else None)


def _event(**fields: object) -> str:
    return json.dumps(fields, ensure_ascii=False) + "\n"
