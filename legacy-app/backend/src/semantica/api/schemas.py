from pydantic import BaseModel, Field

from semantica.corpus import Modality, Source
from semantica.retrieval.types import PRODUCTION_METHOD, Method


class SearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=300)
    method: Method = PRODUCTION_METHOD
    k: int = Field(default=8, ge=1, le=20)


class PassageOut(BaseModel):
    id: str
    doc_id: str
    title: str
    section: str | None
    text: str
    source: Source
    modality: Modality
    url: str | None
    page: int | None
    thumbnail: str | None


class ResultOut(BaseModel):
    rank: int
    score: float
    passage: PassageOut
    matched_terms: list[str]


class DegradationOut(BaseModel):
    step: str
    reason: str


class SearchResponse(BaseModel):
    query: str
    method: Method
    language: str
    abstained: bool
    confidence: float | None
    threshold: float | None
    timings_ms: dict[str, float]
    degraded: list[DegradationOut]
    results: list[ResultOut]


class CompareRequest(BaseModel):
    query: str = Field(min_length=2, max_length=300)
    k: int = Field(default=5, ge=1, le=10)


class CompareResponse(BaseModel):
    query: str
    language: str
    methods: dict[Method, SearchResponse]


class ProjectRequest(BaseModel):
    query: str = Field(min_length=2, max_length=300)


class Neighbour(BaseModel):
    id: str
    score: float


class ProjectResponse(BaseModel):
    x: float
    y: float
    neighbours: list[Neighbour]


class AskRequest(BaseModel):
    query: str = Field(min_length=2, max_length=300)


class QuizRequest(BaseModel):
    modality: Modality | None = None


class QuizResponse(BaseModel):
    question: str
    choices: list[str]
    answer: int
    explanation: str
    source: PassageOut


class GameResponse(BaseModel):
    game: int
    daily: bool


class GuessRequest(BaseModel):
    game: int = Field(ge=0)
    word: str = Field(min_length=1, max_length=40)


class GuessResponse(BaseModel):
    word: str
    known: bool
    similarity: float
    temperature: float
    rank: int | None
    found: bool


class HintRequest(BaseModel):
    game: int = Field(ge=0)
    best_rank: int | None = None


class HintResponse(BaseModel):
    word: str
    rank: int


class RevealRequest(BaseModel):
    game: int = Field(ge=0)


class RevealResponse(BaseModel):
    secret: str
    neighbours: list[tuple[str, float]]


class DiagnoseRequest(BaseModel):
    query: str = Field(min_length=2, max_length=300)


class DiagnosticsOut(BaseModel):
    risk: str
    reasons: list[str]
    language: str
    confidence: float | None
    threshold: float | None
    margin: float | None
    lexical_dense_overlap: float | None
    top1_agreement: bool | None


class JudgeRequest(BaseModel):
    query: str = Field(min_length=2, max_length=300)
    passage_ids: list[str] = Field(min_length=1, max_length=10)
