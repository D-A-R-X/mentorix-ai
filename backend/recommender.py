import json
from pathlib import Path
from typing import Any, Dict

COURSE_CATALOG_PATH = Path(__file__).with_name("course_catalog.json")

with COURSE_CATALOG_PATH.open("r", encoding="utf-8") as file:
    course_catalog = json.load(file)


def generate_recommendations(student_data: Dict[str, Any], risk_level: str) -> Dict[str, Any]:

    status = student_data.get("current_status", "student")
    tech = student_data.get("tech_interest", 0)
    core = student_data.get("core_interest", 0)
    confidence = student_data.get("confidence", 3)
    years_exp = student_data.get("years_experience", 0)

    # Persona-based branching
    if status == "working_professional":
        if years_exp >= 3:
            track = "career_acceleration_track"
            career = "Advanced Career Acceleration Path"
        else:
            track = "skill_upgrade_track"
            career = "Professional Skill Upgrade Path"

    elif status == "career_switcher":
        track = "transition_track"
        career = "Career Transition Path"

    else:  # student
        if confidence <= 2:
            track = "foundation_track"
            career = "Career Foundation Path"
        elif tech >= core:
            track = "software_track"
            career = "Software / IT Career Path"
        else:
            track = "core_track"
            career = "Core Engineering Career Path"

    selected_courses = course_catalog.get(track, [])

    return {
        "career_path": career,
        "track": track,
        "courses": selected_courses,
    }