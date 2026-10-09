from pathlib import Path

import bm25s
import numpy as np

from semantica.retrieval.types import Hit
from semantica.text import analyze


class LexicalIndex:
    def __init__(self, model: bm25s.BM25, size: int) -> None:
        self._model = model
        self._size = size

    @classmethod
    def build(cls, texts: list[str]) -> "LexicalIndex":
        model = bm25s.BM25(k1=1.2, b=0.75)
        model.index([analyze(t) for t in texts], show_progress=False)
        return cls(model, len(texts))

    @classmethod
    def load(cls, directory: Path) -> "LexicalIndex":
        model = bm25s.BM25.load(directory)
        return cls(model, int(model.scores["num_docs"]))

    def save(self, directory: Path) -> None:
        self._model.save(directory)

    def scores(self, query: str) -> np.ndarray:
        tokens = [t for t in analyze(query) if t in self._model.vocab_dict]
        if not tokens:
            return np.zeros(self._size, dtype=np.float32)
        return self._model.get_scores(tokens)

    def search(self, query: str, k: int) -> list[Hit]:
        scores = self.scores(query)
        top = np.argsort(-scores)[:k]
        return [Hit(int(i), float(scores[i])) for i in top if scores[i] > 0]
