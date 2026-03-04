import json
from pathlib import Path
from typing import Any, Dict, List, Optional

COURSE_CATALOG_PATH = Path(__file__).with_name("course_catalog.json")

with COURSE_CATALOG_PATH.open("r", encoding="utf-8") as file:
    course_catalog = json.load(file)

CAREER_MAP = {
    "software_track":            "Software / IT Career Path",
    "core_track":                "Core Engineering Career Path",
    "management_track":          "Management / Product Career Path",
    "foundation_track":          "Foundation First Stabilization Path",
    "career_acceleration_track": "Advanced Career Acceleration Path",
    "skill_upgrade_track":       "Professional Skill Upgrade Path",
    "transition_track":          "Career Transition Path",
}


# ── Helper: build consistent response ─────────────────────────
def _build_response(
    track: str,
    risk_level: str,
    stability_index: float,
    trend: str,
    scores: Dict,
    momentum_bonus: float,
    volatility_penalty: float
) -> Dict[str, Any]:

    selected_courses = course_catalog.get(track) or course_catalog.get("foundation_track", [])
    career = CAREER_MAP.get(track, "General Career Path")

    if volatility_penalty > 0 and track == "foundation_track":
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
        "momentum_bonus":     round(momentum_bonus, 2),
        "volatility_penalty": round(volatility_penalty, 2),
        "stability_index":    stability_index,
        "trend":              trend,
    }


# ── Helper: Layer D — detect dominant track from history ───────
def detect_dominant_track(history: List[Dict[str, Any]]) -> Optional[str]:
    if not history or len(history) < 5:
        return None

    tracks = [h.get("track") for h in history[:10] if h.get("track")]

    counts = {}
    for t in tracks:
        counts[t] = counts.get(t, 0) + 1

    dominant = max(counts, key=counts.get)

    # Only lock in if track appears 4+ times out of last 10 sessions
    if counts[dominant] >= 4:
        return dominant

    return None


# ── Main engine ────────────────────────────────────────────────
def generate_recommendations(
    student_data: Dict[str, Any],
    risk_level: str,
    stability_index: float = 0.5,
    trend: str = "stable",
    volatility: float = 0.0,
    track_flips: int = 0,
    history: List[Dict[str, Any]] = None
) -> Dict[str, Any]:

    if history is None:
        history = []

    persona = student_data.get("current_status", "student")

    # ── Persona routing (non-student) ─────────────────────────
    if persona == "working_professional":
        years_exp = student_data.get("years_experience") or 0
        track = "career_acceleration_track" if years_exp >= 3 else "skill_upgrade_track"
        return _build_response(track, risk_level, stability_index, trend, {}, 0.0, 0.0)

    if persona == "career_switcher":
        return _build_response("transition_track", risk_level, stability_index, trend, {}, 0.0, 0.0)

    # ── Student weighted engine ────────────────────────────────

    tech = float(student_data.get("tech_interest", 3))
    core = float(student_data.get("core_interest", 3))
    mgmt = float(student_data.get("management_interest", 3))
    confidence = int(student_data.get("confidence", 3))

    # Step 1 — Base interest scores
    scores = {
        "software_track":   tech,
        "core_track":       core,
        "management_track": mgmt,
        "foundation_track": 0.0,
    }

    # Determine dominant interest track
    interest_map = {"software_track": tech, "core_track": core, "management_track": mgmt}
    dominant_interest_track = max(interest_map, key=interest_map.get)

    # Step 2 — Foundation sliding force
    foundation_score = (1 - stability_index) * 6

    # Step 3 — Risk level adjustment
    if risk_level == "High":     foundation_score += 2.0
    elif risk_level == "Medium": foundation_score += 0.8

    # Step 4 — Trend boost on specialization / foundation
    if trend == "improving":
        for k in ["software_track", "core_track", "management_track"]:
            scores[k] += 1.5
        foundation_score -= 1.5
    elif trend == "declining":
        foundation_score += 1.5

    if confidence <= 2: foundation_score += 1.2
    elif confidence >= 4: foundation_score -= 0.8

    scores["foundation_track"] = max(0.0, round(foundation_score, 2))

    # Step 5 — Layer A: Directional Momentum (dominant track only)
    if trend == "improving":     momentum_bonus = 1.5 * stability_index
    elif trend == "stable":      momentum_bonus = 0.7 * stability_index
    elif trend == "declining":   momentum_bonus = -1.0 * stability_index
    else:                        momentum_bonus = 0.0

    scores[dominant_interest_track] = round(
        scores[dominant_interest_track] + momentum_bonus, 2
    )

    # Step 6 — Confidence boost on dominant track
    if confidence >= 4:
        scores[dominant_interest_track] = round(
            scores[dominant_interest_track] + 1.0, 2
        )

    # Step 7 — Layer B: Volatility Detection
    volatility_penalty = 0.0

    if volatility > 0.0002:   # tuned for tight stability range (0.55–0.59)
        volatility_penalty += 1.5
    if track_flips >= 2:
        volatility_penalty += 2.0

    scores["foundation_track"] = round(
        scores["foundation_track"] + volatility_penalty, 2
    )

    if volatility_penalty > 0:
        reduction = volatility_penalty * 0.5
        for k in ["software_track", "core_track", "management_track"]:
            scores[k] = max(0.0, round(scores[k] - reduction, 2))

    # Step 8 — Layer C: Confidence Projection
    # Predicts future confidence trajectory from trend + stability + confidence
    confidence_projection = 0.0

    if trend == "improving":
        # Student is on upward path — boost specialization forward
        confidence_projection = stability_index * confidence * 0.2
        for k in ["software_track", "core_track", "management_track"]:
            scores[k] = round(scores[k] + confidence_projection, 2)

    elif trend == "declining":
        # Student is slipping — push foundation proportionally
        confidence_projection = -(1 - stability_index) * (5 - confidence) * 0.2
        scores["foundation_track"] = round(
            scores["foundation_track"] + abs(confidence_projection), 2
        )

    # Step 9 — Layer D: Track Lock-in
    # After 4+ consistent sessions on same track, resist switching
    locked_track = detect_dominant_track(history)
    lock_applied = False

    if locked_track and locked_track in scores:
        scores[locked_track] = round(scores[locked_track] + 1.8, 2)
        for k in scores:
            if k != locked_track:
                scores[k] = max(0.0, round(scores[k] - 0.6, 2))
        lock_applied = True

    # Step 10 — Final track selection
    selected_track = max(scores, key=scores.get)

    return _build_response(
        selected_track,
        risk_level,
        stability_index,
        trend,
        scores,
        momentum_bonus,
        volatility_penalty
    )