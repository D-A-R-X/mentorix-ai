import os
import json
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("mentorix-api")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_URL     = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"


def build_explanation_prompt(data: Dict[str, Any]) -> str:
    risk          = data.get("risk_level", "Unknown")
    stability     = data.get("stability_index", 0)
    trend         = data.get("trend", "unknown")
    track         = data.get("track", "unknown").replace("_", " ")
    career_dir    = data.get("career_direction", "")
    volatility    = data.get("volatility", 0)
    scores        = data.get("assessment_scores", {})
    history_count = len(data.get("history", []))
    latency       = data.get("latency_analysis", {})

    labels = {"tech": "Technical", "core": "Core Engineering",
              "management": "Management", "confidence": "Confidence",
              "decision_style": "Decision Style"}

    score_lines = []
    for k, s in scores.items():
        val = s.get("normalized", 0) if isinstance(s, dict) else s
        score_lines.append(f"  {labels.get(k, k)}: {val}/5")
    scores_text = "\n".join(score_lines) if score_lines else "  Not available"

    latency_text = ""
    if latency:
        avg_ms  = latency.get("avg_response_time_ms", 0)
        hes     = latency.get("hesitation_score", 1.0)
        avg_sec = round(avg_ms / 1000, 1)
        if hes < 1.5:
            latency_text = f"Response timing shows decisiveness (avg {avg_sec}s per question), suggesting strong internal alignment."
        elif hes < 2.5:
            latency_text = f"Response timing shows moderate deliberation (avg {avg_sec}s per question), suggesting thoughtful decision-making."
        else:
            latency_text = f"Response timing shows high deliberation (avg {avg_sec}s per question), suggesting some career uncertainty."

    return f"""You are Mentorix AI's explanation engine. Translate structured behavioral data into a clear, personal explanation. You never make decisions — the engine already made them. You only narrate what the data shows.

Write exactly 3 short paragraphs. No headers. No bullet points. No markdown. Plain text only.

Paragraph 1 — Behavioral strengths: What the domain scores reveal about this person's inclinations.
Paragraph 2 — Career alignment: Why the recommended track fits their behavioral pattern.
Paragraph 3 — Stability and risk: What stability index, trend, and risk level mean right now.

Tone: Confident, direct, warm. Like a mentor who respects the person's intelligence. Be specific to this data. Do not write generic career advice.

DATA:
Risk Level: {risk}
Stability Index: {round(stability * 100, 1)}%
Trend: {trend}
Volatility: {"High" if volatility > 0.0002 else "Low"}
Recommended Track: {track}
Career Direction: {career_dir}
Sessions completed: {history_count}

Domain Scores:
{scores_text}

{f"Behavioral timing: {latency_text}" if latency_text else ""}

Write the 3 paragraphs now."""


async def generate_explanation(data: Dict[str, Any]) -> Optional[str]:
    """Call Gemini Flash to generate personalized explanation. Returns text or None."""
    if not GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not set — skipping explanation")
        return None

    try:
        import httpx

        prompt = build_explanation_prompt(data)

        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.post(
                f"{GEMINI_URL}?key={GEMINI_API_KEY}",
                headers={"Content-Type": "application/json"},
                json={
                    "contents": [{
                        "parts": [{"text": prompt}]
                    }],
                    "generationConfig": {
                        "maxOutputTokens": 400,
                        "temperature":     0.7,
                    }
                }
            )

        if res.status_code != 200:
            logger.error(f"Gemini API error: {res.status_code} {res.text[:200]}")
            return None

        body = res.json()
        text = (
            body
            .get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
            .strip()
        )
        return text if text else None

    except Exception as e:
        logger.exception(f"explanation generation failed: {e}")
        return None


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