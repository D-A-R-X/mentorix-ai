import pandas as pd
import numpy as np
import os

OUTPUT_PATH = "backend/data/synthetic_dataset.csv"

np.random.seed(42)

NUM_STUDENTS = 1000
SESSIONS_PER_STUDENT = 10

ARCHETYPES = [
    "stable_achiever",
    "confused_explorer",
    "late_stabilizer"
]


def compute_stability_score(cgpa, confidence, tech, core, mgmt, backlogs, career_changes, decision_time):
    interest_alignment = max(tech, core, mgmt) / 5
    cgpa_factor = cgpa / 10
    confidence_factor = confidence / 5
    backlog_penalty = min(backlogs / 10, 1)
    switch_penalty = min(career_changes / 5, 1)
    decision_clarity = min(decision_time / 24, 1)
    score = (
        cgpa_factor * 0.25 +
        confidence_factor * 0.20 +
        interest_alignment * 0.20 +
        (1 - backlog_penalty) * 0.15 +
        (1 - switch_penalty) * 0.10 +
        decision_clarity * 0.10
    )
    return round(score, 4)


def infer_risk_level(stability_score):
    if stability_score >= 0.75:
        return "Low"
    elif stability_score >= 0.55:
        return "Medium"
    else:
        return "High"


def choose_track(tech, core, mgmt):
    interests = {
        "software_track": tech,
        "core_track": core,
        "management_track": mgmt
    }
    return max(interests, key=interests.get)


def generate_stable_achiever(session):
    cgpa = np.random.normal(8.5, 0.3)
    cgpa = np.clip(cgpa, 7.5, 9.8)
    backlogs = np.random.choice([0, 0, 0, 1])
    tech = np.random.randint(4, 6)
    core = np.random.randint(2, 4)
    mgmt = np.random.randint(2, 4)
    confidence = min(5, 3 + session // 3 + np.random.choice([0, 1]))
    career_changes = np.random.choice([0, 0, 1])
    decision_time = np.random.randint(5, 12)
    return cgpa, backlogs, tech, core, mgmt, confidence, career_changes, decision_time


def generate_confused_explorer(session):
    if np.random.random() < 0.5:
        cgpa = np.random.normal(4.5, 0.8)
        cgpa = np.clip(cgpa, 3.0, 6.0)
        backlogs = np.random.choice([2, 3, 4, 5])
        confidence = 1
        career_changes = np.random.randint(4, 8)
        decision_time = np.random.randint(24, 48)
    else:
        cgpa = np.random.normal(5.8, 1.0)
        cgpa = np.clip(cgpa, 4.0, 7.5)
        backlogs = np.random.choice([0, 1, 2, 3])
        confidence = np.random.randint(1, 3)
        career_changes = np.random.randint(2, 6)
        decision_time = np.random.randint(18, 36)
    tech = np.random.randint(1, 6)
    core = np.random.randint(1, 6)
    mgmt = np.random.randint(1, 6)
    return cgpa, backlogs, tech, core, mgmt, confidence, career_changes, decision_time


def generate_late_stabilizer(session):
    cgpa = np.random.normal(7.2, 0.5)
    cgpa = np.clip(cgpa, 6.0, 8.5)
    backlogs = np.random.choice([0, 1, 2])
    if session < 5:
        tech = np.random.randint(2, 5)
        core = np.random.randint(2, 5)
        mgmt = np.random.randint(2, 5)
        confidence = np.random.randint(2, 4)
        career_changes = np.random.randint(1, 3)
    else:
        tech = np.random.randint(4, 6)
        core = np.random.randint(2, 4)
        mgmt = np.random.randint(2, 4)
        confidence = np.random.randint(3, 5)
        career_changes = np.random.choice([0, 1])
    decision_time = np.random.randint(8, 16)
    return cgpa, backlogs, tech, core, mgmt, confidence, career_changes, decision_time


def generate_student_sessions(student_id, archetype):
    rows = []
    email = f"student{student_id}@mentorix.ai"
    for session in range(SESSIONS_PER_STUDENT):
        if archetype == "stable_achiever":
            data = generate_stable_achiever(session)
        elif archetype == "confused_explorer":
            data = generate_confused_explorer(session)
        else:
            data = generate_late_stabilizer(session)
        cgpa, backlogs, tech, core, mgmt, confidence, career_changes, decision_time = data
        stability = compute_stability_score(cgpa, confidence, tech, core, mgmt, backlogs, career_changes, decision_time)
        risk = infer_risk_level(stability)
        track = choose_track(tech, core, mgmt)
        row = {
            "email": email,
            "cgpa": round(cgpa, 2),
            "backlogs": int(backlogs),
            "tech_interest": int(tech),
            "core_interest": int(core),
            "management_interest": int(mgmt),
            "confidence": int(confidence),
            "career_changes": int(career_changes),
            "decision_time": int(decision_time),
            "current_status": "student",
            "risk_level": risk,
            "stability_score": stability,
            "track": track
        }
        rows.append(row)
    return rows


def generate_dataset():
    all_rows = []
    students_per_archetype = NUM_STUDENTS // len(ARCHETYPES)
    student_id = 1
    for archetype in ARCHETYPES:
        for _ in range(students_per_archetype):
            rows = generate_student_sessions(student_id, archetype)
            all_rows.extend(rows)
            student_id += 1
    df = pd.DataFrame(all_rows)
    os.makedirs("backend/data", exist_ok=True)
    df.to_csv(OUTPUT_PATH, index=False)
    print("Dataset generated successfully")
    print("Rows:", len(df))
    print(df['risk_level'].value_counts())
    print(df.groupby('track')['stability_score'].mean().round(3))


if __name__ == "__main__":
    generate_dataset()
