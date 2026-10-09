import argparse
import sys
from pathlib import Path

from semantica.settings import get_settings


def main() -> None:
    parser = argparse.ArgumentParser(prog="semantica")
    commands = parser.add_subparsers(dest="command", required=True)

    ingest_cmd = commands.add_parser("ingest", help="Construit le corpus (slides + Wikipedia)")
    ingest_cmd.add_argument("--pdf", type=Path, required=True, help="PDF du cours INF5101")

    build_cmd = commands.add_parser(
        "build", help="Calcule embeddings, index BM25, carte UMAP et vocabulaire"
    )
    build_cmd.add_argument(
        "--only",
        nargs="+",
        choices=["bm25", "embeddings", "map", "vocab"],
        help="Ne reconstruit que ces étapes (la carte réutilise les embeddings existants)",
    )
    build_cmd.add_argument(
        "--encoders",
        nargs="+",
        choices=["gemini", "e5-small", "minilm"],
        help="Encodeurs à recalculer pour l'étape embeddings (tous par défaut)",
    )
    commands.add_parser("evaluate", help="Évalue toutes les méthodes sur le jeu de questions")

    serve_cmd = commands.add_parser("serve", help="Lance l'API")
    serve_cmd.add_argument("--host", default="127.0.0.1")
    serve_cmd.add_argument("--port", type=int, default=8000)
    serve_cmd.add_argument("--reload", action="store_true")

    args = parser.parse_args()
    settings = get_settings()

    if args.command == "ingest":
        from semantica.ingest.pipeline import ingest

        report = ingest(settings, args.pdf)
        print(
            f"{report.slides} slides, {report.articles} articles, "
            f"{report.passages} passages -> {settings.corpus_file}"
        )
        for failure in report.failures:
            print(f"  échec : {failure.title} ({failure.reason})", file=sys.stderr)

    elif args.command == "build":
        from semantica.indexing import STEPS, build_artifacts
        from semantica.retrieval.dense import ENCODERS

        build_artifacts(settings, frozenset(args.only or STEPS), tuple(args.encoders or ENCODERS))

    elif args.command == "evaluate":
        from semantica.evaluation.runner import run_evaluation

        run_evaluation(settings)

    elif args.command == "serve":
        import uvicorn

        uvicorn.run(
            "semantica.api.app:create_app",
            factory=True,
            host=args.host,
            port=args.port,
            reload=args.reload,
        )
