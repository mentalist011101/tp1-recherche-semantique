from dataclasses import dataclass

import numpy as np

from semantica.inference import InferenceError, embed
from semantica.retrieval.types import Hit
from semantica.settings import Settings


@dataclass(frozen=True)
class EncoderSpec:
    key: str
    model_id: str
    provider: str
    query_template: str = "{text}"
    passage_template: str = "{text}"


ENCODERS: dict[str, EncoderSpec] = {
    spec.key: spec
    for spec in (
        EncoderSpec(
            "gemini",
            "gemini-embedding-2",
            "gemini",
            # Gemini Embedding 2 attend la tâche sous forme d'instruction dans le texte lui-même.
            query_template="task: search result | query: {text}",
            passage_template="title: none | text: {text}",
        ),
        EncoderSpec(
            "e5-small",
            "intfloat/multilingual-e5-small",
            "hf-inference",
            query_template="query: {text}",
            passage_template="passage: {text}",
        ),
        EncoderSpec(
            "minilm", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2", "hf-inference"
        ),
    )
}

DEFAULT_ENCODER = "gemini"


@dataclass(frozen=True)
class Encoder:
    spec: EncoderSpec
    token: str | None

    @classmethod
    def for_settings(cls, spec: EncoderSpec, settings: Settings) -> "Encoder":
        key = settings.gemini_api_key if spec.provider == "gemini" else settings.hf_token
        return cls(spec, key)

    def encode_queries(
        self, texts: list[str], patience_seconds: float = 0
    ) -> np.ndarray | InferenceError:
        formatted = [self.spec.query_template.format(text=t) for t in texts]
        return self._encode(formatted, patience_seconds)

    def encode_passages(
        self, texts: list[str], patience_seconds: float = 0
    ) -> np.ndarray | InferenceError:
        formatted = [self.spec.passage_template.format(text=t) for t in texts]
        return self._encode(formatted, patience_seconds)

    def encode_words(
        self, words: list[str], patience_seconds: float = 0
    ) -> np.ndarray | InferenceError:
        formatted = [self.spec.query_template.format(text=w) for w in words]
        return self._encode(formatted, patience_seconds)

    def _encode(self, texts: list[str], patience_seconds: float = 0) -> np.ndarray | InferenceError:
        return embed(
            self.token,
            self.spec.model_id,
            self.spec.provider,
            texts,
            patience_seconds=patience_seconds,
        )


class DenseIndex:
    def __init__(self, embeddings: np.ndarray) -> None:
        self.embeddings = embeddings

    def scores(self, query_vector: np.ndarray) -> np.ndarray:
        return self.embeddings @ query_vector

    def search(self, query_vector: np.ndarray, k: int) -> list[Hit]:
        scores = self.scores(query_vector)
        top = np.argsort(-scores)[:k]
        return [Hit(int(i), float(scores[i])) for i in top]
