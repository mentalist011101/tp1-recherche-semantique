import re
from pathlib import Path

import pymupdf

from semantica.corpus import Modality, Passage, Source

COURSE_HEADER = "Traitement Multimédia des Données"
COVER_TITLE = "Présentation du cours INF5101"
BULLET = "●"
DIAGRAM_NOISE = frozenset({"Architecture logique"})

MODULE_RANGES: tuple[tuple[range, Modality], ...] = (
    (range(1, 13), Modality.INTRO),
    (range(13, 25), Modality.TEXT),
    (range(25, 39), Modality.IMAGE),
    (range(39, 52), Modality.AUDIO),
    (range(52, 61), Modality.VIDEO),
)


def extract_slides(pdf_path: Path, doc_id: str) -> list[Passage]:
    passages: list[Passage] = []
    with pymupdf.open(pdf_path) as pdf:
        for index, page in enumerate(pdf):
            number = index + 1
            passage = _parse_slide(page, number, doc_id)
            if passage is not None:
                passages.append(passage)
    return passages


def render_thumbnails(pdf_path: Path, out_dir: Path, width: int = 640) -> int:
    out_dir.mkdir(parents=True, exist_ok=True)
    with pymupdf.open(pdf_path) as pdf:
        for index, page in enumerate(pdf):
            zoom = width / page.rect.width
            pixmap = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom))
            pixmap.save(out_dir / f"{index + 1}.jpg", jpg_quality=82)
        return pdf.page_count


def _parse_slide(page: pymupdf.Page, number: int, doc_id: str) -> Passage | None:
    blocks = [b for b in page.get_text("blocks", sort=True) if b[6] == 0]
    texts = [_clean(b[4]) for b in blocks]
    texts = [t for t in texts if t and t != str(number)]
    if not texts:
        return None

    # La couverture n'a pas de titre de slide : son premier bloc est le nom de l'école.
    title = COVER_TITLE if number == 1 else texts[0].replace(COURSE_HEADER, "").strip()
    rest = texts if number == 1 else texts[1:]
    bullets = [t for t in rest if BULLET in t]
    labels = [t for t in rest if BULLET not in t and _is_diagram_label(t)]

    if bullets:
        body = "\n".join(_split_bullets(" ".join(bullets)))
        if labels:
            body += "\nSchéma : " + " · ".join(labels)
    else:
        body = " ".join(rest)
        if title.startswith("MODULE") and rest:
            title = f"{title} — {rest[0]}"

    return Passage(
        id=f"{doc_id}:p{number}",
        doc_id=doc_id,
        source=Source.COURSE,
        modality=_modality_of(number),
        title=title,
        text=body.strip() or title,
        page=number,
    )


def _split_bullets(text: str) -> list[str]:
    return [f"• {item.strip()}" for item in text.split(BULLET)[1:] if item.strip()]


def _is_diagram_label(text: str) -> bool:
    return (
        3 <= len(text) <= 40
        and text[0].isupper()
        and text.upper() != text
        and text not in DIAGRAM_NOISE
    )


def _clean(text: str) -> str:
    text = text.replace("­", "").replace("’", "'").replace("•", BULLET)
    text = re.sub(r"-\s*\n\s*", "-", text)
    return re.sub(r"\s+", " ", text).strip()


def _modality_of(page: int) -> Modality:
    for pages, modality in MODULE_RANGES:
        if page in pages:
            return modality
    return Modality.INTRO
