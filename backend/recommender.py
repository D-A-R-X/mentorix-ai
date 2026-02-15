def generate_recommendations(data, risk_level):
    if data.tech_interest >= data.core_interest:
        career = "Software / IT Path"
        recommended_track = "Tech Skill Acceleration"
    else:
        career = "Core Engineering Path"
        recommended_track = "Core Discipline Mastery"

    notes = []

    if data.confidence <= 2:
        notes.append("Exploratory learning recommended")

    if data.backlogs >= 5:
        notes.append("Recovery-focused learning plan required")

    if not notes:
        notes.append("Maintain consistent progress with milestone-based learning")

    focus_message = " | ".join(notes)

    return {
        "career_path": career,
        "focus_message": focus_message,
        "recommended_track": recommended_track,
    }
