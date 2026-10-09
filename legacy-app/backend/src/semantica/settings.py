from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="SEMANTICA_", env_file=BACKEND_DIR / ".env", extra="ignore"
    )

    data_dir: Path = BACKEND_DIR / "data"
    static_dir: Path | None = None

    hf_token: str | None = None
    gemini_api_key: str | None = None

    # Le premier modèle sert par défaut ; les suivants prennent le relais s'il est saturé.
    llm_models: tuple[str, ...] = ("gemini-3.5-flash", "gemini-flash-lite-latest")

    @property
    def llm_enabled(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def corpus_file(self) -> Path:
        return self.data_dir / "corpus" / "passages.jsonl"

    @property
    def index_dir(self) -> Path:
        return self.data_dir / "index"

    @property
    def slides_dir(self) -> Path:
        return self.data_dir / "slides"

    @property
    def eval_dir(self) -> Path:
        return self.data_dir / "eval"


@lru_cache
def get_settings() -> Settings:
    return Settings()
