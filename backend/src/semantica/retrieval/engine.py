import json
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from semantica.corpus import Passage, load_passages
from semantica.inference import InferenceError
from semantica.retrieval.dense import DEFAULT_ENCODER, ENCODERS, DenseIndex, Encoder
from semantica.retrieval.fusion import reciprocal_rank_fusion
from semantica.retrieval.lexical import LexicalIndex
from semantica.retrieval.rerank import rerank_hits
from semantica.retrieval.types import PRODUCTION_METHOD, Hit, Method
from semantica.settings import Settings
from semantica.text import detect_language

CANDIDATES = 50
RERANK_DEPTH = 20


@dataclass(frozen=True)
class Calibration:
    dense_threshold: float | None = None


@dataclass(frozen=True)
class Degradation:
    step: str
    reason: str


@dataclass(frozen=True)
class SearchOutcome:
    hits: list[Hit]
    method: Method
    language: str
    abstained: bool
    confidence: float | None
    timings_ms: dict[str, float] = field(default_factory=dict)
    query_vector: np.ndarray | None = None
    degraded: list[Degradation] = field(default_factory=list)


class SearchEngine:
    def __init__(
        self,
        passages: list[Passage],
        lexical: LexicalIndex,
        dense: dict[str, DenseIndex],
        settings: Settings,
        calibration: Calibration,
    ) -> None:
        self.passages = passages
        self.texts = [p.embedding_text for p in passages]
        self.lexical = lexical
        self.dense = dense
        self.settings = settings
        self.calibration = calibration
        self._query_vectors: dict[tuple[str, str], np.ndarray] = {}
        # En ligne, aucune attente : un refus de l'API déclenche le repli. L'évaluation, elle,
        # préfère attendre la fin d'une limite de débit que mesurer un mode dégradé.
        self.patience_seconds: float = 0

    @classmethod
    def load(
        cls, settings: Settings, encoders: tuple[str, ...] = (DEFAULT_ENCODER,)
    ) -> "SearchEngine":
        index_dir = settings.index_dir
        dense = {
            key: DenseIndex(np.load(index_dir / f"embeddings-{key}.npy"))
            for key in encoders
            if (index_dir / f"embeddings-{key}.npy").exists()
        }
        return cls(
            passages=load_passages(settings.corpus_file),
            lexical=LexicalIndex.load(index_dir / "bm25"),
            dense=dense,
            settings=settings,
            calibration=_load_calibration(index_dir / "calibration.json"),
        )

    def encoder(self, key: str = DEFAULT_ENCODER) -> Encoder:
        return Encoder.for_settings(ENCODERS[key], self.settings)

    def embed_query(self, query: str, key: str = DEFAULT_ENCODER) -> np.ndarray | InferenceError:
        # Comparateur, carte et RAG réencodent souvent la même question : un appel API évité
        # est de la latence et du quota économisés.
        cache_key = (key, query)
        if cache_key not in self._query_vectors:
            encoded = self.encoder(key).encode_queries([query], self.patience_seconds)
            if isinstance(encoded, InferenceError):
                return encoded
            if len(self._query_vectors) > 2000:
                self._query_vectors.clear()
            self._query_vectors[cache_key] = encoded[0]
        return self._query_vectors[cache_key]

    def search(
        self,
        query: str,
        method: Method = PRODUCTION_METHOD,
        k: int = 10,
        encoder_key: str = DEFAULT_ENCODER,
        route_by_language: bool = True,
    ) -> SearchOutcome:
        timings: dict[str, float] = {}
        degraded: list[Degradation] = []
        language = detect_language(query)
        query_vector: np.ndarray | None = None

        lexical_hits: list[Hit] = []
        if method is not Method.DENSE:
            with _timer(timings, "bm25"):
                lexical_hits = self.lexical.search(query, CANDIDATES)

        dense_hits: list[Hit] = []
        if method is not Method.BM25:
            with _timer(timings, "embedding"):
                encoded = self.embed_query(query, encoder_key)
            if isinstance(encoded, InferenceError):
                # Sans embedding, BM25 reste disponible : le moteur répond moins bien
                # plutôt que pas du tout.
                degraded.append(Degradation("embedding", encoded.reason))
                if method is Method.DENSE:
                    lexical_hits = self.lexical.search(query, CANDIDATES)
            else:
                query_vector = encoded
                dense_hits = self.dense[encoder_key].search(query_vector, CANDIDATES)

        # BM25 ne peut rien apparier sur une question en anglais face à un corpus français :
        # le fusionner n'ajoute que du bruit au classement dense.
        skip_lexical = route_by_language and language != "fr" and bool(dense_hits)

        if method is Method.BM25 or not dense_hits:
            hits = lexical_hits
        elif method is Method.DENSE:
            hits = dense_hits
        else:
            rankings = [dense_hits] if skip_lexical else [lexical_hits, dense_hits]
            hits = reciprocal_rank_fusion(rankings)

        if method is Method.RERANK and hits:
            with _timer(timings, "rerank"):
                reranked = rerank_hits(
                    self.settings.hf_token,
                    query,
                    hits[:RERANK_DEPTH],
                    self.texts,
                    self.patience_seconds,
                )
            if isinstance(reranked, InferenceError):
                degraded.append(Degradation("rerank", reranked.reason))
            else:
                hits = reranked

        # Le seuil est calibré sur le cosinus du meilleur passage dense : disponible quelle que
        # soit la méthode (hors BM25) et aussi séparateur que le score du reranker (voir docs).
        confidence = dense_hits[0].score if dense_hits else None
        threshold = self.calibration.dense_threshold if encoder_key == DEFAULT_ENCODER else None
        abstained = threshold is not None and confidence is not None and confidence < threshold
        return SearchOutcome(
            hits=hits[:k],
            method=method,
            language=language,
            abstained=abstained,
            confidence=confidence,
            timings_ms=timings,
            query_vector=query_vector,
            degraded=degraded,
        )


def _load_calibration(path: Path) -> Calibration:
    if not path.exists():
        return Calibration()
    return Calibration(**json.loads(path.read_text(encoding="utf-8")))


@contextmanager
def _timer(timings: dict[str, float], name: str) -> Iterator[None]:
    start = time.perf_counter()
    yield
    timings[name] = round((time.perf_counter() - start) * 1000, 1)
