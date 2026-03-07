import logging
import os
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
                      get_completion_stats,migrate_db,
                      get_connection)
from explainer import generate_explanation, score_latency
# ── App ─────────────────────────────────────────────────────────
app = FastAPI(title="Mentorix AI")

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("mentorix-api")

init_db()
try:
    from database import migrate_voice_sessions; migrate_voice_sessions()
except: pass
migrate_db()

MODEL_PATH = os.path.join(os.path.dirname(__file__), "model", "risk_model.pkl")
model = None

try:
    with open(MODEL_PATH, "rb") as f:
        model = pickle.load(f)
    logger.info(f"Model loaded from {MODEL_PATH}")
except Exception as e:
    logger.exception("Failed to load ML model")
    raise RuntimeError("Model file missing or corrupted.") from e

# ── CORS ─────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Bearer token security ────────────────────────────────────────
bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)
) -> str:
    """Extract and verify JWT. Returns email or raises 401."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required. Please log in.")
    email = extract_email_from_token(credentials.credentials)
    if not email:
        raise HTTPException(status_code=401, detail="Invalid or expired token. Please log in again.")
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
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
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
        "UPDATE users SET name = %s WHERE email = %s",
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
async def google_callback(code: Optional[str] = None, error: Optional[str] = None, request: Optional[Request] = None):
    from fastapi.responses import RedirectResponse

    if error or not code:
        return RedirectResponse(f"{FRONTEND_URL}/login.html?error=google_cancelled")

    redirect_uri = get_google_redirect_uri(request)
    user_info    = await exchange_google_code(code, redirect_uri)

    if not user_info or not user_info.get("email"):
        return RedirectResponse(f"{FRONTEND_URL}/login.html?error=google_failed")

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
        f"{FRONTEND_URL}/login.html"
        f"?token={token}"
        f"&email={user_info['email']}"
        f"&name={name}"
        f"&provider=google"
    )
class RegisterRequest(BaseModel):
    name:     str
    email:    EmailStr
    password: str

class LoginRequest(BaseModel):
    email:    EmailStr
    password: str

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
    import bcrypt
    user = get_user_by_email(data.email)
    if not user:
        raise HTTPException(status_code=401, detail="No account found with this email. Please create an account.")

    if user.get("auth_provider") == "google":
        raise HTTPException(status_code=400, detail="This email uses Google sign-in. Please use Continue with Google.")

    pw_hash = user.get("password_hash", "")
    if not pw_hash:
        raise HTTPException(status_code=401, detail="Invalid credentials.")

    try:
        valid = bcrypt.checkpw(data.password.encode(), pw_hash.encode())
    except Exception:
        valid = False

    if not valid:
        raise HTTPException(status_code=401, detail="Incorrect password. Please try again.")

    token = create_token(data.email)
    logger.info(f"user logged in email={data.email}")
    return {"token": token, "name": user.get("name") or data.email.split("@")[0], "email": data.email}

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
    stats       = get_completion_stats(current_user)
    return {
        "completions": completions,
        "stats":       stats,
    }
@app.get("/user/history")
def user_history(current_user: str = Depends(get_current_user)):
    history = get_user_history(current_user)
    return {"history": history, "count": len(history)}
@app.post("/user/profile")
async def save_profile(data: dict, current_user: str = Depends(get_current_user)):
    conn = get_connection(); cur = conn.cursor()
    cur.execute("""UPDATE users SET department=%s, year=%s, semester=%s WHERE email=%s""",
      (data.get("dept",""), data.get("year",""), data.get("sem",""), current_user))
    conn.commit(); cur.close(); conn.close()
    return {"message": "Profile saved"}
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
    message: str
    system:  str = ""
    history: list = []

@app.post("/chat")
async def chat_endpoint(
    data: ChatRequest,
    current_user: str = Depends(get_current_user)
):
    messages = [{"role": m["role"], "content": m["content"]} for m in (data.history or [])]
    messages.append({"role": "user", "content": data.message})
    
    reply = await call_llm(messages, system=data.system or "", max_tokens=300, timeout=10.0)
    if not reply:
        raise HTTPException(status_code=503, detail="AI service unavailable")
    return {"reply": reply}

class VoiceSession(BaseModel):
    transcript:     str = ""
    summary:        str = ""
    tab_warnings:   int = 0
    exchange_count: int = 0
    scores:         dict = {}
    overall:        int  = 0
    mode:           str  = "voice"

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
        # Fire honor event
        event = "hr_session_complete" if data.mode == "hr_interview" else "voice_session_complete"
        tab_penalty = "hr_tab_violation" if data.mode == "hr_interview" else "tab_switch_voice"
        add_honor_event(current_user, event, f"{data.exchange_count} exchanges")
        if data.tab_warnings > 0:
            for _ in range(min(data.tab_warnings, 3)):
                add_honor_event(current_user, tab_penalty, "tab switch during session")
        conn.commit(); cur.close(); conn.close()
        return {"message": "Voice session saved."}
    except Exception as e:
        logger.warning(f"voice save failed: {e}")
        return {"message": "Saved with warning."}


@app.get("/user/sessions")
async def get_user_sessions(current_user: str = Depends(get_current_user)):
    try:
        conn = get_connection(); cur = conn.cursor()
        import json as _json
        # Get sessions
        cur.execute("""
            SELECT summary, tab_warnings, exchange_count, scores, overall_score, mode, created_at
            FROM voice_sessions WHERE email=%s ORDER BY created_at DESC LIMIT 10
        """, (current_user,))
        rows = cur.fetchall()
        # Get user profile
        cur.execute("SELECT name, department, year, semester FROM users WHERE email=%s", (current_user,))
        urow = cur.fetchone()
        cur.close(); conn.close()
        profile = {"name": urow[0] if urow else "", "dept": urow[1] if urow else "",
                   "year": urow[2] if urow else "", "sem": urow[3] if urow else ""} if urow else {}
        sessions = []
        for r in rows:
            sc = {}
            try: sc = _json.loads(r[3]) if r[3] else {}
            except: pass
            sessions.append({
                "summary":        r[0] or "",
                "tab_warnings":   r[1] or 0,
                "exchange_count": r[2] or 0,
                "scores":         sc,
                "overall_score":  r[4] or 0,
                "mode":           r[5] or "voice",
                "created_at":     r[6].isoformat() if r[6] else ""
            })
        return {"sessions": sessions, "profile": profile}
    except Exception as e:
        logger.warning(f"get sessions failed: {e}")
        return {"sessions": []}


# ── Honor Score System ────────────────────────────────────
HONOR_RULES = {
    "voice_session_complete": +8,
    "hr_session_complete":    +12,
    "course_marked_done":     +3,
    "scan_complete":          +5,
    "stability_improvement":  +5,
    "streak_30_days":         +3,
    "tab_switch_assessment":  -5,
    "tab_switch_voice":       -3,
    "early_session_exit":     -2,
    "low_scan_quality":       -5,
    "hr_tab_violation":       -4,
}

def get_honor_score(email: str) -> int:
    try:
        conn = get_connection(); cur = conn.cursor()
        cur.execute("SELECT running_score FROM honor_events WHERE email=%s ORDER BY created_at DESC LIMIT 1", (email,))
        row = cur.fetchone(); cur.close(); conn.close()
        return row[0] if row else 100
    except: return 100

def add_honor_event(email: str, event_type: str, note: str = "") -> dict:
    delta = HONOR_RULES.get(event_type, 0)
    if delta == 0: return {"score": get_honor_score(email), "delta": 0}
    try:
        current = get_honor_score(email)
        new_score = max(0, min(100, current + delta))
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
        conn = get_connection(); cur = conn.cursor()
        cur.execute("""
            SELECT event_type, delta, running_score, note, created_at
            FROM honor_events WHERE email=%s ORDER BY created_at DESC LIMIT 30
        """, (current_user,))
        rows = cur.fetchall(); cur.close(); conn.close()
        score = rows[0][2] if rows else 100
        events = [{"event_type":r[0],"delta":r[1],"running_score":r[2],"note":r[3],"created_at":r[4].isoformat() if r[4] else ""} for r in rows]
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


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

def require_admin(current_user: str = Depends(get_current_user)):
    """Allow only the admin account."""
    conn = get_connection(); cur = conn.cursor()
    try:
        cur.execute("SELECT name FROM users WHERE email = %s", (current_user,))
        row = cur.fetchone()
        name = (row[0] if row else "") or ""
    finally:
        cur.close(); conn.close()
    if current_user != "admin@mentorix.ai" and name.lower() != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
    return current_user


# Bootstrap institutions table
def _ensure_institutions_table():
    conn = get_connection(); cur = conn.cursor()
    try:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS institutions (
                id            SERIAL PRIMARY KEY,
                name          TEXT NOT NULL,
                contact_email TEXT,
                env           TEXT DEFAULT 'dev',
                created_at    TIMESTAMP DEFAULT NOW()
            )
        """)
        conn.commit()
    finally:
        cur.close(); conn.close()

try:
    _ensure_institutions_table()
except Exception as _ie:
    logger.warning(f"institutions table init: {_ie}")


# ── /admin/overview ───────────────────────────────────────────────────────────
@app.get("/admin/overview")
def admin_overview(admin: str = Depends(require_admin)):
    conn = get_connection(); cur = conn.cursor()
    try:
        cur.execute("SELECT COUNT(*) FROM users")
        total_users = (cur.fetchone() or (0,))[0]

        cur.execute("SELECT COUNT(*) FROM voice_sessions")
        total_sessions = (cur.fetchone() or (0,))[0]

        cur.execute("SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '7 days'")
        new_users_week = (cur.fetchone() or (0,))[0]

        cur.execute("SELECT AVG(overall_score) FROM voice_sessions WHERE overall_score IS NOT NULL")
        r = cur.fetchone()
        avg_score = round(float(r[0]), 1) if r and r[0] else 0

        cur.execute("""
            SELECT vs.id, u.name AS user_name, vs.email AS user_email,
                   vs.mode, vs.created_at, vs.overall_score
            FROM voice_sessions vs
            LEFT JOIN users u ON u.email = vs.email
            ORDER BY vs.created_at DESC LIMIT 10
        """)
        cols = [d[0] for d in (cur.description or [])]
        recent_activity = []
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            if d.get("created_at"): d["created_at"] = d["created_at"].isoformat()
            recent_activity.append(d)

        cur.execute("""
            SELECT DATE(created_at) AS day, COUNT(*) AS count
            FROM users WHERE created_at >= NOW() - INTERVAL '14 days'
            GROUP BY day ORDER BY day
        """)
        registrations_by_day = [{"day": str(r[0]), "count": r[1]} for r in cur.fetchall()]

        cur.execute("""
            SELECT COALESCE(mode,'voice') AS mode, COUNT(*) AS count
            FROM voice_sessions GROUP BY mode
        """)
        session_type_breakdown = {r[0]: r[1] for r in cur.fetchall()}

        return {
            "total_users": total_users,
            "total_sessions": total_sessions,
            "new_users_week": new_users_week,
            "avg_score": avg_score,
            "recent_activity": recent_activity,
            "registrations_by_day": registrations_by_day,
            "session_type_breakdown": session_type_breakdown,
        }
    finally:
        cur.close(); conn.close()


# ── /admin/users ──────────────────────────────────────────────────────────────
@app.get("/admin/users")
def admin_get_users(admin: str = Depends(require_admin)):
    conn = get_connection(); cur = conn.cursor()
    try:
        cur.execute("""
            SELECT u.id, u.name, u.email, u.department, u.year, u.semester,
                   u.auth_provider, u.created_at,
                   COUNT(DISTINCT vs.id)       AS session_count,
                   COALESCE(SUM(he.delta), 0)  AS honor_score
            FROM users u
            LEFT JOIN voice_sessions vs ON vs.email = u.email
            LEFT JOIN honor_events   he ON he.email = u.email
            GROUP BY u.id, u.name, u.email, u.department, u.year,
                     u.semester, u.auth_provider, u.created_at
            ORDER BY u.created_at DESC
        """)
        cols = [d[0] for d in (cur.description or [])]
        users = []
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            if d.get("created_at"): d["created_at"] = d["created_at"].isoformat()
            users.append(d)
        return {"users": users}
    finally:
        cur.close(); conn.close()


@app.delete("/admin/users/{user_id}")
def admin_delete_user(user_id: int, admin: str = Depends(require_admin)):
    conn = get_connection(); cur = conn.cursor()
    try:
        cur.execute("SELECT email FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found.")
        email = row[0]
        cur.execute("DELETE FROM voice_sessions  WHERE email = %s", (email,))
        cur.execute("DELETE FROM honor_events    WHERE email = %s", (email,))
        cur.execute("DELETE FROM assessments     WHERE email = %s", (email,))
        cur.execute("DELETE FROM course_completions WHERE email = %s", (email,))
        cur.execute("DELETE FROM users           WHERE id    = %s", (user_id,))
        conn.commit()
        return {"ok": True, "deleted_email": email}
    finally:
        cur.close(); conn.close()


# ── /admin/sessions ───────────────────────────────────────────────────────────
@app.get("/admin/sessions")
def admin_get_sessions(admin: str = Depends(require_admin)):
    conn = get_connection(); cur = conn.cursor()
    try:
        cur.execute("""
            SELECT vs.id, u.name AS user_name, vs.email AS user_email,
                   vs.mode, vs.created_at, vs.exchange_count,
                   vs.overall_score, vs.tab_warnings
            FROM voice_sessions vs
            LEFT JOIN users u ON u.email = vs.email
            ORDER BY vs.created_at DESC
            LIMIT 500
        """)
        cols = [d[0] for d in (cur.description or [])]
        sessions = []
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            if d.get("created_at"): d["created_at"] = d["created_at"].isoformat()
            sessions.append(d)
        return {"sessions": sessions}
    finally:
        cur.close(); conn.close()


@app.delete("/admin/sessions/{session_id}")
def admin_delete_session(session_id: int, admin: str = Depends(require_admin)):
    conn = get_connection(); cur = conn.cursor()
    try:
        cur.execute("DELETE FROM voice_sessions WHERE id = %s RETURNING id", (session_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Session not found.")
        conn.commit()
        return {"ok": True}
    finally:
        cur.close(); conn.close()


# ── /admin/institutions ───────────────────────────────────────────────────────
@app.get("/admin/institutions")
def admin_get_institutions(admin: str = Depends(require_admin)):
    conn = get_connection(); cur = conn.cursor()
    try:
        cur.execute(
            "SELECT id, name, contact_email, env, created_at FROM institutions ORDER BY created_at DESC"
        )
        cols = [d[0] for d in (cur.description or [])]
        rows = []
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            if d.get("created_at"): d["created_at"] = d["created_at"].isoformat()
            rows.append(d)
        return {"institutions": rows}
    finally:
        cur.close(); conn.close()


class InstitutionCreate(BaseModel):
    name: str
    contact_email: Optional[str] = None
    env: Optional[str] = "dev"


@app.post("/admin/institutions")
def admin_create_institution(data: InstitutionCreate, admin: str = Depends(require_admin)):
    conn = get_connection(); cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO institutions (name, contact_email, env) VALUES (%s, %s, %s) RETURNING id",
            (data.name.strip(), data.contact_email or None, data.env or "dev")
        )
        new_id = (cur.fetchone() or (None,))[0]
        conn.commit()
        return {"ok": True, "id": new_id}
    finally:
        cur.close(); conn.close()


class InstitutionPatch(BaseModel):
    env:           Optional[str] = None
    name:          Optional[str] = None
    contact_email: Optional[str] = None


@app.patch("/admin/institutions/{inst_id}")
def admin_patch_institution(inst_id: int, data: InstitutionPatch, admin: str = Depends(require_admin)):
    conn = get_connection(); cur = conn.cursor()
    try:
        updates, vals = [], []
        if data.env is not None:
            if data.env not in ("dev", "prod"):
                raise HTTPException(status_code=400, detail="env must be 'dev' or 'prod'")
            updates.append("env = %s"); vals.append(data.env)
        if data.name is not None:
            updates.append("name = %s"); vals.append(data.name.strip())
        if data.contact_email is not None:
            updates.append("contact_email = %s"); vals.append(data.contact_email)
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update.")
        vals.append(inst_id)
        cur.execute(f"UPDATE institutions SET {', '.join(updates)} WHERE id = %s RETURNING id", vals)
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Institution not found.")
        conn.commit()
        return {"ok": True}
    finally:
        cur.close(); conn.close()


@app.delete("/admin/institutions/{inst_id}")
def admin_delete_institution(inst_id: int, admin: str = Depends(require_admin)):
    conn = get_connection(); cur = conn.cursor()
    try:
        cur.execute("DELETE FROM institutions WHERE id = %s RETURNING id", (inst_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Institution not found.")
        conn.commit()
        return {"ok": True}
    finally:
        cur.close(); conn.close()


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


@app.get("/admin/logs")
def admin_logs(admin: str = Depends(require_admin)):
    return {"logs": list(reversed(_admin_log_buffer))}


# ═════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    import uvicorn
    is_render = os.getenv("RENDER") is not None
    host      = "0.0.0.0" if is_render else "127.0.0.1"
    port      = int(os.getenv("PORT", "10000")) if is_render else 8000
    reload    = not is_render
    logger.info(f"Starting server on {host}:{port}")
    uvicorn.run("app:app", host=host, port=port, reload=reload)