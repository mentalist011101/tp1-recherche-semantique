import logging
from collections.abc import Iterator
from dataclasses import dataclass

from langchain_core.language_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate

from moteur.catalog import Article
from moteur.search import Hit

logger = logging.getLogger(__name__)

# Même consigne que dans le notebook (section 8).
SYSTEM_PROMPT = """Tu es l'assistant d'un moteur de recherche d'articles scientifiques sur le traitement \
multimédia (texte, image, audio, multimodal).
Réponds à la question uniquement à partir des passages numérotés fournis, jamais de tes connaissances.
- Réponds dans la langue de la question, en quelques phrases claires.
- Cite les passages utilisés par leur numéro entre crochets droits, exactement sous la forme [1] ou [2][4].
- Si les passages ne suffisent pas pour répondre, dis-le franchement au lieu de compléter.
- Termine par une ligne « Sources : » suivie des numéros réellement utilisés, au même format, par exemple « Sources : [1][3] »."""

PROMPT = ChatPromptTemplate.from_messages(
    [("system", SYSTEM_PROMPT), ("human", "Passages :\n\n{context}\n\nQuestion : {question}")]
)


# gpt-oss cite parfois avec les crochets pleine chasse « 【1】 » malgré la consigne : on les
# ramène à « [1] », le format que le front sait relier aux sources.
FULLWIDTH_BRACKETS = str.maketrans({"【": "[", "】": "]"})


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
                yield chunk.text.translate(FULLWIDTH_BRACKETS)
    except Exception as error:  # frontière réseau : Groq indisponible, quota, clé invalide
        logger.exception("Génération impossible")
        yield GenerationFailure(f"{type(error).__name__}: {error}")
