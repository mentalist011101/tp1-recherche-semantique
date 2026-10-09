import re
import unicodedata
from functools import lru_cache

import Stemmer

WORD = re.compile(r"[a-zA-ZÀ-ÖØ-öø-ÿœŒæÆ0-9]+(?:-[a-zA-ZÀ-ÖØ-öø-ÿ0-9]+)*")

FRENCH_STOPWORDS = frozenset(
    """
    a au aux avec ce ces cet cette dans de des du elle elles en est et être eux il ils je la le les
    leur leurs lui ma mais me même mes moi mon ne nos notre nous on ou où par pas pour qu que qui sa
    se ses son sont sur ta te tes toi ton tu un une vos votre vous c d j l m n s t y été étée étés
    ai as avons avez ont aura auras aurons auront avait avais avions aviez avaient eu eue eus suis es
    sommes êtes était étais étions étiez étaient fut sera seront serait seraient soit sont ceci cela
    ça celui celle ceux celles comme comment quoi quel quelle quels quelles quand donc car si plus
    moins très tout tous toute toutes autre autres aussi alors ainsi entre sans sous chez vers peut
    peuvent faire fait fais font dont lorsque puis cas afin selon est-ce peut-être
    """.split()
)

ENGLISH_STOPWORDS = frozenset(
    """
    the a an and or of to in on for with is are was were be been being what which who whom how why
    when where does do did can could should would will this that these those it its from by as at
    into about between than then there their they you your i we our not no
    """.split()
)


@lru_cache(maxsize=1)
def _stemmer() -> Stemmer.Stemmer:
    return Stemmer.Stemmer("french")


def fold_accents(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def raw_words(text: str) -> list[str]:
    return WORD.findall(text.replace("'", " ").replace("’", " "))


def words(text: str) -> list[str]:
    return [w.lower() for w in raw_words(text)]


def analyze(text: str) -> list[str]:
    tokens = [w for w in words(text) if w not in FRENCH_STOPWORDS and len(w) > 1]
    return [fold_accents(stem) for stem in _stemmer().stemWords(tokens)]


def detect_language(text: str) -> str:
    tokens = words(text)
    english = sum(t in ENGLISH_STOPWORDS for t in tokens)
    french = sum(t in FRENCH_STOPWORDS for t in tokens)
    return "en" if english > french else "fr"
