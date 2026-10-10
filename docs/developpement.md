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

## Déploiement sur Vercel

L'application est une seule fonction Python Vercel (FastAPI) qui sert aussi le front :

- `app/api/index.py` est le point d'entrée que Vercel détecte : il expose l'instance `app` ;
- `app/api/vercel.json` compile le front (`app/web`) et copie le résultat dans `app/api/dist`,
  que `app.frontend()` sert depuis le CDN de Vercel, avec repli sur `index.html` pour les routes
  du front (`/corpus`, `/a-propos`) ;
- la clé Pinecone est une variable d'environnement du projet Vercel, `PINECONE_API_KEY`.

```bash
npx vercel login
npx vercel link                      # projet Vercel, dossier racine : app/api
npx vercel env add PINECONE_API_KEY production
npx vercel deploy --prod
```

Le projet Vercel est configuré avec `app/api` comme dossier racine, en incluant les fichiers hors
de ce dossier (nécessaire pour compiler `app/web`).

Le `Dockerfile` à la racine produit la même application dans une image unique, pour un hébergeur
de conteneurs (Render, Fly.io, Hugging Face Spaces avec l'offre PRO).
