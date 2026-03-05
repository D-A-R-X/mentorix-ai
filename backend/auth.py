import os
import hashlib
import hmac
import time
import base64
import json
from typing import Optional, Dict, Any

# ── Secret key ─────────────────────────────────────────────────
# Set JWT_SECRET in Render environment variables for production
JWT_SECRET = os.getenv("JWT_SECRET", "mentorix-dev-secret-change-in-production")
JWT_EXPIRY_HOURS = 72  # token valid for 3 days


# ── Password hashing ────────────────────────────────────────────
def hash_password(password: str) -> str:
    """SHA-256 hash with salt — no external deps needed."""
    salt = os.urandom(32)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return base64.b64encode(salt + key).decode()


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        decoded = base64.b64decode(stored_hash.encode())
        salt = decoded[:32]
        stored_key = decoded[32:]
        key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
        return hmac.compare_digest(key, stored_key)
    except Exception:
        return False


# ── JWT (manual — no PyJWT dependency) ─────────────────────────
def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    padding = 4 - len(s) % 4
    return base64.urlsafe_b64decode(s + "=" * padding)


def create_token(email: str) -> str:
    header  = _b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = _b64url_encode(json.dumps({
        "sub": email,
        "iat": int(time.time()),
        "exp": int(time.time()) + JWT_EXPIRY_HOURS * 3600
    }).encode())
    signing_input = f"{header}.{payload}"
    signature = _b64url_encode(
        hmac.new(
            JWT_SECRET.encode(),
            signing_input.encode(),
            hashlib.sha256
        ).digest()
    )
    return f"{signing_input}.{signature}"


def verify_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header, payload, signature = parts
        signing_input = f"{header}.{payload}"
        expected_sig = _b64url_encode(
            hmac.new(
                JWT_SECRET.encode(),
                signing_input.encode(),
                hashlib.sha256
            ).digest()
        )
        if not hmac.compare_digest(signature, expected_sig):
            return None
        data = json.loads(_b64url_decode(payload))
        if data.get("exp", 0) < int(time.time()):
            return None  # expired
        return data
    except Exception:
        return None


def extract_email_from_token(token: str) -> Optional[str]:
    data = verify_token(token)
    return data.get("sub") if data else None