# Image unique pour Hugging Face Spaces (SDK Docker) : le front React est compilé, puis servi
# par FastAPI à côté de l'API. Le Space construit l'image lui-même, aucun Docker local requis.
# Les embeddings sont calculés par Pinecone : l'image ne contient ni torch ni modèle.

FROM node:22-slim AS web
WORKDIR /web
RUN corepack enable
COPY app/web/package.json app/web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY app/web/ ./
RUN pnpm build

FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv

# Spaces exécute le conteneur avec l'UID 1000 : tout ce qui est écrit au runtime doit lui appartenir.
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    MOTEUR_STATIC_DIR=/home/user/app/static
WORKDIR /home/user/app/api

COPY --chown=user app/api/pyproject.toml app/api/uv.lock app/api/.python-version ./
RUN uv sync --frozen --no-dev --no-install-project

COPY --chown=user app/api/ ./
RUN uv sync --frozen --no-dev

COPY --chown=user --from=web /web/dist /home/user/app/static

EXPOSE 7860
CMD ["uv", "run", "--no-sync", "uvicorn", "moteur.main:build", "--factory", "--host", "0.0.0.0", "--port", "7860"]
