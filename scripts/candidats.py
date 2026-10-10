import csv
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

# Les résultats « par pertinence » d'arXiv et de HAL évoluent avec le temps : relancer ce script
# ne redonne pas exactement data/candidates.csv (figé le 2026-10-09). C'est ce fichier qui fait foi.
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parents[1] / "data" / "candidates-rerun.csv"
NS = {"a": "http://www.w3.org/2005/Atom", "x": "http://arxiv.org/schemas/atom"}

ARXIV = {
    "texte": [
        'abs:"dense retrieval"',
        'abs:"sentence embeddings"',
        'abs:"retrieval-augmented generation"',
        'abs:"cross-lingual retrieval"',
        'abs:"BM25" AND abs:"neural"',
        'abs:"question answering" AND abs:"retrieval"',
    ],
    "image": [
        'abs:"convolutional neural network" AND abs:"image classification"',
        'abs:"object detection"',
        'abs:"semantic segmentation"',
        'abs:"content-based image retrieval"',
        'abs:"optical character recognition"',
        'abs:"vision transformer"',
    ],
    "audio": [
        'abs:"automatic speech recognition"',
        'abs:"speaker verification"',
        'abs:"MFCC"',
        'abs:"sound event detection"',
        'abs:"speech emotion recognition"',
        'abs:"music information retrieval"',
    ],
    "multimodal": [
        'abs:"CLIP" AND abs:"image-text"',
        'abs:"video captioning"',
        'abs:"audio-visual"',
        'abs:"multimodal retrieval"',
        'abs:"visual question answering"',
        'abs:"text-to-audio retrieval"',
    ],
}

HAL_CONF = {
    "GRETSI": ["image", "audio"],
    "TALN": ["texte"],
    "CORIA": ["texte"],
    "JEP": ["audio"],
}

rows = []
seen = set()

for modality, queries in ARXIV.items():
    for q in queries:
        url = "https://export.arxiv.org/api/query?" + urllib.parse.urlencode(
            {"search_query": q, "max_results": 150, "sortBy": "relevance"}
        )
        root = ET.fromstring(urllib.request.urlopen(url, timeout=60).read())
        kept = 0
        for e in root.findall("a:entry", NS):
            comment = e.findtext("x:comment", "", NS)
            m = re.search(r"(\d+)\s*pages", comment)
            if not m or not 2 <= int(m.group(1)) <= 6:
                continue
            aid = e.findtext("a:id", "", NS).rsplit("/", 1)[-1]
            if aid in seen:
                continue
            seen.add(aid)
            rows.append(
                {
                    "source": "arxiv",
                    "id": aid,
                    "langue": "en",
                    "modalite": modality,
                    "requete": q,
                    "pages": m.group(1),
                    "annee": e.findtext("a:published", "", NS)[:4],
                    "titre": " ".join(e.findtext("a:title", "", NS).split()),
                    "venue": comment[:120],
                    "url": f"https://arxiv.org/pdf/{aid}",
                }
            )
            kept += 1
            if kept == 6:
                break
        print(modality, q, kept, file=sys.stderr)
        time.sleep(3)

for conf, modalities in HAL_CONF.items():
    params = {
        "q": f'conferenceTitle_t:"{conf}"',
        "fq": ["language_s:fr", "submitType_s:file", "docType_s:COMM"],
        "fl": "halId_s,title_s,page_s,producedDateY_i,conferenceTitle_s,fileMain_s,keyword_s",
        "rows": 300,
        "sort": "producedDateY_i desc",
        "wt": "json",
    }
    url = "https://api.archives-ouvertes.fr/search/?" + urllib.parse.urlencode(params, doseq=True)
    docs = json.load(urllib.request.urlopen(url, timeout=60))["response"]["docs"]
    kept = 0
    for d in docs:
        m = re.fullmatch(r"(\d+)\s*-\s*(\d+)", d.get("page_s", ""))
        if not m:
            continue
        n = int(m.group(2)) - int(m.group(1)) + 1
        if not 2 <= n <= 6:
            continue
        rows.append(
            {
                "source": "hal",
                "id": d["halId_s"],
                "langue": "fr",
                "modalite": "/".join(modalities),
                "requete": conf,
                "pages": n,
                "annee": d.get("producedDateY_i", ""),
                "titre": d["title_s"][0],
                "venue": d.get("conferenceTitle_s", ""),
                "url": d.get("fileMain_s", ""),
            }
        )
        kept += 1
    print(conf, len(docs), kept, file=sys.stderr)

with open(OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0]))
    w.writeheader()
    w.writerows(rows)
print(len(rows), file=sys.stderr)
