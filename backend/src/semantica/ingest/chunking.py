import re

SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?…])\s+(?=[A-ZÀ-ÖØ-Þ0-9«\"(])")


def split_sentences(text: str) -> list[str]:
    return [s.strip() for s in SENTENCE_BOUNDARY.split(text) if s.strip()]


def chunk_text(text: str, max_words: int = 180, min_words: int = 40) -> list[str]:
    chunks: list[list[str]] = []
    current: list[str] = []
    size = 0
    for sentence in split_sentences(text):
        words = len(sentence.split())
        if current and size + words > max_words:
            chunks.append(current)
            current, size = [], 0
        current.append(sentence)
        size += words
    if current:
        # Un fragment final isolé donne un embedding peu informatif qui pollue le haut du classement.
        if chunks and size < min_words:
            chunks[-1].extend(current)
        else:
            chunks.append(current)
    return [" ".join(chunk) for chunk in chunks]
