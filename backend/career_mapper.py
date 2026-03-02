from typing import Tuple


# ✅ Added management track condition for core_interest too
CAREER_THRESHOLDS = {
    "high_cgpa": 8.0,
    "high_confidence": 4,
    "low_confidence": 2,
    "high_tech": 4,
    "high_core": 3,
    "high_mgmt": 4,
}


def infer_career_direction(data) -> Tuple[str, str]:
    tech_interest = data.tech_interest
    core_interest = data.core_interest
    management_interest = data.management_interest
    cgpa = data.cgpa
    confidence = data.confidence

    # ✅ Slightly improved priority order — management check only if not clearly tech
    if tech_interest >= 4 and core_interest >= 3:
        career_direction = "Software / Data Track"
    elif management_interest >= 4 and management_interest > tech_interest:
        career_direction = "Management / Product Track"
    elif core_interest >= 4 and core_interest > tech_interest:
        career_direction = "Core Engineering Track"  # ✅ New: pure core path
    else:
        career_direction = "Exploration Phase"

    # ✅ Insight generation
    high_cgpa = cgpa >= CAREER_THRESHOLDS["high_cgpa"]
    high_conf = confidence >= CAREER_THRESHOLDS["high_confidence"]
    low_conf = confidence <= CAREER_THRESHOLDS["low_confidence"]

    if career_direction == "Software / Data Track":
        if high_cgpa and high_conf:
            insight = "You show strong readiness for technical roles; focus on applied projects and internship opportunities."
        elif low_conf:
            insight = "You have a solid technical base, but confidence is low; use guided practice and mentorship to build momentum."
        else:
            insight = "You are aligned toward software/data roles; strengthen consistency with problem-solving and portfolio work."

    elif career_direction == "Management / Product Track":
        if high_cgpa and high_conf:
            insight = "You appear well-positioned for management/product pathways; build leadership artifacts and cross-functional exposure."
        elif low_conf:
            insight = "You show management interest; confidence can improve through team projects and gradual leadership tasks."
        else:
            insight = "You are trending toward management/product roles; combine domain understanding with communication and planning skills."

    elif career_direction == "Core Engineering Track":  # ✅ New block
        if high_cgpa and high_conf:
            insight = "Strong academic profile for core engineering; target PSU roles, GATE, or research opportunities."
        elif low_conf:
            insight = "Core engineering suits you; build confidence through lab projects and technical certifications."
        else:
            insight = "You are aligned toward core engineering; focus on domain depth and technical competitive exams."

    else:  # Exploration Phase
        if high_cgpa and high_conf:
            insight = "You have strong academic and confidence indicators; test tracks through short projects before committing."
        elif low_conf:
            insight = "Start with foundational modules and small wins to improve confidence before specializing."
        else:
            insight = "You are in an exploration phase; compare tracks with structured experiments and choose based on sustained interest."

    return career_direction, insight