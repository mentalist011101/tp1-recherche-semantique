import sys
from pathlib import Path

# Point d'entrée Vercel, qui cherche une instance FastAPI nommée `app` dans index.py. Vercel
# installe les dépendances du projet mais pas le package lui-même : on le rend importable.
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "src"))

from moteur.main import create_app  # noqa: E402

app = create_app(static_dir=ROOT / "dist")
