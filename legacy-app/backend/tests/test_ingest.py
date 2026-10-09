from semantica.corpus import Modality, Source
from semantica.ingest.wikipedia import Article, article_to_passages

EXTRACT = """Le TF-IDF est une méthode de pondération souvent utilisée en recherche d'information et en fouille de textes. Elle évalue l'importance d'un terme dans un document relativement à une collection, en combinant sa fréquence locale et sa rareté globale dans le corpus.

== Fréquence du terme ==
La fréquence brute d'un terme est le nombre de ses occurrences dans le document considéré, divisé par le nombre total de mots du document. Des variantes logarithmiques limitent l'effet des termes très répétés dans un même texte.

== Calcul ==
t f i , j ⋅ i d f i = n i , j ∑ k n k , j ⋅ log ⁡ | D | | { d j : t i ∈ d j } |

== Voir aussi ==
=== Articles connexes ===
Okapi BM25, sac de mots, modèle vectoriel, recherche d'information, similarité cosinus et autres liens.

== Notes et références ==
Références bibliographiques qui ne doivent jamais se retrouver dans le corpus de recherche final.
"""


def test_article_sections_skip_references_and_formulas():
    article = Article(title="TF-IDF", url="https://fr.wikipedia.org/wiki/TF-IDF", extract=EXTRACT)
    passages = article_to_passages(article, Modality.TEXT)

    text = " ".join(p.text for p in passages)
    assert "occurrences" in text
    assert "Okapi" not in text
    assert "bibliographiques" not in text
    assert "∑" not in text
    assert all(p.source is Source.WIKIPEDIA and p.doc_id == "wiki:tf-idf" for p in passages)
    assert [p.id for p in passages] == [f"wiki:tf-idf#{i}" for i in range(len(passages))]
