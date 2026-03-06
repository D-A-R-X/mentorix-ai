import json
from pathlib import Path
from typing import Dict, List, Any, Optional

QUESTION_BANK_PATH = Path(__file__).parent / "data" / "question_bank.json"
with QUESTION_BANK_PATH.open("r", encoding="utf-8") as f:
    QUESTION_BANK = json.load(f)

DEPT_GROUPS: Dict[str, str] = {}
for group, depts in QUESTION_BANK["department_groups"].items():
    for d in depts:
        DEPT_GROUPS[d.upper()] = group


def get_dept_group(department: str) -> str:
    """Map department code to group: IT | ENGINEERING | BIO_AGRI | GENERAL"""
    if not department:
        return "GENERAL"
    return DEPT_GROUPS.get(department.upper(), "GENERAL")


def get_all_questions(department: str = "") -> List[Dict[str, Any]]:
    """
    Return 25 questions filtered by department group.
    Each domain returns exactly 5 questions:
      - dept-specific variant replaces the generic variant for that slot
    """
    dept_group = get_dept_group(department)
    questions  = []

    for domain_key, domain_data in QUESTION_BANK["domains"].items():
        all_qs   = domain_data["questions"]
        selected = []

        # Separate ALL questions from dept-specific ones
        all_group    = [q for q in all_qs if q.get("dept_group") == "ALL"]
        dept_group_qs = [q for q in all_qs if q.get("dept_group") == dept_group]
        general_qs   = [q for q in all_qs if q.get("dept_group") == "GENERAL"]

        # Pick dept-specific first, fall back to general, then ALL
        specific = dept_group_qs if dept_group_qs else general_qs

        # Merge: use specific variants to replace ALL variants by slot position
        used_ids = set()
        for q in specific:
            if len(selected) < 5:
                selected.append(q)
                used_ids.add(q["id"])

        for q in all_group:
            if len(selected) >= 5:
                break
            # Skip if this is a slot already covered by a dept variant
            base_id = q["id"].split("_")[0] + "_" + q["id"].split("_")[1]
            already_covered = any(
                s["id"].startswith(base_id) and s["id"] != q["id"]
                for s in selected
            )
            if not already_covered and q["id"] not in used_ids:
                selected.append(q)
                used_ids.add(q["id"])

        # Ensure exactly 5 — pad with ALL questions if needed
        if len(selected) < 5:
            for q in all_group:
                if len(selected) >= 5:
                    break
                if q["id"] not in used_ids:
                    selected.append(q)
                    used_ids.add(q["id"])

        for q in selected[:5]:
            questions.append({
                **q,
                "domain":        domain_key,
                "domain_label":  domain_data["label"],
                "weight_output": domain_data["weight_output"],
            })

    return questions


def get_track_courses(track: str, department: str = "") -> List[Dict[str, Any]]:
    """Get courses for a track, filtered by department group."""
    dept_group = get_dept_group(department)
    tracks     = QUESTION_BANK.get("tracks", {})

    if track in tracks:
        t = tracks[track]
        allowed = t.get("dept_groups", [])
        if dept_group in allowed or "GENERAL" in allowed or not allowed:
            return t.get("courses", [])

    # Fallback to foundation track
    return tracks.get("foundation_track", {}).get("courses", [])


def score_assessment(answers: Dict[str, int]) -> Dict[str, Any]:
    """
    answers: { "tech_001": 2, "core_001": 3, ... }
    values are 0-based option index.
    Returns mapped engine inputs + raw scores.
    """
    domain_scores: Dict[str, Dict] = {}
    domain_map:    Dict[str, Dict] = {}

    for domain_key, domain_data in QUESTION_BANK["domains"].items():
        domain_scores[domain_key] = {
            "total": 0, "max": 0,
            "weight_output": domain_data["weight_output"]
        }
        for q in domain_data["questions"]:
            domain_map[q["id"]] = {
                "domain": domain_key,
                "scores": q["scores"]
            }

    for q_id, answer_index in answers.items():
        if q_id not in domain_map:
            continue
        q_info = domain_map[q_id]
        domain = q_info["domain"]
        scores = q_info["scores"]
        if answer_index < 0 or answer_index >= len(scores):
            continue
        domain_scores[domain]["total"] += scores[answer_index]
        domain_scores[domain]["max"]   += max(scores)

    # Normalize each domain to 1–5 scale
    normalized: Dict[str, Any] = {}
    for domain_key, ds in domain_scores.items():
        if ds["max"] == 0:
            normalized[domain_key] = {"raw": 0, "normalized": 1, "pct": 0}
        else:
            pct  = ds["total"] / ds["max"]
            norm = round(1 + pct * 4, 2)
            normalized[domain_key] = {
                "raw":        ds["total"],
                "normalized": round(norm, 1),
                "pct":        round(pct * 100, 1),
            }

    # Map to engine inputs
    def n(key: str) -> float:
        return normalized.get(key, {}).get("normalized", 3.0)

    engine_inputs = {
        "tech_interest":        n("tech"),
        "core_interest":        n("core"),
        "management_interest":  n("management"),
        "confidence":           n("confidence"),
        "career_changes":       round((5 - n("decision_style")) * 0.4),
        "decision_time":        round(n("decision_style") * 1.5),
    }

    return {
        "domain_scores": domain_scores,
        "normalized":    normalized,
        "engine_inputs": engine_inputs,
        "raw_scores":    normalized,
    }


def infer_track_from_scores(
    engine_inputs: Dict[str, float],
    department:    str = "",
    stability:     float = 0.5
) -> str:
    """
    Pick the best track based on scores + department context.
    """
    dept_group = get_dept_group(department)
    tech  = engine_inputs.get("tech_interest", 3)
    core  = engine_inputs.get("core_interest", 3)
    mgmt  = engine_inputs.get("management_interest", 3)
    conf  = engine_inputs.get("confidence", 3)

    # Low stability → foundation
    if stability < 0.45:
        return "foundation_track"

    # Management dominant
    if mgmt >= 4.0 and mgmt > tech and mgmt > core:
        return "management_track"

    # IT group routing
    if dept_group == "IT":
        if tech >= 4.0 and core >= 3.5:
            return "data_science_track" if core >= 4.0 else "software_track"
        if tech >= 3.5:
            return "cybersecurity_track" if conf >= 3.5 else "software_track"
        if mgmt >= 3.5:
            return "management_track"
        return "software_track"

    # Engineering group routing
    if dept_group == "ENGINEERING":
        if tech >= 4.0:
            return "data_science_track"
        if core >= 3.5:
            return "core_engineering_track"
        if mgmt >= 3.5:
            return "management_track"
        return "core_engineering_track"

    # Bio/Agri group routing
    if dept_group == "BIO_AGRI":
        if tech >= 3.5:
            return "data_science_track"
        if core >= 4.0:
            return "biotech_track"
        if core >= 3.0:
            return "food_agri_track"
        if mgmt >= 3.5:
            return "management_track"
        return "biotech_track"

    # General / unknown
    if tech >= 4.0:
        return "software_track"
    if core >= 4.0:
        return "core_engineering_track"
    if mgmt >= 4.0:
        return "management_track"
    return "foundation_track"