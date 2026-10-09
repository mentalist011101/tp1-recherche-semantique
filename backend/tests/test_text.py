from semantica.ingest.chunking import chunk_text, split_sentences
from semantica.text import analyze, detect_language, fold_accents


def test_analyze_removes_stopwords_and_merges_inflections():
    assert analyze("Les réseaux de neurones") == analyze("réseau neurone")


def test_analyze_is_accent_insensitive():
    assert analyze("évaluation") == analyze("evaluation")


def test_fold_accents():
    assert fold_accents("Échantillonnage à fréquence") == "Echantillonnage a frequence"


def test_detect_language():
    assert detect_language("What is a spectrogram?") == "en"
    assert detect_language("Qu'est-ce qu'un spectrogramme ?") == "fr"


def test_split_sentences_keeps_abbreviations_inside_sentence():
    sentences = split_sentences("Le modèle apprend. Il généralise ensuite ! Fin")
    assert sentences == ["Le modèle apprend.", "Il généralise ensuite !", "Fin"]


def test_chunk_text_respects_word_budget():
    text = " ".join(f"Phrase numéro {i} assez courte." for i in range(100))
    chunks = chunk_text(text, max_words=50, min_words=10)
    assert all(len(c.split()) <= 50 for c in chunks)
    assert " ".join(chunks) == text


def test_chunk_text_merges_short_tail():
    text = "Un. " * 30 + "Fin."
    chunks = chunk_text(text, max_words=30, min_words=5)
    assert chunks[-1].endswith("Fin.")
    assert len(chunks[-1].split()) > 1
