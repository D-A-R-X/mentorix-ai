"""
llm_client.py — Groq primary, Gemini Flash fallback
Drop-in async function: call_llm(messages, system, max_tokens)
"""
import os, asyncio, logging
import httpx
from typing import List, Dict, Optional

logger = logging.getLogger("mentorix-api")

GROQ_API_KEY    = os.getenv("GROQ_API_KEY", "")
GEMINI_API_KEY  = os.getenv("GEMINI_API_KEY", "")
GROQ_URL        = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL      = "llama-3.1-8b-instant"
GEMINI_URL      = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

async def _call_groq(messages: List[Dict], system: str, max_tokens: int, timeout: float) -> str:
    if not GROQ_API_KEY:
        raise ValueError("No GROQ_API_KEY")
    payload = {
        "model":       GROQ_MODEL,
        "max_tokens":  max_tokens,
        "temperature": 0.7,
        "messages":    [{"role": "system", "content": system}] + messages
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        res = await client.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            json=payload
        )
        res.raise_for_status()
        return res.json()["choices"][0]["message"]["content"].strip()

async def _call_gemini(messages: List[Dict], system: str, max_tokens: int, timeout: float) -> str:
    if not GEMINI_API_KEY:
        raise ValueError("No GEMINI_API_KEY")
    # Build Gemini contents from message history
    contents = []
    for m in messages:
        role = "user" if m["role"] == "user" else "model"
        contents.append({"role": role, "parts": [{"text": m["content"]}]})
    # If last message is not user, add a nudge
    if not contents or contents[-1]["role"] != "user":
        contents.append({"role": "user", "parts": [{"text": "Continue."}]})

    payload = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": contents,
        "generationConfig": {
            "maxOutputTokens": max_tokens,
            "temperature": 0.7
        }
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        res = await client.post(
            f"{GEMINI_URL}?key={GEMINI_API_KEY}",
            headers={"Content-Type": "application/json"},
            json=payload
        )
        res.raise_for_status()
        data = res.json()
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()

async def call_llm(
    messages:   List[Dict],
    system:     str = "",
    max_tokens: int = 500,
    timeout:    float = 10.0
) -> Optional[str]:
    """
    Try Groq first. If it fails (rate limit, timeout, error),
    fall back to Gemini Flash automatically.
    Returns text or None if both fail.
    """
    # Try Groq
    if GROQ_API_KEY:
        try:
            text = await asyncio.wait_for(
                _call_groq(messages, system, max_tokens, timeout),
                timeout=timeout
            )
            logger.info("LLM: groq ok")
            return text
        except asyncio.TimeoutError:
            logger.warning("LLM: groq timeout — trying gemini")
        except Exception as e:
            logger.warning(f"LLM: groq failed ({e}) — trying gemini")

    # Fallback to Gemini
    if GEMINI_API_KEY:
        try:
            text = await asyncio.wait_for(
                _call_gemini(messages, system, max_tokens, timeout),
                timeout=timeout
            )
            logger.info("LLM: gemini fallback ok")
            return text
        except asyncio.TimeoutError:
            logger.warning("LLM: gemini timeout")
        except Exception as e:
            logger.warning(f"LLM: gemini failed ({e})")

    logger.error("LLM: both providers failed")
    return None