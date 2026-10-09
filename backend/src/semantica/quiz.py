import random

from pydantic import BaseModel, Field, ValidationError, field_validator

from semantica.corpus import Modality, Passage, Source
from semantica.llm import LlmError, Message, complete_json
from semantica.settings import Settings

SYSTEM_PROMPT = """Tu crées des questions de révision pour le cours de Master INF5101 « Traitement multimédia des données ».
À partir de la slide fournie, écris UNE question à choix multiple qui vérifie la compréhension (pas la mémorisation mot à mot).
Contraintes :
- 4 propositions plausibles, une seule correcte, de longueurs comparables.
- Les distracteurs doivent être des confusions réalistes d'étudiant, pas des absurdités.
- L'explication (1 à 2 phrases) justifie la bonne réponse en s'appuyant sur la slide.
Réponds en JSON strict : {"question": str, "choices": [str, str, str, str], "answer": int (0-3), "explanation": str}"""


class QuizItem(BaseModel):
    question: str = Field(min_length=10)
    choices: list[str] = Field(min_length=4, max_length=4)
    answer: int = Field(ge=0, le=3)
    explanation: str

    @field_validator("choices")
    @classmethod
    def distinct_choices(cls, choices: list[str]) -> list[str]:
        if len({c.strip().lower() for c in choices}) != 4:
            raise ValueError("propositions en double")
        return choices


def quiz_candidates(passages: list[Passage], modality: Modality | None) -> list[Passage]:
    return [
        p
        for p in passages
        if p.source is Source.COURSE
        and p.text.count("•") >= 3
        and p.modality is not Modality.INTRO
        and (modality is None or p.modality is modality)
    ]


async def generate_quiz(
    settings: Settings, candidates: list[Passage], attempts: int = 2
) -> tuple[QuizItem, Passage] | LlmError:
    slide = random.choice(candidates)
    error = LlmError("Aucune tentative.")
    for _ in range(attempts):
        raw = await complete_json(settings, _messages(slide))
        if isinstance(raw, LlmError):
            if not raw.retryable:
                return raw
            error = raw
            continue
        try:
            item = QuizItem.model_validate(raw)
        except ValidationError:
            error = LlmError("Le modèle a produit un quiz mal formé.", retryable=True)
            continue
        return _shuffled(item), slide
    return error


def _messages(slide: Passage) -> list[Message]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Slide {slide.page} — {slide.title}\n{slide.text}"},
    ]


def _shuffled(item: QuizItem) -> QuizItem:
    # Les LLM placent la bonne réponse en première position bien plus souvent qu'au hasard.
    order = random.sample(range(4), 4)
    return item.model_copy(
        update={"choices": [item.choices[i] for i in order], "answer": order.index(item.answer)}
    )
