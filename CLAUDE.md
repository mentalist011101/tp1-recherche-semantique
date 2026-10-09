# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

Semantica : TP 1 (module texte) du cours INF5101. Moteur de recherche sémantique hybride
(production : dense Gemini Embedding 2 ; BM25, hybride RRF et reranker bge en comparaison), RAG et juge via Gemini Flash,
carte UMAP, Cémantix, quiz. Backend FastAPI (`backend/`, package `semantica`), front React (`frontend/`), déploiement Docker
sur Hugging Face Spaces.

## Commandes

```bash
# backend (depuis backend/)
uv run semantica serve                 # API sur :8000, docs sur /api/docs
uv run pytest                          # tous les tests
uv run pytest tests/test_retrieval.py::test_rrf_ignores_raw_scores
uv run ruff format src tests && uv run ruff check src tests
uv run semantica ingest --pdf ../../COURS/Traitement_Multimedia_Donnees_INF5101_Part1.pdf
uv run semantica build                 # index (embeddings via API) ; --only bm25 vocab …
uv run semantica evaluate              # rapport + calibration (consomme des crédits HF)

# frontend (depuis frontend/)
pnpm dev                               # :5173, proxy /api et /slides vers :8000
pnpm lint                              # oxlint + tsc
pnpm build
```

## Architecture à connaître

- **Hors ligne / en ligne** : `build` et `evaluate` produisent les artefacts versionnés dans
  `backend/data/index/` ; le serveur ne fait que les charger. Toute modification du corpus,
  du découpage ou d'un modèle impose `build` **puis** `evaluate` : le seuil d'abstention
  (`calibration.json`) dépend des scores de l'index.
- Les identifiants de passages (`inf5101:p24`, `wiki:tf-idf#3`) sont positionnels ; le jeu
  d'évaluation `data/eval/questions.jsonl` les référence (ou des `doc_id` entiers). Changer
  le découpage peut invalider les annotations.
- `SearchEngine.search` (retrieval/engine.py) est le point d'entrée unique : méthode,
  routage par langue (BM25 écarté si la question n'est pas en français), reranking,
  abstention.
- Erreurs réseau (Wikipédia, Gemini, Hugging Face) : renvoyées en résultats typés
  (`FetchFailure`, `InferenceError`, `LlmError`), jamais levées vers le cœur. En recherche,
  une `InferenceError` déclenche un repli (hybride sans rerank, puis BM25) listé dans
  `SearchOutcome.degraded` ; `evaluate` s'arrête au contraire au premier repli.
- Le front n'utilise que `undefined` : `withoutNulls` (api/client.ts) convertit les `null`
  de l'API.

## Conventions

- Python : ruff (règles dans `pyproject.toml`). Aucun modèle ne tourne en local : pas de
  torch ni de sentence-transformers, tout passe par `semantica/inference.py`.
- TypeScript : tabulations, `readonly`, exports nommés, imports locaux en `.js`.
- Commentaires uniquement pour le « pourquoi » non évident.
