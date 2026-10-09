# Méthodologie

## 1. Corpus

Le TP demande « 50 documents courts ou extraits de cours ». Le corpus en compte 111 :

| Source | Documents | Passages | Découpage |
| --- | --- | --- | --- |
| Slides du cours INF5101 (partie 1) | 60 | 60 | une slide = un passage |
| Articles Wikipédia FR du domaine | 51 | 379 | par section, au plus 180 mots, phrases entières |

**Pourquoi compléter le cours par Wikipédia ?** Les slides sont très denses (4 puces) et
peu redondantes : avec elles seules, chaque question n'a qu'une bonne réponse et la
recherche ressemble à un test de mémorisation. Les articles introduisent ce qu'un
vrai corpus contient : du vocabulaire différent pour les mêmes notions, des passages
longs, des digressions historiques, des distracteurs plausibles. C'est ce qui rend
l'analyse d'erreurs intéressante.

**Extraction des slides.** PyMuPDF renvoie des blocs positionnés. Le titre est le
premier bloc (débarrassé de l'en-tête répété du cours), le corps est formé des blocs à
puces, et les étiquettes courtes des schémas (« Corpus · Index · Réponse ») sont
conservées sur une ligne `Schéma :` car elles portent des mots-clés utiles. Les
fragments de mots coupés par la mise en page sont filtrés.

**Nettoyage des articles.** Les sections sans contenu propre (références, liens,
bibliographie) sont écartées avec leurs sous-sections. Les formules mathématiques, que
l'API restitue en caractères isolés (`t f i , j ⋅ i d f i`), sont détectées par la
proportion de jetons d'un caractère et le passage est écarté. Les sections trop courtes
sont fusionnées avec la suivante pour ne pas créer de fragments sans contexte. Chaque
article est plafonné à 10 passages pour éviter qu'un sujet très documenté ne domine
l'index.

Chaque passage est indexé avec son titre et sa section (`Spectrogramme — Sonagramme`),
ce qui donne au modèle le contexte que le passage seul n'a pas toujours.

## 2. Représentations

### Lexicale : BM25

BM25 (k1 = 1,2, b = 0,75) sur des jetons normalisés : minuscules, mots vides français
retirés, racinisation Snowball, accents supprimés après racinisation. « Réseaux de
neurones » et « réseau neurone » produisent ainsi les mêmes jetons.

### Dense : embeddings

Les embeddings sont calculés par API : le serveur ne charge aucun modèle. Trois
bi-encodeurs multilingues sont comparés :

| Modèle | Fournisseur | Paramètres | Dimension | Particularité |
| --- | --- | --- | --- | --- |
| `paraphrase-multilingual-MiniLM-L12-v2` | hf-inference | 118 M | 384 | entraîné sur des paraphrases |
| `multilingual-e5-small` | hf-inference | 118 M | 384 | entraîné pour la recherche, préfixes `query:` / `passage:` |
| **`gemini-embedding-2`** (production) | API Gemini (Google) | non publié | 768 | instruction de tâche dans le texte (`task: search result \| query: …`) |

Le corpus est encodé une fois, à la construction de l'index, et les vecteurs sont
versionnés. À l'exécution, seule la question passe par l'API ; un cache évite de
réencoder la même question entre le comparateur, la carte et le RAG. Les vecteurs sont
normalisés : la similarité cosinus devient un produit scalaire, calculé exactement sur
toute la matrice (moins d'une milliseconde pour 439 passages).

## 3. Recherche

La production utilise le **dense seul** : la question est encodée par Gemini Embedding 2
(instruction `task: search result | query: …`) et comparée par cosinus exact aux 439
passages. Ce choix vient de l'évaluation, pas d'un a priori : quatre pipelines plus
élaborés ont été construits et mesurés, et restent disponibles dans le comparateur.

1. **Fusion hybride (RRF).** Les 50 meilleurs passages de BM25 et du dense sont fusionnés
   par *Reciprocal Rank Fusion* : `score(d) = Σ 1 / (60 + rang(d))`. Seuls les rangs
   comptent, ce qui évite de normaliser des scores de natures différentes.
2. **Routage par langue.** Si la question n'est pas en français (détection par mots
   vides), BM25 est écarté de la fusion : il ne peut rien apparier et n'ajoute que du bruit.
3. **Reranking.** Les 20 premiers candidats sont relus par un cross-encoder multilingue
   (`bge-reranker-v2-m3`, via l'API Hugging Face) qui encode la question et le passage
   *ensemble*.

Avec e5-small, la fusion gagnait 2 points de Succès@1 ; avec Gemini, elle en perd 18, et
le reranker ne rattrape pas l'écart (voir [l'évaluation](evaluation.md)). Le dense seul est
aussi le plus simple et le plus rapide : un seul appel d'API par question, mis en cache.

**Abstention.** Si le cosinus du meilleur passage est sous un seuil calibré (0,643), le
moteur déclare la question hors du périmètre au lieu de générer une réponse.

**Repli.** Si l'API d'embeddings échoue (panne, quota), le moteur répond avec BM25 seul et
l'interface affiche un bandeau « mode dégradé ».

## 4. Génération (RAG) et analyse de chaque recherche

Les 5 meilleurs passages sont numérotés et fournis à Gemini Flash (`gemini-3.5-flash`,
avec repli automatique sur `gemini-flash-lite-latest` si le premier est saturé) avec une
consigne stricte : répondre uniquement à partir des extraits, citer chaque affirmation par
son numéro, dire explicitement quand les extraits ne suffisent pas. La réponse est
diffusée en flux (SSE) et chaque citation renvoie au passage, donc à la slide.

Chaque recherche est ensuite analysée :

- **Signaux de confiance** : marge du cosinus au seuil, accord entre BM25 et le dense sur le
  top 5, langue. Ils classent la recherche en risque faible, moyen ou élevé.
- **Juge LLM** : Gemini, à température nulle, juge chaque passage pertinent, partiel ou
  hors sujet avec une justification, puis diagnostique l'erreur probable. La réponse JSON
  est validée par un schéma ; la précision estimée compte un passage partiel pour moitié.

## 5. Visualisation de l'espace

La carte projette les embeddings de production en 2D avec UMAP (métrique cosinus, 15 voisins). Une
question est projetée avec le même modèle UMAP (`transform`), et reliée à ses 8 plus
proches voisins calculés dans l'espace d'origine en 768 dimensions, pas sur la carte :
UMAP préserve le voisinage local mais déforme les distances globales. Un k-means à 14
groupes, étiqueté par c-TF-IDF (termes fréquents dans le groupe et rares ailleurs),
fait apparaître les thèmes.

## 6. Cémantix

Le vocabulaire du jeu (1 887 mots) est extrait du corpus : au moins 4 lettres et 3
occurrences, sans mots grammaticaux ni formes verbales courantes, et sans noms propres
(mots écrits majoritairement avec une majuscule). Chaque mot est encodé par MiniLM : sur
des mots isolés, e5 produit des similarités tassées (médiane 0,82 à 0,86) dominées par la
forme du mot (« voix » → *voici, voie, vote*), là où MiniLM donne des voisins de sens
(« voix » → *vocale, phonétique, parole, locuteur*).

Le mot secret « attention » est gardé à dessein : ses voisins relèvent du sens courant
(*intérêt, observe, regarde*), pas du mécanisme des Transformers. Un embedding de mot
isolé ignore le contexte, exactement la limite que la slide 16 attribue aux embeddings
non contextuels. La « température » rééchelonne le cosinus : 0 °C pour la similarité médiane
du vocabulaire avec le mot secret, 100 °C pour son plus proche voisin. Sans cela, les
cosinus bruts, tassés entre 0,2 et 0,7, donnent une progression illisible.

## 7. Mode révision

Une slide du cours (au moins trois puces, hors introduction) est tirée au hasard et
envoyée au LLM en mode JSON. La réponse est validée par un schéma Pydantic (4 choix
distincts, un index de bonne réponse) et régénérée en cas d'échec. L'ordre des choix est
mélangé côté serveur : les LLM placent la bonne réponse en première position bien plus
souvent que le hasard.
