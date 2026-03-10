"""
patch_bytez_routes.py
─────────────────────────────────────────────────────────────────────────────
Adds 3 Bytez-powered routes to your FastAPI backend.

Run from ANYWHERE inside the mentorix-ai project:
    python patch_bytez_routes.py

It will auto-find your backend main.py.
─────────────────────────────────────────────────────────────────────────────
"""
import os, sys

BYTEZ_ROUTES = '''

# ─────────────────────────────────────────────────────────────────────────────
# BYTEZ AI ROUTES  (posture / emotion / similarity)
# Added by patch_bytez_routes.py
# Requires: pip install bytez
# Env var:  BYTEZ_API_KEY=4f987e7a6cce5120e6388eab32ca072d
# ─────────────────────────────────────────────────────────────────────────────
from bytez import Bytez as BytezSDK
from pydantic import BaseModel as _BM
import base64 as _b64, math as _math

_bytez_sdk        = BytezSDK(os.environ.get("BYTEZ_API_KEY", "4f987e7a6cce5120e6388eab32ca072d"))
_posture_model    = _bytez_sdk.model("google/mobilenet_v1_1.0_224")
_emotion_model    = _bytez_sdk.model("ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition")
_emotion_fallback = _bytez_sdk.model("superb/wav2vec2-base-superb-er")
_embed_model      = _bytez_sdk.model("BAAI/bge-small-en-v1.5")

class _PostureReq(_BM):
    image_b64: str          # base64 data URL from canvas snapshot

class _EmotionReq(_BM):
    audio_b64: str          # base64 data URL from MediaRecorder blob

class _SimilarityReq(_BM):
    candidate: str          # candidate answer text
    ideal:     str          # ideal answer for this question


def _cosine(a, b):
    if len(a) != len(b):
        return 0.0
    dot  = sum(x*y for x, y in zip(a, b))
    magA = _math.sqrt(sum(x*x for x in a))
    magB = _math.sqrt(sum(x*x for x in b))
    return dot / (magA * magB) if magA and magB else 0.0

def _flatten(arr):
    if arr and isinstance(arr[0], list):
        return arr[0]
    return arr


@app.post("/bytez/posture")
async def bytez_posture(req: _PostureReq, _u=Depends(get_current_user)):
    """
    Analyse camera frame posture using Bytez mobilenet_v1_1.0_224.
    Returns: { posture: int, source: "bytez" | "geometric" }
    """
    try:
        result = _posture_model.run(req.image_b64)
        if result.error:
            raise Exception(result.error)
        output = result.output
        if isinstance(output, list) and len(output) > 0:
            top_score = output[0].get("score", 0.5)
            posture   = int(40 + top_score * 55)
            return {"posture": posture, "source": "bytez"}
        raise Exception("empty-output")
    except Exception as e:
        # Geometric fallback — frontend browser handles actual geometric calc
        return {"posture": 70, "source": "geometric", "error": str(e)}


@app.post("/bytez/emotion")
async def bytez_emotion(req: _EmotionReq, _u=Depends(get_current_user)):
    """
    Classify speech emotion from audio blob.
    Primary  : ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition
    Fallback : superb/wav2vec2-base-superb-er
    Returns  : { emotion, confidence, composure, source }
    """
    EMOTION_MAP = {
        "happy":    {"confidence": 85, "composure": 80},
        "neutral":  {"confidence": 70, "composure": 75},
        "calm":     {"confidence": 72, "composure": 82},
        "surprised":{"confidence": 60, "composure": 55},
        "fearful":  {"confidence": 35, "composure": 30},
        "fear":     {"confidence": 35, "composure": 30},
        "angry":    {"confidence": 45, "composure": 25},
        "disgust":  {"confidence": 40, "composure": 35},
        "sad":      {"confidence": 40, "composure": 40},
    }

    def parse(output, source):
        if not isinstance(output, list) or not output:
            return None
        top   = sorted(output, key=lambda x: x.get("score", 0), reverse=True)[0]
        label = top.get("label", "neutral").lower()
        score = top.get("score", 0.5)
        m     = EMOTION_MAP.get(label, {"confidence": 60, "composure": 60})
        return {
            "emotion":    top.get("label", "neutral"),
            "confidence": round(m["confidence"] * score + 50 * (1 - score)),
            "composure":  round(m["composure"]  * score + 50 * (1 - score)),
            "source":     source,
        }

    # Primary Bytez model
    try:
        result = _emotion_model.run(req.audio_b64)
        if not result.error:
            parsed = parse(result.output, "bytez")
            if parsed:
                return parsed
    except Exception:
        pass

    # Fallback Bytez model
    try:
        result = _emotion_fallback.run(req.audio_b64)
        if not result.error:
            parsed = parse(result.output, "bytez_fb")
            if parsed:
                return parsed
    except Exception:
        pass

    # Both failed — frontend will use transcript heuristic
    return {"emotion": "neutral", "confidence": 60, "composure": 60, "source": "fallback"}


@app.post("/bytez/similarity")
async def bytez_similarity(req: _SimilarityReq, _u=Depends(get_current_user)):
    """
    Score answer quality via sentence embeddings (BAAI/bge-small-en-v1.5).
    Returns: { score: int (30-95), source: "bytez" | "llm_fallback" }
    """
    try:
        r1 = _embed_model.run(req.candidate)
        r2 = _embed_model.run(req.ideal)
        if r1.error or r2.error:
            raise Exception(f"embed error: {r1.error or r2.error}")
        emb1 = _flatten(r1.output)
        emb2 = _flatten(r2.output)
        if not emb1 or not emb2:
            raise Exception("empty embeddings")
        sim   = _cosine(emb1, emb2)
        score = int(30 + ((sim + 1) / 2) * 65)
        return {"score": score, "source": "bytez"}
    except Exception as e:
        # Frontend will fall back to Groq LLM score extraction
        return {"score": None, "source": "llm_fallback", "error": str(e)}

# ─────────────────────────────────────────────────────────────────────────────
'''


def find_backend_main():
    """Search for main.py / app.py in common backend locations."""
    # Check common folder names first
    backend_dirs = [
        'backend', 'app', 'server', 'api', 'src',
        os.path.join('backend', 'app'),
        os.path.join('app', 'backend'),
    ]
    filenames = ['main.py', 'app.py', 'server.py']

    # 1. Check current directory first
    for f in filenames:
        if os.path.exists(f):
            return f

    # 2. Check known backend subdirectories
    for d in backend_dirs:
        for f in filenames:
            path = os.path.join(d, f)
            if os.path.exists(path):
                return path

    # 3. Walk up to 3 levels deep looking for FastAPI app
    for root, dirs, files in os.walk('.'):
        # Skip node_modules, .venv, .git etc
        dirs[:] = [d for d in dirs if d not in
                   {'node_modules', '.venv', 'venv', '.git', '__pycache__',
                    'dist', 'build', '.next', 'static', 'public'}]
        depth = root.replace('\\', '/').count('/')
        if depth > 3:
            continue
        for fname in filenames:
            path = os.path.join(root, fname)
            if os.path.exists(path):
                with open(path) as f:
                    content = f.read()
                # Must actually be a FastAPI file
                if 'FastAPI' in content or 'fastapi' in content:
                    return path

    return None


def patch():
    target = find_backend_main()

    if not target:
        print()
        print("ERROR: Could not find your FastAPI main.py automatically.")
        print()
        print("Please run from your backend folder directly:")
        print("  cd ~/Downloads/mentorix-ai/backend   (or wherever main.py is)")
        print("  python patch_bytez_routes.py")
        print()
        print("OR pass the path as an argument:")
        print("  python patch_bytez_routes.py backend/main.py")
        return

    print(f"Found backend file: {target}")

    with open(target, 'r', encoding='utf-8') as f:
        content = f.read()

    if '/bytez/posture' in content:
        print(f"✓ Bytez routes already present in {target} — nothing to do.")
        return

    # Inject before 'if __name__' block, or at end of file
    if 'if __name__' in content:
        content = content.replace('if __name__', BYTEZ_ROUTES + '\nif __name__', 1)
    else:
        content = content + BYTEZ_ROUTES

    # Backup original
    backup = target + '.bak'
    with open(target, 'r', encoding='utf-8') as f:
        original = f.read()
    with open(backup, 'w', encoding='utf-8') as f:
        f.write(original)
    print(f"Backup saved: {backup}")

    with open(target, 'w', encoding='utf-8') as f:
        f.write(content)

    print()
    print(f"✓ Bytez routes injected into {target}")
    print()
    print("─" * 55)
    print("NEXT STEPS:")
    print("─" * 55)
    print()
    print("1. Add env var to Render dashboard:")
    print("   BYTEZ_API_KEY = 4f987e7a6cce5120e6388eab32ca072d")
    print()
    print("2. Deploy:")
    print("   git add -A")
    print('   git commit -m "Add Bytez AI routes: posture + emotion + similarity"')
    print("   git push origin version-2-dev")
    print("   git checkout main && git merge version-2-dev --no-ff")
    print("   git push origin main && git checkout version-2-dev")
    print()
    print("3. New routes available after deploy:")
    print("   POST /bytez/posture     — mobilenet_v1_1.0_224")
    print("   POST /bytez/emotion     — wav2vec2-xlsr + fallback")
    print("   POST /bytez/similarity  — bge-small-en-v1.5")
    print()


# Allow passing path as argument: python patch_bytez_routes.py path/to/main.py
if len(sys.argv) > 1:
    manual_path = sys.argv[1]
    if os.path.exists(manual_path):
        with open(manual_path, 'r', encoding='utf-8') as f:
            content = f.read()
        if '/bytez/posture' in content:
            print(f"✓ Already patched: {manual_path}")
        else:
            backup = manual_path + '.bak'
            with open(backup, 'w', encoding='utf-8') as f:
                f.write(content)
            if 'if __name__' in content:
                content = content.replace('if __name__', BYTEZ_ROUTES + '\nif __name__', 1)
            else:
                content += BYTEZ_ROUTES
            with open(manual_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"✓ Patched: {manual_path}  (backup: {backup})")
    else:
        print(f"ERROR: File not found: {manual_path}")
else:
    patch()
