from enum import StrEnum

from pydantic import BaseModel, Field, ValidationError

from semantica.corpus import Passage
from semantica.llm import LlmError, Message, complete_json
from semantica.settings import Settings

SYSTEM_PROMPT = """Tu évalues un moteur de recherche sur le cours INF5101 « Traitement multimédia des données ».
Pour une question et une liste numérotée de passages retrouvés, juge chaque passage :
- "pertinent" : il répond directement à la question ;
- "partiel" : il en traite une partie ou un aspect voisin utile ;
- "hors_sujet" : il ne permet pas de répondre.
Sois exigeant : un passage qui partage seulement des mots avec la question est hors sujet.
Puis, en une ou deux phrases, diagnostique l'erreur de récupération la plus probable si le classement est imparfait
(vocabulaire différent, jargon anglais, question trop vague, sujet absent du corpus, bon passage mal classé…),
ou confirme que le classement est bon.
Réponds en JSON strict :
{"judgements": [{"id": int, "verdict": "pertinent" | "partiel" | "hors_sujet", "reason": str}], "diagnosis": str}"""

PASSAGE_CHARACTERS = 900


class Verdict(StrEnum):
    RELEVANT = "pertinent"
    PARTIAL = "partiel"
    OFF_TOPIC = "hors_sujet"


class Judgement(BaseModel):
    id: int
    verdict: Verdict
    reason: str = Field(max_length=400)


class JudgeOutput(BaseModel):
    judgements: list[Judgement]
    diagnosis: str = Field(max_length=800)


class JudgeReport(BaseModel):
    judgements: list[Judgement]
    diagnosis: str
    precision: float
    first_relevant_rank: int | None


async def judge_results(
    settings: Settings, question: str, passages: list[Passage]
) -> JudgeReport | LlmError:
    raw = await complete_json(settings, _messages(question, passages), temperature=0)
    if isinstance(raw, LlmError):
        return raw
    try:
        output = JudgeOutput.model_validate(raw)
    except ValidationError:
        return LlmError("Le juge a produit une évaluation mal formée.", retryable=True)

    by_rank = {j.id: j for j in output.judgements if 1 <= j.id <= len(passages)}
    if len(by_rank) != len(passages):
        return LlmError("Le juge n'a pas évalué tous les passages.", retryable=True)
    judgements = [by_rank[rank] for rank in range(1, len(passages) + 1)]
    # Un passage partiel compte pour moitié : il aide sans suffire à répondre.
    weights = {Verdict.RELEVANT: 1.0, Verdict.PARTIAL: 0.5, Verdict.OFF_TOPIC: 0.0}
    precision = sum(weights[j.verdict] for j in judgements) / len(judgements)
    first = next((j.id for j in judgements if j.verdict is Verdict.RELEVANT), None)
    return JudgeReport(
        judgements=judgements,
        diagnosis=output.diagnosis,
        precision=round(precision, 3),
        first_relevant_rank=first,
    )


def _messages(question: str, passages: list[Passage]) -> list[Message]:
    listing = "\n\n".join(
        f"[{rank}] {p.heading}\n{p.text[:PASSAGE_CHARACTERS]}"
        for rank, p in enumerate(passages, start=1)
    )
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Question : {question}\n\nPassages retrouvés :\n\n{listing}"},
    ]
