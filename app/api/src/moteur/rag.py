import logging
from collections.abc import Iterator
from dataclasses import dataclass

from langchain_core.language_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate

from moteur.catalog import Article
from moteur.search import Hit

logger = logging.getLogger(__name__)

# Même consigne que dans le notebook (section 8). Rédigée en anglais : en français, elle poussait
# le modèle à répondre en français même à une question anglaise.
SYSTEM_PROMPT = """You are the assistant of a search engine over scientific articles on multimedia processing (text, image, audio, multimodal).
Answer the question using only the numbered passages provided, never your own knowledge.
- Write your answer in the same language as the question: French if the question is in French, English if it is in English.
- Keep it to a few clear sentences.
- Cite the passages you use by their number in square brackets, exactly like [1] or [2][4].
- If the passages are not enough to answer, say so plainly instead of filling the gaps.
- End with a line "Sources:" followed by the numbers actually used, in the same format, for example "Sources: [1][3]"."""

PROMPT = ChatPromptTemplate.from_messages(
    [("system", SYSTEM_PROMPT), ("human", "Passages:\n\n{context}\n\nQuestion: {question}")]
)


@dataclass(frozen=True)
class GenerationFailure:
    reason: str


def format_context(passages: list[Hit], articles: dict[str, Article]) -> str:
    blocks = []
    for number, hit in enumerate(passages, 1):
        article = articles[hit.doc_id]
        header = f"[{number}] {article.titre} ({article.annee}, {article.langue}) · {hit.section}"
        blocks.append(f"{header}\n{hit.passage}")
    return "\n\n".join(blocks)


def stream_answer(
    llm: BaseChatModel, question: str, passages: list[Hit], articles: dict[str, Article]
) -> Iterator[str | GenerationFailure]:
    chain = PROMPT | llm
    try:
        for chunk in chain.stream(
            {"context": format_context(passages, articles), "question": question}
        ):
            if chunk.text:
                yield chunk.text
    except Exception as error:  # frontière réseau : Groq indisponible, quota, clé invalide
        logger.exception("Génération impossible")
        yield GenerationFailure(f"{type(error).__name__}: {error}")
