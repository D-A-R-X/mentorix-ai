import json
from pathlib import Path
from typing import Dict, List, Any

QUESTION_BANK_PATH = Path(__file__).parent / "data" / "question_bank.json"

with QUESTION_BANK_PATH.open("r", encoding="utf-8") as f:
    QUESTION_BANK = json.load(f)


def get_all_questions() -> List[Dict[str, Any]]:
    """Return all questions in order with domain metadata attached."""
    questions = []
    for domain_key, domain_data in QUESTION_BANK["domains"].items():
        for q in domain_data["questions"]:
            questions.append({
                **q,
                "domain":        domain_key,
                "domain_label":  domain_data["label"],
                "weight_output": domain_data["weight_output"],
            })
    return questions


def score_assessment(answers: Dict[str, int]) -> Dict[str, Any]:
    """
    answers: { "tech_001": 2, "core_001": 3, ... }
             values are 0-based option index

    Returns mapped engine inputs + raw scores + perception gaps placeholder.
    """
    domain_scores = {}   # domain_key → {"total": int, "max": int}
    domain_map    = {}   # question_id → domain info

    # Build lookup
    for domain_key, domain_data in QUESTION_BANK["domains"].items():
        domain_scores[domain_key] = {"total": 0, "max": 0, "weight_output": domain_data["weight_output"]}
        for q in domain_data["questions"]:
            domain_map[q["id"]] = {"domain": domain_key, "scores": q["scores"]}

    unanswered = []

    for q_id, answer_index in answers.items():
        if q_id not in domain_map:
            continue
        q_info = domain_map[q_id]
        domain = q_info["domain"]
        scores = q_info["scores"]

        if answer_index < 0 or answer_index >= len(scores):
            unanswered.append(q_id)
            continue

        domain_scores[domain]["total"] += scores[answer_index]
        domain_scores[domain]["max"]   += max(scores)

    # Normalize each domain to 1–5 scale
    normalized = {}
    for domain_key, ds in domain_scores.items():
        if ds["max"] == 0:
            normalized[domain_key] = 3  # neutral fallback
        else:
            ratio = ds["total"] / ds["max"]
            # Clamp to 1–5
            normalized[domain_key] = max(1, min(5, round(ratio * 5)))

    # ── Map to engine inputs ──────────────────────────────────────
    tech_interest       = normalized["tech"]
    core_interest       = normalized["core"]
    management_interest = normalized["management"]
    confidence          = normalized["confidence"]

    # decision_style: high score = methodical = moderate decision_time (6-12 months)
    # low score = impulsive = low decision_time (1-3 months)
    # We invert: a thoughtful decider is NOT a slow/indecisive one
    dec_score = normalized["decision_style"]
    decision_time = {1: 2, 2: 6, 3: 12, 4: 18, 5: 24}.get(dec_score, 12)

    # career_changes: proxy from decision_style instability
    # low decision score = impulsive = more career changes
    career_changes = max(0, 5 - dec_score)

    return {
        # Engine-ready inputs
        "engine_inputs": {
            "tech_interest":       tech_interest,
            "core_interest":       core_interest,
            "management_interest": management_interest,
            "confidence":          confidence,
            "decision_time":       decision_time,
            "career_changes":      career_changes,
        },
        # Raw scores for transparency
        "raw_scores": {
            domain: {
                "total":         ds["total"],
                "max":           ds["max"],
                "normalized":    normalized[domain],
                "weight_output": ds["weight_output"],
            }
            for domain, ds in domain_scores.items()
        },
        "unanswered": unanswered,
        "total_answered": len(answers) - len(unanswered),
    }


def get_question_count() -> int:
    return sum(len(d["questions"]) for d in QUESTION_BANK["domains"].values())