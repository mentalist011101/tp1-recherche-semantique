# Développement

## Prérequis

- [uv](https://docs.astral.sh/uv/) et Python 3.12, Node 22 et pnpm ;
- un compte [Pinecone](https://www.pinecone.io) (l'offre gratuite suffit) et sa clé dans un
  fichier `.env` à la racine, ignoré par Git :

```bash
PINECONE_API_KEY=...
```

## Le notebook

```bash
uv sync
uv run --with jupyterlab jupyter lab notebooks/recherche_semantique.ipynb   # ou VS Code, noyau .venv
```

Exécuté de bout en bout, il retélécharge les PDF manquants, convertit en Markdown ceux qui ne sont
pas en cache, crée l'index Pinecone s'il n'existe pas, et ne renvoie les passages que si leur
nombre a changé (chaque envoi consomme environ 300 000 tokens du quota d'embedding gratuit).

Sur une machine à 8 Go de RAM, la conversion avec le modèle de mise en page de `pymupdf4llm` peut
saturer la mémoire si les 50 PDF sont traités d'affilée. Il suffit alors de remplir le cache
`data/markdown/` document par document, dans des processus séparés.

## L'application en local

```bash
cd app/api && uv sync && uv run uvicorn moteur.main:build --factory --reload   # :8000
cd app/web && pnpm install && pnpm dev                                         # :5173
```

Le serveur de développement Vite redirige `/api` vers le port 8000 (variable `MOTEUR_API` pour en
changer).

## Qualité

```bash
cd app/api && uv run ruff format src tests && uv run ruff check src tests && uv run pytest
cd app/web && pnpm lint && pnpm build
uvx ruff check notebooks scripts
```

Les tests de l'API remplacent Pinecone par un faux index : ils couvrent le regroupement par
article, les filtres, le nettoyage du Markdown, l'abstention et la gestion d'une panne, sans
réseau ni clé.

La CI GitHub Actions lance ces trois vérifications. Elle ne réexécute pas le notebook, qui
interroge Pinecone avec une clé privée : ses sorties versionnées font foi.

## Déploiement sur Hugging Face Spaces

Docker n'a pas besoin d'être installé : le Space construit l'image lui-même.

```bash
# HF_TOKEN : jeton Hugging Face avec droit d'écriture, dans l'environnement ou le .env
uv run --with huggingface-hub python scripts/deploy_space.py \
    --space <utilisateur>/semantica-articles \
    --repository https://github.com/mentalist011101/tp1-recherche-semantique
```

Le script crée le Space (SDK Docker) s'il n'existe pas, y pousse la clé Pinecone en secret, puis
téléverse uniquement le `Dockerfile` et `app/`, avec un README propre au Space.
