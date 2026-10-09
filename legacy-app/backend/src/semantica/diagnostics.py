from dataclasses import dataclass
from enum import StrEnum

from semantica.retrieval.engine import SearchEngine
from semantica.retrieval.types import Method

TOP = 5
NARROW_MARGIN = 0.02


class Risk(StrEnum):
    LOW = "faible"
    MEDIUM = "moyen"
    HIGH = "élevé"


@dataclass(frozen=True)
class Diagnostics:
    risk: Risk
    reasons: list[str]
    language: str
    confidence: float | None
    threshold: float | None
    margin: float | None
    lexical_dense_overlap: float | None
    top1_agreement: bool | None


def diagnose(engine: SearchEngine, query: str) -> Diagnostics:
    # Sans vérité terrain, on ne mesure pas l'erreur : on repère les signaux qui l'annoncent
    # (confiance proche du seuil, désaccord entre deux familles de méthodes indépendantes).
    lexical = engine.search(query, Method.BM25, k=TOP)
    dense = engine.search(query, Method.DENSE, k=TOP)
    threshold = engine.calibration.dense_threshold
    confidence = dense.confidence
    margin = confidence - threshold if confidence is not None and threshold is not None else None

    reasons: list[str] = []
    risk = Risk.LOW

    if dense.degraded:
        return Diagnostics(
            risk=Risk.HIGH,
            reasons=["Recherche sémantique indisponible : seul BM25 a répondu."],
            language=dense.language,
            confidence=None,
            threshold=threshold,
            margin=None,
            lexical_dense_overlap=None,
            top1_agreement=None,
        )

    lexical_ids = {h.index for h in lexical.hits}
    dense_ids = {h.index for h in dense.hits}
    overlap = len(lexical_ids & dense_ids) / TOP if lexical.hits else 0.0
    top1 = bool(lexical.hits) and lexical.hits[0].index == dense.hits[0].index

    if dense.abstained:
        risk = Risk.HIGH
        reasons.append("Confiance sous le seuil calibré : la question sort probablement du cours.")
    elif margin is not None and margin < NARROW_MARGIN:
        risk = Risk.MEDIUM
        reasons.append("Confiance tout juste au-dessus du seuil : réponse fragile.")

    if dense.language != "fr":
        reasons.append("Question en anglais : seul le dense compte, BM25 ne peut pas apparier.")
    elif not lexical.hits:
        reasons.append("Aucun mot de la question dans le corpus : tout repose sur le dense.")
        risk = max(risk, Risk.MEDIUM, key=_rank)
    elif overlap == 0:
        reasons.append(
            "BM25 et le dense ne retrouvent aucun passage commun : les deux lectures divergent."
        )
        risk = max(risk, Risk.MEDIUM, key=_rank)
    elif top1:
        reasons.append("BM25 et le dense s'accordent sur le meilleur passage.")

    if not reasons:
        reasons.append("Signaux cohérents : confiance confortable et méthodes en accord partiel.")

    return Diagnostics(
        risk=risk,
        reasons=reasons,
        language=dense.language,
        confidence=confidence,
        threshold=threshold,
        margin=round(margin, 4) if margin is not None else None,
        lexical_dense_overlap=round(overlap, 2),
        top1_agreement=top1,
    )


def _rank(risk: Risk) -> int:
    return [Risk.LOW, Risk.MEDIUM, Risk.HIGH].index(risk)
