#!/usr/bin/env python3
"""
Patches backend/app.py to use Bytez suno/bark for TTS
instead of ElevenLabs (which is 503ing).

Bytez models used:
  - suno/bark          → text-to-speech (primary)
  - YeBhoneLin10/MMS   → speech-to-text / audio classification (for HR emotion)

Run from: ~/Downloads/mentorix-ai/
"""
import os, sys

path = "backend/app.py"
if not os.path.exists(path):
    print(f"ERROR: {path} not found. Run from project root.")
    sys.exit(1)

with open(path) as f:
    c = f.read()

# ── 1. Find the existing /voice/tts endpoint and replace it ──────────────────
OLD_TTS = None

# Try to find the existing TTS route - could be elevenlabs or simple
for marker in [
    '@app.post("/voice/tts")',
    "@app.post('/voice/tts')",
]:
    if marker in c:
        # Find start
        start = c.find(marker)
        # Find next route after it
        next_route = c.find("\n@app.", start + 10)
        if next_route == -1:
            next_route = len(c)
        OLD_TTS = c[start:next_route]
        print(f"Found TTS route ({len(OLD_TTS)} chars)")
        break

NEW_TTS = '''@app.post("/voice/tts")
async def text_to_speech(req: Request, data: dict):
    """
    TTS using Bytez suno/bark.
    Falls back to gTTS if Bytez fails.
    Returns audio/mpeg binary.
    """
    text = data.get("text", "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text required")

    bytez_key = os.environ.get("BYTEZ_API_KEY", "")
    
    # ── Primary: Bytez suno/bark ──────────────────────────────────────────────
    if bytez_key:
        try:
            from bytez import Bytez as BytezSDK
            sdk = BytezSDK(bytez_key)
            model = sdk.model("suno/bark")
            result = None
            # SDK v3 returns a generator
            try:
                gen = model.run(text)
                result = next(gen) if hasattr(gen, '__next__') else gen
            except TypeError:
                result = model.run(text)

            if result and not result.error and result.output:
                output = result.output
                # output may be base64 string or dict with audio key
                import base64, io
                audio_b64 = None
                if isinstance(output, str):
                    audio_b64 = output
                elif isinstance(output, dict):
                    audio_b64 = output.get("audio") or output.get("audio_out") or output.get("output")
                elif isinstance(output, list) and len(output) > 0:
                    first = output[0]
                    if isinstance(first, dict):
                        audio_b64 = first.get("audio") or first.get("audio_out")
                    else:
                        audio_b64 = first

                if audio_b64:
                    # Strip data URI prefix if present
                    if "," in audio_b64:
                        audio_b64 = audio_b64.split(",", 1)[1]
                    audio_bytes = base64.b64decode(audio_b64)
                    return Response(
                        content=audio_bytes,
                        media_type="audio/mpeg",
                        headers={"Cache-Control": "no-cache"}
                    )
        except Exception as e:
            print(f"[TTS] Bytez bark error: {e}")

    # ── Fallback: gTTS (Google Text-to-Speech, free) ─────────────────────────
    try:
        from gtts import gTTS
        import io
        tts = gTTS(text=text, lang="en", slow=False)
        buf = io.BytesIO()
        tts.write_to_fp(buf)
        buf.seek(0)
        return Response(
            content=buf.read(),
            media_type="audio/mpeg",
            headers={"Cache-Control": "no-cache"}
        )
    except Exception as e:
        print(f"[TTS] gTTS fallback error: {e}")

    # ── Final fallback: plain text so frontend uses browser speech ────────────
    raise HTTPException(status_code=503, detail="TTS unavailable - use browser speech synthesis")

'''

if OLD_TTS:
    c = c.replace(OLD_TTS, NEW_TTS)
    print("✓ Replaced existing /voice/tts")
else:
    # Append before last line
    c = c.rstrip() + "\n\n" + NEW_TTS
    print("✓ Appended /voice/tts (no existing found)")

# ── 2. Add gTTS to requirements if not present ───────────────────────────────
req_path = "backend/requirements.txt"
if os.path.exists(req_path):
    with open(req_path) as f:
        reqs = f.read()
    added = []
    for pkg in ["gtts", "bytez"]:
        if pkg not in reqs:
            reqs = reqs.rstrip() + f"\n{pkg}\n"
            added.append(pkg)
    with open(req_path, "w") as f:
        f.write(reqs)
    if added:
        print(f"✓ Added to requirements.txt: {', '.join(added)}")
    else:
        print("✓ requirements.txt already has needed packages")

with open(path, "w") as f:
    f.write(c)

print("\n✅ Done. Deploy to Render to activate Bytez TTS.")
print("   BYTEZ_API_KEY must be set in Render dashboard env vars.")
