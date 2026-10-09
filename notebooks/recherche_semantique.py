# %% [markdown]
# # Recherche sémantique dans un corpus d'articles scientifiques
#
# **INF5101 · Traitement multimédia des données · TP texte (slide 24)**
#
# > - Importer 50 documents courts ou extraits de cours.
# > - Créer des embeddings avec un modèle sentence-transformer ou une API locale/serveur.
# > - Construire un petit moteur de recherche sémantique en Python.
# > - Tester des questions et analyser les erreurs de récupération.
#
# Le corpus : 50 articles scientifiques de 2 à 6 pages, 35 en anglais (arXiv) et 15 en français
# (HAL), sur les quatre modalités du cours. Le cas d'usage : un étudiant pose une question et le
# moteur lui indique quels articles lire.
#
# Chaque étape est d'abord construite à la main, pour montrer le mécanisme, puis suivie d'une
# cellule « version moderne » qui fait la même chose avec la bibliothèque qu'on utiliserait en
# production.
#
# | Section | Contenu |
# | --- | --- |
# | 1 | Corpus : téléchargement, vérification, description |
# | 2 | Extraction du texte des PDF |
# | 3 | Découpage en passages |
# | 4 | Embeddings |
# | 5 | Moteur de recherche |
# | 6 | Évaluation |
# | 7 | Analyse des erreurs |

# %%
import hashlib
import time
from pathlib import Path

import httpx
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import pymupdf

ROOT = Path.cwd().parent if Path.cwd().name == "notebooks" else Path.cwd()
DATA = ROOT / "data"
PDF_DIR = DATA / "pdf"
PDF_DIR.mkdir(parents=True, exist_ok=True)

pd.set_option("display.max_colwidth", 80)

# %% [markdown]
# ## 1. Le corpus
#
# ### 1.1 La sélection
#
# Les 50 articles ont été choisis à la main parmi 226 candidats collectés automatiquement sur
# arXiv et HAL. La méthode (requêtes, filtres, critères de choix) est décrite dans
# [`docs/corpus.md`](../docs/corpus.md) et le script de collecte est
# [`scripts/candidats.py`](../scripts/candidats.py).

# %%
selection = pd.read_csv(DATA / "selection.csv")
selection[["doc_id", "langue", "modalite", "pages", "titre"]].head(10)

# %%
pd.crosstab(selection["modalite"], selection["langue"], margins=True, margins_name="total")

# %% [markdown]
# ### 1.2 Téléchargement, à la main
#
# Quelques précautions qu'une boucle naïve oublierait :
#
# - **idempotence** : un PDF déjà présent n'est pas retéléchargé, on peut relancer la cellule ;
# - **politesse** : les conditions d'utilisation d'arXiv demandent au plus une requête toutes les
#   3 secondes ;
# - **vérification du contenu** : un serveur peut renvoyer une page HTML (erreur, captcha) avec un
#   code 200. On vérifie la signature `%PDF` au début du fichier plutôt que de faire confiance à
#   l'en-tête.

# %%
def download(url: str, dest: Path, client: httpx.Client) -> str:
    if dest.exists():
        return "déjà présent"
    response = client.get(url)
    if response.status_code != 200:
        return f"erreur HTTP {response.status_code}"
    if not response.content.startswith(b"%PDF"):
        return "pas un PDF"
    dest.write_bytes(response.content)
    return "téléchargé"


HEADERS = {"User-Agent": "INF5101-tp1 (usage pedagogique)"}
statuses = {}
with httpx.Client(follow_redirects=True, timeout=60, headers=HEADERS) as client:
    for row in selection.itertuples():
        dest = PDF_DIR / f"{row.doc_id}.pdf"
        status = download(row.url, dest, client)
        statuses[row.doc_id] = status
        if status == "téléchargé" and row.source == "arxiv":
            time.sleep(3)

pd.Series(statuses).value_counts()

# %% [markdown]
# ### 1.3 Version moderne : le client `arxiv`
#
# Le paquet [`arxiv`](https://pypi.org/project/arxiv/) encapsule l'API : recherche, pagination,
# respect du délai entre requêtes, téléchargement. HAL n'a pas de client Python officiel ; son API
# Solr s'interroge directement en HTTP, comme dans `scripts/candidats.py`.
#
# On l'utilise ici pour relire les métadonnées d'un article et vérifier qu'elles correspondent à
# notre fichier, sans tout retélécharger.

# %%
import arxiv

client = arxiv.Client(delay_seconds=3)
first = selection[selection["source"] == "arxiv"].iloc[0]
paper = next(client.results(arxiv.Search(id_list=[first["source_id"]])))
print(paper.title)
print(", ".join(a.name for a in paper.authors))
print(paper.comment)
print(paper.pdf_url)
# paper.download_pdf(dirpath=PDF_DIR, filename=f"{first['doc_id']}.pdf") ferait le téléchargement.

# %% [markdown]
# ### 1.4 Vérification des PDF
#
# Pour chaque fichier, on vérifie ce qui pourrait casser les étapes suivantes :
#
# - **nombre réel de pages**, comparé à celui déclaré dans les métadonnées ;
# - **présence d'une couche texte** : un PDF scanné n'a que des images, il faudrait de l'OCR ;
# - **empreinte SHA-256**, pour garantir que le corpus ne change pas entre deux exécutions.

# %%
def inspect(path: Path) -> dict:
    with pymupdf.open(path) as doc:
        text = "".join(page.get_text() for page in doc)
        return {
            "pages_reelles": doc.page_count,
            "mots": len(text.split()),
            "couche_texte": len(text.strip()) > 500,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest()[:16],
        }


checks = pd.DataFrame([{"doc_id": p.stem, **inspect(p)} for p in sorted(PDF_DIR.glob("D*.pdf"))])
corpus = selection.merge(checks, on="doc_id")
corpus["ecart_pages"] = corpus["pages_reelles"] - corpus["pages"]
print(f"{len(corpus)} PDF, {corpus['couche_texte'].sum()} avec couche texte")
corpus["ecart_pages"].value_counts().sort_index()

# %%
corpus.loc[corpus["ecart_pages"] != 0, ["doc_id", "source", "pages", "pages_reelles", "venue"]]

# %% [markdown]
# **Lecture.** Les 50 PDF ont une couche texte : aucun OCR n'est nécessaire. 21 documents ont plus
# de pages que déclaré, pour deux raisons différentes :
#
# - **les 15 articles HAL ont tous une page de plus** : HAL ajoute une page de garde (identifiant,
#   date de dépôt, mention de licence) devant chaque document. Cette page ne dit rien du contenu
#   et devra être retirée à l'extraction, sinon les 15 documents se ressembleront artificiellement ;
# - **les écarts arXiv** viennent des références et des annexes que les auteurs ne comptent pas
#   (« 4 pages content, 1 page references »). D01 passe de 5 à 8 pages à cause d'une annexe.
#
# Aucun document ne dépasse 8 pages : le critère « article court » tient.

# %% [markdown]
# ### 1.5 À quoi ressemble un document
#
# Le format qu'on va devoir traiter : mise en page sur deux colonnes, en-têtes, équations,
# figures, références, la page de garde de HAL et, sur arXiv, le filigrane vertical dans la marge
# gauche (`arXiv:2306.10348v1 [cs.IR] 17 Jun 2023`). Chacun de ces éléments est un défi pour
# l'extraction (section 2).

# %%
pages_to_show = [("D01", 0, "arXiv, page 1"), ("D36", 0, "HAL, page de garde"), ("D36", 1, "HAL, page 2")]
fig, axes = plt.subplots(1, 3, figsize=(15, 7))
for ax, (doc_id, page, label) in zip(axes, pages_to_show):
    with pymupdf.open(PDF_DIR / f"{doc_id}.pdf") as doc:
        pix = doc[page].get_pixmap(dpi=70)
    ax.imshow(np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n))
    ax.set_title(f"{doc_id} · {label}", fontsize=10)
    ax.axis("off")
plt.tight_layout()

# %% [markdown]
# ### 1.6 Description du corpus

# %%
fig, axes = plt.subplots(1, 3, figsize=(15, 4))
pd.crosstab(corpus["modalite"], corpus["langue"]).plot.bar(ax=axes[0], rot=0, title="Documents par modalité")
corpus["pages_reelles"].value_counts().sort_index().plot.bar(ax=axes[1], rot=0, title="Pages réelles par document")
corpus.boxplot(column="mots", by="langue", ax=axes[2])
axes[2].set_title("Mots par document")
fig.suptitle("")
plt.tight_layout()

# %%
corpus.groupby("langue")["mots"].describe().round(0)

# %%
corpus.to_csv(DATA / "corpus.csv", index=False)
print(f"{len(corpus)} documents, {corpus['mots'].sum():,} mots au total".replace(",", " "))
