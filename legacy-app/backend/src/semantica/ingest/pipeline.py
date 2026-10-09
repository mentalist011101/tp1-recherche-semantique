from dataclasses import dataclass
from pathlib import Path

from semantica.corpus import Passage, save_passages
from semantica.ingest.catalog import WIKIPEDIA_ARTICLES
from semantica.ingest.slides import extract_slides, render_thumbnails
from semantica.ingest.wikipedia import FetchFailure, article_to_passages, fetch_articles
from semantica.settings import Settings

COURSE_DOC_ID = "inf5101"


@dataclass(frozen=True)
class IngestReport:
    slides: int
    articles: int
    passages: int
    failures: list[FetchFailure]


def ingest(settings: Settings, course_pdf: Path) -> IngestReport:
    passages: list[Passage] = extract_slides(course_pdf, COURSE_DOC_ID)
    slide_count = len(passages)
    render_thumbnails(course_pdf, settings.slides_dir)

    modality_of = dict(WIKIPEDIA_ARTICLES)
    articles, failures = fetch_articles(list(modality_of), settings.data_dir / "raw" / "wikipedia")
    for requested, article in articles:
        passages.extend(article_to_passages(article, modality_of[requested]))

    total = save_passages(passages, settings.corpus_file)
    return IngestReport(slide_count, len(articles), total, failures)
