import json
from collections import Counter
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse

from semantica.api.ratelimit import RateLimiter
from semantica.api.schemas import (
    AskRequest,
    CompareRequest,
    CompareResponse,
    DegradationOut,
    DiagnoseRequest,
    DiagnosticsOut,
    GameResponse,
    GuessRequest,
    GuessResponse,
    HintRequest,
    HintResponse,
    JudgeRequest,
    Neighbour,
    PassageOut,
    ProjectRequest,
    ProjectResponse,
    QuizRequest,
    QuizResponse,
    ResultOut,
    RevealRequest,
    RevealResponse,
    SearchRequest,
    SearchResponse,
)
from semantica.api.services import Services
from semantica.cemantix import SECRET_WORDS, Cemantix
from semantica.corpus import Passage
from semantica.diagnostics import diagnose
from semantica.inference import InferenceError
from semantica.judge import JudgeReport, judge_results
from semantica.llm import LlmError, stream_chat
from semantica.quiz import generate_quiz, quiz_candidates
from semantica.rag import build_messages
from semantica.retrieval.dense import DEFAULT_ENCODER
from semantica.retrieval.engine import SearchOutcome
from semantica.retrieval.types import PRODUCTION_METHOD, Method
from semantica.text import analyze, words

RAG_CONTEXT = 5

router = APIRouter(prefix="/api")
llm_limiter = RateLimiter(capacity=8, refill_per_minute=8)


def services(request: Request) -> Services:
    return request.app.state.services


@router.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/stats", tags=["meta"])
def stats(svc: Services = Depends(services)) -> dict:
    passages = svc.passages
    return {
        **svc.manifest,
        "by_source": Counter(p.source.value for p in passages),
        "by_modality": Counter(p.modality.value for p in passages),
        "llm_enabled": svc.settings.llm_enabled,
        "inference_enabled": bool(svc.settings.hf_token),
        "llm_model": svc.settings.llm_models[0],
        "calibration": svc.engine.calibration.__dict__,
    }


@router.post("/search", tags=["recherche"])
def search(body: SearchRequest, svc: Services = Depends(services)) -> SearchResponse:
    outcome = svc.engine.search(body.query, body.method, k=body.k)
    return _search_response(svc, body.query, outcome)


@router.post("/compare", tags=["recherche"])
def compare(body: CompareRequest, svc: Services = Depends(services)) -> CompareResponse:
    responses = {
        method: _search_response(svc, body.query, svc.engine.search(body.query, method, k=body.k))
        for method in Method
    }
    return CompareResponse(
        query=body.query,
        language=responses[Method.DENSE].language,
        methods=responses,
    )


@router.get("/passages/{passage_id:path}", tags=["recherche"])
def passage(passage_id: str, svc: Services = Depends(services)) -> PassageOut:
    match = next((p for p in svc.passages if p.id == passage_id), None)
    if match is None:
        raise HTTPException(404, "Passage introuvable")
    return _passage_out(match)


@router.get("/map", tags=["carte"])
def semantic_map(svc: Services = Depends(services)) -> dict:
    by_id = {p.id: p for p in svc.passages}
    points = [
        {
            **point,
            "title": by_id[point["id"]].title,
            "heading": by_id[point["id"]].heading,
            "modality": by_id[point["id"]].modality,
            "source": by_id[point["id"]].source,
            "page": by_id[point["id"]].page,
            "snippet": by_id[point["id"]].text[:220],
        }
        for point in svc.map_data["points"]
    ]
    return {"points": points, "clusters": svc.map_data["clusters"]}


@router.post("/map/project", tags=["carte"])
def project(body: ProjectRequest, svc: Services = Depends(services)) -> ProjectResponse:
    vector = svc.engine.embed_query(body.query)
    if isinstance(vector, InferenceError):
        raise HTTPException(503, vector.reason)
    x, y = svc.projector.project(vector[None, :])[0]
    hits = svc.engine.dense[DEFAULT_ENCODER].search(vector, 8)
    return ProjectResponse(
        x=float(x),
        y=float(y),
        neighbours=[Neighbour(id=svc.passages[h.index].id, score=round(h.score, 4)) for h in hits],
    )


@router.get("/evaluation", tags=["évaluation"])
def evaluation(svc: Services = Depends(services)) -> dict:
    if svc.report is None:
        raise HTTPException(404, "Aucun rapport : lancez `semantica evaluate`.")
    return svc.report


@router.post("/ask", tags=["rag"])
async def ask(body: AskRequest, request: Request, svc: Services = Depends(services)):
    llm_limiter.check(request)
    outcome = await run_in_threadpool(svc.engine.search, body.query, PRODUCTION_METHOD, RAG_CONTEXT)
    response = _search_response(svc, body.query, outcome)
    return StreamingResponse(
        _answer_events(svc, body.query, outcome, response),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _answer_events(
    svc: Services, query: str, outcome: SearchOutcome, response: SearchResponse
) -> AsyncIterator[str]:
    yield _sse("sources", response.model_dump(mode="json"))
    if outcome.abstained:
        yield _sse("abstain", {"reason": "Aucun passage du corpus n'est assez pertinent."})
        yield _sse("done", {})
        return
    passages = [svc.passages[h.index] for h in outcome.hits]
    async for chunk in stream_chat(svc.settings, build_messages(query, passages)):
        if isinstance(chunk, LlmError):
            yield _sse("error", {"reason": chunk.reason, "retryable": chunk.retryable})
            break
        yield _sse("token", {"text": chunk})
    yield _sse("done", {})


@router.post("/quiz", tags=["révision"])
async def quiz(
    body: QuizRequest, request: Request, svc: Services = Depends(services)
) -> QuizResponse:
    llm_limiter.check(request)
    candidates = quiz_candidates(svc.passages, body.modality)
    result = await generate_quiz(svc.settings, candidates)
    if isinstance(result, LlmError):
        raise HTTPException(503 if result.retryable else 502, result.reason)
    item, slide = result
    return QuizResponse(**item.model_dump(), source=_passage_out(slide))


@router.post("/diagnose", tags=["qualité"])
def diagnose_search(body: DiagnoseRequest, svc: Services = Depends(services)) -> DiagnosticsOut:
    return DiagnosticsOut(**diagnose(svc.engine, body.query).__dict__)


@router.post("/judge", tags=["qualité"])
async def judge(
    body: JudgeRequest, request: Request, svc: Services = Depends(services)
) -> JudgeReport:
    llm_limiter.check(request)
    by_id = {p.id: p for p in svc.passages}
    missing = [pid for pid in body.passage_ids if pid not in by_id]
    if missing:
        raise HTTPException(404, f"Passages inconnus : {', '.join(missing)}")
    result = await judge_results(svc.settings, body.query, [by_id[pid] for pid in body.passage_ids])
    if isinstance(result, LlmError):
        raise HTTPException(503 if result.retryable else 502, result.reason)
    return result


@router.get("/cemantix/daily", tags=["cémantix"])
def cemantix_daily() -> GameResponse:
    return GameResponse(game=Cemantix.daily_game(), daily=True)


@router.post("/cemantix/new", tags=["cémantix"])
def cemantix_new(exclude: int | None = None) -> GameResponse:
    return GameResponse(game=Cemantix.random_game(exclude), daily=False)


@router.post("/cemantix/guess", tags=["cémantix"])
def cemantix_guess(body: GuessRequest, svc: Services = Depends(services)) -> GuessResponse:
    _check_game(body.game)
    if not body.word.strip().replace("-", "").isalpha():
        raise HTTPException(422, "Un seul mot, sans chiffres ni espaces.")
    guess = svc.cemantix.guess(body.game, body.word)
    if isinstance(guess, InferenceError):
        raise HTTPException(503, guess.reason)
    return GuessResponse(**guess.__dict__)


@router.post("/cemantix/hint", tags=["cémantix"])
def cemantix_hint(body: HintRequest, svc: Services = Depends(services)) -> HintResponse:
    _check_game(body.game)
    word, rank = svc.cemantix.hint(body.game, body.best_rank)
    return HintResponse(word=word, rank=rank)


@router.post("/cemantix/reveal", tags=["cémantix"])
def cemantix_reveal(body: RevealRequest, svc: Services = Depends(services)) -> RevealResponse:
    _check_game(body.game)
    secret, neighbours = svc.cemantix.reveal(body.game)
    return RevealResponse(secret=secret, neighbours=neighbours)


def _check_game(game: int) -> None:
    if game >= len(SECRET_WORDS):
        raise HTTPException(404, "Partie inconnue")


def _search_response(svc: Services, query: str, outcome: SearchOutcome) -> SearchResponse:
    query_stems = set(analyze(query))
    return SearchResponse(
        query=query,
        method=outcome.method,
        language=outcome.language,
        abstained=outcome.abstained,
        confidence=outcome.confidence,
        threshold=svc.engine.calibration.dense_threshold
        if outcome.confidence is not None
        else None,
        timings_ms=outcome.timings_ms,
        degraded=[DegradationOut(step=d.step, reason=d.reason) for d in outcome.degraded],
        results=[
            ResultOut(
                rank=rank + 1,
                score=round(hit.score, 4),
                passage=_passage_out(svc.passages[hit.index]),
                matched_terms=_matched_terms(svc.passages[hit.index], query_stems),
            )
            for rank, hit in enumerate(outcome.hits)
        ],
    )


def _matched_terms(passage: Passage, query_stems: set[str]) -> list[str]:
    if not query_stems:
        return []
    return sorted({w for w in words(passage.embedding_text) if set(analyze(w)) & query_stems})


def _passage_out(passage: Passage) -> PassageOut:
    return PassageOut(
        id=passage.id,
        doc_id=passage.doc_id,
        title=passage.title,
        section=passage.section,
        text=passage.text,
        source=passage.source,
        modality=passage.modality,
        url=passage.url,
        page=passage.page,
        thumbnail=f"/slides/{passage.page}.jpg" if passage.page else None,
    )


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
