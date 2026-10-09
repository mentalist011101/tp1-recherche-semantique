import math

from semantica.evaluation.metrics import (
    best_threshold,
    first_relevant_rank,
    ndcg_at,
    reciprocal_rank,
    success_at,
)
from semantica.retrieval.fusion import reciprocal_rank_fusion
from semantica.retrieval.lexical import LexicalIndex
from semantica.retrieval.types import Hit


def test_rrf_rewards_documents_ranked_well_by_both_lists():
    lexical = [Hit(1, 9.0), Hit(2, 5.0), Hit(3, 1.0)]
    dense = [Hit(2, 0.9), Hit(4, 0.8), Hit(1, 0.7)]
    fused = reciprocal_rank_fusion([lexical, dense])
    assert [h.index for h in fused[:2]] == [2, 1]
    assert {h.index for h in fused} == {1, 2, 3, 4}


def test_rrf_ignores_raw_scores():
    a = reciprocal_rank_fusion([[Hit(1, 1000.0), Hit(2, 0.001)]])
    b = reciprocal_rank_fusion([[Hit(1, 0.5), Hit(2, 0.4)]])
    assert [h.score for h in a] == [h.score for h in b]


def test_lexical_index_matches_inflected_forms():
    index = LexicalIndex.build(
        [
            "Les spectrogrammes représentent le son.",
            "La segmentation d'images attribue une classe à chaque pixel.",
            "Le Transformer utilise l'auto-attention.",
        ]
    )
    hits = index.search("segmenter une image", k=3)
    assert hits[0].index == 1


def test_lexical_index_returns_nothing_without_shared_terms():
    index = LexicalIndex.build(["Les spectrogrammes représentent le son."])
    assert index.search("bounding boxes", k=3) == []


def test_ranking_metrics():
    ranked = [False, True, False, True]
    assert first_relevant_rank(ranked) == 2
    assert success_at(ranked, 1) == 0.0
    assert success_at(ranked, 2) == 1.0
    assert reciprocal_rank(ranked) == 0.5
    expected = (1 / math.log2(3) + 1 / math.log2(5)) / (1 + 1 / math.log2(3))
    assert math.isclose(ndcg_at(ranked, relevant_count=2), expected)


def test_ndcg_is_one_for_perfect_ranking():
    assert ndcg_at([True, True, False], relevant_count=2) == 1.0


def test_best_threshold_separates_clean_distributions():
    threshold, accuracy = best_threshold([0.8, 0.9, 0.95], [0.1, 0.2, 0.3])
    assert 0.3 < threshold < 0.8
    assert accuracy == 1.0
