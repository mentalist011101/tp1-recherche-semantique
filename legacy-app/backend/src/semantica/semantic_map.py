import json
import pickle
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
from sklearn.cluster import KMeans
from umap import UMAP

from semantica.corpus import Passage
from semantica.text import FRENCH_STOPWORDS, analyze, words

CLUSTER_COUNT = 14


@dataclass(frozen=True)
class MapPoint:
    id: str
    x: float
    y: float
    cluster: int


@dataclass(frozen=True)
class Cluster:
    id: int
    label: str
    keywords: list[str]
    size: int


def build_map(passages: list[Passage], embeddings: np.ndarray, out_dir: Path) -> None:
    reducer = UMAP(
        n_neighbors=15, min_dist=0.08, metric="cosine", random_state=42, transform_seed=42
    )
    coords = _normalize(reducer.fit_transform(embeddings))
    labels = KMeans(n_clusters=CLUSTER_COUNT, n_init=10, random_state=42).fit_predict(embeddings)

    points = [
        MapPoint(p.id, round(float(x), 4), round(float(y), 4), int(c))
        for p, (x, y), c in zip(passages, coords, labels, strict=True)
    ]
    clusters = _describe_clusters(passages, labels)

    out_dir.mkdir(parents=True, exist_ok=True)
    with (out_dir / "umap.pkl").open("wb") as f:
        pickle.dump({"reducer": reducer, "bounds": _bounds(reducer.embedding_)}, f)
    (out_dir / "map.json").write_text(
        json.dumps(
            {"points": [asdict(p) for p in points], "clusters": [asdict(c) for c in clusters]},
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


class MapProjector:
    def __init__(self, path: Path) -> None:
        with path.open("rb") as f:
            state = pickle.load(f)
        self._reducer: UMAP = state["reducer"]
        self._bounds: tuple[np.ndarray, np.ndarray] = state["bounds"]

    def project(self, vectors: np.ndarray) -> np.ndarray:
        raw = self._reducer.transform(vectors)
        low, high = self._bounds
        return (raw - low) / (high - low)


def _describe_clusters(passages: list[Passage], labels: np.ndarray) -> list[Cluster]:
    # c-TF-IDF : un terme caractérise un cluster s'il y est fréquent et rare ailleurs.
    counts = [Counter[str]() for _ in range(CLUSTER_COUNT)]
    for passage, label in zip(passages, labels, strict=True):
        counts[label].update(_content_words(passage.embedding_text))
    document_frequency = Counter[str]()
    for counter in counts:
        document_frequency.update(set(counter))
    average_size = np.mean([sum(c.values()) for c in counts])

    clusters: list[Cluster] = []
    for index, counter in enumerate(counts):
        total = sum(counter.values()) or 1
        scored = {
            term: (freq / total) * np.log(1 + average_size / document_frequency[term])
            for term, freq in counter.items()
            if freq >= 2
        }
        ranked = [t for t, _ in sorted(scored.items(), key=lambda item: -item[1])]
        keywords = _distinct_by_stem(ranked, 5)
        clusters.append(
            Cluster(
                id=index,
                label=" · ".join(keywords[:3]),
                keywords=keywords,
                size=int((labels == index).sum()),
            )
        )
    return clusters


def _distinct_by_stem(terms: list[str], count: int) -> list[str]:
    # « image » et « images » ne doivent pas occuper deux places dans l'étiquette.
    kept: list[str] = []
    stems: set[str] = set()
    for term in terms:
        stem = "".join(analyze(term))
        if stem not in stems:
            kept.append(term)
            stems.add(stem)
        if len(kept) == count:
            break
    return kept


def _content_words(text: str) -> list[str]:
    return [w for w in words(text) if len(w) > 3 and w not in FRENCH_STOPWORDS and not w.isdigit()]


def _bounds(coords: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    return coords.min(axis=0), coords.max(axis=0)


def _normalize(coords: np.ndarray) -> np.ndarray:
    low, high = _bounds(coords)
    return (coords - low) / (high - low)
