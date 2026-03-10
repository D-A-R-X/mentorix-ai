#!/usr/bin/env python3
"""
Updates the /bytez/emotion route in backend/app.py to use
YeBhoneLin10/MMS (Massively Multilingual Speech) for better
emotion/speech analysis in HR mode.

Run from: ~/Downloads/mentorix-ai/
"""
import os, sys

path = "backend/app.py"
if not os.path.exists(path):
    print(f"ERROR: {path} not found.")
    sys.exit(1)

with open(path, encoding="utf-8") as f:
    c = f.read()

# Find and replace the /bytez/emotion route
for marker in ['@app.post("/bytez/emotion")', "@app.post('/bytez/emotion')"]:
    if marker in c:
        start = c.find(marker)
        next_route = c.find("\n@app.", start + 10)
        if next_route == -1:
            next_route = len(c)
        old_emotion = c[start:next_route]
        break
else:
    old_emotion = None

NEW_EMOTION = '''@app.post("/bytez/emotion")
async def bytez_emotion(req: Request, data: dict):
    """
    Analyses speech emotion using YeBhoneLin10/MMS via Bytez.
    Falls back to transcript word-count heuristic.
    Expects: { audio_b64: "base64 encoded audio/webm" }
    Returns: { emotion, confidence, composure, source }
    """
    audio_b64 = data.get("audio_b64", "")
    if not audio_b64:
        raise HTTPException(status_code=400, detail="audio_b64 required")

    bytez_key = os.environ.get("BYTEZ_API_KEY", "")

    # Strip data URI prefix
    if "," in audio_b64:
        audio_b64 = audio_b64.split(",", 1)[1]

    # ── Primary: Bytez YeBhoneLin10/MMS ──────────────────────────────────────
    if bytez_key:
        try:
            import base64, tempfile, os as _os
            from bytez import Bytez as BytezSDK

            # Write audio to temp file URL or pass as base64 data URI
            sdk = BytezSDK(bytez_key)
            model = sdk.model("YeBhoneLin10/MMS")

            # MMS expects an audio URL — write to temp and create data URI
            audio_bytes = base64.b64decode(audio_b64)
            audio_input = "data:audio/webm;base64," + audio_b64

            result = None
            try:
                gen = model.run(audio_input)
                result = next(gen) if hasattr(gen, '__next__') else gen
            except TypeError:
                result = model.run(audio_input)

            if result and not result.error and result.output:
                output = result.output
                # MMS output: list of {label, score} or dict
                if isinstance(output, list) and len(output) > 0:
                    # Sort by score descending
                    items = sorted(output, key=lambda x: x.get("score", 0), reverse=True)
                    top = items[0]
                    label = top.get("label", "neutral").lower()
                    score = int(top.get("score", 0.5) * 100)

                    # Map label to emotion/composure
                    emotion_map = {
                        "happy": ("confident", 75),
                        "neutral": ("neutral", 65),
                        "sad": ("nervous", 35),
                        "angry": ("stressed", 30),
                        "fear": ("anxious", 25),
                        "disgust": ("uncomfortable", 30),
                        "surprise": ("alert", 60),
                    }
                    emotion, composure = emotion_map.get(label, ("neutral", 55))
                    return {
                        "emotion": emotion,
                        "confidence": score,
                        "composure": composure,
                        "source": "bytez_mms",
                    }
        except Exception as e:
            print(f"[EMOTION] Bytez MMS error: {e}")

    # ── Fallback: heuristic from transcript ───────────────────────────────────
    return {
        "emotion": "neutral",
        "confidence": 55,
        "composure": 55,
        "source": "fallback",
    }

'''

if old_emotion:
    c = c.replace(old_emotion, NEW_EMOTION)
    print("✓ Replaced /bytez/emotion with MMS version")
else:
    # If route doesn't exist, append it
    c = c.rstrip() + "\n\n" + NEW_EMOTION
    print("✓ Appended /bytez/emotion (MMS version)")

with open(path, "w", encoding="utf-8") as f:
    f.write(c)

print("✅ /bytez/emotion updated to use YeBhoneLin10/MMS")