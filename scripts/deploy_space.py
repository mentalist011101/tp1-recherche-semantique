import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from huggingface_hub import HfApi

ROOT = Path(__file__).resolve().parents[1]

# Seuls l'image et l'application partent sur le Space : ni le notebook, ni les données brutes,
# ni l'ancienne application.
INCLUDED = ["Dockerfile", ".dockerignore", "app/**"]
IGNORED = [
    "**/node_modules/**",
    "**/.venv/**",
    "**/__pycache__/**",
    "**/.pytest_cache/**",
    "**/.ruff_cache/**",
    "app/web/dist/**",
    "**/.env",
]

SPACE_README = """---
title: Semantica Articles
emoji: 📚
colorFrom: yellow
colorTo: red
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: Quels articles lire ? Recherche sémantique (INF5101)
---

Moteur de recherche sémantique dans 50 articles scientifiques courts (arXiv et HAL), en
français et en anglais. Code source, notebook et documentation : {repository}
"""


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Publie l'application sur un Space Hugging Face (SDK Docker). Lit HF_TOKEN "
        "(droit d'écriture) et PINECONE_API_KEY, poussée en secret du Space, depuis "
        "l'environnement ou le fichier .env."
    )
    parser.add_argument("--space", required=True, help="identifiant du Space, ex. user/semantica-articles")
    parser.add_argument("--repository", default="", help="URL du dépôt GitHub affichée sur le Space")
    args = parser.parse_args()

    load_dotenv(ROOT / ".env")
    token = os.environ.get("HF_TOKEN")
    if not token:
        sys.exit("HF_TOKEN manquant (jeton Hugging Face avec droit d'écriture).")

    api = HfApi(token=token)
    api.create_repo(args.space, repo_type="space", space_sdk="docker", exist_ok=True)
    if os.environ.get("PINECONE_API_KEY"):
        api.add_space_secret(args.space, "PINECONE_API_KEY", os.environ["PINECONE_API_KEY"])

    api.upload_file(
        path_or_fileobj=SPACE_README.format(repository=args.repository).encode(),
        path_in_repo="README.md",
        repo_id=args.space,
        repo_type="space",
    )
    api.upload_folder(
        folder_path=ROOT,
        repo_id=args.space,
        repo_type="space",
        allow_patterns=INCLUDED,
        ignore_patterns=IGNORED,
        delete_patterns=["app/**"],
        commit_message="Déploiement",
    )
    print(f"https://huggingface.co/spaces/{args.space}")


if __name__ == "__main__":
    main()
