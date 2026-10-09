# Développement et déploiement

## Prérequis

- Python 3.12 et [uv](https://docs.astral.sh/uv/)
- Node.js 22+ et pnpm
- Une clé [Google AI Studio](https://aistudio.google.com/apikey) (gratuite) : embeddings,
  réponse générée, juge et mode révision. Sans clé, le moteur fonctionne en BM25 seul.
- Un token [Hugging Face](https://huggingface.co/settings/tokens) avec le droit
  « Make calls to Inference Providers » : seulement pour le reranker et les modèles de
  comparaison (comparateur, évaluation).

## Lancer en local

```bash
# Backend
cd backend
uv sync
cp .env.example .env          # puis renseigner les clés (Gemini, Hugging Face)
uv run semantica serve        # http://127.0.0.1:8000/api/docs

# Frontend (autre terminal)
cd frontend
pnpm install
pnpm dev                      # http://localhost:5173, l'API est relayée par Vite
```

Le corpus et l'index sont versionnés : aucune étape de construction n'est nécessaire pour
lancer l'application, et aucun modèle n'est téléchargé (tout passe par l'API).

## Reconstruire le corpus et l'index

```bash
cd backend
uv run semantica ingest --pdf chemin/vers/Traitement_Multimedia_Donnees_INF5101_Part1.pdf
uv run semantica build        # BM25, embeddings (3 modèles, via l'API), UMAP, vocabulaire du jeu
uv run semantica build --only bm25 vocab   # ne reconstruire que certaines étapes
uv run semantica evaluate     # rapport + calibration du seuil d'abstention
```

`ingest` met en cache les réponses de l'API Wikipédia dans `data/raw/` et respecte sa
politique d'accès (User-Agent identifiable, une requête par seconde, reprise sur 429).
`build` puis `evaluate` doivent toujours être relancés ensemble : le seuil d'abstention
dépend des scores produits par l'index.

Pour ajouter un article, il suffit de l'inscrire dans `ingest/catalog.py` avec sa modalité.

## Qualité

```bash
cd backend && uv run ruff format --check src tests && uv run ruff check src tests && uv run pytest
cd frontend && pnpm lint && pnpm build
```

La CI GitHub Actions exécute ces mêmes commandes à chaque push.

## Déploiement sur Hugging Face Spaces

L'application est une image Docker unique (`Dockerfile` à la racine) : le front est
compilé dans une première étape, puis servi par FastAPI. Hugging Face construit l'image
sur ses serveurs, Docker n'est pas nécessaire en local.

```bash
export HF_TOKEN=hf_...                    # jeton avec droit d'écriture
export SEMANTICA_GEMINI_API_KEY=...      # secret du Space : embeddings
export SEMANTICA_HF_TOKEN=hf_...         # secret du Space : reranker de comparaison
uv run --project backend python scripts/deploy_space.py \
    --space <utilisateur>/semantica \
    --repository https://github.com/<utilisateur>/<depot>
```

Le script crée le Space s'il n'existe pas, enregistre les clés comme secrets (jamais dans
le code) et téléverse le dépôt avec un README adapté au format des Spaces. L'image ne
contient ni PyTorch ni poids de modèle. Après une période d'inactivité, le Space gratuit
se met en veille et le premier visiteur attend son redémarrage.

### Coût de l'inférence

Les embeddings utilisent le palier gratuit de l'API Gemini. Le reranking utilise les
crédits d'inférence Hugging Face : 0,10 $ par mois sur un compte gratuit, épuisés en
quelques dizaines d'appels. Une question coûte un embedding et, en mode reranking, une
requête de 20 paires. Quand une API refuse (quota, panne), le moteur se replie
automatiquement (hybride sans reranking, puis BM25) et le signale dans l'interface.

### Protection du quota de génération

Les routes qui appellent le LLM (`/api/ask`, `/api/quiz`, `/api/judge`) sont limitées à 8 requêtes par
minute et par adresse IP, avec un seau à jetons en mémoire. C'est suffisant pour une
démonstration publique sur une seule instance ; un déploiement multi-instances
demanderait un stockage partagé (Redis).
