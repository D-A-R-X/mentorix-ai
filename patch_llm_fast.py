#!/usr/bin/env python3
"""
1. Rewrites llm_client.py to use fastest model first with smart fallbacks
2. Adds /admin/llm-stats endpoint to app.py for LLM activity monitoring
3. Adds LLM call logging to a ring buffer

Run from: ~/Downloads/mentorix-ai/
"""
import os, sys

# ── 1. Rewrite llm_client.py ─────────────────────────────────────────────────
llm_path = "backend/llm_client.py"
if not os.path.exists(llm_path):
    print(f"ERROR: {llm_path} not found")
    sys.exit(1)

new_llm = '''"""
llm_client.py — Mentorix AI
Speed-optimised LLM chain:
  1. Groq  llama-3.1-8b-instant   (~200ms) — fastest, good quality
  2. Groq  llama-3.3-70b-versatile (~800ms) — slower, higher quality  
  3. Groq  mixtral-8x7b-32768     (~600ms) — backup
  4. Gemini gemini-1.5-flash       (~1.2s)  — final fallback
"""
import os, asyncio, time, logging, json
from typing import Optional

import httpx

logger = logging.getLogger("mentorix-api")

GROQ_API_KEY   = os.getenv("GROQ_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# ── LLM model chain — ordered by speed ───────────────────────────────────────
GROQ_MODELS = [
    "llama-3.1-8b-instant",      # ~200ms  — PRIMARY (fastest)
    "llama-3.3-70b-versatile",   # ~800ms  — better quality backup
    "mixtral-8x7b-32768",        # ~600ms  — second backup
]

# ── Activity ring buffer for admin panel ─────────────────────────────────────
_LLM_LOG: list = []
_LLM_LOG_MAX = 200

def _log_llm(model: str, latency_ms: int, tokens: int, success: bool, error: str = ""):
    _LLM_LOG.append({
        "model":      model,
        "latency_ms": latency_ms,
        "tokens":     tokens,
        "success":    success,
        "error":      error,
        "time":       time.strftime("%H:%M:%S"),
    })
    if len(_LLM_LOG) > _LLM_LOG_MAX:
        _LLM_LOG.pop(0)

def get_llm_stats() -> dict:
    """Return LLM activity stats for admin panel."""
    if not _LLM_LOG:
        return {"calls": 0, "success_rate": 100, "avg_latency_ms": 0,
                "model_usage": {}, "recent": []}
    total   = len(_LLM_LOG)
    success = sum(1 for e in _LLM_LOG if e["success"])
    latencies = [e["latency_ms"] for e in _LLM_LOG if e["success"]]
    avg_lat = round(sum(latencies) / len(latencies)) if latencies else 0
    model_usage: dict = {}
    for e in _LLM_LOG:
        m = e["model"]
        if m not in model_usage:
            model_usage[m] = {"calls": 0, "success": 0, "avg_latency": 0, "latencies": []}
        model_usage[m]["calls"] += 1
        if e["success"]:
            model_usage[m]["success"] += 1
            model_usage[m]["latencies"].append(e["latency_ms"])
    for m, v in model_usage.items():
        lats = v.pop("latencies", [])
        v["avg_latency"] = round(sum(lats)/len(lats)) if lats else 0
        v["success_rate"] = round(v["success"]/v["calls"]*100)
    return {
        "calls":          total,
        "success_rate":   round(success/total*100),
        "avg_latency_ms": avg_lat,
        "model_usage":    model_usage,
        "recent":         list(reversed(_LLM_LOG[-20:])),
    }


async def _call_groq(model: str, messages: list, system: str, max_tokens: int, timeout: float) -> Optional[str]:
    if not GROQ_API_KEY:
        return None
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": ([{"role": "system", "content": system}] if system else []) + messages,
        "temperature": 0.7,
    }
    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
                json=payload,
            )
            r.raise_for_status()
            data = r.json()
            text = data["choices"][0]["message"]["content"].strip()
            tokens = data.get("usage", {}).get("total_tokens", 0)
            lat = round((time.monotonic() - t0) * 1000)
            _log_llm(model, lat, tokens, True)
            logger.info(f"[LLM] {model} OK {lat}ms {tokens}tok")
            return text
    except Exception as e:
        lat = round((time.monotonic() - t0) * 1000)
        _log_llm(model, lat, 0, False, str(e)[:80])
        logger.warning(f"[LLM] {model} FAILED {lat}ms: {e}")
        return None


async def _call_gemini(messages: list, system: str, max_tokens: int, timeout: float) -> Optional[str]:
    if not GEMINI_API_KEY:
        return None
    # Build Gemini contents
    parts = []
    if system:
        parts.append({"role": "user", "parts": [{"text": f"[SYSTEM] {system}"}]})
        parts.append({"role": "model", "parts": [{"text": "Understood."}]})
    for m in messages:
        role = "user" if m["role"] == "user" else "model"
        parts.append({"role": role, "parts": [{"text": m["content"]}]})
    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}",
                json={
                    "contents": parts,
                    "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.7}
                },
            )
            r.raise_for_status()
            data  = r.json()
            text  = data["candidates"][0]["content"]["parts"][0]["text"].strip()
            tokens = data.get("usageMetadata", {}).get("totalTokenCount", 0)
            lat   = round((time.monotonic() - t0) * 1000)
            _log_llm("gemini-1.5-flash", lat, tokens, True)
            logger.info(f"[LLM] gemini-1.5-flash OK {lat}ms")
            return text
    except Exception as e:
        lat = round((time.monotonic() - t0) * 1000)
        _log_llm("gemini-1.5-flash", lat, 0, False, str(e)[:80])
        logger.warning(f"[LLM] gemini-1.5-flash FAILED: {e}")
        return None


async def call_llm(
    messages: list,
    system: str = "",
    max_tokens: int = 500,
    timeout: float = 12.0,
) -> Optional[str]:
    """
    Try each model in speed order. Returns first successful response.
    Fast path: llama-3.1-8b-instant with 3s timeout.
    """
    # Fast path — llama-3.1-8b-instant with tight timeout
    result = await _call_groq("llama-3.1-8b-instant", messages, system, max_tokens, min(timeout, 4.0))
    if result:
        return result

    # Second — llama-3.3-70b-versatile (higher quality, slower)
    result = await _call_groq("llama-3.3-70b-versatile", messages, system, max_tokens, min(timeout, 8.0))
    if result:
        return result

    # Third — mixtral
    result = await _call_groq("mixtral-8x7b-32768", messages, system, max_tokens, min(timeout, 8.0))
    if result:
        return result

    # Final — Gemini
    result = await _call_gemini(messages, system, max_tokens, timeout)
    return result
'''

with open(llm_path, "w", encoding="utf-8") as f:
    f.write(new_llm)
print(f"✓ Rewrote {llm_path} with speed-optimised model chain")

# ── 2. Add /admin/llm-stats to app.py ────────────────────────────────────────
app_path = "backend/app.py"
if not os.path.exists(app_path):
    print(f"ERROR: {app_path} not found"); sys.exit(1)

with open(app_path, encoding="utf-8") as f:
    app_content = f.read()

# Check if already patched
if "/admin/llm-stats" in app_content:
    print("✓ /admin/llm-stats already present — skipping")
else:
    # Find the /admin/logs endpoint and inject before it
    insert_before = '@app.get("/admin/logs")'
    llm_stats_route = '''
@app.get("/admin/llm-stats")
def admin_llm_stats(admin: str = Depends(require_admin)):
    """Return LLM usage stats and recent call log for admin panel."""
    try:
        from llm_client import get_llm_stats
        return get_llm_stats()
    except Exception as e:
        return {"calls": 0, "success_rate": 100, "avg_latency_ms": 0,
                "model_usage": {}, "recent": [], "error": str(e)}

'''
    if insert_before in app_content:
        app_content = app_content.replace(insert_before, llm_stats_route + insert_before)
        print("✓ Added /admin/llm-stats to app.py")
    else:
        # Append before if __name__
        app_content = app_content.replace(
            'if __name__ == "__main__":',
            llm_stats_route + '\nif __name__ == "__main__":'
        )
        print("✓ Appended /admin/llm-stats to app.py")

    with open(app_path, "w", encoding="utf-8") as f:
        f.write(app_content)

print("\n✅ LLM optimisation complete!")
print("   Primary: llama-3.1-8b-instant (4s timeout)")
print("   Backup:  llama-3.3-70b-versatile → mixtral → gemini-1.5-flash")
print("   Admin panel: /admin/llm-stats")
