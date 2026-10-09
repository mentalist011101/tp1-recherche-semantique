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
import json
import re
import time
import unicodedata
from collections import Counter
from dataclasses import dataclass
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

# %% [markdown]
# ## 2. Extraction du texte
#
# ### 2.1 Le problème
#
# Un PDF ne contient pas de « texte » au sens d'un document Word : il contient des instructions
# de dessin (tel glyphe, dans telle police, à telle position). L'extraction la plus simple,
# `page.get_text()`, recolle ces glyphes dans l'ordre où ils ont été dessinés. Voici ce qu'elle
# donne sur le début de D21 :

# %%
with pymupdf.open(PDF_DIR / "D21.pdf") as doc:
    print(doc[0].get_text()[:1200])

# %% [markdown]
# Tout y est mélangé : auteurs, affiliations, adresse e-mail, et à la fin de la page le filigrane
# arXiv. Plus loin viendraient les numéros de page, les légendes de figures, les cellules de
# tableaux et les références. Pour un moteur de recherche, chacun de ces éléments est du bruit :
#
# - la **page de garde HAL** est identique pour 15 documents : elle les rapprocherait tous entre eux ;
# - les **références** contiennent les titres d'autres articles : une question sur la reconnaissance
#   vocale remonterait un article d'image qui cite un article de reconnaissance vocale ;
# - le **filigrane**, les **en-têtes** et les **numéros de page** n'ont aucun sens.
#
# On veut à la place, pour chaque document : son résumé, et la liste de ses sections (intertitre +
# texte), sans le reste.
#
# ### 2.2 Lecture ligne par ligne avec la mise en forme
#
# `page.get_text("dict")` donne, pour chaque ligne, ses fragments (*spans*) avec leur police, leur
# taille, leur graisse et l'orientation de la ligne. C'est cette mise en forme qui permet de trier :
#
# | Élément | Comment on le reconnaît |
# | --- | --- |
# | page de garde HAL | première page contenant « HAL Id » |
# | filigrane arXiv | ligne verticale (`dir` différent de (1, 0)) |
# | en-têtes, pieds de page | bloc court dans les 7 % du haut ou du bas de la page |
# | notes de bas de page, affiliations | police nettement plus petite que le corps du texte |
#
# Deux défauts de rendu sont corrigés au passage : les petites capitales des articles IEEE, que le
# PDF découpe en « I NTRODUCTION », et les numéros de section isolés sur leur propre ligne
# (« 2.1 » puis « Query Augmentation »).

# %%
BOLD_FONTS = ("bold", "medi", "semibold", "black", "heavy")
BARE_NUMBER_RE = re.compile(r"^(\d+(\.\d+)*|[IVX]+)\.?$")


@dataclass(frozen=True)
class Line:
    text: str
    size: float
    bold: bool


def read_lines(path: Path) -> list[Line]:
    lines = []
    with pymupdf.open(path) as doc:
        for page in doc:
            if page.number == 0 and "HAL Id" in page.get_text():
                continue
            height = page.rect.height
            for block in page.get_text("dict")["blocks"]:
                if block["type"] != 0:
                    continue
                top, bottom = block["bbox"][1] / height, block["bbox"][3] / height
                pending_number = ""
                for line in block["lines"]:
                    if line["dir"] != (1.0, 0.0):
                        continue
                    spans = [s for s in line["spans"] if s["text"].strip()]
                    text = fix_small_caps(normalize(" ".join(s["text"] for s in spans)))
                    if not text or (bottom < 0.07 or top > 0.93) and len(text) < 120:
                        continue
                    if BARE_NUMBER_RE.match(text):
                        pending_number = text
                        continue
                    text = f"{pending_number} {text}".strip()
                    pending_number = ""
                    lines.append(Line(text, max(s["size"] for s in spans), all(is_bold(s) for s in spans)))
    return lines


def normalize(text: str) -> str:
    # NFKC décompose les ligatures typographiques (« ﬁ » → « fi ») que les PDF LaTeX utilisent partout.
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", text)).strip()


def fix_small_caps(text: str) -> str:
    return re.sub(r"\b([A-ZÀ-Ý]) ([A-ZÀ-Ý]{2,})\b", r"\1\2", text)


def is_bold(span: dict) -> bool:
    return bool(span["flags"] & 16) or any(k in span["font"].lower() for k in BOLD_FONTS)


def body_size(lines: list[Line]) -> int:
    chars = Counter()
    for line in lines:
        chars[round(line.size)] += len(line.text)
    return chars.most_common(1)[0][0]


d21 = read_lines(PDF_DIR / "D21.pdf")
print(f"corps du texte : {body_size(d21)} pt")
pd.DataFrame(d21[:14])

# %% [markdown]
# ### 2.3 Reconnaître les intertitres
#
# Aucune règle unique ne marche sur 50 articles issus d'une dizaine de gabarits (IEEE, ACM, ACL,
# Interspeech, GRETSI…). Un intertitre est une ligne qui cumule plusieurs indices :
#
# 1. **courte** (moins de 70 caractères), et ce n'est pas une légende (« Figure 3 », « Table 1 ») ;
# 2. **mise en valeur** : en gras, plus grande que le corps du texte, ou entièrement en majuscules ;
# 3. **numérotée** (« 2.1 », « III. », « B. ») ou formée d'un **mot-clé** de section
#    (Introduction, Conclusion, Résumé, Références…) ;
# 4. **numérotation plausible** : une section suit la précédente (au plus un numéro sauté, au cas
#    où un intertitre n'aurait pas été reconnu), une sous-section reste dans sa section, et le
#    style reste le même (« 3. » ne succède pas à « 2 »). Sans ce garde-fou, les lignes d'un
#    tableau de résultats (« 84.57 CBAM », « 11 UR AIR ») deviendraient des sections.

# %%
NUMBERED_RE = re.compile(r"^(\d+(\.\d+)*\.?|[IVX]+\.|[A-H]\.)\s+[A-ZÀ-ÖØ-Ý0-9]")
KEYWORD_RE = re.compile(
    r"^((\d+|[IVX]+)\.?\s+)?(abstract|résumé|introduction|conclusions?|related works?|references?|références|"
    r"bibliograph(y|ie)|acknowledge?ments?|remerciements|keywords|index terms|mots[- ]clés|ccs concepts|"
    r"discussion|results?|résultats|experiments?|expériences|methods?|méthodes?|methodology|méthodologie)\b",
    re.I,
)
CAPTION_RE = re.compile(r"^(fig(ure)?|table|tab)\.?\s*\d", re.I)
ROMAN = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8, "IX": 9, "X": 10}


def is_heading(line: Line, body: int) -> bool:
    text = line.text
    if len(text) > 70 or CAPTION_RE.match(text):
        return False
    if text.endswith((".", ",", ":")) and not KEYWORD_RE.match(text):
        return False
    emphasized = line.bold or line.size >= body + 1 or text.upper() == text
    return emphasized and bool(NUMBERED_RE.match(text) or KEYWORD_RE.match(text) and len(text) < 40)


@dataclass(frozen=True)
class Numbering:
    top: int
    sub: bool
    dotted: bool


def numbering(text: str) -> Numbering | None:
    match = re.match(r"^(\d+|[IVX]+)((\.\d+)*)(\.?)\s", text)
    if not match:
        return None
    token = match.group(1)
    top = int(token) if token.isdigit() else ROMAN.get(token, 0)
    return Numbering(top, bool(match.group(2)), text[len(token)] == ".")


def plausible(current: Numbering | None, previous: Numbering | None) -> bool:
    if current is None or previous is None:
        return True
    if current.sub:
        return current.top == previous.top
    return previous.top < current.top <= previous.top + 2 and current.dotted == previous.dotted


body = body_size(d21)
candidates = [line.text for line in d21 if is_heading(line, body)]
print("candidats :", candidates)

kept, previous, started = [], None, False
for text in candidates:
    current = numbering(text)
    if (started or KEYWORD_RE.match(text)) and plausible(current, previous):
        started = True
        kept.append(text)
        if current and not current.sub:
            previous = current
print("\nretenus :", kept)

# %% [markdown]
# ### 2.4 Assembler le document
#
# On parcourt les lignes dans l'ordre. Tout ce qui précède le résumé (titre, auteurs, affiliations)
# est ignoré : le titre officiel vient des métadonnées, plus fiables. Chaque intertitre ouvre une
# section, chaque ligne de texte s'ajoute à la section en cours, et la lecture s'arrête à
# « References ». Trois cas particuliers :
#
# - le résumé est parfois un intertitre (« Abstract »), parfois en ligne (« Abstract— Dense
#   retrieval is… », « Résumé – Les réseaux… ») ;
# - les articles francophones ont souvent deux résumés ; on garde le premier, celui dans la langue
#   de l'article ;
# - les mots-clés, remerciements et concepts ACM ne sont pas du contenu : ces sections sont retirées.
#
# Les mots coupés en fin de ligne (« conve- nient ») sont recollés à la fin.

# %%
INLINE_ABSTRACT_RE = re.compile(r"^(abstract|résumé)\s*[-–—:.]\s*", re.I)
INLINE_META_RE = re.compile(r"^(keywords|mots[- ]clés|index terms|article)\s*[:—–-]", re.I)
STOP_TITLES = {"references", "reference", "références", "bibliography", "bibliographie"}
DROP_TITLES = {"acknowledgments", "acknowledgements", "acknowledgment", "remerciements", "keywords",
               "index terms", "mots-clés", "mots clés", "ccs concepts"}
ABSTRACT_TITLES = {"abstract", "résumé"}
MIN_SECTION_WORDS = 20


def extract_document(path: Path) -> dict:
    lines = read_lines(path)
    body = body_size(lines)
    sections, started, previous, references = [], False, None, False
    for line in lines:
        if line.size < 0.75 * body:
            continue
        inline = INLINE_ABSTRACT_RE.match(line.text)
        if inline and len(line.text) > 40:
            started = True
            sections.append({"titre": inline.group(1), "lignes": [line.text[inline.end():]]})
            continue
        if started and INLINE_META_RE.match(line.text):
            # Le corps de certains articles courts (CORIA) n'a aucun intertitre après les mots-clés.
            sections.append({"titre": "Corps du texte", "lignes": []})
            continue
        current = numbering(line.text)
        if is_heading(line, body) and plausible(current, previous) and (started or KEYWORD_RE.match(line.text)):
            started = True
            if current and not current.sub:
                previous = current
            if bare_title(line.text) in STOP_TITLES:
                references = True
                break
            sections.append({"titre": line.text, "lignes": []})
        elif sections:
            sections[-1]["lignes"].append(line.text)

    sections = [{"titre": s["titre"], "texte": dehyphenate(" ".join(s["lignes"]))} for s in sections]
    abstracts = [s["texte"] for s in sections if bare_title(s["titre"]) in ABSTRACT_TITLES]
    excluded = ABSTRACT_TITLES | DROP_TITLES
    content = [
        s for s in sections
        if bare_title(s["titre"]) not in excluded and len(s["texte"].split()) >= MIN_SECTION_WORDS
    ]
    return {"resume": abstracts[0] if abstracts else "", "sections": content, "references_coupees": references}


def bare_title(title: str) -> str:
    return re.sub(r"^([\dIVX]+(\.\d+)*\.?\s+)", "", title).strip(" .:-—").lower()


def dehyphenate(text: str) -> str:
    return re.sub(r"(\w)- ([a-zà-ÿ])", r"\1\2", text)


d21_doc = extract_document(PDF_DIR / "D21.pdf")
print("RÉSUMÉ :", d21_doc["resume"][:300], "…\n")
for section in d21_doc["sections"]:
    print(f"{section['titre']:<45} {len(section['texte'].split()):>5} mots")

# %% [markdown]
# ### 2.5 Application au corpus et contrôle
#
# On contrôle chaque document sur trois points : un résumé trouvé, les références coupées, et la
# part du texte conservée par rapport au texte brut de la section 1.

# %%
documents = {row.doc_id: extract_document(PDF_DIR / f"{row.doc_id}.pdf") for row in corpus.itertuples()}

report = pd.DataFrame([
    {
        "doc_id": doc_id,
        "resume": bool(doc["resume"]),
        "references_coupees": doc["references_coupees"],
        "sections": len(doc["sections"]),
        "mots_gardes": len(doc["resume"].split()) + sum(len(s["texte"].split()) for s in doc["sections"]),
    }
    for doc_id, doc in documents.items()
]).merge(corpus[["doc_id", "langue", "mots"]], on="doc_id")
report["part_gardee"] = (report["mots_gardes"] / report["mots"]).round(2)
report[["resume", "references_coupees"]].sum()

# %%
report.describe().loc[["mean", "min", "max"], ["sections", "mots_gardes", "part_gardee"]].round(2)

# %%
report.sort_values("part_gardee").head(8)

# %%
report.loc[~report["references_coupees"], ["doc_id", "sections", "part_gardee"]]

# %% [markdown]
# **Lecture.**
#
# - Les 50 résumés sont trouvés, et les références sont coupées dans 49 documents. Dans le
#   dernier (D47), elles sont en petite police et déjà écartées par le filtre de taille.
# - En moyenne, 77 % du texte brut est conservé. Le reste correspond à ce qu'on voulait retirer :
#   références, tableaux, en-têtes, affiliations, page de garde.
# - Les parts les plus basses concernent les articles HAL, qui perdent en plus leur page de garde
#   et leur second résumé (en anglais). Le cas limite est celui des « articles déjà publiés » de
#   CORIA (D45, D46) : un résumé étendu sans intertitres, qui tient en une seule section.
#
# **Limite connue.** Quand un intertitre n'est pas reconnu (gras absent, mise en page atypique),
# son texte n'est pas perdu : il rejoint la section précédente. Le découpage en passages
# (section 3) ne dépendra donc pas de la finesse de ce découpage en sections.

# %% [markdown]
# ### 2.6 Version moderne : `pymupdf4llm`
#
# [`pymupdf4llm`](https://pymupdf.readthedocs.io/en/latest/pymupdf4llm/) convertit un PDF en
# Markdown pensé pour les LLM et le RAG : intertitres en `#`, gras, listes, tableaux en Markdown.
# Il s'appuie sur la même bibliothèque, avec des heuristiques de mise en page plus poussées (ordre
# de lecture, détection des tableaux). On le compare à notre extraction sur quatre gabarits
# différents (Interspeech, IEEE, ACM, GRETSI).

# %%
import pymupdf4llm

comparison = []
for doc_id in ["D21", "D05", "D07", "D36"]:
    start = time.perf_counter()
    extract_document(PDF_DIR / f"{doc_id}.pdf")
    ours = time.perf_counter() - start
    start = time.perf_counter()
    markdown = pymupdf4llm.to_markdown(PDF_DIR / f"{doc_id}.pdf", show_progress=False)
    elapsed = time.perf_counter() - start
    headings = [h.strip("#* ").strip() for h in re.findall(r"^#+ .+$", markdown, re.M)]
    comparison.append({
        "doc_id": doc_id,
        "intertitres_pymupdf4llm": len(headings),
        "sections_maison": len(documents[doc_id]["sections"]),
        "secondes_maison": round(ours, 1),
        "secondes_pymupdf4llm": round(elapsed, 1),
        "references_dans_le_markdown": any(bare_title(h) in STOP_TITLES for h in headings),
        "page_de_garde_hal": "HAL Id" in markdown,
    })
pd.DataFrame(comparison)

# %%
print(markdown[:1500])

# %% [markdown]
# **Ce que montre la comparaison.**
#
# - `pymupdf4llm` reconnaît davantage d'intertitres, et restitue le gras, l'italique et les
#   tableaux : c'est le bon outil quand on veut donner le texte à un LLM qui saura en tirer parti.
# - Il ne sait pas ce qu'est un article scientifique : la page de garde HAL, les auteurs, les
#   affiliations et les références restent dans le Markdown. Il faudrait les retirer après coup,
#   avec les mêmes règles qu'aux sections 2.3 et 2.4.
# - Il est bien plus lent sur cette machine (analyse de la mise en page de chaque page).
#
# On garde notre extraction : elle produit exactement ce dont le moteur a besoin (résumé et
# sections, sans bruit), et chaque règle est justifiée et vérifiable.

# %% [markdown]
# ### 2.7 Sauvegarde
#
# Un document par ligne (JSON Lines), avec les métadonnées qui serviront à afficher les résultats.

# %%
meta = corpus.set_index("doc_id")
with open(DATA / "documents.jsonl", "w", encoding="utf-8") as f:
    for doc_id, doc in documents.items():
        record = {
            "doc_id": doc_id,
            "titre": meta.loc[doc_id, "titre"],
            "langue": meta.loc[doc_id, "langue"],
            "modalite": meta.loc[doc_id, "modalite"],
            "annee": int(meta.loc[doc_id, "annee"]),
            "url": meta.loc[doc_id, "url"],
            "resume": doc["resume"],
            "sections": doc["sections"],
        }
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
print(f"{len(documents)} documents écrits dans data/documents.jsonl")
