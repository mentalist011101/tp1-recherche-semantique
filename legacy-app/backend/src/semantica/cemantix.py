import json
import random
from collections import Counter
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import numpy as np

from semantica.corpus import Passage
from semantica.inference import InferenceError
from semantica.retrieval.dense import Encoder
from semantica.text import ENGLISH_STOPWORDS, FRENCH_STOPWORDS, fold_accents, raw_words

ENCODER_KEY = "minilm"
NEIGHBOURHOOD = 1000

SECRET_WORDS = (
    "spectrogramme", "pixel", "attention", "segmentation", "transcription", "traduction",
    "fréquence", "image", "vidéo", "parole", "convolution", "classification", "compression",
    "recherche", "embedding", "bruit", "mouvement", "caméra", "musique", "langage", "texte",
    "signal", "voix", "couleur", "réseau", "apprentissage", "détection", "phrase", "modèle",
    "résumé", "sentiment", "document", "trame", "codage", "échantillonnage", "spectre",
)  # fmt: skip

# Mots grammaticaux et formes verbales courantes : ils encombrent le voisinage des mots
# secrets sans rien apprendre au joueur.
FUNCTION_WORDS = frozenset(
    """
    puisse puissent soient voient étant ayant fois parmi lesquels lesquelles auxquels auxquelles
    laquelle lequel devient donnent rendre mise mises partie usuellement voire pendant concerne
    permet permettent permettant chaque encore toujours souvent également notamment cependant
    toutefois plusieurs certains certaines autant aucun aucune ensuite depuis avant après lors
    deux trois quatre cinq premier première premiers premières second seconde dernier dernière
    grande grand grands grandes petit petite petits petites nouveau nouvelle nouveaux nouvelles
    différents différentes possible possibles généralement particulier particulière exemple
    exemples utilisé utilisée utilisés utilisées utilise utilisent utiliser dite dits dites tant
    tels telle telles avoir étaient sont celle ceux leurs dont elles comme cette cela ceci très
    était sera seront serait peuvent pourrait doivent doit faut fait faite faits font faire
    afin ainsi aussi alors donc enfin bien mieux moins plus tous toutes tout toute autres autre
    même mêmes selon sous sans vers chez entre dans pour avec contre leur quel quelle quels
    quelles lorsque puisque tandis quant dire peut sein lieu cours suite façon manière
    """.split()
)
EXCLUDED_WORDS = FRENCH_STOPWORDS | ENGLISH_STOPWORDS | FUNCTION_WORDS


@dataclass(frozen=True)
class Guess:
    word: str
    known: bool
    similarity: float
    temperature: float
    rank: int | None
    found: bool


def build_vocabulary(
    passages: list[Passage], encoder: Encoder, out_dir: Path
) -> int | InferenceError:
    counts: Counter[str] = Counter()
    capitalized: Counter[str] = Counter()
    for passage in passages:
        for raw in raw_words(passage.embedding_text):
            word = raw.lower()
            counts[word] += 1
            capitalized[word] += raw[0].isupper()
    vocabulary = sorted(
        {
            w
            for w, n in counts.items()
            if n >= 3
            and len(w) >= 4
            and w.isalpha()
            and w not in EXCLUDED_WORDS
            # Majoritairement en majuscule : nom propre (Porter, Kalman…), pas un concept.
            and capitalized[w] / n < 0.5
        }
        | set(SECRET_WORDS)
    )
    vectors = encoder.encode_words(vocabulary, patience_seconds=600)
    if isinstance(vectors, InferenceError):
        return vectors
    out_dir.mkdir(parents=True, exist_ok=True)
    np.save(out_dir / "vocab-embeddings.npy", vectors)
    (out_dir / "vocab.json").write_text(
        json.dumps(vocabulary, ensure_ascii=False), encoding="utf-8"
    )
    return len(vocabulary)


class Cemantix:
    def __init__(self, index_dir: Path, encoder: Encoder) -> None:
        self.vocabulary: list[str] = json.loads(
            (index_dir / "vocab.json").read_text(encoding="utf-8")
        )
        self._vectors = np.load(index_dir / "vocab-embeddings.npy")
        self._position = {w: i for i, w in enumerate(self.vocabulary)}
        self._folded = {fold_accents(w): w for w in self.vocabulary}
        self._encoder = encoder
        self._neighbourhoods: dict[int, _Neighbourhood] = {}
        self._unknown: dict[str, np.ndarray] = {}

    @staticmethod
    def daily_game(today: date | None = None) -> int:
        return (today or date.today()).toordinal() % len(SECRET_WORDS)

    @staticmethod
    def random_game(exclude: int | None = None) -> int:
        choices = [i for i in range(len(SECRET_WORDS)) if i != exclude]
        return random.choice(choices)

    def guess(self, game: int, raw_word: str) -> Guess | InferenceError:
        secret = SECRET_WORDS[game]
        word = self._canonical(raw_word)
        if word == secret:
            return Guess(word, True, 1.0, 100.0, 0, True)

        vector = self._vector(word)
        if isinstance(vector, InferenceError):
            return vector
        neighbours = self._neighbourhood(game)
        similarity = float(vector @ self._vectors[self._position[secret]])
        rank = neighbours.ranks.get(word)
        return Guess(
            word=word,
            known=word in self._position,
            similarity=round(similarity, 4),
            temperature=neighbours.temperature(similarity),
            rank=rank,
            found=False,
        )

    def reveal(self, game: int, count: int = 10) -> tuple[str, list[tuple[str, float]]]:
        neighbours = self._neighbourhood(game)
        return SECRET_WORDS[game], neighbours.top[:count]

    def hint(self, game: int, best_rank: int | None) -> tuple[str, int]:
        neighbours = self._neighbourhood(game)
        target = max(1, (best_rank or NEIGHBOURHOOD) // 2)
        word, _ = neighbours.top[target - 1]
        return word, target

    def _canonical(self, raw_word: str) -> str:
        word = raw_word.strip().lower()
        if word in self._position:
            return word
        return self._folded.get(fold_accents(word), word)

    def _vector(self, word: str) -> np.ndarray | InferenceError:
        if word in self._position:
            return self._vectors[self._position[word]]
        if word not in self._unknown:
            encoded = self._encoder.encode_queries([word])
            if isinstance(encoded, InferenceError):
                return encoded
            # Le jeu est public : on borne le cache des mots hors vocabulaire.
            if len(self._unknown) > 5000:
                self._unknown.clear()
            self._unknown[word] = encoded[0]
        return self._unknown[word]

    def _neighbourhood(self, game: int) -> "_Neighbourhood":
        if game not in self._neighbourhoods:
            self._neighbourhoods[game] = self._compute_neighbourhood(game)
        return self._neighbourhoods[game]

    def _compute_neighbourhood(self, game: int) -> "_Neighbourhood":
        secret = SECRET_WORDS[game]
        similarities = self._vectors @ self._vectors[self._position[secret]]
        order = [i for i in np.argsort(-similarities) if self.vocabulary[i] != secret]
        top = [
            (self.vocabulary[i], round(float(similarities[i]), 4)) for i in order[:NEIGHBOURHOOD]
        ]
        return _Neighbourhood(
            top=top,
            ranks={w: r + 1 for r, (w, _) in enumerate(top)},
            closest=top[0][1],
            median=float(np.median(similarities)),
        )


@dataclass(frozen=True)
class _Neighbourhood:
    top: list[tuple[str, float]]
    ranks: dict[str, int]
    closest: float
    median: float

    def temperature(self, similarity: float) -> float:
        # Les cosinus bruts d'un sentence-transformer sont tassés (souvent entre 0.2 et 0.7) :
        # on les ramène sur une échelle où la médiane du vocabulaire vaut 0 °C et le voisin le
        # plus proche 100 °C, ce qui rend la progression lisible pour le joueur.
        scaled = 100 * (similarity - self.median) / (self.closest - self.median)
        return round(max(-100.0, min(99.99, scaled)), 2)
