import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel

Language = Literal["fr", "en"]
Modality = Literal["texte", "image", "audio", "multimodal"]

DATA_DIR = Path(__file__).resolve().parents[2] / "data"


class Article(BaseModel):
    doc_id: str
    titre: str
    langue: Language
    modalite: Modality
    annee: int
    pages: int
    source: Literal["arxiv", "hal"]
    venue: str
    url: str
    resume: str


class Scores(BaseModel):
    hit_rate_at_1: float
    hit_rate_at_5: float
    mrr_at_10: float
    ndcg_at_10: float


class Evaluation(BaseModel):
    questions: int
    pinecone: Scores
    bm25: Scores
    biais_langue: dict[Language, float]


class Settings(BaseModel):
    index: str
    embedding_model: str
    k_passages: int
    abstention_threshold: float
    passages: int
    evaluation: Evaluation


def load_articles(data_dir: Path = DATA_DIR) -> dict[str, Article]:
    raw = json.loads((data_dir / "articles.json").read_text(encoding="utf-8"))
    return {item["doc_id"]: Article.model_validate(item) for item in raw}


def load_settings(data_dir: Path = DATA_DIR) -> Settings:
    raw = json.loads((data_dir / "settings.json").read_text(encoding="utf-8"))
    # ranx nomme ses métriques « hit_rate@1 » : « @ » n'est pas permis dans un nom de champ.
    for engine in ("pinecone", "bm25"):
        raw["evaluation"][engine] = {
            name.replace("@", "_at_"): value for name, value in raw["evaluation"][engine].items()
        }
    return Settings.model_validate(raw)
