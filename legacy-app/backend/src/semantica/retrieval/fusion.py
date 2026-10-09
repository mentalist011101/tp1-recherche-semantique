from collections import defaultdict

from semantica.retrieval.types import Hit

RRF_K = 60


def reciprocal_rank_fusion(rankings: list[list[Hit]], k: int = RRF_K) -> list[Hit]:
    # RRF ne combine que des rangs : les scores BM25 (non bornés) et cosinus (dans [-1, 1])
    # ne sont pas comparables, une somme pondérée exigerait une normalisation fragile.
    fused: dict[int, float] = defaultdict(float)
    for ranking in rankings:
        for rank, hit in enumerate(ranking):
            fused[hit.index] += 1.0 / (k + rank + 1)
    return [Hit(i, s) for i, s in sorted(fused.items(), key=lambda item: -item[1])]
