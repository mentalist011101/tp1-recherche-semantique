import argparse
import os
import sys
from pathlib import Path

from huggingface_hub import HfApi

ROOT = Path(__file__).resolve().parents[1]

IGNORED = [
    ".git/*",
    ".github/*",
    "**/node_modules/*",
    "**/.venv/*",
    "**/__pycache__/*",
    "**/.pytest_cache/*",
    "**/.ruff_cache/*",
    "frontend/dist/*",
    "backend/data/raw/*",
    "docs/*",
    "**/.env",
    "README.md",
]

SPACE_README = """---
title: Semantica
emoji: 🔎
colorFrom: indigo
colorTo: green
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: Recherche sémantique, RAG et carte d'embeddings (INF5101)
---

Moteur de recherche sémantique sur le cours INF5101 (ENSPY). Code source et documentation : {repository}
"""


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Publie le dépôt sur un Space Hugging Face (SDK Docker). "
        "Variables : HF_TOKEN (écriture) ; SEMANTICA_GEMINI_API_KEY et SEMANTICA_HF_TOKEN, "
        "poussées en secrets du Space."
    )
    parser.add_argument("--space", required=True, help="identifiant du Space, ex. user/semantica")
    parser.add_argument("--repository", default="", help="URL du dépôt GitHub affichée sur le Space")
    args = parser.parse_args()

    token = os.environ.get("HF_TOKEN")
    if not token:
        sys.exit("HF_TOKEN manquant (jeton Hugging Face avec droit d'écriture).")

    api = HfApi(token=token)
    api.create_repo(args.space, repo_type="space", space_sdk="docker", exist_ok=True)

    for secret in ("SEMANTICA_GEMINI_API_KEY", "SEMANTICA_HF_TOKEN"):
        if os.environ.get(secret):
            api.add_space_secret(args.space, secret, os.environ[secret])

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
        ignore_patterns=IGNORED,
        delete_patterns=["backend/**", "frontend/**"],
        commit_message="Déploiement Semantica",
    )
    print(f"https://huggingface.co/spaces/{args.space}")


if __name__ == "__main__":
    main()
