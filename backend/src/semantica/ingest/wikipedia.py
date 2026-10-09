import json
import re
import time
from dataclasses import dataclass
from pathlib import Path

import httpx

from semantica.corpus import Modality, Passage, Source
from semantica.ingest.chunking import chunk_text

API_URL = "https://fr.wikipedia.org/w/api.php"
USER_AGENT = (
    "SemanticaTP/0.1 (https://huggingface.co/spaces; educational project ENSPY INF5101) httpx/0.28"
)
SKIPPED_SECTIONS = frozenset(
    {
        "notes et références",
        "références",
        "notes",
        "voir aussi",
        "articles connexes",
        "liens externes",
        "bibliographie",
        "annexes",
        "sources",
    }
)
NATURAL_SINGLE_CHARS = frozenset("àay:;!?«»-–—,.()'\"")
HEADING = re.compile(r"^(={2,})\s*(.+?)\s*\1\s*$", re.MULTILINE)


@dataclass(frozen=True)
class Article:
    title: str
    url: str
    extract: str


@dataclass(frozen=True)
class FetchFailure:
    title: str
    reason: str


def fetch_article(
    client: httpx.Client, title: str, cache_dir: Path, max_retries: int = 5
) -> Article | FetchFailure:
    cache_file = cache_dir / f"{_slug(title)}.json"
    if cache_file.exists():
        return Article(**json.loads(cache_file.read_text(encoding="utf-8")))

    params = {
        "action": "query",
        "prop": "extracts|info",
        "inprop": "url",
        "explaintext": 1,
        "exsectionformat": "wiki",
        "redirects": 1,
        "titles": title,
        "format": "json",
        "formatversion": 2,
    }
    for attempt in range(max_retries):
        try:
            response = client.get(API_URL, params=params)
        except httpx.HTTPError as error:
            return FetchFailure(title, f"erreur réseau : {error}")
        if response.status_code == 429:
            time.sleep(float(response.headers.get("retry-after", 2 ** (attempt + 2))))
            continue
        if response.status_code != 200:
            return FetchFailure(title, f"HTTP {response.status_code}")
        page = response.json()["query"]["pages"][0]
        if page.get("missing"):
            return FetchFailure(title, "article introuvable")
        article = Article(title=page["title"], url=page["fullurl"], extract=page["extract"])
        cache_dir.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(json.dumps(article.__dict__, ensure_ascii=False), encoding="utf-8")
        return article
    return FetchFailure(title, "limite de requêtes atteinte")


def fetch_articles(
    titles: list[str], cache_dir: Path, delay_seconds: float = 1.0
) -> tuple[list[tuple[str, Article]], list[FetchFailure]]:
    articles: list[tuple[str, Article]] = []
    failures: list[FetchFailure] = []
    with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=30) as client:
        for title in titles:
            cached = (cache_dir / f"{_slug(title)}.json").exists()
            result = fetch_article(client, title, cache_dir)
            if isinstance(result, Article):
                articles.append((title, result))
            else:
                failures.append(result)
            if not cached:
                time.sleep(delay_seconds)
    return articles, failures


def article_to_passages(
    article: Article, modality: Modality, max_passages: int = 10
) -> list[Passage]:
    doc_id = f"wiki:{_slug(article.title)}"
    passages: list[Passage] = []
    for section, body in _merge_short_sections(_sections(article.extract)):
        for chunk in chunk_text(body):
            if _is_formula_heavy(chunk):
                continue
            if len(passages) == max_passages:
                return passages
            passages.append(
                Passage(
                    id=f"{doc_id}#{len(passages)}",
                    doc_id=doc_id,
                    source=Source.WIKIPEDIA,
                    modality=modality,
                    title=article.title,
                    section=section,
                    text=chunk,
                    url=article.url,
                )
            )
    return passages


def _sections(extract: str) -> list[tuple[str | None, str]]:
    sections: list[tuple[str | None, str]] = []
    matches = list(HEADING.finditer(extract))
    lead = extract[: matches[0].start()] if matches else extract
    sections.append((None, lead))

    skipped_level: int | None = None
    for index, match in enumerate(matches):
        level = len(match.group(1))
        heading = match.group(2)
        end = matches[index + 1].start() if index + 1 < len(matches) else len(extract)
        if skipped_level is not None and level > skipped_level:
            continue
        skipped_level = None
        if heading.lower() in SKIPPED_SECTIONS:
            skipped_level = level
            continue
        sections.append((heading, extract[match.end() : end]))

    cleaned = [(name, _normalize(_strip_math(body))) for name, body in sections]
    return [(name, body) for name, body in cleaned if len(body.split()) >= 15]


def _merge_short_sections(
    sections: list[tuple[str | None, str]], min_words: int = 60
) -> list[tuple[str | None, str]]:
    merged: list[tuple[str | None, str]] = []
    for name, body in sections:
        if merged and len(merged[-1][1].split()) < min_words:
            previous_name, previous_body = merged[-1]
            merged[-1] = (previous_name or name, f"{previous_body} {body}")
        else:
            merged.append((name, body))
    return merged


def _is_formula_heavy(text: str, max_ratio: float = 0.2) -> bool:
    tokens = text.split()
    residue = sum(1 for t in tokens if len(t) == 1 and t.lower() not in NATURAL_SINGLE_CHARS)
    return residue / max(len(tokens), 1) > max_ratio


def _strip_math(text: str) -> str:
    marker = "{\\displaystyle"
    while (start := text.find(marker)) != -1:
        depth = 0
        for end in range(start, len(text)):
            if text[end] == "{":
                depth += 1
            elif text[end] == "}":
                depth -= 1
                if depth == 0:
                    break
        text = text[:start] + text[end + 1 :]
    return re.sub(r"\s{2,}", " ", text)


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("’", "'")).strip()


def _slug(title: str) -> str:
    return re.sub(r"[^\w]+", "-", title.lower()).strip("-")
