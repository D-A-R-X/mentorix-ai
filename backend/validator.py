from typing import Dict, List


# ---------------------------------------------------
# 1. Baseline Rule System
# ---------------------------------------------------
# Simple baseline: choose track by max interest only
# No behavioral intelligence involved
# ---------------------------------------------------

def compute_baseline_rule(student_data: Dict) -> str:

    tech = student_data.get("tech_interest", 0)
    core = student_data.get("core_interest", 0)
    mgmt = student_data.get("management_interest", 0)

    interests = {
        "software_track": tech,
        "core_track": core,
        "management_track": mgmt
    }

    baseline_track = max(interests, key=interests.get)

    return baseline_track


# ---------------------------------------------------
# 2. Consistency Score
# ---------------------------------------------------
# Measures stability of career track decisions
#
# Formula:
# consistency = 1 - (track_flips / sessions)
# ---------------------------------------------------

def compute_consistency_score(history: List[Dict]) -> float:

    if not history or len(history) < 2:
        return 1.0

    tracks = [item.get("track") for item in history if item.get("track")]

    if len(tracks) < 2:
        return 1.0

    track_flips = 0

    for i in range(1, len(tracks)):
        if tracks[i] != tracks[i - 1]:
            track_flips += 1

    sessions = len(tracks)

    consistency = 1 - (track_flips / sessions)

    return round(consistency, 4)


# ---------------------------------------------------
# 3. Alignment Score
# ---------------------------------------------------
# Checks if engine recommendation matches
# the user's dominant interest
# ---------------------------------------------------

def compute_alignment_score(recommended_track: str, student_data: Dict) -> int:

    tech = student_data.get("tech_interest", 0)
    core = student_data.get("core_interest", 0)
    mgmt = student_data.get("management_interest", 0)

    interests = {
        "software_track": tech,
        "core_track": core,
        "management_track": mgmt
    }

    dominant_interest = max(interests, key=interests.get)

    if recommended_track == dominant_interest:
        return 1
    else:
        return 0