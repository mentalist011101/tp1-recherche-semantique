import json
import statistics
import sys
import time
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from semantica.corpus import Passage
from semantica.evaluation.metrics import (
    best_threshold,
    first_relevant_rank,
    ndcg_at,
    reciprocal_rank,
    success_at,
)
from semantica.retrieval.dense import DEFAULT_ENCODER, ENCODERS
from semantica.retrieval.engine import Calibration, SearchEngine
from semantica.retrieval.types import Method
from semantica.settings import Settings

OUT_OF_DOMAIN = "hors-domaine"
K = 10
EVALUATION_PATIENCE_SECONDS = 300


@dataclass(frozen=True)
class Question:
    id: str
    category: str
    question: str
    relevant: list[str]


@dataclass(frozen=True)
class Config:
    name: str
    label: str
    method: Method
    encoder: str = DEFAULT_ENCODER
    route_by_language: bool = True


CONFIGS = (
    Config("bm25", "BM25 (lexical)", Method.BM25),
    Config("dense-minilm", "Dense MiniLM-L12", Method.DENSE, "minilm"),
    Config("dense-e5-small", "Dense e5-small", Method.DENSE, "e5-small"),
    Config("dense-gemini", "Dense Gemini Embedding 2", Method.DENSE, "gemini"),
    Config("hybrid-naive", "Hybride RRF sans routage", Method.HYBRID, route_by_language=False),
    Config("hybrid", "Hybride RRF", Method.HYBRID),
    Config("hybrid-rerank", "Hybride + reranking", Method.RERANK),
)
PRODUCTION = "dense-gemini"


def load_questions(path: Path) -> list[Question]:
    with path.open(encoding="utf-8") as f:
        return [Question(**json.loads(line)) for line in f if line.strip()]


def run_evaluation(settings: Settings) -> dict:
    questions = load_questions(settings.eval_dir / "questions.jsonl")
    engine = SearchEngine.load(settings, encoders=tuple(ENCODERS))
    # La calibration est l'objet de l'évaluation : on mesure les scores bruts, sans abstention.
    engine.calibration = Calibration()
    engine.patience_seconds = EVALUATION_PATIENCE_SECONDS

    runs = {config.name: _run_config(engine, config, questions) for config in CONFIGS}
    report = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "corpus": {"passages": len(engine.passages), "questions": len(questions)},
        "configs": [
            {"name": c.name, "label": c.label, **_summarize(runs[c.name], questions)}
            for c in CONFIGS
        ],
        "abstention": _calibrate(runs, questions),
        "questions": _question_details(engine.passages, runs, questions),
    }

    settings.eval_dir.mkdir(parents=True, exist_ok=True)
    (settings.eval_dir / "report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    calibration = report["abstention"]
    (settings.index_dir / "calibration.json").write_text(
        json.dumps({"dense_threshold": calibration["dense"]["threshold"]}),
        encoding="utf-8",
    )
    _print_summary(report)
    return report


@dataclass(frozen=True)
class _Result:
    ranked_ids: list[str]
    relevance: list[bool]
    relevant_count: int
    latency_ms: float
    timings_ms: dict[str, float]
    confidence: float | None
    top_score: float | None


def _run_config(engine: SearchEngine, config: Config, questions: list[Question]) -> list[_Result]:
    results = []
    # Le cache des questions est partagé entre configurations pour ménager les quotas : les
    # configurations hybrides réutilisent l'embedding calculé par la configuration dense.
    for question in questions:
        start = time.perf_counter()
        outcome = engine.search(
            question.question,
            config.method,
            k=K,
            encoder_key=config.encoder,
            route_by_language=config.route_by_language,
        )
        latency = (time.perf_counter() - start) * 1000
        if outcome.degraded:
            # Un repli (BM25 au lieu du dense…) fausserait silencieusement les métriques.
            reasons = "; ".join(f"{d.step} : {d.reason}" for d in outcome.degraded)
            sys.exit(f"Évaluation interrompue ({config.name}, {question.id}) — {reasons}")
        passages = [engine.passages[h.index] for h in outcome.hits]
        results.append(
            _Result(
                ranked_ids=[p.id for p in passages],
                relevance=[_is_relevant(p, question.relevant) for p in passages],
                relevant_count=sum(_is_relevant(p, question.relevant) for p in engine.passages),
                latency_ms=latency,
                timings_ms=outcome.timings_ms,
                confidence=outcome.confidence,
                top_score=outcome.hits[0].score if outcome.hits else None,
            )
        )
    return results


def _summarize(results: list[_Result], questions: list[Question]) -> dict:
    in_domain = [(r, q) for r, q in zip(results, questions, strict=True) if q.relevant]

    def metrics(pairs: list[tuple[_Result, Question]]) -> dict[str, float]:
        return {
            "success@1": _mean(success_at(r.relevance, 1) for r, _ in pairs),
            "success@3": _mean(success_at(r.relevance, 3) for r, _ in pairs),
            "success@5": _mean(success_at(r.relevance, 5) for r, _ in pairs),
            "success@10": _mean(success_at(r.relevance, 10) for r, _ in pairs),
            "mrr@10": _mean(reciprocal_rank(r.relevance) for r, _ in pairs),
            "ndcg@10": _mean(ndcg_at(r.relevance, r.relevant_count) for r, _ in pairs),
        }

    by_category: dict[str, list[tuple[_Result, Question]]] = defaultdict(list)
    for result, question in in_domain:
        by_category[question.category].append((result, question))

    latencies = [r.latency_ms for r in results]
    steps = sorted({step for r in results for step in r.timings_ms})
    return {
        "overall": metrics(in_domain),
        "by_category": {cat: metrics(pairs) for cat, pairs in by_category.items()},
        "latency_ms": {
            "p50": round(statistics.median(latencies), 1),
            "p95": round(statistics.quantiles(latencies, n=20)[-1], 1),
            "steps_p50": {
                step: round(statistics.median(r.timings_ms.get(step, 0) for r in results), 1)
                for step in steps
            },
        },
    }


def _calibrate(runs: dict[str, list[_Result]], questions: list[Question]) -> dict:
    return {
        "dense": _calibrate_scores([r.confidence for r in runs["dense-gemini"]], questions),
        "rerank": _calibrate_scores([r.top_score for r in runs["hybrid-rerank"]], questions),
    }


def _calibrate_scores(scores: list[float | None], questions: list[Question]) -> dict:
    scored = [(s, bool(q.relevant)) for s, q in zip(scores, questions, strict=True)]
    positives = [s for s, in_domain in scored if in_domain and s is not None]
    negatives = [s for s, in_domain in scored if not in_domain and s is not None]
    threshold, accuracy = best_threshold(positives, negatives)
    return {
        "threshold": round(threshold, 4),
        "balanced_accuracy": round(accuracy, 3),
        "leave_one_out_accuracy": round(_leave_one_out(positives, negatives), 3),
        "in_domain_scores": sorted(round(s, 4) for s in positives),
        "out_of_domain_scores": sorted(round(s, 4) for s in negatives),
    }


def _leave_one_out(positives: list[float], negatives: list[float]) -> float:
    # Le seuil est choisi sur les mêmes 65 questions qu'il sert à juger : l'estimation
    # « leave-one-out » corrige cet optimisme en jugant chaque question avec un seuil
    # appris sans elle.
    correct = 0
    for i, score in enumerate(positives):
        threshold, _ = best_threshold(positives[:i] + positives[i + 1 :], negatives)
        correct += score >= threshold
    positive_rate = correct / len(positives)
    correct = 0
    for i, score in enumerate(negatives):
        threshold, _ = best_threshold(positives, negatives[:i] + negatives[i + 1 :])
        correct += score < threshold
    return (positive_rate + correct / len(negatives)) / 2


def _question_details(
    passages: list[Passage], runs: dict[str, list[_Result]], questions: list[Question]
) -> list[dict]:
    by_id = {p.id: p for p in passages}
    details = []
    for index, question in enumerate(questions):
        production = runs[PRODUCTION][index]
        details.append(
            {
                "id": question.id,
                "category": question.category,
                "question": question.question,
                "relevant": question.relevant,
                "first_relevant_rank": {
                    name: first_relevant_rank(results[index].relevance)
                    for name, results in runs.items()
                },
                "confidence": production.confidence,
                "rerank_score": production.top_score,
                "top": [
                    {"id": pid, "title": by_id[pid].heading, "relevant": rel}
                    for pid, rel in zip(
                        production.ranked_ids[:5], production.relevance, strict=False
                    )
                ],
            }
        )
    return details


def _is_relevant(passage: Passage, relevant: list[str]) -> bool:
    return passage.id in relevant or passage.doc_id in relevant


def _mean(values) -> float:
    values = list(values)
    return round(sum(values) / len(values), 4) if values else 0.0


def _print_summary(report: dict) -> None:
    print(f"{'config':<28}{'S@1':>7}{'S@5':>7}{'MRR':>7}{'nDCG':>7}{'p50 ms':>9}")
    for config in report["configs"]:
        m = config["overall"]
        print(
            f"{config['label']:<28}{m['success@1']:>7.2f}{m['success@5']:>7.2f}"
            f"{m['mrr@10']:>7.2f}{m['ndcg@10']:>7.2f}{config['latency_ms']['p50']:>9.1f}"
        )
    for name, calibration in report["abstention"].items():
        print(
            f"abstention {name}: seuil={calibration['threshold']} "
            f"acc. équilibrée={calibration['balanced_accuracy']} "
            f"(LOO {calibration['leave_one_out_accuracy']})"
        )
