from __future__ import annotations

import json
from collections.abc import Iterable
from enum import StrEnum
from pathlib import Path

from pydantic import BaseModel, ConfigDict


class Modality(StrEnum):
    INTRO = "intro"
    TEXT = "texte"
    IMAGE = "image"
    AUDIO = "audio"
    VIDEO = "video"


class Source(StrEnum):
    COURSE = "cours"
    WIKIPEDIA = "wikipedia"


class Passage(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    doc_id: str
    source: Source
    modality: Modality
    title: str
    section: str | None = None
    text: str
    url: str | None = None
    page: int | None = None

    @property
    def heading(self) -> str:
        return f"{self.title} — {self.section}" if self.section else self.title

    @property
    def embedding_text(self) -> str:
        return f"{self.heading}\n{self.text}"


def save_passages(passages: Iterable[Passage], path: Path) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", encoding="utf-8") as f:
        for passage in passages:
            f.write(passage.model_dump_json() + "\n")
            count += 1
    return count


def load_passages(path: Path) -> list[Passage]:
    with path.open(encoding="utf-8") as f:
        return [Passage.model_validate(json.loads(line)) for line in f if line.strip()]
