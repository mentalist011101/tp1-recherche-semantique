# Méthodologie

Chaque étape correspond à une section du
[notebook](../notebooks/recherche_semantique.ipynb). Le principe : une bibliothèque standard pour
le travail générique, du code maison seulement là où ce corpus l'exige. La constitution du corpus
(section 1) est décrite à part, dans [corpus.md](corpus.md).

## 2. Des PDF au Markdown

`pymupdf4llm` convertit chaque PDF en Markdown. Son modèle de mise en page (un petit réseau ONNX)
reconnaît les intertitres bien mieux que des règles : 17 intertitres sur D21, contre 1 sans le
modèle. Il retire aussi de lui-même le filigrane vertical d'arXiv.

Deux adaptations au corpus, constatées en vérifiant les PDF :

- **Page de garde HAL.** HAL ajoute une page identique (identifiant, date de dépôt, licence)
  devant chacun des 15 articles français. Elle n'est pas convertie : laissée, elle rendrait ces
  15 documents artificiellement proches.
- **Références.** Les bibliographies citent les titres d'autres articles : une question sur la
  parole remonterait un article d'image qui cite un article de parole. Le texte est coupé à
  l'intertitre des références, reconnu exactement (« References », « Références »,
  « Bibliographie », éventuellement numéroté) pour ne pas couper D08 à sa section « Effect of
  reference input document ». Quand l'intertitre manque (D36), la coupe se fait à la première
  entrée « [n] ». En moyenne 18 % du texte est retiré.

Contrainte matérielle : le modèle de mise en page sature les 8 Go de la machine si l'on enchaîne
les 50 conversions dans un même processus. Le cache `data/markdown/` a été rempli à raison d'un
processus par document.

## 3. Découpage en passages

Un embedding résume un texte en un vecteur : plus le texte est long, plus le vecteur est flou. Les
articles sont donc découpés en passages, en deux temps :

1. `MarkdownHeaderTextSplitter` : un morceau par section, l'intertitre gardé en métadonnée ;
2. `RecursiveCharacterTextSplitter` : 1 000 caractères au plus (environ 160 mots, sous la limite
   de 507 tokens du modèle), coupés de préférence entre paragraphes, avec 150 caractères de
   chevauchement pour qu'une idée à cheval sur une coupure reste trouvable.

Avant le découpage, on retire ce qui n'est pas du contenu :

- tout ce qui précède le résumé (titre, auteurs, affiliations, e-mails) ;
- le texte lu dans les figures et les lignes des tableaux, des fragments sans phrases ;
- les sections de remerciements ;
- les passages de moins de 20 mots (numéros de page isolés, légendes seules). Ce dernier filtre
  vient de l'analyse des erreurs (section 7) : leur embedding se résumait au titre de l'article.

Chaque passage est ensuite **préfixé par « titre de l'article › intertitre »** avant d'être
encodé. Un passage isolé comme « Our method outperforms… » ne dit pas de quoi il parle ; le
préfixe lui donne son contexte. Résultat : 1 196 passages, de 9 à 42 par article.

## 4. Embeddings et base vectorielle

- **Modèle** : `multilingual-e5-large`, servi par Pinecone Inference. Il place le français et
  l'anglais dans le même espace (une phrase et sa traduction : similarité 0,93), ce qui rend la
  recherche cross-lingue possible, et rien de lourd ne tourne sur notre machine. La famille e5
  distingue les requêtes des passages (préfixes `query:` et `passage:`), ce que LangChain gère.
- **Base** : un index Pinecone *serverless* de dimension 1 024, en similarité cosinus. Les
  identifiants des vecteurs sont les `chunk_id` (`D21-004`) : relancer l'envoi écrase au lieu de
  dupliquer.

Propriété à garder en tête : avec e5, toutes les similarités sont tassées dans le haut de
l'échelle (une phrase sans rapport obtient encore 0,85). Un score n'a de sens que comparé aux
autres.

## 5. Des passages aux articles

Pinecone renvoie des passages ; l'étudiant veut savoir quels articles lire. On récupère les 60
passages les plus proches, puis chaque article prend le score de son **meilleur** passage, qui
sert aussi de justification affichée. Il faut aller chercher large : avec 20 passages, la question
sur le spoofing ne renvoyait qu'un article, qui occupait les 20 premières places.

## 7. Abstention

Sous un seuil de similarité, le moteur prévient qu'aucun article du corpus ne semble traiter le
sujet. Le seuil (0,838) est celui qui maximise la justesse équilibrée entre questions hors corpus
refusées et questions avec réponse acceptées. Les limites de ce seuil sont discutées dans
[evaluation.md](evaluation.md).
