# Évaluation

> Le rapport complet (scores, rangs par question, distributions) est régénéré par
> `uv run semantica evaluate` dans `backend/data/eval/report.json`, et consultable sur la
> page *Évaluation* de l'application.

## Protocole

**Jeu de questions.** 65 questions écrites à la main, chacune annotée avec ses passages
pertinents (un passage précis, ou un document entier quand plusieurs sections répondent).
Les catégories ciblent chacune une faiblesse connue de la recherche :

| Catégorie | Questions | Ce qu'elle teste | Exemple |
| --- | --- | --- | --- |
| Lexicale | 13 | vocabulaire du cours | *Qu'est-ce que le TF-IDF ?* |
| Paraphrase | 16 | aucun mot-clé commun avec la réponse | *Comment un modèle sait-il qui prend la parole à quel moment ?* (diarisation) |
| Acronyme | 7 | sigles à développer | *Qu'est-ce que l'ASR ?* |
| Cross-lingue | 10 | question en anglais, corpus en français | *What is speaker diarization?* |
| Fautes | 5 | orthographe approximative | *c quoi la segmantation d'imaje* |
| Raisonnement | 6 | comparaison, négation | *Quelles méthodes de vision n'utilisent pas d'apprentissage profond ?* |
| Hors domaine | 8 | doit être refusée | *Quelle est la capitale du Cameroun ?* |

**Métriques** (sur les 57 questions du domaine) :

- **Succès@k** : part des questions dont au moins un passage pertinent est dans les k premiers.
- **MRR@10** : moyenne de 1/rang du premier passage pertinent (0 s'il est absent du top 10).
- **nDCG@10** : qualité de l'ordre en tenant compte de *tous* les passages pertinents.
- **Exactitude équilibrée** de l'abstention : moyenne du taux de réponses aux questions du
  domaine et du taux de refus hors domaine.

## Résultats

| Configuration | Succès@1 | Succès@5 | Succès@10 | MRR@10 | nDCG@10 |
| --- | --- | --- | --- | --- | --- |
| BM25 (lexical) | 0,54 | 0,79 | 0,82 | 0,65 | 0,54 |
| Dense MiniLM-L12 | 0,63 | 0,77 | 0,82 | 0,68 | 0,56 |
| Dense e5-small | 0,72 | 0,88 | 0,91 | 0,79 | 0,68 |
| **Dense Gemini Embedding 2 (production)** | **0,95** | **1,00** | **1,00** | **0,97** | **0,91** |
| Hybride RRF sans routage | 0,72 | 0,93 | 0,96 | 0,82 | 0,72 |
| Hybride RRF (BM25 + Gemini, routage par langue) | 0,77 | 0,95 | 0,96 | 0,85 | 0,77 |
| Hybride + reranking bge-reranker-v2-m3 | 0,81 | 0,93 | 0,96 | 0,85 | 0,74 |

Succès@1 par catégorie :

| Configuration | Lexicale | Paraphrase | Acronyme | Cross-lingue | Fautes | Raisonnement |
| --- | --- | --- | --- | --- | --- | --- |
| BM25 | 0,77 | 0,44 | 0,43 | 0,50 | 0,60 | 0,50 |
| Dense MiniLM | 0,85 | 0,19 | 0,71 | 0,90 | 0,60 | 0,83 |
| Dense e5-small | 0,92 | 0,31 | 1,00 | 0,90 | 1,00 | 0,50 |
| **Dense Gemini** | **1,00** | **0,81** | **1,00** | **1,00** | **1,00** | **1,00** |
| Hybride sans routage | 0,85 | 0,56 | 0,86 | 0,70 | 1,00 | 0,50 |
| Hybride RRF | 0,85 | 0,56 | 0,86 | 1,00 | 1,00 | 0,50 |
| Hybride + reranking | 0,92 | 0,56 | 1,00 | 1,00 | 1,00 | 0,50 |

**Abstention** (8 questions hors domaine, 57 du domaine) :

| Signal | Seuil | Exactitude équilibrée | Leave-one-out |
| --- | --- | --- | --- |
| **Cosinus Gemini du meilleur passage (production)** | 0,643 | 1,00 | 1,00 |
| Score du reranker | −6,00 | 1,00 | 1,00 |

## Ce que les erreurs nous apprennent

**1. Le modèle d'embedding fait presque tout.** À architecture égale, passer d'e5-small à
Gemini Embedding 2 fait monter le Succès@1 de 0,72 à 0,95. Aucun réglage de pipeline n'a
approché cet écart.

**2. Avec un bon modèle dense, BM25 devient du bruit.** La fusion RRF fait reculer la bonne
réponse sur 13 questions et n'en améliore que 3 (Succès@1 de 0,95 à 0,77). Avec e5, la même
fusion gagnait 2 points : l'hybride compense un modèle dense faible, il dilue un bon
classement. C'est pourquoi la production utilise le dense seul.

**3. Un reranker plus faible que le retriever.** bge-reranker-v2-m3 remonte l'hybride à
0,81 sans rattraper Gemini seul, et coûte plusieurs secondes par question. Un
cross-encoder n'est utile que s'il juge mieux que le premier étage.

**4. Le sens sans les mots.** Sur les paraphrases, Gemini atteint 0,81, contre 0,44 pour
BM25 et 0,31 pour e5. Les trois échecs restants sont des quasi-réussites : la bonne réponse
est au rang 2 (*Pourquoi les machines ne comprennent-elles pas directement les mots ?*,
*Comment transformer un enregistrement de voix en texte écrit ?*, *Comment éviter qu'un
assistant conversationnel invente des réponses ?*).

**5. Le franglais du cours.** *Comment suivre une personne d'une image à l'autre dans une
vidéo ?* échouait avec tous les modèles : la slide attendue parle de *tracking*, *Kalman
filter*, *ByteTrack*. Gemini la place au rang 1 ; l'hybride et le reranker la perdent de
nouveau, tirés par des passages qui partagent des mots avec la question.

**6. L'anglais exige toujours d'écarter BM25 de la fusion.** Sans routage par langue,
l'hybride tombe à 0,70 en Succès@1 cross-lingue ; avec routage, 1,00. BM25 apparie quelques
termes techniques partagés (*spectrogram*, *diarization*) et pollue le classement.

**7. Un seuil d'abstention enfin robuste.** Avec e5, les cosinus du domaine et hors domaine
se chevauchaient à quelques millièmes près (exactitude 0,93 en leave-one-out). Avec
Gemini, la question du domaine la moins bien notée (0,70) dépasse nettement la mieux notée
hors domaine (0,59) : 8 refus sur 8 et aucun refus à tort.

**8. La qualité se paie en latence réseau.** Un embedding Gemini prend environ 1,5 s par
l'API gratuite, contre quelques dizaines de millisecondes pour e5 en local. Sur une machine
modeste, c'est le bon compromis : aucun modèle en mémoire, et une qualité qu'aucun modèle
local testé n'atteint.

## Évaluer chaque recherche

Le jeu de 65 questions mesure le moteur ; il ne dit rien d'une question quelconque posée
par un visiteur. Chaque recherche affiche donc deux analyses complémentaires :

- **Signaux de confiance** (gratuits, immédiats) : cosinus du meilleur passage comparé au
  seuil calibré, accord entre BM25 et le dense sur le top 5, langue de la question. Ils
  classent la recherche en risque faible, moyen ou élevé.
- **Juge LLM** (Gemini, quelques secondes) : chaque passage est jugé pertinent, partiel ou
  hors sujet, avec une justification ; on en déduit une précision estimée (un passage
  partiel compte pour moitié), le rang du premier passage pertinent et un diagnostic de
  l'erreur probable. C'est l'évaluation *LLM-as-judge* : une estimation sans vérité
  terrain, présentée comme telle dans l'interface.

## Limites

- **Taille du jeu.** 57 questions du domaine : un écart de 2 points correspond à une
  question. Seules les différences marquées sont interprétables. Les 8 questions hors
  domaine rendent la calibration du seuil optimiste malgré la validation croisée.
- **Annotation par une seule personne**, qui connaît le corpus. Des passages pertinents non
  annotés pénalisent à tort certaines réponses (le nDCG y est le plus sensible).
- **Juge non calibré.** Le juge LLM n'a pas été comparé à des jugements humains ; ses
  verdicts peuvent être plus sévères ou plus indulgents qu'un enseignant.
- **Latence mesurée sur l'API gratuite** depuis Yaoundé : elle dépend du réseau et de la
  charge de Google, et varie fortement (p95 de l'embedding autour de 3,5 s).
