import math
from collections.abc import Sequence
from itertools import pairwise


def first_relevant_rank(ranked: Sequence[bool]) -> int | None:
    return next((i + 1 for i, relevant in enumerate(ranked) if relevant), None)


def success_at(ranked: Sequence[bool], k: int) -> float:
    return 1.0 if any(ranked[:k]) else 0.0


def reciprocal_rank(ranked: Sequence[bool], k: int = 10) -> float:
    rank = first_relevant_rank(ranked[:k])
    return 1.0 / rank if rank else 0.0


def ndcg_at(ranked: Sequence[bool], relevant_count: int, k: int = 10) -> float:
    dcg = sum(1.0 / math.log2(i + 2) for i, relevant in enumerate(ranked[:k]) if relevant)
    ideal = sum(1.0 / math.log2(i + 2) for i in range(min(relevant_count, k)))
    return dcg / ideal if ideal else 0.0


def best_threshold(positives: list[float], negatives: list[float]) -> tuple[float, float]:
    candidates = sorted(set(positives) | set(negatives))
    midpoints = [(a + b) / 2 for a, b in pairwise(candidates)]
    best = (candidates[0], balanced_accuracy(positives, negatives, candidates[0]))
    for threshold in midpoints:
        score = balanced_accuracy(positives, negatives, threshold)
        if score > best[1]:
            best = (threshold, score)
    return best


def balanced_accuracy(positives: list[float], negatives: list[float], threshold: float) -> float:
    answered = sum(p >= threshold for p in positives) / len(positives)
    abstained = sum(n < threshold for n in negatives) / len(negatives)
    return (answered + abstained) / 2
