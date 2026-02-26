from typing import Tuple


def infer_career_direction(data) -> Tuple[str, str]:
    tech_interest = data.tech_interest
    core_interest = data.core_interest
    management_interest = data.management_interest
    cgpa = data.cgpa
    confidence = data.confidence

    if tech_interest >= 4 and core_interest >= 3:
        career_direction = "Software / Data Track"
    elif management_interest >= 4:
        career_direction = "Management / Product Track"
    else:
        career_direction = "Exploration Phase"

    if career_direction == "Software / Data Track":
        if cgpa >= 8 and confidence >= 4:
            insight_message = "You show strong readiness for technical roles; focus on applied projects and internship opportunities."
        elif confidence <= 2:
            insight_message = "You have a solid technical base, but confidence is low; use guided practice and mentorship to build momentum."
        else:
            insight_message = "You are aligned toward software/data roles; strengthen consistency with problem-solving and portfolio work."
    elif career_direction == "Management / Product Track":
        if cgpa >= 8 and confidence >= 4:
            insight_message = "You appear well-positioned for management/product pathways; build leadership artifacts and cross-functional exposure."
        elif confidence <= 2:
            insight_message = "You show management interest, and confidence can improve through team projects, communication practice, and gradual leadership tasks."
        else:
            insight_message = "You are trending toward management/product roles; combine domain understanding with communication and planning skills."
    else:
        if cgpa >= 8 and confidence >= 4:
            insight_message = "You have strong academic and confidence indicators; use this phase to test tracks through short projects before committing."
        elif confidence <= 2:
            insight_message = "This is a healthy exploration stage; start with foundational modules and small wins to improve confidence before specializing."
        else:
            insight_message = "You are in an exploration phase; compare tracks with structured experiments and choose based on sustained interest."

    return career_direction, insight_message
