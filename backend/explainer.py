import os
import logging
from typing import Dict, Any, Optional
from llm_client import call_llm
logger = logging.getLogger("mentorix-api")

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL   = "llama-3.1-8b-instant"


def build_explanation_prompt(data: Dict[str, Any]) -> str:
    risk          = data.get("risk_level", "Unknown")
    stability     = data.get("stability_index", 0)
    trend         = data.get("trend", "unknown")
    track         = data.get("track", "unknown").replace("_", " ").title()
    career_dir    = data.get("career_direction", "")
    volatility    = data.get("volatility", 0)
    scores        = data.get("assessment_scores", {})
    history_count = len(data.get("history", []))
    latency       = data.get("latency_analysis", {})
    courses       = data.get("courses", [])

    labels = {
        "tech": "Technical", "core": "Core Engineering",
        "management": "Management", "confidence": "Confidence",
        "decision_style": "Decision Style"
    }

    # Find top scoring domain
    top_domain = "technical"
    top_score  = 0
    score_lines = []
    for k, s in scores.items():
        val = s.get("normalized", 0) if isinstance(s, dict) else s
        score_lines.append(f"  {labels.get(k, k)}: {val}/5")
        if val > top_score:
            top_score  = val
            top_domain = labels.get(k, k)
    scores_text = "\n".join(score_lines) if score_lines else "  Not available"

    # Latency signal
    decisiveness = ""
    if latency:
        hes = latency.get("hesitation_score", 1.0)
        avg_sec = round(latency.get("avg_response_time_ms", 0) / 1000, 1)
        if hes < 1.5:
            decisiveness = f"You answered quickly and decisively (avg {avg_sec}s) — strong internal clarity."
        elif hes < 2.5:
            decisiveness = f"You took your time answering (avg {avg_sec}s) — thoughtful but some uncertainty present."
        else:
            decisiveness = f"You hesitated on many questions (avg {avg_sec}s) — suggests career direction is still forming."

    # Trend signal
    trend_line = ""
    if trend == "improving":
        trend_line = f"Your stability is improving across {history_count} sessions — you're moving in the right direction."
    elif trend == "declining":
        trend_line = f"Your stability has been declining across {history_count} sessions — worth reflecting on what's changed."
    elif trend == "stable":
        trend_line = f"Your career thinking is consistent across {history_count} sessions — stable foundation."
    else:
        trend_line = "This is your first scan — your baseline has been set."

    # First course recommendation
    first_course = ""
    if courses:
        c = courses[0]
        first_course = f'→ Start "{c.get("title","")}" on {c.get("provider","")}'
    else:
        first_course = "→ Explore the recommended courses in your dashboard"

    return f"""You are Mentorix, a direct and warm AI career mentor. Your job is to give this person a clear, simple, actionable career report. 

Rules:
- Write like a mentor texting a friend — warm, direct, no jargon
- Never use bullet points with dashes inside paragraphs
- Use → only for action items
- Maximum 4 short sections
- Be specific to the data — no generic advice
- End with exactly 3 action items labeled "This week:"

Here is the person's behavioral data:
Risk Level: {risk}
Stability: {round(stability * 100, 1)}%
Trend: {trend}
Recommended Track: {track}
Career Direction: {career_dir}
Top Domain: {top_domain} ({top_score}/5)
Sessions completed: {history_count}
Volatility: {"high" if volatility > 0.0002 else "low"}

Domain Scores:
{scores_text}

{f"Decision pattern: {decisiveness}" if decisiveness else ""}
{trend_line}

Write the report in this EXACT format — no deviations:

[One sentence about their strongest behavioral signal and what it means]

Recommended path: {track}
[One or two sentences on why this track fits them specifically based on their scores]

[One sentence on their stability trend and what it means for them right now]

This week:
{first_course}
→ [One specific skill-building action related to their track — be concrete]
→ Return for your next scan in 30 days to measure your progress

Keep the entire response under 120 words. Be specific. Be human."""


async def generate_explanation(data: Dict[str, Any]) -> Optional[str]:
    """Call Groq to generate mentor-style explanation. Returns text or None."""
    if not GROQ_API_KEY:
        logger.warning("GROQ_API_KEY not set — skipping explanation")
        return None

    try:
        messages = [{"role": "user", "content": prompt}]
        text = await call_llm(messages, system="", max_tokens=300, timeout=8.0)
        return text
    except Exception as e:
        logger.warning(f"explanation failed: {e}")
        return None


def parse_tasks_from_explanation(explanation: str) -> list:
    """Extract 'This week:' tasks from AI explanation as a list."""
    if not explanation:
        return []
    tasks = []
    in_tasks = False
    for line in explanation.split("\n"):
        line = line.strip()
        if "this week" in line.lower():
            in_tasks = True
            continue
        if in_tasks and line.startswith("→"):
            task = line.lstrip("→").strip()
            if task:
                tasks.append(task)
    return tasks


def score_latency(latency_data: Dict[str, int]) -> Dict[str, Any]:
    """
    latency_data: { "question_id": response_time_ms, ... }
    Returns latency analysis dict.
    """
    if not latency_data:
        return {}

    times = [v for v in latency_data.values() if isinstance(v, (int, float))]
    if not times:
        return {}

    avg_ms   = sum(times) / len(times)
    baseline = 3000
    mean     = avg_ms
    variance = sum((t - mean) ** 2 for t in times) / len(times)
    std_dev  = variance ** 0.5

    hesitation_score = avg_ms / baseline

    if hesitation_score < 1.5:
        decisiveness = "high"
    elif hesitation_score < 2.5:
        decisiveness = "moderate"
    else:
        decisiveness = "low"

    stability_adjustment = 0.0
    if hesitation_score > 2.5:
        stability_adjustment = -0.05
    elif hesitation_score > 1.5:
        stability_adjustment = -0.02

    return {
        "avg_response_time_ms": round(avg_ms),
        "std_dev_ms":           round(std_dev),
        "hesitation_score":     round(hesitation_score, 2),
        "decisiveness":         decisiveness,
        "stability_adjustment": stability_adjustment,
        "question_count":       len(times),
    }