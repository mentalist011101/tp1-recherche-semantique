# Architecture

Le projet sépare le travail **hors ligne**, fait une fois dans le notebook, du service **en
ligne**, qui ne fait que l'exploiter.

```mermaid
flowchart TB
    subgraph NB[Notebook, hors ligne]
        S[selection.csv] --> PDF[data/pdf] --> MD[data/markdown] --> CH[1 196 passages]
        CH -->|embeddings e5| PC[(Pinecone<br/>inf5101-articles)]
        CH --> EV[Évaluation, analyse]
        EV --> EX[app/api/data<br/>articles.json, settings.json]
    end
    subgraph APP[Application, en ligne]
        WEB[Front React] -->|/api/search| API[FastAPI]
        API -->|requête + filtres| PC
        API --- EX
    end
```

## Le notebook, source de vérité

Il construit l'index Pinecone et exporte (section 8) ce dont l'application a besoin :

- `articles.json` : la fiche des 50 articles (titre, langue, modalité, année, pages, URL, résumé) ;
- `settings.json` : nom de l'index, modèle, nombre de passages récupérés, seuil d'abstention et
  résultats de l'évaluation, affichés dans la page À propos.

Si le corpus, le découpage ou le modèle changent, on réexécute le notebook : l'index et les
réglages de l'application suivent.

## L'API (`app/api`, package `moteur`)

| Module | Rôle |
| --- | --- |
| `catalog.py` | Charge et valide `articles.json` et `settings.json` (Pydantic) |
| `search.py` | Interroge Pinecone, regroupe les passages par article, nettoie le Markdown pour l'affichage |
| `rag.py` | Consigne du modèle (identique au notebook), mise en forme des passages, génération en flux |
| `ratelimit.py` | Limite chaque visiteur à 20 recherches et 6 questions au chat par minute, pour protéger les quotas gratuits |
| `main.py` | Routes, et service du front compilé (`app.frontend()`) en production |

| Route | Réponse |
| --- | --- |
| `GET /api/search?q=…&langue=fr&modalite=audio&k=5` | Articles classés, meilleur passage de chacun, score, seuil, abstention |
| `POST /api/chat` | Flux NDJSON : les passages sources, puis la réponse morceau par morceau, puis la fin (ou une erreur) |
| `GET /api/articles` | Les 50 fiches |
| `GET /api/stats` | Réglages et résultats d'évaluation |
| `GET /api/docs` | Documentation OpenAPI |

Les filtres de langue et de modalité sont des filtres de métadonnées Pinecone, appliqués avant le
classement. Une erreur de Pinecone (réseau, quota, clé) est capturée à la frontière et renvoyée en
résultat typé (`SearchFailure`), que la route traduit en 503.

## Le front (`app/web`)

React 19, TypeScript, Vite, Tailwind CSS 4 et TanStack Query, avec la charte « bureau papier »
reprise de l'application précédente. Quatre pages :

- **Recherche** : la question et les filtres vivent dans l'URL, une recherche est donc partageable ;
- **Chat** : une réponse rédigée par gpt-oss-120b (Groq) à partir des passages, citations cliquables vers
  les sources ; la page de recherche y renvoie par un lien `/chat?q=…` ;
- **Corpus** : les 50 articles, filtrables par langue, modalité et titre ;
- **À propos** : la chaîne de traitement, les résultats de l'évaluation et les choix techniques.

## Déploiement

Sur Vercel, l'API devient une fonction Python (point d'entrée `app/api/index.py`) et le front
compilé est servi par le CDN grâce à `app.frontend()` de FastAPI. Aucun modèle ne tourne dans la
fonction : les embeddings des questions sont calculés par Pinecone, les réponses du chat par
l'API Groq. Le `Dockerfile` produit la
même application dans une image unique, pour un hébergeur de conteneurs. Voir
[developpement.md](developpement.md).
