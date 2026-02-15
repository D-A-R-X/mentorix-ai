from typing import Dict, List


def _select_career_path(student_input, risk_level: str) -> str:
    tech = student_input.tech_interest
    core = student_input.core_interest
    mgmt = student_input.management_interest

    if risk_level == "High":
        return "Career Exploration Foundation Path (guided mentoring + structured goal setting)"

    if tech >= core and tech >= mgmt:
        return "Technology Specialist Path (Software / Data / AI)"

    if mgmt >= tech and mgmt >= core:
        return "Management and Product Path"

    return "Core Domain Specialist Path"


def _select_courses(career_path: str, risk_level: str) -> List[Dict[str, str]]:
    base_courses = {
        "Technology Specialist Path (Software / Data / AI)": [
            {"title": "Python for Everybody", "platform": "Coursera", "url": "https://example.com"},
            {"title": "Intro to Data Analysis", "platform": "edX", "url": "https://example.com"},
            {"title": "Project-Based Web Development", "platform": "Udemy", "url": "https://example.com"},
        ],
        "Management and Product Path": [
            {"title": "Foundations of Management", "platform": "Coursera", "url": "https://example.com"},
            {"title": "Product Thinking Basics", "platform": "Udemy", "url": "https://example.com"},
            {"title": "Business Communication", "platform": "edX", "url": "https://example.com"},
        ],
        "Core Domain Specialist Path": [
            {"title": "Domain Fundamentals Masterclass", "platform": "Coursera", "url": "https://example.com"},
            {"title": "Applied Problem Solving", "platform": "Udemy", "url": "https://example.com"},
            {"title": "Industry Readiness Toolkit", "platform": "edX", "url": "https://example.com"},
        ],
        "Career Exploration Foundation Path (guided mentoring + structured goal setting)": [
            {"title": "Career Planning Essentials", "platform": "Coursera", "url": "https://example.com"},
            {"title": "Self-Assessment and Goal Setting", "platform": "Udemy", "url": "https://example.com"},
            {"title": "Confidence and Decision Making", "platform": "edX", "url": "https://example.com"},
        ],
    }

    courses = base_courses.get(career_path, base_courses["Core Domain Specialist Path"])

    if risk_level == "High":
        return courses

    return courses[:3]


def _skills_to_focus(student_input, risk_level: str) -> List[str]:
    skills = ["Goal clarity", "Consistency", "Self-reflection"]

    if student_input.confidence <= 2:
        skills.append("Decision confidence")
    if student_input.career_changes >= 3:
        skills.append("Long-term planning")
    if student_input.cgpa < 6.5:
        skills.append("Academic strengthening")

    if risk_level == "Low":
        skills.append("Advanced specialization")

    # Keep unique order
    seen = set()
    unique = []
    for skill in skills:
        if skill not in seen:
            seen.add(skill)
            unique.append(skill)
    return unique


def generate_recommendations(student_input, risk_level: str) -> Dict[str, object]:
    career_path = _select_career_path(student_input, risk_level)
    courses = _select_courses(career_path, risk_level)
    skills_to_focus = _skills_to_focus(student_input, risk_level)

    return {
        "career_path": career_path,
        "courses": courses,
        "skills_to_focus": skills_to_focus,
    }
