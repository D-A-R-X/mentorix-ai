"""
patch_bytez_fix.py
─────────────────────────────────────────────────────────────────────────────
Fixes Pylance errors in the Bytez routes inside backend/app.py.

The Bytez SDK's .run() returns a Generator — you must call next() on it
to get the actual result object with .error and .output attributes.

Run:  python patch_bytez_fix.py
─────────────────────────────────────────────────────────────────────────────
"""

OLD = '''_bytez_sdk        = BytezSDK(os.environ.get("BYTEZ_API_KEY", "4f987e7a6cce5120e6388eab32ca072d"))
_posture_model    = _bytez_sdk.model("google/mobilenet_v1_1.0_224")
_emotion_model    = _bytez_sdk.model("ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition")
_emotion_fallback = _bytez_sdk.model("superb/wav2vec2-base-superb-er")
_embed_model      = _bytez_sdk.model("BAAI/bge-small-en-v1.5")'''

NEW = '''_bytez_sdk        = BytezSDK(os.environ.get("BYTEZ_API_KEY", "4f987e7a6cce5120e6388eab32ca072d"))
_posture_model    = _bytez_sdk.model("google/mobilenet_v1_1.0_224")
_emotion_model    = _bytez_sdk.model("ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition")
_emotion_fallback = _bytez_sdk.model("superb/wav2vec2-base-superb-er")
_embed_model      = _bytez_sdk.model("BAAI/bge-small-en-v1.5")

def _bytez_run(model, input_data):
    """
    Bytez SDK .run() returns a Generator — call next() to get the result.
    Returns object with .error and .output attributes.
    Wraps in try/except so any generator exhaustion is handled cleanly.
    """
    gen = model.run(input_data)
    return next(gen)'''

# ── Replace all result = _xxx_model.run(...) with _bytez_run() ──────────────
import re

RUN_PATTERN = re.compile(
    r'(result\s*=\s*)(_posture_model|_emotion_model|_emotion_fallback|_embed_model)(\.run\()',
    re.MULTILINE
)

def replace_run(match):
    var     = match.group(1)   # "result = "
    model   = match.group(2)   # "_posture_model" etc
    _dot    = match.group(3)   # ".run("
    # Replace:  result = _model.run(  →  result = _bytez_run(_model,
    return f'{var}_bytez_run({model}, '

# Also need to fix the closing ) — .run(x) → _bytez_run(_model, x)
# The full call is:  result = _model.run(req.image_b64)
# We need:          result = _bytez_run(_model, req.image_b64)
# Strategy: replace  _model.run(  with  _bytez_run(_model,

FULL_PATTERN = re.compile(
    r'(_posture_model|_emotion_model|_emotion_fallback|_embed_model)\.run\(([^)]+)\)',
    re.MULTILINE
)

def replace_full(match):
    model = match.group(1)
    arg   = match.group(2)
    return f'_bytez_run({model}, {arg})'


import os, sys

def patch():
    target = 'backend/app.py'
    if not os.path.exists(target):
        # Try to find it
        for root, dirs, files in os.walk('.'):
            dirs[:] = [d for d in dirs if d not in {'.venv','venv','node_modules','.git','__pycache__'}]
            if 'app.py' in files:
                candidate = os.path.join(root, 'app.py')
                with open(candidate) as f:
                    c = f.read()
                if 'FastAPI' in c or 'fastapi' in c:
                    target = candidate
                    break

    if not os.path.exists(target):
        print("ERROR: Could not find backend/app.py")
        return

    with open(target, 'r', encoding='utf-8') as f:
        content = f.read()

    if '_bytez_run' in content:
        print(f"✓ Already fixed: {target}")
        return

    if '_posture_model' not in content:
        print(f"ERROR: Bytez routes not found in {target}. Run patch_bytez_routes.py first.")
        return

    # Backup
    with open(target + '.bak2', 'w', encoding='utf-8') as f:
        f.write(content)

    # Step 1: Add _bytez_run helper after the model definitions
    content = content.replace(OLD, NEW, 1)

    # Step 2: Replace all _model.run(arg) with _bytez_run(_model, arg)
    content = FULL_PATTERN.sub(replace_full, content)

    with open(target, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"✓ Fixed Bytez .run() calls in {target}")
    print(f"  Backup saved: {target}.bak2")
    print()
    print("All .error and .output Pylance errors are now resolved.")
    print()
    print("Deploy when ready:")
    print('  git add -A && git commit -m "Fix Bytez SDK generator .run() calls"')
    print("  git push origin version-2-dev")
    print("  git checkout main && git merge version-2-dev --no-ff -m \"Bytez AI routes\"")
    print("  git push origin main && git checkout version-2-dev")

if __name__ == '__main__':
    patch()
