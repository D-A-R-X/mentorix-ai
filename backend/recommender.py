import json
from pathlib import Path
from typing import Any, Dict

COURSE_CATALOG_PATH = Path(__file__).with_name("course_catalog.json")

with COURSE_CATALOG_PATH.open("r", encoding="utf-8") as file:
    course_catalog = json.load(file)


def generate_recommendations(student_data: Dict[str, Any], risk_level: str) -> Dict[str, Any]:
    if student_data["tech_interest"] >= student_data["core_interest"]:
        track = "software_track"
        career = "Software / IT Career Path"
    elif student_data["core_interest"] > student_data["tech_interest"]:
        track = "core_track"
        career = "Core Engineering Career Path"

    if student_data["confidence"] <= 2:
        track = "foundation_track"

    selected_courses = course_catalog[track]

    return {
        "career_path": career,
        "track": track,
        "courses": selected_courses,
    }
