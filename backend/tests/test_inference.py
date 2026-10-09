import json

import numpy as np

from semantica import inference
from semantica.inference import InferenceError, embed, rerank


def test_rerank_unwraps_nested_pipeline_output(monkeypatch):
    response = [[{"label": "LABEL_0", "score": 4.7}, {"label": "LABEL_0", "score": -11.0}]]
    monkeypatch.setattr(inference, "_post", lambda *_: response)
    scores = rerank("token", "model", "question", ["pertinent", "hors sujet"])
    assert np.allclose(scores, [4.7, -11.0])


def test_rerank_rejects_mismatched_score_count(monkeypatch):
    monkeypatch.setattr(inference, "_post", lambda *_: [[{"score": 1.0}]])
    assert isinstance(rerank("token", "model", "q", ["a", "b"]), InferenceError)


def test_missing_key_is_reported_without_network_call():
    error = embed(None, "gemini-embedding-2", "gemini", ["texte"])
    assert isinstance(error, InferenceError)
    assert "SEMANTICA_GEMINI_API_KEY" in error.reason


def test_embed_normalizes_vectors(monkeypatch):
    monkeypatch.setattr(inference, "_embed_hf_inference", lambda *_: np.array([[3.0, 4.0]]))
    vectors = embed("token", "model", "hf-inference", ["texte"])
    assert np.allclose(vectors, [[0.6, 0.8]])


def test_embed_waits_on_rate_limit_when_patient(monkeypatch):
    calls = iter(
        [InferenceError("limite", quota_exhausted=True, retry_after=0.01), np.ones((1, 2))]
    )
    monkeypatch.setattr(inference, "_embed_gemini", lambda *_: next(calls))
    assert not isinstance(embed("key", "m", "gemini", ["t"], patience_seconds=1), InferenceError)


def test_embed_gives_up_immediately_without_patience(monkeypatch):
    error = InferenceError("limite", quota_exhausted=True, retry_after=0.01)
    monkeypatch.setattr(inference, "_embed_gemini", lambda *_: error)
    assert embed("key", "m", "gemini", ["t"]) is error


def test_http_errors_are_classified():
    assert inference._http_error(402, "").quota_exhausted
    assert inference._http_error(429, "").retry_after == 30.0
    assert "invalide" in inference._http_error(401, "").reason


def test_retry_delay_reads_google_hint():
    body = json.dumps({"error": {"details": [{"retryDelay": "37s"}]}})
    assert inference._retry_delay(body) == 38.0
