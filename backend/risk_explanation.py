from typing import Dict, List


def _reasons_for_risk(data, prediction: str) -> List[str]:
    """Return non-technical reasons while preserving existing risk signals."""
    reasons: List[str] = []

    if data.confidence <= 2:
        reasons.append("Your current career confidence is low, so decisions may feel uncertain.")
    if data.career_changes >= 3:
        reasons.append("You have changed career preferences several times, which suggests instability.")
    if data.cgpa < 6.5:
        reasons.append("Your recent academic performance may not yet strongly support your chosen direction.")
    if prediction == "High" and not reasons:
        reasons.append("Several medium-level factors together increase overall risk.")

    return reasons


def _summary_for_risk(risk_level: str, reasons: List[str]) -> str:
    """Build a 3-sentence plain-language summary for end users."""
    intro = f"Your profile is currently classified as {risk_level} risk for career decision instability."

    if reasons:
        short_reasons = [reason.rstrip(".") for reason in reasons[:2]]
        detail = f"This result is mainly driven by {', '.join(short_reasons)}."
    else:
        detail = "Your inputs look reasonably stable right now, with no major warning pattern detected."

    if risk_level == "High":
        next_step = "Focus on one short-term goal and seek mentoring to improve confidence and consistency."
    elif risk_level == "Medium":
        next_step = "With regular guidance and clearer goals, this risk can likely be reduced over time."
    else:
        next_step = "Keep following your current plan and review your goals periodically to stay on track."

    return f"{intro} {detail} {next_step}"


def build_risk_explanation(data, prediction: str) -> Dict[str, object]:
    reasons = _reasons_for_risk(data, prediction)
    summary = _summary_for_risk(prediction, reasons)
    return {"reasons": reasons, "summary": summary}
