import logging
import os
import time
from typing import List, Tuple, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, EmailStr
import pickle
import numpy as np

from database import init_db, save_assessment, get_user_history
from risk_explanation import build_risk_explanation
from recommender import generate_recommendations
from career_mapper import infer_career_direction
from database import init_db, save_assessment, get_user_history


# -----------------------
# App Initialization
# -----------------------

app = FastAPI(title="Mentorix AI")

# Logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)

logger = logging.getLogger("mentorix-api")

init_db()

# Load ML model once
MODEL_PATH = os.path.join(os.path.dirname(__file__), "model", "risk_model.pkl")

model = None  # Prevent Pylance undefined warning

try:
    with open(MODEL_PATH, "rb") as f:
        model = pickle.load(f)
    logger.info(f"Model loaded successfully from {MODEL_PATH}")
except Exception as e:
    logger.exception("Failed to load ML model")
    raise RuntimeError("Model file missing or corrupted.") from e


# -------------------- CORS --------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------- Models --------------------

class StudentInput(BaseModel):
    email: EmailStr
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

# -------------------- Middleware --------------------

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()

    # ✅ Handle preflight OPTIONS requests explicitly
    if request.method == "OPTIONS":
        from fastapi.responses import Response
        response = Response()
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
        return response

    response = await call_next(request)
    duration_ms = round((time.time() - start) * 1000, 2)

    # ✅ Inject CORS headers into every response as a safety net
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "*"

    logger.info(
        f"{request.method} {request.url.path} "
        f"status={response.status_code} duration={duration_ms}ms"
    )


    return response


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    messages = []
    for err in exc.errors():
        field = ".".join(str(loc) for loc in err.get("loc", []) if loc != "body")
        messages.append(f"{field}: {err.get('msg', 'Invalid input')}")

    return JSONResponse(
        status_code=422,
        content={
            "detail": "Input validation failed",
            "errors": messages,
        },
    )

# -------------------- Routes --------------------

@app.get("/")
def root():
    return {"status": "Mentorix AI backend running"}


@app.get("/health")
def health():
    return {"status": "ok"}


# -------------------- Core Logic --------------------

def normalize_input(data: StudentInput) -> np.ndarray:

    if data.current_status == "student":
        cgpa_value = data.cgpa
        backlog_value = data.backlogs

    elif data.current_status == "working_professional":
        experience_factor = min((data.years_experience or 0) / 10, 1)
        cgpa_value = 6 + (experience_factor * 4)
        backlog_value = 0

    elif data.current_status == "career_switcher":
        cgpa_value = 7
        backlog_value = data.career_changes

    else:
        cgpa_value = data.cgpa
        backlog_value = data.backlogs

    normalized_backlogs = min(float(np.log1p(backlog_value)), 3.0)
    normalized_cgpa = cgpa_value / 10
    normalized_tech_interest = data.tech_interest / 5
    normalized_core_interest = data.core_interest / 5
    normalized_management_interest = data.management_interest / 5
    normalized_confidence = data.confidence / 5
    normalized_decision_time = min(data.decision_time / 24, 1)

    return np.array([[
        normalized_cgpa,
        normalized_backlogs,
        normalized_tech_interest,
        normalized_core_interest,
        normalized_management_interest,
        normalized_confidence,
        data.career_changes,
        normalized_decision_time,
    ]])


def compute_stability_index(data: StudentInput) -> float:
    cgpa_factor = data.cgpa / 10
    confidence_factor = data.confidence / 5
    interest_alignment = max(
        data.tech_interest,
        data.core_interest,
        data.management_interest
    ) / 5

    backlog_penalty = min(data.backlogs / 10, 1)
    switch_penalty = min(data.career_changes / 5, 1)
    decision_clarity = min(data.decision_time / 24, 1)

    score = (
        cgpa_factor * 0.25 +
        confidence_factor * 0.20 +
        interest_alignment * 0.20 +
        (1 - backlog_penalty) * 0.15 +
        (1 - switch_penalty) * 0.10 +
        decision_clarity * 0.10
    )

    return round(score, 2)


def compute_trend(history):
    if len(history) < 2:
        return "insufficient_data"

    latest = history[0]["stability_score"]
    previous = history[1]["stability_score"]

    if latest > previous:
        return "improving"
    elif latest < previous:
        return "declining"
    else:
        return "stable"

def compute_volatility(history) -> float:
    if len(history) < 3:
        return 0.0
    scores = [item["stability_score"] for item in history[:5]]
    mean = sum(scores) / len(scores)
    variance = sum((s - mean) ** 2 for s in scores) / len(scores)
    return round(variance, 3)


def compute_track_instability(history) -> int:
    if len(history) < 3:
        return 0
    tracks = [item.get("track") for item in history[:5]]
    flips = sum(1 for i in range(1, len(tracks)) if tracks[i] != tracks[i - 1])
    return flips
# -------------------- Main Endpoint --------------------

@app.post("/analyze-risk")
def analyze_risk(data: StudentInput):

    features = normalize_input(data)

    try:
        risk = model.predict(features)[0]
    except Exception:
        logger.exception("Prediction failed")
        raise HTTPException(status_code=500, detail="Prediction failed")

    stability_index = compute_stability_index(data)

    user_id = data.email

    # ✅ Get history FIRST before anything else
    history = get_user_history(user_id)

    # ✅ Then compute all signals from history
    trend = compute_trend(history)
    volatility = compute_volatility(history)
    track_flips = compute_track_instability(history)

    logger.info(f"volatility={volatility} track_flips={track_flips} history_len={len(history)}")

    explanation = build_risk_explanation(data, risk)

    # ✅ Then generate recommendations with all signals
    recommendation = generate_recommendations(
        data.model_dump(),
        risk,
        stability_index,
        trend,
        volatility,
        track_flips,
        history
    )

    # ✅ Save AFTER recommendation so track is captured
    save_assessment(user_id, risk, stability_index, recommendation["track"])

    career_direction, insight = infer_career_direction(data)

    return {
        "risk_level":       risk,
        "stability_score":  round(stability_index, 2),
        "stability_index":  stability_index,
        "trend":            trend,
        "volatility":       volatility,
        "track_flips":      track_flips,
        "reasons":          explanation["reasons"],
        "summary":          explanation["summary"],
        "recommendation":   recommendation,
        "career_direction": career_direction,
        "insight":          insight,
        "decision_scores":  recommendation["decision_scores"],
        "history":          history,
    }


# -------------------- Run Server --------------------

if __name__ == "__main__":
    import uvicorn

    is_render = os.getenv("RENDER") is not None
    is_vercel = os.getenv("VERCEL") is not None

    if is_render or is_vercel:
        host = "0.0.0.0"
        port = int(os.getenv("PORT", "10000"))
        reload = False
    else:
        host = "127.0.0.1"
        port = 8000
        reload = True

    logger.info(f"Starting server on {host}:{port}")
    uvicorn.run("app:app", host=host, port=port, reload=reload)