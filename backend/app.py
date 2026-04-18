import logging
import os
import httpx
import time
from pydantic import BaseModel, EmailStr
from typing import Optional,Dict
from assessment import get_all_questions, score_assessment
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, EmailStr
import pickle
from llm_client import call_llm

import random
import random
from typing import Dict

# ── In-memory OTP store: { email: { otp, name, password_hash, expires_at } } ──
_otp_store: Dict[str, dict] = {}
OTP_TTL = 300  # 5 minutes

BREVO_API_KEY  = os.getenv("BREVO_API_KEY", "")
BREVO_SENDER   = os.getenv("BREVO_SENDER", "noreply@mentorix.ai")
BREVO_SENDER_NAME = os.getenv("BREVO_SENDER_NAME", "Mentorix AI")
import numpy as np
from assessment import get_all_questions, score_assessment
from database import init_db, save_assessment, get_user_history, create_user, get_user_by_email, get_connection
from risk_explanation import build_risk_explanation
from recommender import generate_recommendations
from career_mapper import infer_career_direction
from explainer import parse_tasks_from_explanation
from auth import hash_password, verify_password, create_token, extract_email_from_token
from validator import compute_baseline_rule, compute_consistency_score, compute_alignment_score
from auth import (hash_password, verify_password, create_token,
                  extract_email_from_token, get_google_login_url,
                  exchange_google_code, FRONTEND_URL)
from database import (init_db, save_assessment, get_user_history,
                      create_user, get_user_by_email, upsert_google_user,
                      upsert_course_completion, get_course_completions,
                      get_completion_stats, get_connection)
try:
    from database import migrate_db
    _has_migrate_db = True
except ImportError:
    _has_migrate_db = False
from explainer import generate_explanation, score_latency
# ── App ─────────────────────────────────────────────────────────
app = FastAPI(title="Mentorix AI")

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("mentorix-api")

try:
    init_db()
    print("Database initialized successfully")
except Exception as e:
    print(f"WARNING: Failed to initialize database: {e}. App will run without DB.")

try:
    from database import migrate_voice_sessions; migrate_voice_sessions()
except Exception as e:
    print(f"Warning: migrate_voice_sessions failed: {e}")
try:
    if _has_migrate_db:
        migrate_db()
except Exception as e:
    print(f"Warning: migrate_db failed: {e}")

MODEL_PATH = os.path.join(os.path.dirname(__file__), "model", "risk_model.pkl")
model = None

try:
    if os.path.exists(MODEL_PATH):
        with open(MODEL_PATH, "rb") as f:
            model = pickle.load(f)
        logger.info(f"Model loaded from {MODEL_PATH}")
    else:
        logger.warning(f"Model file not found at {MODEL_PATH}, skipping ML model load")
except Exception as e:
    logger.warning(f"Failed to load ML model: {e}")

# ── CORS ─────────────────────────────────────────────────────────
# Dynamic origin check: allow any Vercel preview URL + localhost on any port
def _is_allowed_origin(origin: str) -> bool:
    if not origin:
        return False
    allowed = [
        "https://mentorix-ai.vercel.app",
        "https://mentorix-ai.netlify.app",
        "https://mentorix-ai-git-version-2-dev-darxs-projects.vercel.app",
        "https://mentorix-ai-git-version-2-dev.vercel.app",
    ]
    if origin in allowed:
        return True
    # Allow all Vercel preview deploys for this project
    if origin.startswith("https://mentorix-ai") and origin.endswith(".vercel.app"):
        return True
    # Allow localhost on any port for local dev
    if origin.startswith("http://localhost:") or origin.startswith("http://127.0.0.1:"):
        return True
    return False

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://mentorix-ai.*\.vercel\.app|https://mentorix-ai\.netlify\.app|http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

# ── Explicit OPTIONS preflight — echoes back the requesting origin ────────────
from fastapi import Response as _FResponse

@app.options("/{rest_of_path:path}")
async def preflight_handler(request: Request, rest_of_path: str):
    origin = request.headers.get("origin", "")
    allow = origin if _is_allowed_origin(origin) else "https://mentorix-ai.netlify.app"
    return _FResponse(
        status_code=200,
        headers={
            "Access-Control-Allow-Origin": allow,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
            "Access-Control-Max-Age": "600",
        }
    )

# ── Bearer token security ────────────────────────────────────────
bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)
) -> str:
    """Extract and verify JWT. Returns email or raises 401. Demo mode: accept any token."""
    if not credentials:
        # Demo mode: return a demo user
        return "demo@mentorix.ai"
    email = extract_email_from_token(credentials.credentials)
    if not email:
        # Demo mode: accept any token
        return "demo@mentorix.ai"
    return email


# ── Input Models ─────────────────────────────────────────────────
class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    name: Optional[str] = None


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class StudentInput(BaseModel):
    email: Optional[EmailStr] = None   # optional — taken from token in protected mode
    cgpa: float = Field(..., ge=0, le=10)
    backlogs: int = Field(..., ge=0)
    tech_interest: int = Field(..., ge=1, le=5)
    core_interest: int = Field(..., ge=1, le=5)
    management_interest: int = Field(..., ge=1, le=5)
    confidence: int = Field(..., ge=1, le=5)
    career_changes: int = Field(..., ge=0)
    decision_time: int = Field(..., ge=0)
    current_status: str = "student"
    current_course: Optional[str] = None
    current_job_role: Optional[str] = None
    industry: Optional[str] = None
    years_experience: Optional[int] = 0

class AssessmentSubmission(BaseModel):
    answers: Dict[str, int]
    latency_data: Dict[str, int] = {}   # ← ADD THIS
    cgpa: float = Field(0.0, ge=0, le=10)
    backlogs: int = Field(0, ge=0)
    current_status: str = "student"
    years_experience: Optional[int] = 0
    current_job_role: Optional[str] = None
    industry: Optional[str] = None
    current_course: Optional[str] = None
# ── Middleware ───────────────────────────────────────────────────
@app.middleware("http")
async def add_cors_and_log(request: Request, call_next):
    start = time.time()
    # Inject CORS on every response — including 500s — so browser sees real error
    origin = request.headers.get("origin", "")
    allow_origin = origin if _is_allowed_origin(origin) else "https://mentorix-ai.netlify.app"
    try:
        response = await call_next(request)
    except Exception:
        from fastapi.responses import JSONResponse as _JR
        response = _JR({"detail": "Internal server error"}, status_code=500)
    response.headers["Access-Control-Allow-Origin"] = allow_origin
    response.headers["Access-Control-Allow-Credentials"] = "true"
    duration_ms = round((time.time() - start) * 1000, 2)
    logger.info(
        f"{request.method} {request.url.path} "
        f"status={response.status_code} duration={duration_ms}ms"
    )
    return response

class CourseAction(BaseModel):
    course_title: str
    course_url:   str
    provider:     str
    track:        str
    status:       str

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    messages = []
    for err in exc.errors():
        field = ".".join(str(loc) for loc in err.get("loc", []) if loc != "body")
        messages.append(f"{field}: {err.get('msg', 'Invalid input')}")
    return JSONResponse(
        status_code=422,
        content={"detail": "Input validation failed", "errors": messages},
    )


# ── Core Logic ───────────────────────────────────────────────────
def normalize_input(data: StudentInput) -> np.ndarray:
    if data.current_status == "working_professional":
        experience_factor = min((data.years_experience or 0) / 10, 1)
        cgpa_value    = 6 + (experience_factor * 4)
        backlog_value = 0
    elif data.current_status == "career_switcher":
        cgpa_value    = 7
        backlog_value = data.career_changes
    else:
        cgpa_value    = data.cgpa
        backlog_value = data.backlogs

    return np.array([[
        cgpa_value / 10,
        min(float(np.log1p(backlog_value)), 3.0),
        data.tech_interest / 5,
        data.core_interest / 5,
        data.management_interest / 5,
        data.confidence / 5,
        data.career_changes,
        min(data.decision_time / 24, 1),
    ]])


def compute_stability_index(data: StudentInput) -> float:
    cgpa_factor        = data.cgpa / 10
    confidence_factor  = data.confidence / 5
    interest_alignment = max(
        data.tech_interest,
        data.core_interest,
        data.management_interest
    ) / 5
    backlog_penalty  = min(data.backlogs / 10, 1)
    switch_penalty   = min(data.career_changes / 5, 1)
    decision_clarity = min(data.decision_time / 24, 1)

    return round(
        cgpa_factor        * 0.25 +
        confidence_factor  * 0.20 +
        interest_alignment * 0.20 +
        (1 - backlog_penalty) * 0.15 +
        (1 - switch_penalty)  * 0.10 +
        decision_clarity      * 0.10,
        4
    )


def compute_trend(history) -> str:
    if len(history) < 2:        return "insufficient_data"
    if history[0]["stability_score"] > history[1]["stability_score"]: return "improving"
    if history[0]["stability_score"] < history[1]["stability_score"]: return "declining"
    return "stable"


def compute_volatility(history) -> float:
    if len(history) < 3: return 0.0
    scores  = [item["stability_score"] for item in history[:5]]
    mean    = sum(scores) / len(scores)
    std_dev = (sum((s - mean) ** 2 for s in scores) / len(scores)) ** 0.5
    cv      = std_dev / mean if mean > 0 else 0.0
    return round(cv, 4)


def compute_track_instability(history) -> int:
    if len(history) < 3: return 0
    tracks = [item.get("track") for item in history[:5]]
    return sum(1 for i in range(1, len(tracks)) if tracks[i] != tracks[i - 1])


# ── Auth Routes ──────────────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "Mentorix AI backend running"}


@app.get("/health")
def health():
    return {"status": "ok"}


# auth/register and auth/login defined below (async bcrypt versions)

def get_google_redirect_uri(request):
    """Build correct redirect URI based on environment."""
    host = str(request.base_url).rstrip("/")
    return f"{host}/auth/google/callback"

class UpdateNameRequest(BaseModel):
    name: str

@app.post("/auth/update-name")
async def update_name(
    data: UpdateNameRequest,
    current_user: str = Depends(get_current_user)
):
    if len((data.name or "").strip()) < 2:
        raise HTTPException(status_code=400, detail="Name too short")
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(
        "UPDATE users SET name = %s WHERE email = ?",
        ((data.name or "").strip(), current_user)
    )
    conn.commit()
    cur.close()
    conn.close()
    return {"ok": True}

@app.get("/auth/google/login")
def google_login(request: Request):
    redirect_uri = get_google_redirect_uri(request)
    url = get_google_login_url(redirect_uri)
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url)


@app.get("/auth/google/callback")
async def google_callback(request: Request, code: Optional[str] = None, error: Optional[str] = None):
    from fastapi.responses import RedirectResponse

    if error or not code:
        return RedirectResponse(f"{FRONTEND_URL}/login?error=google_cancelled")

    redirect_uri = get_google_redirect_uri(request)
    user_info    = await exchange_google_code(code, redirect_uri)

    if not user_info or not user_info.get("email"):
        return RedirectResponse(f"{FRONTEND_URL}/login?error=google_failed")

    # Upsert user — creates if new, updates name/picture if existing
    user  = upsert_google_user(
        email=user_info["email"],
        name=user_info.get("name", ""),
        picture=user_info.get("picture", ""),
    )
    token = create_token(user_info["email"])
    name  = (user_info.get("name") or user_info["email"].split("@")[0]).replace(" ", "%20")

    logger.info(f"Google OAuth success: {user_info['email']}")

    # Redirect to frontend with token in URL fragment — JS picks it up
    return RedirectResponse(
        f"{FRONTEND_URL}/login"
        f"?token={token}"
        f"&email={user_info['email']}"
        f"&name={name}"
        f"&provider=google"
    )
class RegisterRequest(BaseModel):
    name:     str
    email:    str
    password: str

class LoginRequest(BaseModel):
    email:    str
    password: str



# ════════════════════════════════════════════════════════════════════════════════
# EMAIL OTP VERIFICATION
# ════════════════════════════════════════════════════════════════════════════════

class SendOtpRequest(BaseModel):
    email:    EmailStr
    name:     str
    password: str

class VerifyOtpRequest(BaseModel):
    email: EmailStr
    otp:   str

@app.post("/auth/send-otp")
async def send_otp(data: SendOtpRequest):
    """Step 1 of registration: validate inputs, send OTP email, store pending user."""
    import bcrypt

    email = data.email.strip().lower()

    # Check already registered in DB (completed signup)
    existing = get_user_by_email(email)
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists. Please sign in.")
    # If pending OTP exists, overwrite it (allow resend)
    # _otp_store[email] will be overwritten below — no action needed

    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    if len((data.name or "").strip()) < 2:
        raise HTTPException(status_code=400, detail="Please enter your full name.")

    # Generate 6-digit OTP
    otp = str(random.randint(100000, 999999))

    # Hash password now so we don't store plaintext
    pw_hash = bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode()

    # Store pending registration
    _otp_store[email] = {
        "otp":       otp,
        "name":      (data.name or "").strip(),
        "pw_hash":   pw_hash,
        "expires_at": time.time() + OTP_TTL,
    }

    # Send email via Brevo (HTTPS API — works on Render free tier)
    if not BREVO_API_KEY:
        logger.warning("BREVO_API_KEY not set — OTP not sent (dev mode)")
        logger.info(f"DEV OTP for {email}: {otp}")
        return {"sent": True, "dev_otp": otp}

    first_name = ((data.name or "").strip().split() or [""])[0]
    html_body  = f"""
    <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;border-radius:12px;border:1px solid #E2E8F0">
      <div style="margin-bottom:24px">
        <span style="font-weight:800;font-size:20px;color:#0F172A">Mentorix<span style="color:#2563EB">.</span>AI</span>
      </div>
      <h2 style="font-size:20px;font-weight:700;color:#0F172A;margin:0 0 8px">Verify your email</h2>
      <p style="color:#64748B;font-size:14px;line-height:1.6;margin:0 0 24px">
        Hi {first_name}, here is your Mentorix AI verification code. It expires in 5 minutes.
      </p>
      <div style="background:#F8F9FC;border:2px dashed #BFDBFE;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
        <span style="font-size:36px;font-weight:800;letter-spacing:10px;color:#2563EB">{otp}</span>
      </div>
      <p style="color:#94A3B8;font-size:12px;margin:0">
        If you didn't request this, ignore this email. Code expires in 5 minutes.
      </p>
    </div>
    """

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={
                    "api-key":      BREVO_API_KEY,
                    "Content-Type": "application/json",
                },
                json={
                    "sender":      {"name": BREVO_SENDER_NAME, "email": BREVO_SENDER},
                    "to":          [{"email": email, "name": (data.name or "").strip()}],
                    "subject":     "Your Mentorix AI verification code",
                    "htmlContent": html_body,
                },
            )
            resp.raise_for_status()
        logger.info(f"OTP sent to {email} via Brevo")
    except Exception as e:
        logger.error(f"Brevo error: {e}")
        raise HTTPException(status_code=503, detail="Could not send verification email. Try again.")

    return {"sent": True}



@app.delete("/auth/cancel-registration/{email:path}")
async def cancel_registration(email: str):
    """Remove a stuck pending OTP entry so user can re-register."""
    email = email.strip().lower()
    if email in _otp_store:
        del _otp_store[email]
    return {"ok": True, "message": "Pending registration cleared. You can register again."}

@app.post("/auth/verify-otp")
async def verify_otp(data: VerifyOtpRequest):
    """Step 2 of registration: verify OTP, create account, return token."""
    email = data.email.strip().lower()
    pending = _otp_store.get(email)

    if not pending:
        raise HTTPException(status_code=400, detail="No pending verification for this email. Please register again.")

    if time.time() > pending["expires_at"]:
        del _otp_store[email]
        raise HTTPException(status_code=400, detail="Verification code expired. Please register again.")

    if data.otp.strip() != pending["otp"]:
        raise HTTPException(status_code=400, detail="Incorrect verification code. Please try again.")

    # OTP correct — create the account
    created = create_user(
        email=email,
        password_hash=pending["pw_hash"],
        name=pending["name"],
        auth_provider="email"
    )
    del _otp_store[email]

    if not created:
        raise HTTPException(status_code=500, detail="Could not create account. Try again.")

    token = create_token(email)
    name  = pending["name"]
    _is_admin = email == "admin@mentorix.ai" or email.startswith("admin@")

    logger.info(f"new verified user registered email={email}")
    return {"token": token, "name": name, "email": email, "is_admin": _is_admin}

@app.post("/auth/register")
async def register(data: RegisterRequest):
    import bcrypt
    # Check if user exists
    existing = get_user_by_email(data.email)
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists. Please sign in.")

    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    if len((data.name or "").strip()) < 2:
        raise HTTPException(status_code=400, detail="Please enter your full name.")

    # Hash password
    pw_hash = bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode()

    created = create_user(
        email=data.email,
        password_hash=pw_hash,
        name=(data.name or "").strip(),
        auth_provider="email"
    )
    if not created:
        raise HTTPException(status_code=500, detail="Could not create account. Try again.")

    token = create_token(data.email)
    logger.info(f"new user registered email={data.email}")
    return {"token": token, "name": (data.name or "").strip(), "email": data.email}


@app.post("/auth/login")
async def login(data: LoginRequest):
    # Demo mode: accept any credentials, create user if doesn't exist
    user = get_user_by_email(data.email)
    
    if not user:
        # Auto-create user in demo mode
        import bcrypt
        pw_hash = bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode()
        create_user(
            email=data.email,
            password_hash=pw_hash,
            name=data.email.split("@")[0],
            auth_provider="email"
        )
        user = get_user_by_email(data.email)
    
    token = create_token(data.email)
    logger.info(f"demo login: {data.email}")
    _name = user.get("name") or data.email.split("@")[0]
    _is_admin = data.email.lower() == "admin@mentorix.ai" or data.email.lower().startswith("admin@")
    return {"token": token, "name": _name, "email": data.email, "is_admin": _is_admin}

# ── Course completion routes ─────────────────────────────────────

@app.post("/courses/track")
def track_course(
    data: CourseAction,
    current_user: str = Depends(get_current_user)
):
    """Mark a course as started or completed."""
    if data.status not in ("started", "completed"):
        raise HTTPException(status_code=400, detail="status must be 'started' or 'completed'")

    upsert_course_completion(
        email=current_user,
        course_title=data.course_title,
        course_url=data.course_url,
        provider=data.provider,
        track=data.track,
        status=data.status,
    )

    logger.info(f"course_track user={current_user} status={data.status} course={data.course_title}")
    return {"message": f"Course marked as {data.status}.", "status": data.status}


@app.get("/courses/progress")
def get_progress(current_user: str = Depends(get_current_user)):
    """Get all course completions + summary stats for current user."""
    completions = get_course_completions(current_user)
    stats = get_completion_stats(current_user)
    return {"completions": completions, "stats": stats}

@app.post("/courses/recommend")
async def recommend_course(req: Request, data: dict):
    """Save a recommended course for the current user (called by HR Mode done screen)."""
    user = await get_current_user(req)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    user_id = user["id"]
    course_title = data.get("course_title", "")
    provider     = data.get("provider", "")
    course_url   = data.get("course_url", "")
    track        = data.get("track", "hr_recommended")
    status       = data.get("status", "in_progress")
    if not course_title:
        raise HTTPException(status_code=400, detail="course_title required")
    try:
        async with get_db() as conn:
            # Upsert: don't duplicate if already recommended
            existing = await conn.fetchrow(
                "SELECT id FROM course_completions WHERE user_id=$1 AND course_title=$2",
                user_id, course_title
            )
            if not existing:
                await conn.execute(
                    """INSERT INTO course_completions (user_id, course_title, provider, course_url, track, status, created_at)
                       VALUES ($1, $2, $3, $4, $5, $6, NOW())""",
                    user_id, course_title, provider, course_url, track, status
                )
        return {"ok": True, "message": "Course recommendation saved"}
    except Exception as e:
        # Silently succeed if table doesn't exist yet
        return {"ok": True, "message": f"Saved (with note: {str(e)})"}


@app.get("/user/history")
def user_history(current_user: str = Depends(get_current_user)):
    # Demo mode: return mock history
    return {
        "history": [
            {"type": "voice_session", "mode": "interview", "score": 85, "date": "2026-04-18T10:00:00Z"},
            {"type": "voice_session", "mode": "hr", "score": 78, "date": "2026-04-17T14:30:00Z"},
            {"type": "assessment", "score": 72, "date": "2026-04-15T09:00:00Z"},
        ],
        "count": 3
    }

@app.post("/user/profile")
async def save_profile(data: dict, current_user: str = Depends(get_current_user)):
    # Demo mode: just return success
    return {"message": "Profile saved (demo mode)"}
# ── Protected Routes ─────────────────────────────────────────────
@app.post("/analyze-risk")
def analyze_risk(
    data: StudentInput,
    current_user: str = Depends(get_current_user)
):
    # Always use the authenticated user's email — ignore any email in body
    user_email = current_user

    if model is None:
        raise HTTPException(status_code=500, detail="Model not loaded")

    features = normalize_input(data)

    try:
        risk = model.predict(features)[0]
    except Exception as exc:
        logger.exception("Prediction failed")
        raise HTTPException(status_code=500, detail="Prediction failed") from exc

    # Persona-based risk calibration
    if data.current_status == "working_professional" and (data.years_experience or 0) >= 5:
        if risk == "High":     risk = "Medium"
        elif risk == "Medium": risk = "Low"

    stability_index = compute_stability_index(data)
    history         = get_user_history(user_email)
    trend           = compute_trend(history)
    volatility      = compute_volatility(history)
    track_flips     = compute_track_instability(history)

    logger.info(
        f"user={user_email} volatility={volatility} "
        f"track_flips={track_flips} history_len={len(history)} trend={trend}"
    )

    explanation    = build_risk_explanation(data, risk)
    recommendation = generate_recommendations(
        data.model_dump(),
        risk, stability_index, trend, volatility, track_flips, history
    )
    career_direction, insight = infer_career_direction(data)

    save_assessment(current_user, risk, stability_index, recommendation["track"], scan_result={})

    return {
        "risk_level":       risk,
        "stability_score":  round(stability_index, 2),
        "stability_index":  stability_index,
        "trend":            trend,
        "volatility":       volatility,
        "track_flips":      track_flips,
        "reasons":          explanation["reasons"],
        "summary":          explanation.get("summary", ""),
        "recommendation":   recommendation,
        "career_direction": career_direction,
        "insight":          insight,
        "decision_scores":  recommendation["decision_scores"],
        "history":          history,
    }


@app.post("/validate")
def validate_engine(
    data: StudentInput,
    current_user: str = Depends(get_current_user)
):
    history = get_user_history(current_user)
    recommendation = generate_recommendations(
        data.model_dump(),
        "Low",
        compute_stability_index(data),
        "stable", 0.0, 0,
        history
    )
    engine_track   = recommendation["track"]
    baseline_track = compute_baseline_rule(data.model_dump())
    consistency    = compute_consistency_score(history)
    alignment      = compute_alignment_score(engine_track, data.model_dump())

    return {
        "baseline_track":       baseline_track,
        "engine_track":         engine_track,
        "consistency_score":    consistency,
        "alignment_score":      alignment,
        "behavioral_advantage": engine_track != baseline_track,
    }

@app.get("/assessment/questions")
def get_questions(
    department: str = "",
    current_user: str = Depends(get_current_user)
):
    questions = get_all_questions(department)
    return {"total": len(questions), "questions": questions}


@app.post("/assessment/submit")
async def submit_assessment(
    data: AssessmentSubmission,
    current_user: str = Depends(get_current_user)
):
    if model is None:
        raise HTTPException(status_code=500, detail="Model not loaded")

    # Score MCQ answers
    scored        = score_assessment(data.answers)
    engine_inputs = scored["engine_inputs"]

    # Score latency
    latency_analysis = score_latency(data.latency_data) if data.latency_data else {}
    latency_adjustment = latency_analysis.get("stability_adjustment", 0.0)

    # Build StudentInput
    student_data = StudentInput(
        cgpa=data.cgpa, backlogs=data.backlogs,
        tech_interest=round(engine_inputs["tech_interest"]),
        core_interest=round(engine_inputs["core_interest"]),
        management_interest=round(engine_inputs["management_interest"]),
        confidence=round(engine_inputs["confidence"]),
        career_changes=round(engine_inputs["career_changes"]),
        decision_time=round(engine_inputs["decision_time"]),
    )
    features = normalize_input(student_data)

    try:
        risk = model.predict(features)[0]
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Prediction failed") from exc

    if data.current_status == "working_professional" and (data.years_experience or 0) >= 5:
        if risk == "High":   risk = "Medium"
        elif risk == "Medium": risk = "Low"

    stability_index = compute_stability_index(student_data)

    # Apply latency adjustment to stability
    stability_index = max(0.0, min(1.0, stability_index + latency_adjustment))

    history     = get_user_history(current_user)
    trend       = compute_trend(history)
    volatility  = compute_volatility(history)
    track_flips = compute_track_instability(history)

    explanation_data  = build_risk_explanation(student_data, risk)
    recommendation    = generate_recommendations(
        student_data.model_dump(), risk, stability_index,
        trend, volatility, track_flips, history
    )
    career_direction, insight = infer_career_direction(student_data)

    save_assessment(current_user, risk, stability_index, recommendation["track"])

    # Build result dict for explanation
    result_for_explanation = {
        "risk_level":        risk,
        "stability_index":   stability_index,
        "trend":             trend,
        "volatility":        volatility,
        "track":             recommendation["track"],
        "career_direction":  career_direction,
        "assessment_scores": scored["raw_scores"],
        "history":           history,
        "latency_analysis":  latency_analysis,
    }

    # Run explanation in background — don't block the response
    import asyncio
    ai_explanation = None
    try:
        ai_explanation = await asyncio.wait_for(
            generate_explanation(result_for_explanation), timeout=8.0
        )
    except asyncio.TimeoutError:
        logger.warning("Groq explanation timed out — returning result without explanation")
    weekly_tasks = parse_tasks_from_explanation(ai_explanation or "")
    full_result = {
        "risk_level": risk, "stability_score": round(stability_index, 2),
        "stability_index": stability_index, "trend": trend,
        "volatility": volatility, "track_flips": track_flips,
        "summary": explanation_data.get("summary", ""),
        "ai_explanation": ai_explanation,
        "recommendation": recommendation,
        "career_direction": career_direction,
        "insight": insight,
        "decision_scores": recommendation["decision_scores"],
        "history": history, "assessment_scores": scored["raw_scores"],
        "engine_inputs": engine_inputs, "latency_analysis": latency_analysis,
    }
    save_assessment(current_user, risk, stability_index, recommendation["track"], scan_result=full_result)
    logger.info(f"scan submitted user={current_user} track={recommendation['track']} latency_decisiveness={latency_analysis.get('decisiveness','n/a')}")

    return {
        "risk_level":        risk,
        "stability_score":   round(stability_index, 2),
        "stability_index":   stability_index,
        "trend":             trend,
        "volatility":        volatility,
        "track_flips":       track_flips,
        "reasons":           explanation_data["reasons"],
        "summary":           explanation_data.get("summary", ""),
        "ai_explanation":    ai_explanation,          # ← NEW
        "recommendation":    recommendation,
        "weekly_tasks": weekly_tasks,   # ← ADD THIS
        "career_direction":  career_direction,
        "insight":           insight,
        "decision_scores":   recommendation["decision_scores"],
        "history":           history,
        "assessment_scores": scored["raw_scores"],
        "engine_inputs":     engine_inputs,
        "latency_analysis":  latency_analysis,        # ← NEW
    }
@app.get("/user/latest-scan")
async def get_latest_scan(current_user: str = Depends(get_current_user)):
    history = get_user_history(current_user, limit=1)
    if not history:
        raise HTTPException(status_code=404, detail="No scan found")
    latest = history[0]
    # If full result was stored, return it directly
    if latest.get("scan_result"):
        result = latest["scan_result"]
        result["history"] = get_user_history(current_user)
        return result
    # Fallback for old records without scan_result
    all_history = get_user_history(current_user)
    trend      = compute_trend(all_history)
    volatility = compute_volatility(all_history)
    track_flips = compute_track_instability(all_history)
    student_data = StudentInput(
        cgpa=0, backlogs=0, tech_interest=3, core_interest=3,
        management_interest=3, confidence=3, career_changes=0,
        decision_time=6, current_status="student"
    )
    recommendation  = generate_recommendations(
        student_data.model_dump(), latest["risk_level"], latest["stability_score"],
        trend, volatility, track_flips, all_history
    )
    career_direction, insight = infer_career_direction(student_data)
    explanation_data = build_risk_explanation(student_data, latest["risk_level"])
    return {
        "risk_level": latest["risk_level"],
        "stability_score": round(latest["stability_score"], 2),
        "stability_index": latest["stability_score"],
        "trend": trend, "volatility": volatility, "track_flips": track_flips,
        "summary": explanation_data.get("summary", ""),
        "ai_explanation": None, "recommendation": recommendation,
        "career_direction": career_direction, "insight": insight,
        "decision_scores": recommendation["decision_scores"],
        "history": all_history, "assessment_scores": {},
        "engine_inputs": {}, "latency_analysis": {},
    }

# ═══════════════════════════════════════════════════════════════
# ADD this to backend/app.py — before the # ── Run ── line
# ═══════════════════════════════════════════════════════════════

class ChatRequest(BaseModel):
    message:  str = ""
    system:   str = ""
    history:  list = []
    messages: list = []  # alternative: array of {role, content}

@app.post("/chat")
async def chat_endpoint(
    data: ChatRequest,
    current_user: str = Depends(get_current_user)
):
    if data.messages:
        messages = [{"role": m["role"], "content": m["content"]} for m in data.messages]
    else:
        messages = [{"role": m["role"], "content": m["content"]} for m in (data.history or [])]
        if data.message:
            messages.append({"role": "user", "content": data.message})
    
    # Try AI first, fallback to demo response
    reply = await call_llm(messages, system=data.system or "", max_tokens=300, timeout=10.0)
    if not reply:
        # Demo fallback
        demo_responses = [
            "That's a great question! In a real implementation, the AI would analyze your input and provide a personalized response based on your profile and career goals.",
            "Based on your current skills, I'd recommend exploring roles in Software Development, Data Science, or AI/ML. Would you like more details?",
            "Your interview practice session went well! Focus on STAR method answers and maintain confident body language for your next session.",
            "I notice you've completed 3 courses this month. Keep up the momentum! Your technical skills are improving steadily.",
        ]
        import random
        reply = random.choice(demo_responses)
    return {"reply": reply}

class VoiceSession(BaseModel):
    transcript:         str  = ""
    summary:            str  = ""
    tab_warnings:       int  = 0
    tab_switches:       int  = 0   # alias — frontend may send either
    exchange_count:     int  = 0
    scores:             dict = {}
    overall:            int  = 0
    mode:               str  = "voice"
    forced_end:         bool = False
    questions_answered: int  = 0
    department:         str  = ""
    answers:            list = []


ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # Rachel - warm, emotional female

@app.post("/voice/tts")
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


@app.post("/voice/tts")
async def tts_endpoint(data: dict, current_user: str = Depends(get_current_user)):
    text = str(data.get("text", ""))[:500]
    if not text or not ELEVENLABS_API_KEY:
        raise HTTPException(status_code=503, detail="TTS unavailable")
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}",
                headers={"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"},
                json={"text": text, "model_id": "eleven_turbo_v2",
                      "voice_settings": {"stability": 0.4, "similarity_boost": 0.85, "style": 0.35, "use_speaker_boost": True}}
            )
            r.raise_for_status()
            from fastapi.responses import Response as FResponse
            return FResponse(content=r.content, media_type="audio/mpeg")
    except Exception as e:
        logger.warning(f"TTS failed: {e}")
        raise HTTPException(status_code=503, detail="TTS failed")

@app.post("/voice/save")
async def save_voice_session(
    data: VoiceSession,
    current_user: str = Depends(get_current_user)
):
    try:
        conn = get_connection()
        cur  = conn.cursor()
        import json as _json
        cur.execute("""
            INSERT INTO voice_sessions
              (email, transcript, summary, tab_warnings, exchange_count, scores, overall_score, mode, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
        """, (current_user, data.transcript, data.summary,
              data.tab_warnings, data.exchange_count,
              _json.dumps(data.scores), data.overall, data.mode))
        conn.commit(); cur.close(); conn.close()
        # ── Honor score: AI-score-driven ─────────────────────────────────────
        exchanges = data.exchange_count or 0
        overall   = data.overall or 0
        tab_warn  = data.tab_switches or data.tab_warnings or 0
        if data.mode == "hr_interview":
            if exchanges == 0:
                add_honor_event(current_user, "early_session_exit",
                                "HR skipped with 0 exchanges", override_delta=-3)
            elif data.forced_end or exchanges < 4:
                add_honor_event(current_user, "early_session_exit",
                                f"only {exchanges} exchanges in HR", override_delta=-3)
            else:
                d = +4 if overall >= 80 else (+3 if overall >= 65 else (+2 if overall >= 50 else -1))
                add_honor_event(current_user, "hr_session_complete",
                                f"overall={overall} exchanges={exchanges}", override_delta=d)
            # HR: every tab switch penalised (no cap), session force-ends at 3
            for _ in range(tab_warn):
                add_honor_event(current_user, "hr_tab_violation", "tab switch during HR interview")
        else:
            if exchanges == 0:
                # Zero exchanges = pure skip — always penalise
                add_honor_event(current_user, "early_session_exit",
                                "voice skipped with 0 exchanges", override_delta=-3)
            elif data.forced_end or exchanges < 3:
                add_honor_event(current_user, "early_session_exit",
                                f"voice abandoned after {exchanges} exchanges", override_delta=-3)
            else:
                d = +2 if overall >= 70 else +1
                add_honor_event(current_user, "voice_session_complete",
                                f"overall={overall}", override_delta=d)
            for _ in range(min(tab_warn, 3)):
                add_honor_event(current_user, "tab_switch_voice", "tab switch during voice")
        return {"message": "Voice session saved."}
    except Exception as e:
        logger.warning(f"voice save failed: {e}")
        return {"message": "Saved with warning."}


@app.get("/user/sessions")
async def get_user_sessions(current_user: str = Depends(get_current_user)):
    """Get user's voice sessions from database."""
    conn = get_connection()
    cur = conn.cursor()
    import json
    cur.execute("""
        SELECT DISTINCT id, summary, mode, overall_score, exchange_count, tab_warnings, created_at
        FROM voice_sessions WHERE email = ? ORDER BY created_at DESC LIMIT 20
    """, (current_user,))
    rows = cur.fetchall()
    
    sessions = []
    for r in rows:
        sc = {}
        try:
            sc = json.loads(r[3]) if r[3] else {}
        except:
            pass
        sessions.append({
            "id": r[0],
            "summary": r[1] or "",
            "mode": r[2] or "voice",
            "overall_score": r[3] or 0,
            "exchange_count": r[4] or 0,
            "tab_warnings": r[5] or 0,
            "created_at": r[6] if r[6] else ""
        })
    
    # Get user profile
    cur.execute("SELECT name, department, year, semester FROM users WHERE email = ?", (current_user,))
    urow = cur.fetchone()
    profile = {"name": urow[0] if urow else "", "dept": urow[1] if urow else "", "year": urow[2] if urow else "", "sem": urow[3] if urow else ""} if urow else {}
    
    cur.close()
    conn.close()
    return {"sessions": sessions, "profile": profile}


# ── Honor Score System ────────────────────────────────────
HONOR_RULES = {
    # Static events
    "course_marked_done":     +2,
    "scan_complete":          +3,
    "stability_improvement":  +3,
    "streak_30_days":         +2,
    "tab_switch_assessment":  -2,
    "tab_switch_voice":       -1,
    "early_session_exit":     -3,
    "low_scan_quality":       -2,
    "hr_tab_violation":       -2,
    "camera_off_violation":   -3,
    "admin_adjustment":        0,
    # Dynamic — override_delta passed at call site
    "voice_session_complete": 0,
    "hr_session_complete":    0,
}

def get_honor_score(email: str) -> int:
    try:
        conn = get_connection(); cur = conn.cursor()
        cur.execute("SELECT running_score FROM honor_events WHERE email = ? ORDER BY created_at DESC LIMIT 1", (email,))
        row = cur.fetchone(); cur.close(); conn.close()
        return row[0] if row else 100
    except: return 100

def add_honor_event(email: str, event_type: str, note: str = "",
                    override_delta: Optional[int] = None) -> dict:
    delta = override_delta if override_delta is not None else HONOR_RULES.get(event_type, 0)
    if delta == 0: return {"score": get_honor_score(email), "delta": 0}
    try:
        current = get_honor_score(email)
        new_score = max(0, min(200, current + delta))
        # Floor: never drop below 0, but log if dramatic drop
        if delta < -5:
            logger.warning(f"Large honor penalty: {email} delta={delta} new={new_score}")
        conn = get_connection(); cur = conn.cursor()
        cur.execute("""
            INSERT INTO honor_events (email, event_type, delta, running_score, note, created_at)
            VALUES (%s, %s, %s, %s, %s, NOW())
        """, (email, event_type, delta, new_score, note))
        conn.commit(); cur.close(); conn.close()
        return {"score": new_score, "delta": delta}
    except Exception as e:
        logger.warning(f"honor event failed: {e}")
        return {"score": get_honor_score(email), "delta": 0}

@app.get("/user/honor")
async def get_honor(current_user: str = Depends(get_current_user)):
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT event_type, delta, running_score, note, created_at
            FROM honor_events WHERE email = ? ORDER BY created_at DESC LIMIT 30
        """, (current_user,))
        rows = cur.fetchall()
        
        score = get_honor_score(current_user)
        events = []
        for r in rows:
            ca = r[4]
            events.append({
                "event_type": r[0],
                "delta": r[1],
                "running_score": r[2],
                "note": r[3] or "",
                "created_at": ca if ca else ""
            })
        
        cur.close()
        conn.close()
        return {"score": score, "events": events}
    except Exception as e:
        logger.warning(f"honor get failed: {e}")
        return {"score": 100, "events": []}

@app.post("/user/honor/event")
async def post_honor_event(data: dict, current_user: str = Depends(get_current_user)):
    event_type = data.get("event_type","")
    note       = data.get("note","")
    result     = add_honor_event(current_user, event_type, note)
    return result


@app.post("/courses/ai-recommend")
async def ai_course_recommend(data: dict, current_user: str = Depends(get_current_user)):
    try:
        dept       = data.get("dept", "")
        mode       = data.get("mode", "voice")
        scores     = data.get("scores", {})
        summary    = data.get("summary", "")
        track      = data.get("track", "")
        goal       = data.get("goal", "")

        weaknesses = []
        if scores:
            for k, v in scores.items():
                if isinstance(v, (int, float)) and v < 60:
                    labels = {"tech":"Technical Knowledge","comm":"Communication","crit":"Critical Thinking","pres":"Pressure Handling","lead":"Leadership"}
                    weaknesses.append(labels.get(k, k))

        prompt = f"""You are a career advisor for a student/professional using Mentorix AI.

User Profile:
- Department/Field: {dept or "Not specified"}
- Career Goal: {goal or "Not specified"}
- Session Type: {mode}
- Track: {track or "Not specified"}
- Weak Areas: {", ".join(weaknesses) if weaknesses else "General improvement needed"}
- Session Summary: {summary[:400] if summary else "No summary"}

Generate exactly 5 course recommendations. Mix free and paid. Include at least 2 with certificates.
Prioritize: Coursera, edX, NPTEL, Udemy, YouTube (freeCodeCamp/Traversy), MIT OpenCourseWare, LinkedIn Learning.

Respond ONLY with a JSON array. No explanation. No markdown. No backticks. Example format:
[
  {{
    "title": "Course Title",
    "provider": "Coursera",
    "url": "https://coursera.org/learn/example",
    "duration": "4 weeks",
    "level": "Beginner",
    "certificate": true,
    "free": false,
    "reason": "One sentence why this course fits this user"
  }}
]

Rules:
- URLs must be real working URLs from the actual platform
- Match courses to weak areas and department
- level must be one of: Beginner, Intermediate, Advanced
- duration format: X weeks or X hours
- certificate: true only if platform actually gives a certificate
- free: true for YouTube, NPTEL, MIT OCW, freeCodeCamp"""

        from llm_client import call_llm
        import json as _json

        result = await call_llm(
            messages=[{"role":"user","content":prompt}],
            system="You are a course recommendation engine. Output only valid JSON arrays.",
            max_tokens=1200,
            timeout=20
        )

        text = (result or "").strip()
        if "```" in text:
            text = text.split("```")[1].replace("json","").strip()
        courses = _json.loads(text)

        validated = []
        for course in courses[:6]:
            if "title" in course and "url" in course:
                validated.append({
                    "title":       course.get("title",""),
                    "provider":    course.get("provider",""),
                    "url":         course.get("url","#"),
                    "duration":    course.get("duration","Self-paced"),
                    "level":       course.get("level","Intermediate"),
                    "certificate": bool(course.get("certificate",False)),
                    "free":        bool(course.get("free",False)),
                    "reason":      course.get("reason","")
                })
        return {"courses": validated, "track": track or dept}

    except Exception as e:
        logger.warning(f"AI course recommend failed: {e}")
        return {"courses": [], "track": ""}




# ── Public: list institutions (for student login page) ───────────────────────
@app.get("/institutions")
def get_public_institutions():
    """No auth required — returns all institutions for student college selector."""
    conn = get_connection(); cur = conn.cursor()
    try:
        cur.execute("""
            SELECT id, name, contact_email, college_code, active
            FROM institutions
            WHERE active = TRUE OR active IS NULL
            ORDER BY name ASC
        """)
        rows = [{"id": r[0], "name": r[1], "contact_email": r[2] or "", "college_code": r[3] or ""} for r in cur.fetchall()]
        return {"institutions": rows}
    finally:
        cur.close(); conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN ENDPOINTS

def _safe_dt(v) -> str:
    """Convert datetime or TEXT timestamp to ISO string safely."""
    if v is None:
        return ""
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return str(v)
# ══════════════════════════════════════════════════════════════════════════════

def require_admin(current_user: str = Depends(get_current_user)):
    """Allow only the admin account — matches by email OR by name 'admin'."""
    # Demo mode: allow any email starting with admin@
    is_admin = (
        current_user.lower() == "admin@mentorix.ai"
        or current_user.lower().startswith("admin@")
    )
    if not is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


# Bootstrap extra tables + columns (simplified for SQLite)
def _ensure_extra_tables():
    # Tables are already created in database.py init_db()
    pass

try:
    _ensure_extra_tables()
except Exception as _ie:
    logger.warning(f"extra tables init: {_ie}")


# ── /admin/overview ───────────────────────────────────────────────────────────
@app.get("/admin/overview")
def admin_overview(admin: str = Depends(require_admin)):
    """Get admin overview stats from database."""
    conn = get_connection()
    cur = conn.cursor()
    
    # User count
    cur.execute("SELECT COUNT(*) FROM users")
    result = cur.fetchone()
    total_users = result[0] if result else 0
    
    # Session count
    cur.execute("SELECT COUNT(*) FROM voice_sessions")
    result = cur.fetchone()
    total_sessions = result[0] if result else 0
    
    # Active today
    cur.execute("SELECT COUNT(*) FROM users WHERE created_at >= date('now')")
    result = cur.fetchone()
    active_today = result[0] if result else 0
    
    # Avg score
    cur.execute("SELECT AVG(overall_score) FROM voice_sessions WHERE overall_score > 0")
    result = cur.fetchone()
    avg_score = round(float(result[0]), 1) if result and result[0] else 0
    
    # Honor avg
    cur.execute("SELECT AVG(running_score) FROM honor_events")
    result = cur.fetchone()
    avg_honor = int(result[0]) if result and result[0] else 100
    
    # Session breakdown
    cur.execute("SELECT mode, COUNT(*) FROM voice_sessions GROUP BY mode")
    rows = cur.fetchall() or []
    session_breakdown = {"voice": 0, "hr": 0}
    for r in rows:
        if r[0] == "hr_interview":
            session_breakdown["hr"] = r[1]
        else:
            session_breakdown["voice"] += r[1]
    
    # Recent activity
    cur.execute("""
        SELECT vs.id, COALESCE(u.name, vs.email) as name, vs.email, vs.mode, vs.created_at, vs.overall_score
        FROM voice_sessions vs
        LEFT JOIN users u ON u.email = vs.email
        ORDER BY vs.created_at DESC LIMIT 10
    """)
    rows = cur.fetchall() or []
    recent = []
    for r in rows:
        recent.append({
            "id": r[0],
            "name": r[1] or "—",
            "email": r[2],
            "action": r[3] or "voice",
            "time": r[4] or "",
            "detail": f"Score: {r[5] or '—'}"
        })
    
    cur.close()
    conn.close()
    
    return {
        "stats": {
            "total_users": total_users,
            "total_sessions": total_sessions,
            "active_7d": total_users // 3,  # Estimate
            "active_today": active_today,
            "avg_score": avg_score,
            "avg_honor": avg_honor,
            "hr_sessions": session_breakdown.get("hr", 0),
            "total_institutions": 0,
        },
        "recent_activity": recent,
        "registrations_by_day": [],
        "session_type_breakdown": session_breakdown,
    }


# ── /admin/users ──────────────────────────────────────────────────────────────
@app.get("/admin/users")
def admin_get_users(admin: str = Depends(require_admin)):
    """Get all users from database."""
    conn = get_connection()
    cur = conn.cursor()
    
    cur.execute("""
        SELECT u.id, u.name, u.email, u.department, u.year, u.semester,
               u.auth_provider, u.created_at, u.is_suspended,
               (SELECT COUNT(*) FROM voice_sessions WHERE email = u.email) as session_count,
               COALESCE((SELECT SUM(delta) FROM honor_events WHERE email = u.email), 0) as honor_score
        FROM users u
        ORDER BY u.created_at DESC
    """)
    
    rows = cur.fetchall() or []
    users = []
    for r in rows:
        users.append({
            "id": r[0],
            "name": r[1] or "",
            "email": r[2] or "",
            "department": r[3] or "",
            "year": r[4] or "",
            "semester": r[5] or "",
            "auth_provider": r[6] or "email",
            "created_at": r[7] or "",
            "is_suspended": bool(r[8]) if r[8] is not None else False,
            "session_count": r[9] or 0,
            "honor_score": r[10] or 0,
            "institution_id": 0,
            "institution_name": ""
        })
    
    cur.close()
    conn.close()
    return {"users": users}


@app.delete("/admin/users/by-email/{email:path}")
def admin_delete_user_by_email(email: str, admin: str = Depends(require_admin)):
    """Delete user by email — used by admin panel."""
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id FROM users WHERE email = ?", (email,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found.")
        uid = row[0]
        for tbl in ("voice_sessions", "honor_events", "assessments", "course_completions"):
            try:
                cur.execute(f"DELETE FROM {tbl} WHERE email = ?", (email,))
            except:
                pass
        cur.execute("DELETE FROM users WHERE id = ?", (uid,))
        conn.commit()
        return {"ok": True, "deleted": email}
    finally:
        cur.close()
        conn.close()


@app.delete("/admin/users/{user_id}")
def admin_delete_user(user_id: int, admin: str = Depends(require_admin)):
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT email FROM users WHERE id = ?", (user_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found.")
        email = row[0]
        cur.execute("DELETE FROM voice_sessions  WHERE email = ?", (email,))
        cur.execute("DELETE FROM honor_events    WHERE email = ?", (email,))
        cur.execute("DELETE FROM assessments     WHERE email = ?", (email,))
        cur.execute("DELETE FROM course_completions WHERE email = ?", (email,))
        cur.execute("DELETE FROM users           WHERE id    = %s", (user_id,))
        conn.commit()
        return {"ok": True, "deleted_email": email}
    finally:
        cur.close(); conn.close()


# ── /admin/users/{id}/suspend ────────────────────────────────────────────────
class SuspendPatch(BaseModel):
    suspended: bool

@app.patch("/admin/users/{user_id}/suspend")
def admin_suspend_user(user_id: int, data: SuspendPatch, admin: str = Depends(require_admin)):
    conn = get_connection(); cur = conn.cursor()
    try:
        cur.execute("UPDATE users SET is_suspended=%s WHERE id = ? RETURNING email",
                    (data.suspended, user_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found.")
        conn.commit()
        logger.info(f"User {row[0]} {'suspended' if data.suspended else 'reinstated'} by admin")
        return {"ok": True, "email": row[0], "suspended": data.suspended}
    finally:
        cur.close(); conn.close()


# ── /admin/sessions ───────────────────────────────────────────────────────────
@app.get("/admin/sessions")
def admin_get_sessions(admin: str = Depends(require_admin)):
    """Get all voice sessions from database."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT vs.id, COALESCE(u.name, vs.email) as user_name, vs.email as user_email,
               vs.mode, vs.created_at, vs.exchange_count, vs.overall_score, vs.tab_warnings,
               COALESCE(i.name, 'Independent') as institution_name, u.department
        FROM voice_sessions vs
        LEFT JOIN users u ON u.email = vs.email
        LEFT JOIN institutions i ON i.id = u.institution_id
        ORDER BY vs.created_at DESC LIMIT 100
    """)
    
    rows = cur.fetchall() or []
    sessions = []
    for r in rows:
        sessions.append({
            "id": r[0],
            "user_name": r[1] or "—",
            "user_email": r[2] or "",
            "mode": r[3] or "voice",
            "created_at": r[4] or "",
            "exchange_count": r[5] or 0,
            "overall_score": r[6] or 0,
            "tab_warnings": r[7] or 0,
            "institution_name": r[8] or "Independent",
            "department": r[9] or ""
        })
    
    cur.close()
    conn.close()
    return {"sessions": sessions}


@app.delete("/admin/sessions/{session_id}")
def admin_delete_session(session_id: int, admin: str = Depends(require_admin)):
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM voice_sessions WHERE id = ?", (session_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Session not found.")
        conn.commit()
        return {"ok": True}
    finally:
        cur.close()
        conn.close()


# ── /admin/institutions ───────────────────────────────────────────────────────
@app.get("/admin/institutions")
def admin_get_institutions(admin: str = Depends(require_admin)):
    """Get all institutions from database."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, name, contact_email, env, college_code, active, created_at FROM institutions ORDER BY created_at DESC")
    
    rows = cur.fetchall() or []
    institutions = []
    for r in rows:
        institutions.append({
            "id": r[0],
            "name": r[1] or "",
            "contact_email": r[2] or "",
            "env": r[3] or "dev",
            "college_code": r[4] or "",
            "active": bool(r[5]) if r[5] is not None else True,
            "created_at": r[6] or ""
        })
    
    cur.close()
    conn.close()
    return {"institutions": institutions}


class InstitutionCreate(BaseModel):
    name: str
    contact_email: Optional[str] = None
    env: Optional[str] = "dev"
    college_code: Optional[str] = None
    active: Optional[bool] = True


@app.post("/admin/institutions")
def admin_create_institution(data: InstitutionCreate, admin: str = Depends(require_admin)):
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO institutions (name, contact_email, env, college_code, active) VALUES (?, ?, ?, ?, ?)",
            (data.name.strip(), data.contact_email or None, data.env or "dev",
             (data.college_code or "").strip() or None, 1 if data.active is not None else 1)
        )
        new_id = cur.lastrowid
        conn.commit()
        return {"ok": True, "id": new_id}
    finally:
        cur.close()
        conn.close()


class InstitutionPatch(BaseModel):
    env:           Optional[str]  = None
    name:          Optional[str]  = None
    contact_email: Optional[str]  = None
    college_code:  Optional[str]  = None
    active:        Optional[bool] = None


@app.patch("/admin/institutions/{inst_id}")
def admin_patch_institution(inst_id: int, data: InstitutionPatch, admin: str = Depends(require_admin)):
    conn = get_connection()
    cur = conn.cursor()
    try:
        updates, vals = [], []
        if data.env is not None:
            if data.env not in ("dev", "prod"):
                raise HTTPException(status_code=400, detail="env must be 'dev' or 'prod'")
            updates.append("env = ?"); vals.append(data.env)
        if data.name is not None:
            updates.append("name = ?"); vals.append(data.name.strip())
        if data.contact_email is not None:
            updates.append("contact_email = ?"); vals.append(data.contact_email)
        if data.college_code is not None:
            updates.append("college_code = ?"); vals.append((data.college_code or "").strip() or None)
        if data.active is not None:
            updates.append("active = ?"); vals.append(1 if data.active else 0)
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update.")
        vals.append(inst_id)
        cur.execute(f"UPDATE institutions SET {', '.join(updates)} WHERE id = ?", vals)
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Institution not found.")
        conn.commit()
        return {"ok": True}
    finally:
        cur.close(); conn.close()




class ServiceToggleRequest(BaseModel):
    active: bool

@app.patch("/admin/institutions/{inst_id}/service")
def admin_toggle_service(inst_id: int, data: ServiceToggleRequest, admin: str = Depends(require_admin)):
    """Toggle whether an institution's service is active."""
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE institutions SET active = ? WHERE id = ?", (1 if data.active else 0, inst_id))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Institution not found.")
        conn.commit()
        
        cur.execute("SELECT name FROM institutions WHERE id = ?", (inst_id,))
        row = cur.fetchone()
        status = "activated" if data.active else "deactivated"
        logger.info(f"Institution {row[0] if row else inst_id} (id={inst_id}) service {status} by admin")
        return {"ok": True, "id": inst_id, "active": data.active}
    finally:
        cur.close()
        conn.close()

@app.patch("/admin/institutions/{inst_id}/toggle")
def admin_toggle_institution(inst_id: int, admin: str = Depends(require_admin)):
    """Toggle institution active/inactive (prod = active, dev = inactive)."""
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT env FROM institutions WHERE id = ?", (inst_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Institution not found.")
        new_env = "dev" if row[0] == "prod" else "prod"
        cur.execute("UPDATE institutions SET env = ? WHERE id = ?", (new_env, inst_id))
        conn.commit()
        return {"ok": True, "id": inst_id, "env": new_env, "active": new_env == "prod"}
    finally:
        cur.close()
        conn.close()


@app.delete("/admin/institutions/{inst_id}")
def admin_delete_institution(inst_id: int, admin: str = Depends(require_admin)):
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM institutions WHERE id = ?", (inst_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Institution not found.")
        conn.commit()
        return {"ok": True}
    finally:
        cur.close()
        conn.close()


# ── /admin/honor ──────────────────────────────────────────────────────────────
@app.get("/admin/honor")
def admin_get_honor(admin: str = Depends(require_admin)):
    """Get honor leaderboard from database."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT u.name, u.email, u.department,
               COALESCE(i.name, 'Independent') as institution_name,
               COALESCE(SUM(he.delta), 0) as total_score,
               COUNT(he.id) as event_count,
               MAX(he.created_at) as last_event
        FROM users u
        LEFT JOIN honor_events he ON he.email = u.email
        LEFT JOIN institutions i ON i.id = u.institution_id
        GROUP BY u.name, u.email, u.department, i.name
        ORDER BY total_score DESC
    """)
    
    rows = cur.fetchall() or []
    honor = []
    for r in rows:
        honor.append({
            "name": r[0] or "",
            "email": r[1] or "",
            "department": r[2] or "",
            "institution_name": r[3] or "Independent",
            "total_score": r[4] or 0,
            "event_count": r[5] or 0,
            "last_event": r[6] or ""
        })
    
    cur.close()
    conn.close()
    return {"honor": honor}


# ── /admin/analytics ──────────────────────────────────────────────────────────
@app.get("/admin/analytics")
def admin_analytics(admin: str = Depends(require_admin)):
    conn = get_connection(); cur = conn.cursor()
    try:
        cur.execute("""
            SELECT
                COUNT(CASE WHEN overall_score BETWEEN 0  AND 20  THEN 1 END),
                COUNT(CASE WHEN overall_score BETWEEN 21 AND 40  THEN 1 END),
                COUNT(CASE WHEN overall_score BETWEEN 41 AND 60  THEN 1 END),
                COUNT(CASE WHEN overall_score BETWEEN 61 AND 80  THEN 1 END),
                COUNT(CASE WHEN overall_score BETWEEN 81 AND 100 THEN 1 END)
            FROM voice_sessions WHERE overall_score IS NOT NULL
        """)
        row = cur.fetchone() or (0, 0, 0, 0, 0)
        score_distribution = [
            {"range": "0-20",   "count": row[0]},
            {"range": "21-40",  "count": row[1]},
            {"range": "41-60",  "count": row[2]},
            {"range": "61-80",  "count": row[3]},
            {"range": "81-100", "count": row[4]},
        ]

        cur.execute("""
            SELECT u.department,
                   ROUND(AVG(vs.overall_score)::numeric, 1) AS avg_score,
                   COUNT(*) AS sessions
            FROM voice_sessions vs
            JOIN users u ON u.email = vs.email
            WHERE u.department IS NOT NULL AND vs.overall_score IS NOT NULL
            GROUP BY u.department
        """)
        dept_breakdown = {
            r[0]: {"avg_score": float(r[1]) if r[1] else 0, "sessions": r[2]}
            for r in cur.fetchall()
        }

        cur.execute("""
            SELECT DATE(created_at) AS day, COUNT(*) AS sessions
            FROM voice_sessions WHERE created_at >= NOW() - INTERVAL '28 days'
            GROUP BY day ORDER BY day
        """)
        weekly_activity = [{"day": str(r[0]), "sessions": r[1]} for r in cur.fetchall()]

        cur.execute("""
            SELECT u.name, u.email, u.department,
                   COUNT(vs.id) AS session_count,
                   ROUND(AVG(vs.overall_score)::numeric, 1) AS avg_score
            FROM users u
            JOIN voice_sessions vs ON vs.email = u.email
            GROUP BY u.name, u.email, u.department
            ORDER BY session_count DESC LIMIT 10
        """)
        cols = [d[0] for d in (cur.description or [])]
        top_users = []
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            if d.get("avg_score"): d["avg_score"] = float(d["avg_score"])
            top_users.append(d)

        return {
            "score_distribution": score_distribution,
            "dept_breakdown":     dept_breakdown,
            "weekly_activity":    weekly_activity,
            "top_users":          top_users,
        }
    finally:
        cur.close(); conn.close()


# ── /admin/logs ───────────────────────────────────────────────────────────────
_admin_log_buffer: list = []

class _AdminLogHandler(logging.Handler):
    _fmt = logging.Formatter()

    def emit(self, record):
        _admin_log_buffer.append({
            "time":    self._fmt.formatTime(record),
            "level":   record.levelname,
            "message": record.getMessage(),
        })
        if len(_admin_log_buffer) > 300:
            _admin_log_buffer.pop(0)

_alh = _AdminLogHandler()
_alh.setLevel(logging.INFO)
logging.getLogger("mentorix-api").addHandler(_alh)




# ════════════════════════════════════════════════════════════════════════════════
# ADMIN AI COMMAND ENGINE
# ════════════════════════════════════════════════════════════════════════════════

class AdminAiRequest(BaseModel):
    command: str
    confirm: bool = False   # True = actually execute, False = dry-run preview

@app.post("/admin/ai-command")
async def admin_ai_command(
    data: AdminAiRequest,
    admin: str = Depends(require_admin)
):
    """
    Natural language admin commands.
    Pass confirm=False for a preview/plan, confirm=True to execute.
    """
    import json as _json

    conn = get_connection()
    cur  = conn.cursor()

    # ── 1. Fetch live context so the LLM knows what's in the DB ──────────────
    users, insts, sessions, honor = [], [], [], []
    try:
        cur.execute("SELECT id, name, email, auth_provider, created_at, institution_id FROM users ORDER BY created_at DESC LIMIT 200")
        cols  = [d[0] for d in (cur.description or [])]
        users = [dict(zip(cols, r)) for r in (cur.fetchall() or [])]
    except Exception as e:
        conn.rollback()
        logger.warning(f"AI context users fetch error: {e}")
    try:
        cur.execute("SELECT id, name, env, contact_email FROM institutions")
        cols  = [d[0] for d in (cur.description or [])]
        insts = [dict(zip(cols, r)) for r in (cur.fetchall() or [])]
    except Exception as e:
        conn.rollback()
        logger.warning(f"AI context insts fetch error: {e}")
    try:
        cur.execute("SELECT id, email, exchange_count, overall_score, mode, created_at FROM voice_sessions ORDER BY created_at DESC LIMIT 100")
        cols     = [d[0] for d in (cur.description or [])]
        sessions = [dict(zip(cols, r)) for r in (cur.fetchall() or [])]
    except Exception as e:
        conn.rollback()
        logger.warning(f"AI context sessions fetch error: {e}")
    try:
        cur.execute("""
            SELECT email, COALESCE(SUM(delta), 0) AS score
            FROM honor_events GROUP BY email ORDER BY score DESC LIMIT 50
        """)
        honor = [{"email": r[0], "score": r[1]} for r in (cur.fetchall() or [])]
    except Exception as e:
        conn.rollback()
        logger.warning(f"AI context honor fetch error: {e}")

    context_summary = f"""
CURRENT DATABASE STATE:
- Total users: {len(users)}
- Institutions: {[i['name'] for i in insts]}
- Recent sessions: {len(sessions)}

USERS (sample, max 200):
{_json.dumps(users[:50], default=str, indent=2)}

ALL INSTITUTIONS:
{_json.dumps(insts, default=str, indent=2)}

HONOR SCORES (top 50):
{_json.dumps(honor, default=str, indent=2)}
"""

    # ── 2. Ask LLM to interpret the command and produce an action plan ────────
    system_prompt = """You are an AI admin assistant for Mentorix AI. You MUST respond with ONLY a valid JSON object — no explanation, no markdown, no text before or after the JSON.

Given a natural language command about managing users, institutions, sessions, or honor scores:
1. Understand what the admin wants
2. Return a JSON action plan
3. Be conservative — prefer listing over deleting

AVAILABLE ACTIONS (use exactly these action types):
- list_users: filter and show users (params: filter_by, value, operator)
- delete_user: delete a specific user (params: email)
- bulk_delete_users: delete multiple users (params: emails list)
- suspend_user: suspend a user (params: email)
- unsuspend_user: unsuspend a user (params: email)
- list_sessions: show sessions (params: filter_by, value)
- delete_session: delete a session (params: session_id)
- list_institutions: show institutions
- add_institution: add institution (params: name, env, contact_email)
- delete_institution: delete institution (params: institution_id)
- toggle_institution: toggle dev/prod (params: institution_id)
- show_honor: show honor scores (params: filter_by, value)
- adjust_honor: manually adjust honor (params: email, delta, reason)
- show_stats: show platform statistics
- search: search across users/sessions (params: query)

Respond ONLY with valid JSON in this exact format:
{
  "understood": "plain English summary of what you understood",
  "plan": [
    {
      "action": "action_type",
      "description": "what this step does in plain English",
      "params": { ... },
      "affected_count": N,
      "affected_items": ["email1", "email2"]
    }
  ],
  "warning": "optional warning if destructive",
  "safe_to_execute": true/false
}

IMPORTANT RULES:
- For delete operations, ALWAYS list what will be deleted first
- If the command is ambiguous, ask for clarification via understood field
- Never delete all users or all sessions unless explicitly confirmed with exact wording
- institution_id values must come from the provided institutions list
- Email matching should be case-insensitive
"""

    user_prompt = f"""ADMIN COMMAND: "{data.command}"

CONFIRM MODE: {"EXECUTE" if data.confirm else "DRY RUN — just show the plan, do not execute"}

DATABASE CONTEXT:
{context_summary}

Produce the action plan JSON."""

    plan_text = ""
    plan_text = ""
    plan = None
    try:
        plan_text = await call_llm(
            [{"role": "user", "content": user_prompt}],
            system=system_prompt,
            max_tokens=2000,
            timeout=30.0
        )
        plan_text = (plan_text or "").strip()

        # Extract JSON from response — handle markdown fences and surrounding text
        import re as _re
        # Try to find JSON object in the response
        json_match = _re.search(r'\{[\s\S]*\}', plan_text)
        if json_match:
            plan = _json.loads(json_match.group(0))
        else:
            # Strip markdown fences manually
            cleaned = plan_text
            if "```" in cleaned:
                parts = cleaned.split("```")
                for part in parts:
                    part = part.strip()
                    if part.startswith("json"):
                        part = part[4:].strip()
                    try:
                        plan = _json.loads(part)
                        break
                    except Exception:
                        continue
            if not plan:
                plan = _json.loads(plan_text)

    except Exception as e:
        logger.error(f"AI command parse error: {e} | raw: {plan_text[:300]}")
        # Fallback: build a safe show_stats plan so something always works
        plan = {
            "understood": f"I understood: {data.command}",
            "plan": [{"action": "show_stats", "description": "Show platform statistics", "params": {}, "affected_count": 0, "affected_items": []}],
            "warning": "",
            "safe_to_execute": True
        }
        logger.info("AI command using fallback show_stats plan")

    # ── 3. If dry run, return plan without executing ──────────────────────────
    if not data.confirm:
        return {
            "mode":       "preview",
            "understood": plan.get("understood", ""),
            "plan":       plan.get("plan", []),
            "warning":    plan.get("warning", ""),
            "safe":       plan.get("safe_to_execute", True),
            "message":    "This is a preview. Send with confirm=true to execute."
        }

    # ── 4. Execute the plan ───────────────────────────────────────────────────
    results = []

    for step in plan.get("plan", []):
        action  = step.get("action", "")
        params  = step.get("params", {})
        outcome = {"action": action, "description": step.get("description", ""), "result": "ok", "data": None}

        try:
            # ── Read actions ──────────────────────────────────────────────────
            if action == "list_users":
                filter_by = params.get("filter_by", "")
                value     = str(params.get("value", "")).strip()

                if filter_by == "institution_id":
                    if value in ("", "null", "None", "0"):
                        cur.execute("SELECT id,name,email,auth_provider,created_at,institution_id FROM users WHERE institution_id IS NULL ORDER BY created_at DESC LIMIT 50")
                    else:
                        try:
                            cur.execute("SELECT id,name,email,auth_provider,created_at,institution_id FROM users WHERE institution_id = %s ORDER BY created_at DESC LIMIT 50", (int(value),))
                        except ValueError:
                            cur.execute("SELECT id,name,email,auth_provider,created_at,institution_id FROM users ORDER BY created_at DESC LIMIT 50")
                elif filter_by == "email" and value:
                    cur.execute("SELECT id,name,email,auth_provider,created_at,institution_id FROM users WHERE email ILIKE %s ORDER BY created_at DESC LIMIT 50", (f"%{value}%",))
                elif filter_by == "name" and value:
                    cur.execute("SELECT id,name,email,auth_provider,created_at,institution_id FROM users WHERE name ILIKE %s ORDER BY created_at DESC LIMIT 50", (f"%{value}%",))
                elif filter_by and value:
                    allowed = {"email", "name", "auth_provider"}
                    if filter_by in allowed:
                        cur.execute(f"SELECT id,name,email,auth_provider,created_at,institution_id FROM users WHERE {filter_by} ILIKE %s ORDER BY created_at DESC LIMIT 50", (f"%{value}%",))
                    else:
                        cur.execute("SELECT id,name,email,auth_provider,created_at,institution_id FROM users ORDER BY created_at DESC LIMIT 50")
                else:
                    cur.execute("SELECT id,name,email,auth_provider,created_at,institution_id FROM users ORDER BY created_at DESC LIMIT 50")
            elif action == "show_stats":
                cur.execute("SELECT COUNT(*) FROM users")
                total_users = (cur.fetchone() or (0,))[0]
                cur.execute("SELECT COUNT(*) FROM voice_sessions")
                total_sessions = (cur.fetchone() or (0,))[0]
                cur.execute("SELECT AVG(overall_score) FROM voice_sessions WHERE overall_score > 0")
                avg = cur.fetchone()
                outcome["data"] = {
                    "total_users": total_users,
                    "total_sessions": total_sessions,
                    "avg_score": round(float(avg[0]), 1) if avg and avg[0] else 0
                }

            elif action == "search":
                q = params.get("query", "")
                cur.execute(
                    "SELECT id,name,email,institution_id FROM users WHERE email ILIKE %s OR name ILIKE %s LIMIT 50",
                    (f"%{q}%", f"%{q}%")
                )
                cols = [d[0] for d in (cur.description or [])]
                outcome["data"] = [dict(zip(cols, r)) for r in cur.fetchall()]

            elif action == "list_sessions":
                cur.execute("SELECT id,user_email,exchange_count,overall_score,mode,created_at FROM voice_sessions ORDER BY created_at DESC LIMIT 50")
                cols = [d[0] for d in (cur.description or [])]
                outcome["data"] = [dict(zip(cols, r)) for r in cur.fetchall()]

            elif action == "list_institutions":
                cur.execute("SELECT id,name,env,contact_email FROM institutions")
                cols = [d[0] for d in (cur.description or [])]
                outcome["data"] = [dict(zip(cols, r)) for r in cur.fetchall()]

            elif action == "show_honor":
                filter_by = params.get("filter_by", "")
                value     = params.get("value", "")
                if filter_by == "email":
                    cur.execute("""
                        SELECT email, COALESCE(SUM(delta),0) AS score
                        FROM honor_events WHERE email ILIKE %s GROUP BY email
                    """, (f"%{value}%",))
                else:
                    cur.execute("""
                        SELECT email, COALESCE(SUM(delta),0) AS score
                        FROM honor_events GROUP BY email ORDER BY score DESC LIMIT 50
                    """)
                outcome["data"] = [{"email": r[0], "score": r[1]} for r in (cur.fetchall() or [])]

            # ── Write actions ─────────────────────────────────────────────────
            elif action == "delete_user":
                email = params.get("email", "")
                if not email:
                    outcome["result"] = "error"; outcome["data"] = "No email provided"
                else:
                    cur.execute("DELETE FROM users WHERE email = ?", (email.lower(),))
                    conn.commit()
                    outcome["data"] = f"Deleted user: {email}"
                    logger.info(f"AI admin deleted user {email}")

            elif action == "bulk_delete_users":
                emails = params.get("emails", [])
                deleted = []
                for email in emails:
                    cur.execute("DELETE FROM users WHERE email = ?", (email.lower(),))
                    deleted.append(email)
                conn.commit()
                outcome["data"] = f"Deleted {len(deleted)} users: {deleted}"
                logger.info(f"AI admin bulk deleted {len(deleted)} users")

            elif action == "suspend_user":
                email = params.get("email", "")
                cur.execute("UPDATE users SET suspended = TRUE WHERE email = ?", (email.lower(),))
                conn.commit()
                outcome["data"] = f"Suspended: {email}"

            elif action == "unsuspend_user":
                email = params.get("email", "")
                cur.execute("UPDATE users SET suspended = FALSE WHERE email = ?", (email.lower(),))
                conn.commit()
                outcome["data"] = f"Unsuspended: {email}"

            elif action == "delete_session":
                sid = params.get("session_id")
                cur.execute("DELETE FROM voice_sessions WHERE id = ?", (sid,))
                conn.commit()
                outcome["data"] = f"Deleted session {sid}"

            elif action == "add_institution":
                name  = params.get("name", "")
                env   = params.get("env", "dev")
                email = params.get("contact_email", "")
                cur.execute(
                    "INSERT INTO institutions (name, env, contact_email) VALUES (%s, %s, %s) RETURNING id",
                    (name, env, email)
                )
                row = cur.fetchone()
                new_id = row[0] if row else None
                conn.commit()
                outcome["data"] = f"Added institution '{name}' with id {new_id}"

            elif action == "delete_institution":
                inst_id = params.get("institution_id")
                cur.execute("DELETE FROM institutions WHERE id = ?", (inst_id,))
                conn.commit()
                outcome["data"] = f"Deleted institution {inst_id}"

            elif action == "toggle_institution":
                inst_id = params.get("institution_id")
                cur.execute("SELECT env FROM institutions WHERE id = ?", (inst_id,))
                row = cur.fetchone()
                if row:
                    new_env = "prod" if row[0] == "dev" else "dev"
                    cur.execute("UPDATE institutions SET env = %s WHERE id = ?", (new_env, inst_id))
                    conn.commit()
                    outcome["data"] = f"Institution {inst_id} toggled to {new_env}"

            elif action == "adjust_honor":
                email  = params.get("email", "")
                delta  = int(params.get("delta", 0))
                reason = params.get("reason", "admin adjustment")
                add_honor_event(email, "admin_adjustment", reason, override_delta=delta)
                outcome["data"] = f"Honor adjusted for {email} by {delta:+d} ({reason})"

            else:
                outcome["result"] = "skipped"
                outcome["data"]   = f"Unknown action: {action}"

        except Exception as e:
            conn.rollback()
            outcome["result"] = "error"
            outcome["data"]   = str(e)
            logger.error(f"AI admin action {action} failed: {e}")

        results.append(outcome)

    # ── 5. Ask LLM to summarise what happened ─────────────────────────────────
    try:
        summary_prompt = f"""The admin ran this command: "{data.command}"
These actions were executed: {_json.dumps(results, default=str)}
Write a clear 1-3 sentence plain English summary of what was done and the outcome. Be specific about counts and names."""
        summary = await call_llm(
            [{"role": "user", "content": summary_prompt}],
            system="You are a helpful admin assistant. Give concise action summaries.",
            max_tokens=200,
            timeout=10.0
        )
    except Exception:
        summary = f"Executed {len(results)} action(s)."

    cur.close()
    conn.close()

    return {
        "mode":       "executed",
        "understood": plan.get("understood", ""),
        "results":    results,
        "summary":    summary,
        "warning":    plan.get("warning", ""),
    }


@app.get("/admin/llm-stats")
def admin_llm_stats(admin: str = Depends(require_admin)):
    """Return LLM usage stats and recent call log for admin panel."""
    try:
        from llm_client import get_llm_stats
        return get_llm_stats()
    except Exception as e:
        return {"calls": 0, "success_rate": 100, "avg_latency_ms": 0,
                "model_usage": {}, "recent": [], "error": str(e)}

@app.get("/admin/logs")
def admin_logs(admin: str = Depends(require_admin)):
    return {"logs": list(reversed(_admin_log_buffer))}


# ═════════════════════════════════════════════════════════════════════════════


# ── /admin/setup — create or reset the admin account ─────────────────────────
class AdminSetup(BaseModel):
    secret: str          # must match ADMIN_SETUP_SECRET env var
    email: str
    password: str
    name: str = "Admin"

@app.post("/admin/setup")
async def admin_setup(data: AdminSetup):
    return await _do_admin_setup(data.secret, data.email, data.password, data.name)

@app.get("/admin/setup")
async def admin_setup_get(secret: str, email: str, password: str, name: str = "Admin"):
    """GET version — call from browser: /admin/setup?secret=X&email=Y&password=Z"""
    return await _do_admin_setup(secret, email, password, name)

async def _do_admin_setup(secret: str, email: str, password: str, name: str):
    import bcrypt as _bc
    expected = os.getenv("ADMIN_SETUP_SECRET", "mentorix-setup-2025")
    if secret != expected:
        raise HTTPException(status_code=403, detail="Invalid setup secret.")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 chars.")
    try:
        pw_hash = _bc.hashpw(password.encode(), _bc.gensalt()).decode()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"bcrypt error: {e}")
    conn = get_connection(); cur = conn.cursor()
    try:
        # UPSERT — works whether admin exists or not
        cur.execute("""
            INSERT INTO users (email, password_hash, name, auth_provider)
            VALUES (%s, %s, %s, 'email')
            ON CONFLICT (email)
            DO UPDATE SET password_hash = EXCLUDED.password_hash,
                          name = EXCLUDED.name,
                          auth_provider = 'email'
        """, (email.lower().strip(), pw_hash, name))
        conn.commit()
        token = create_token(email.lower().strip())
        return {"ok": True, "email": email, "message": "Admin ready — log in to cronix-admin.html", "token": token}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"DB error: {e}")
    finally:
        cur.close(); conn.close()



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

def _bytez_run(model, input_data):
    """
    Bytez SDK .run() returns a Generator — call next() to get the result.
    Returns object with .error and .output attributes.
    Wraps in try/except so any generator exhaustion is handled cleanly.
    """
    gen = model.run(input_data)
    return next(gen)

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
        result = _bytez_run(_posture_model, req.image_b64)
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


@app.post("/bytez/similarity")
async def bytez_similarity(req: _SimilarityReq, _u=Depends(get_current_user)):
    """
    Score answer quality via sentence embeddings (BAAI/bge-small-en-v1.5).
    Returns: { score: int (30-95), source: "bytez" | "llm_fallback" }
    """
    try:
        r1 = _bytez_run(_embed_model, req.candidate)
        r2 = _bytez_run(_embed_model, req.ideal)
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

if __name__ == "__main__":
    import uvicorn
    is_render = os.getenv("RENDER") is not None
    host      = "0.0.0.0" if is_render else "127.0.0.1"
    port      = int(os.getenv("PORT", "10000")) if is_render else 8000
    reload    = not is_render
    logger.info(f"Starting server on {host}:{port}")
    uvicorn.run("app:app", host=host, port=port, reload=reload)