import logging
import os
import time
from typing import List, Tuple
from .database import init_db, save_assessment, get_user_history

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import pickle
import numpy as np

from .risk_explanation import build_risk_explanation
from .recommender import generate_recommendations
from .career_mapper import infer_career_direction

app = FastAPI(title="Mentorix AI")

# Structured logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("mentorix-api")
init_db()
# Load trained ML model at startup
MODEL_PATH = os.path.join(os.path.dirname(__file__), "model", "risk_model.pkl")

try:
    with open(MODEL_PATH, "rb") as f:
        model = pickle.load(f)
    logger.info(f"Model loaded successfully from {MODEL_PATH}")
except Exception as e:
    logger.exception("Failed to load ML model")
    raise RuntimeError("Model file missing or corrupted. Ensure risk_model.pkl exists.") from e


def get_cors_settings() -> Tuple[List[str], bool]:
    """Read CORS origins from environment variable.

    Use comma-separated values in CORS_ORIGINS, e.g.
    https://your-frontend.vercel.app,https://mentorix.example.com
    """
    raw_origins = os.getenv("CORS_ORIGINS", "*")
    parsed_origins = [origin.strip().strip('"').strip("'") for origin in raw_origins.split(",") if origin.strip()]

    # Always include these deployment URLs
    static_origins = [
        "https://mentorix-ai-backend.onrender.com",
        "https://mentorix-ld6g2yrer-darxs-projects-7e3e4cb5.vercel.app"
    ]
    for url in static_origins:
        if url not in parsed_origins:
            parsed_origins.append(url)

    # If wildcard is present (alone or mixed), enforce true wildcard mode.
    # Mixed values like "*,https://site" can break preflight in some deployments.
    if "*" in parsed_origins or not parsed_origins:
        return ["*"], False

    return parsed_origins, True

# CORS (for Vercel frontend later)
cors_origins, cors_allow_credentials = get_cors_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=cors_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

class StudentInput(BaseModel):
    cgpa: float = Field(..., ge=0, le=10, description="CGPA must be between 0 and 10")
    backlogs: int = Field(..., ge=0, description="Backlogs must be 0 or greater")
    tech_interest: int = Field(..., ge=1, le=5, description="Tech interest must be between 1 and 5")
    core_interest: int = Field(..., ge=1, le=5, description="Core interest must be between 1 and 5")
    management_interest: int = Field(..., ge=1, le=5, description="Management interest must be between 1 and 5")
    confidence: int = Field(..., ge=1, le=5, description="Confidence level must be between 1 and 5")
    career_changes: int = Field(..., ge=0, description="Career changes must be 0 or greater")
    decision_time: int = Field(..., ge=0, description="Decision time must be 0 or greater")


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration_ms = round((time.time() - start) * 1000, 2)

    logger.info(
        "request_completed",
        extra={
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
            "client": request.client.host if request.client else None,
        },
    )
    return response


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    messages = []
    for err in exc.errors():
        field = ".".join(str(loc) for loc in err.get("loc", []) if loc != "body")
        if not field:
            field = "request"
        messages.append(f"{field}: {err.get('msg', 'Invalid input')}")

    return JSONResponse(
        status_code=422,
        content={
            "detail": "Input validation failed",
            "errors": messages,
            "path": request.url.path,
        },
    )

@app.get("/")
def root():
    return {"status": "Mentorix AI backend running"}


@app.get("/health")
def health():
    return {"status": "ok"}

def normalize_input(data: StudentInput) -> np.ndarray:
    normalized_backlogs = min(float(np.log1p(data.backlogs)), 3.0)
    normalized_cgpa = data.cgpa / 10
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
@app.post("/analyze-risk")
def analyze_risk(data: StudentInput):
    features = normalize_input(data)

    try:
        risk = model.predict(features)[0]
    except Exception as exc:
        logger.exception("prediction_failed")
        raise HTTPException(status_code=500, detail="Prediction failed. Please try again later.") from exc

    explanation = build_risk_explanation(data, risk)
    input_dict = data.model_dump()
    risk_level = risk
    recommendation = generate_recommendations(input_dict, risk_level)
    career_direction, insight = infer_career_direction(data)
    score = round(1.0 - (0.33 if risk == "High" else 0.15 if risk == "Medium" else 0.05), 2)
    stability_index = compute_stability_index(data)
    reasons = explanation["reasons"]

    user_id = "demo_user"  # temporary until auth system
    save_assessment(user_id, risk, score)
    history = get_user_history(user_id)

    return {
    "risk_level": risk,
    "stability_score": score,
    "stability_index": stability_index,
    "reasons": reasons,
    "recommendation": recommendation,
    "career_direction": career_direction,
    "insight": insight,
    "history": history,
}

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=False,
    )
