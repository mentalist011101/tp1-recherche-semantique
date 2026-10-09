from semantica.corpus import Passage
from semantica.llm import Message

SYSTEM_PROMPT = """Tu es l'assistant de révision du cours INF5101 « Traitement multimédia des données » (ENSPY).
Tu réponds UNIQUEMENT à partir des extraits numérotés fournis.
Règles :
- Réponds dans la langue de la question, en 3 à 6 phrases claires, niveau master.
- Cite chaque affirmation avec le numéro de l'extrait entre crochets, par ex. [1] ou [2][3].
- Privilégie les slides du cours quand elles répondent à la question.
- Si les extraits ne permettent pas de répondre, dis-le explicitement et n'invente rien.
- N'ajoute ni introduction ni conclusion de politesse."""


def build_messages(question: str, passages: list[Passage]) -> list[Message]:
    context = "\n\n".join(_format(i + 1, p) for i, p in enumerate(passages))
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Extraits :\n\n{context}\n\nQuestion : {question}"},
    ]


def _format(number: int, passage: Passage) -> str:
    origin = f"slide {passage.page} du cours" if passage.page else f"Wikipédia, {passage.title}"
    return f"[{number}] ({origin}) {passage.heading}\n{passage.text}"
