# Évaluation

Sections 6 et 7 du [notebook](../notebooks/recherche_semantique.ipynb).

## Protocole

[`data/questions.csv`](../data/questions.csv) contient 40 questions annotées à la main, chacune
avec les articles qui y répondent :

| Type | Nombre | Principe |
| --- | --- | --- |
| Factuelle | 12 | reprend le vocabulaire de l'article (8 en anglais, 4 en français) |
| Paraphrase | 10 | formulée comme un étudiant, sans le jargon de l'article |
| Cross-lingue | 10 | 7 questions françaises vers un article anglais, 3 dans l'autre sens |
| Hors corpus | 8 | aucun article ne répond |

Les questions ont été rédigées à partir des résumés, sans les passer dans le moteur, pour ne pas
les ajuster à ce qu'il trouve.

Métriques, calculées avec `ranx` sur les 32 questions qui ont une réponse :

- **Hit@1, Hit@5** : un bon article est-il en tête, dans les cinq premiers ?
- **MRR@10** : inverse du rang du premier bon article ;
- **nDCG@10** : qualité de tout le classement quand plusieurs articles sont pertinents.

Référence de comparaison : **BM25** (`bm25s`) sur les mêmes passages, avec le même regroupement
par article. Les écarts sont testés avec un test de Student apparié (`ranx.compare`).

## Résultats

| Moteur | Hit@1 | Hit@5 | MRR@10 | nDCG@10 |
| --- | --- | --- | --- | --- |
| BM25 | 0,69 | 0,78 | 0,73 | 0,75 |
| **Pinecone + multilingual-e5-large** | **0,94** | **1,00** | **0,95** | **0,96** |

Le moteur sémantique l'emporte sur les quatre métriques, avec un écart significatif (p < 0,05).

| Type (Hit@1) | BM25 | Pinecone + e5 |
| --- | --- | --- |
| Factuelle | 1,00 | 1,00 |
| Paraphrase | 0,70 | 1,00 |
| Cross-lingue | 0,30 | 0,80 |

L'avantage des embeddings n'apparaît que quand les mots changent : à vocabulaire identique, BM25
fait aussi bien. Sans mot commun entre une question française et un article anglais, BM25
s'effondre sur le cross-lingue.

## Analyse des erreurs

**Une erreur d'extraction, corrigée.** La première analyse montrait que le passage qui trompait
le moteur sur C06 se réduisait à « 1 » : un numéro de page isolé, dont l'embedding se résumait au
préfixe, donc au titre de l'article. 46 passages de moins de 20 mots ont été écartés (section 3),
ce qui a corrigé C06 sans rien dégrader.

**Deux erreurs restantes, une même cause : le biais de langue.**

| Question | Attendu | Obtenu en tête | Rang de l'attendu |
| --- | --- | --- | --- |
| C05 · Retrouver des sons à partir d'une description en langage naturel | D34, D35 (en) | D48 (fr), via sa ligne de mots-clés « Recherche d'Information… » | 4 |
| C07 · Recherche d'images par le contenu dans de grandes bases de données | D14, D15 (en) | D43 (fr), sur la description d'images | 4 |

**Le biais se mesure sur toutes les questions** : part d'articles français dans les cinq premiers
résultats.

| Langue de la question | Part d'articles français dans le top 5 |
| --- | --- |
| Français | 73 % |
| Anglais | 12 % |
| *Part dans le corpus* | *30 %* |

Le modèle est multilingue, mais la langue reste une part importante de ce que l'embedding encode.
Pistes non testées : traduire la question dans l'autre langue et fusionner les deux recherches, ou
indexer une traduction de chaque passage. L'application propose en attendant un filtre de langue.

## Abstention

Le meilleur score des 8 questions hors corpus reste sous celui des questions avec réponse. Au
seuil de 0,838, les 8 sont refusées et une seule question avec réponse l'est à tort (C05, déjà mal
classée).

## Limites

- **Taille** : 32 questions avec réponse et 8 hors corpus. Un écart d'une question change Hit@1 de
  3 points.
- **Questions trop faciles** : 100 % sur les paraphrases suggère qu'elles restent proches du
  vocabulaire des articles. Des questions posées par de vrais étudiants seraient un test plus dur.
- **Seuil fragile** : l'écart entre questions hors corpus et questions avec réponse ne tient qu'à
  quelques millièmes, à cause des scores e5 tassés. C'est un ordre de grandeur, pas une valeur à
  figer.
- **Annotations** : un seul annotateur, et quelques cas discutables (une question sur l'émotion
  dans la voix est-elle servie par un article sur les caractéristiques GFCC ?).
