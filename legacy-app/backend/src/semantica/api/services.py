import json
from dataclasses import dataclass
from pathlib import Path

from semantica.cemantix import ENCODER_KEY as CEMANTIX_ENCODER
from semantica.cemantix import Cemantix
from semantica.corpus import Passage
from semantica.retrieval.engine import SearchEngine
from semantica.semantic_map import MapProjector
from semantica.settings import Settings


@dataclass
class Services:
    settings: Settings
    engine: SearchEngine
    projector: MapProjector
    map_data: dict
    cemantix: Cemantix
    manifest: dict
    report: dict | None

    @property
    def passages(self) -> list[Passage]:
        return self.engine.passages


def load_services(settings: Settings) -> Services:
    engine = SearchEngine.load(settings)
    index_dir = settings.index_dir
    report_file = settings.eval_dir / "report.json"
    services = Services(
        settings=settings,
        engine=engine,
        projector=MapProjector(index_dir / "umap.pkl"),
        map_data=_read_json(index_dir / "map.json"),
        cemantix=Cemantix(index_dir, engine.encoder(CEMANTIX_ENCODER)),
        manifest=_read_json(index_dir / "manifest.json"),
        report=_read_json(report_file) if report_file.exists() else None,
    )
    # La première projection UMAP compile ses fonctions numba (plusieurs secondes) : on la paie
    # au démarrage plutôt qu'à la première visite de la carte.
    services.projector.project(engine.dense[next(iter(engine.dense))].embeddings[:1])
    return services


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))
