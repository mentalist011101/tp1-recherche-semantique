# Constitution du corpus

Le corpus compte 50 articles scientifiques courts (2 à 6 pages) : 35 en anglais tirés d'arXiv,
15 en français tirés de HAL. Ils couvrent les quatre modalités du cours INF5101 (texte, image,
audio, multimodal). Ce document retrace comment ils ont été choisis, le 2026-10-09.

## Pourquoi des articles courts

- Un article de 2 à 6 pages traite un sujet précis : une question d'utilisateur a en général une
  réponse claire, ce qui rend l'annotation des questions d'évaluation fiable.
- Le corpus reste lisible en entier par un humain, donc vérifiable.
- C'est le cas d'usage visé : un étudiant cherche quels articles lire sur un sujet.

## Étape 1 : collecte automatique des candidats

Script : [`scripts/candidats.py`](../scripts/candidats.py). Résultat figé :
[`data/candidates.csv`](../data/candidates.csv) (226 lignes).

**arXiv** (API Atom `export.arxiv.org`). Six requêtes par modalité, portant sur le résumé
(`abs:`), triées par pertinence, 150 résultats chacune :

| Modalité | Requêtes |
| --- | --- |
| texte | dense retrieval, sentence embeddings, retrieval-augmented generation, cross-lingual retrieval, BM25 AND neural, question answering AND retrieval |
| image | CNN AND image classification, object detection, semantic segmentation, content-based image retrieval, optical character recognition, vision transformer |
| audio | automatic speech recognition, speaker verification, MFCC, sound event detection, speech emotion recognition, music information retrieval |
| multimodal | CLIP AND image-text, video captioning, audio-visual, multimodal retrieval, visual question answering, text-to-audio retrieval |

arXiv ne fournit pas le nombre de pages comme champ structuré, mais les auteurs l'écrivent presque
toujours dans le commentaire libre (« 5 pages, 2 figures »). Le script extrait ce nombre par
expression régulière et ne garde que les articles de 2 à 6 pages, au plus 6 par requête.

**HAL** (API Solr `api.archives-ouvertes.fr`). Quatre conférences francophones dont les actes sont
courts : GRETSI (signal et image, format 4 pages), CORIA et TALN (recherche d'information et TAL),
JEP (parole). Filtres : langue française, communication en conférence, texte intégral déposé. Le
nombre de pages est calculé à partir de la plage `page_s` (`217-220` → 4 pages).

## Étape 2 : sélection manuelle

Résultat : [`data/selection.csv`](../data/selection.csv), identifiants `D01` à `D50`.

Critères appliqués :

1. **Lien avec le cours.** Ont été écartés les articles hors du périmètre multimédia : radar,
   décomposition tensorielle, communications satellite, détection quantique multi-utilisateurs.
2. **Contenu scientifique.** Ont été écartés les démos d'outils et les descriptions de corpus des
   JEP, qui contiennent peu de texte explicatif.
3. **Équilibre.** Texte 15, image 13, audio 11, multimodal 11.
4. **Voisins volontaires.** Des articles proches pour que le moteur ait à les départager, et que
   l'analyse d'erreurs ait de la matière :
   - OCR : D16 (super-résolution) et D17 (seuillage adaptatif) ;
   - émotion dans la parole : D22, D23, D26 ;
   - RAG : D04, D05, D06 en anglais, D45, D46, D47 en français ;
   - recherche d'information neuronale : D01, D07, D08, D48, D49.
5. **Paires anglais/français sur un même thème**, pour tester la recherche cross-lingue : RAG,
   CNN (D10, D11 / D36, D37), similarité de phrases (D02, D03 / D50), parole (D19, D20 / D41).
6. **Doublons.** Les résultats HAL contenaient des doublons (même article indexé deux fois). Un seul
   exemplaire est gardé.

## Limites connues

- Le nombre de pages vient des métadonnées déclarées. Il est revérifié sur les PDF dans la section 1
  du notebook.
- Le tri « par pertinence » des deux API évolue : relancer le script ne redonne pas exactement la
  même liste. Le fichier `candidates.csv` figé fait foi.
- La modalité des articles HAL est attribuée à la main, la conférence seule ne suffisant pas
  (GRETSI couvre à la fois l'image et l'audio).
