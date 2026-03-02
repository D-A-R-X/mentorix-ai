import json
from pathlib import Path
from typing import Any, Dict

COURSE_CATALOG_PATH = Path(__file__).with_name("course_catalog.json")

with COURSE_CATALOG_PATH.open("r", encoding="utf-8") as file:
    course_catalog = json.load(file)

CAREER_MAP = {
    "software_track":   "Software / IT Career Path",
    "core_track":       "Core Engineering Career Path",
    "management_track": "Management / Product Career Path",
    "foundation_track": "Foundation First Stabilization Path",
}
def generate_recommendations(
    student_data: Dict[str, Any],
    risk_level: str,
    stability_index: float = 0.5,
    trend: str = "stable",
    volatility: float = 0.0,      # ✅ Layer B
    track_flips: int = 0           # ✅ Layer B
) -> Dict[str, Any]:

    tech       = student_data["tech_interest"]
    core       = student_data["core_interest"]
    mgmt       = student_data["management_interest"]
    confidence = student_data["confidence"]

    # ── Dominant track ───────────────────────────────────────
    interest_scores = {
        "software_track":   float(tech),
        "core_track":       float(core),
        "management_track": float(mgmt),
    }
    dominant_track = max(interest_scores, key=interest_scores.get)

    # ── Base scores ──────────────────────────────────────────
    scores = {**interest_scores, "foundation_track": 0.0}

    # ── Foundation sliding force ─────────────────────────────
    foundation_score = (1 - stability_index) * 6

    if risk_level == "High":   foundation_score += 2.0
    elif risk_level == "Medium": foundation_score += 0.8

    if trend == "improving":   foundation_score -= 1.5
    elif trend == "declining": foundation_score += 1.5

    if confidence <= 2: foundation_score += 1.2
    elif confidence >= 4: foundation_score -= 0.8

    scores["foundation_track"] = max(0.0, round(foundation_score, 2))

    # ── Trend boost on specialization ────────────────────────
    if trend == "improving":
        for key in ["software_track", "core_track", "management_track"]:
            scores[key] += 1.5

    # ── Layer A: Directional Momentum ────────────────────────
    if trend == "improving":     momentum_bonus = 1.5
    elif trend == "stable":      momentum_bonus = 0.7
    elif trend == "declining":   momentum_bonus = -1.0
    else:                        momentum_bonus = 0.0

    momentum_bonus *= stability_index
    scores[dominant_track] += round(momentum_bonus, 2)

    # ── Confidence boost ─────────────────────────────────────
    if confidence >= 4:
        scores[dominant_track] += 1.0

    # ── Layer B: Volatility Detection (affects BOTH) ─────────
    volatility_penalty = 0.0

    if volatility > 0.0002:   # ✅ tuned for tight stability range
        volatility_penalty += 1.5
    if track_flips >= 2:
        volatility_penalty += 2.0

    # C: Affect both — foundation up AND specialization down
    scores["foundation_track"] += volatility_penalty
    if volatility_penalty > 0:
        # Reduce ALL specialization tracks proportionally
        reduction = volatility_penalty * 0.5  # softer on specialization
        for key in ["software_track", "core_track", "management_track"]:
            scores[key] = max(0.0, scores[key] - reduction)

    # ── Round all scores ─────────────────────────────────────
    scores = {k: round(v, 2) for k, v in scores.items()}

    # ── Select winning track ─────────────────────────────────
    track = max(scores, key=scores.get)

    # ── Safe catalog lookup ───────────────────────────────────
    selected_courses = course_catalog.get(track) or course_catalog.get("foundation_track", [])

    # ── Dynamic career label ──────────────────────────────────
    career = CAREER_MAP.get(track, "General Career Path")

    if volatility > 0.02 and track == "foundation_track":
        career = "⚠️ Unstable Pattern — " + career
    elif risk_level == "High" and track == "foundation_track":
        career = "⚠️ High Risk — " + career
    elif trend == "improving" and track != "foundation_track":
        career = "📈 " + career
    elif trend == "declining":
        career = "⚠️ " + career + " — Needs Attention"

    return {
        "career_path":        career,
        "track":              track,
        "courses":            selected_courses,
        "risk_level":         risk_level,
        "decision_scores":    scores,
        "dominant_track":     dominant_track,
        "momentum_bonus":     round(momentum_bonus, 2),
        "volatility_penalty": round(volatility_penalty, 2),
        "stability_index":    stability_index,
        "trend":              trend,
    }