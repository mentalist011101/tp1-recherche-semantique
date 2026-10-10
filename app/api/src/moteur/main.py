import os
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from langchain_pinecone import PineconeEmbeddings, PineconeVectorStore
from pydantic import BaseModel

from moteur.catalog import Article, Language, Modality, Settings, load_articles, load_settings
from moteur.ratelimit import RateLimiter
from moteur.search import SearchFailure, VectorStore, search_articles


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


def create_app(store: VectorStore | None = None, static_dir: Path | None = None) -> FastAPI:
    articles = load_articles()
    settings = load_settings()
    # Chaque recherche consomme du quota d'embedding gratuit chez Pinecone.
    limiter = RateLimiter(capacity=20, refill_per_minute=20)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if store is None:
            # En local, la clé vient du .env à la racine du dépôt ; sur le Space, d'un secret.
            load_dotenv(Path(__file__).resolve().parents[4] / ".env")
            embeddings = PineconeEmbeddings(model=settings.embedding_model)
            app.state.store = PineconeVectorStore(index_name=settings.index, embedding=embeddings)
        else:
            app.state.store = store
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

    if static_dir is not None:
        _mount_spa(app, static_dir)
    return app


def _mount_spa(app: FastAPI, static_dir: Path) -> None:
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")
    index = static_dir / "index.html"

    # Les routes du front (React Router) n'existent pas côté serveur : tout chemin inconnu
    # renvoie index.html, sauf un vrai fichier présent à la racine (favicon…).
    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        candidate = (static_dir / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(static_dir.resolve()):
            return FileResponse(candidate)
        return FileResponse(index)


def build() -> FastAPI:
    static = os.environ.get("MOTEUR_STATIC_DIR")
    return create_app(static_dir=Path(static) if static else None)
