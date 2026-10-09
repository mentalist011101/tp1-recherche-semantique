import hashlib
import json
import sys
from datetime import UTC, datetime

import numpy as np

from semantica.cemantix import ENCODER_KEY as CEMANTIX_ENCODER
from semantica.cemantix import build_vocabulary
from semantica.corpus import load_passages
from semantica.inference import InferenceError
from semantica.retrieval.dense import DEFAULT_ENCODER, ENCODERS, Encoder
from semantica.retrieval.lexical import LexicalIndex
from semantica.retrieval.rerank import RERANKER_MODEL
from semantica.semantic_map import build_map
from semantica.settings import Settings

STEPS = ("bm25", "embeddings", "map", "vocab")
# Les paliers gratuits limitent le débit par minute : la construction attend plutôt
# que d'échouer.
BUILD_PATIENCE_SECONDS = 600


def build_artifacts(
    settings: Settings,
    only: frozenset[str] = frozenset(STEPS),
    encoders: tuple[str, ...] = tuple(ENCODERS),
) -> None:
    passages = load_passages(settings.corpus_file)
    texts = [p.embedding_text for p in passages]
    out = settings.index_dir
    out.mkdir(parents=True, exist_ok=True)

    if "bm25" in only:
        print(f"BM25 sur {len(passages)} passages")
        LexicalIndex.build(texts).save(out / "bm25")

    if "embeddings" in only:
        for key in encoders:
            print(f"Embeddings {key} ({ENCODERS[key].model_id}, via {ENCODERS[key].provider})")
            encoder = Encoder.for_settings(ENCODERS[key], settings)
            vectors = encoder.encode_passages(texts, patience_seconds=BUILD_PATIENCE_SECONDS)
            np.save(out / f"embeddings-{key}.npy", _or_exit(vectors))

    if "map" in only:
        print("Carte UMAP + clusters")
        build_map(passages, np.load(out / f"embeddings-{DEFAULT_ENCODER}.npy"), out)

    if "vocab" in only:
        print("Vocabulaire Cémantix")
        encoder = Encoder.for_settings(ENCODERS[CEMANTIX_ENCODER], settings)
        print(f"  {_or_exit(build_vocabulary(passages, encoder, out))} mots")

    manifest = {
        "built_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "corpus_sha256": hashlib.sha256(settings.corpus_file.read_bytes()).hexdigest(),
        "passages": len(passages),
        # Chaque slide compte comme un document, comme chaque article.
        "documents": len({p.page if p.page else p.doc_id for p in passages}),
        "encoders": {key: spec.model_id for key, spec in ENCODERS.items()},
        "default_encoder": DEFAULT_ENCODER,
        "reranker": RERANKER_MODEL,
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def _or_exit[T](result: T | InferenceError) -> T:
    if isinstance(result, InferenceError):
        sys.exit(f"Échec de l'appel d'inférence : {result.reason}")
    return result
