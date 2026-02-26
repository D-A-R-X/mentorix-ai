import logging
import os
import time
from typing import List, Tuple, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import pickle
import numpy as np

from risk_explanation import build_risk_explanation
from recommender import generate_recommendations
from career_mapper import infer_career_direction
from database import init_db, save_assessment, get_user_history


# -----------------------
# App Initialization
# -----------------------

app = FastAPI(title="Mentorix AI")

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)

logger = logging.getLogger("mentorix-api")

# Initialize SQLite DB
init_db()


# -----------------------
# Load ML Model
# -----------------------

MODEL_PATH = os.path.join(os.path.dirname(__file__), "model", "risk_model.pkl")

model = None  # Prevent Pylance undefined warning

try:
    with open(MODEL_PATH, "rb") as f:
        model = pickle.load(f)
    logger.info(f"Model loaded successfully from {MODEL_PATH}")
except Exception as e:
    logger.exception("Failed to load ML model")
    raise RuntimeError("Model file missing or corrupted.") from e


# -----------------------
# CORS Configuration
# -----------------------

origins = [
    "https://mentorix-ai.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -----------------------
# Input Model
# -----------------------

class StudentInput(BaseModel):
    cgpa: float = Field(..., ge=0, le=10)
    backlogs: int = Field(..., ge=0)
    tech_interest: int = Field(..., ge=1, le=5)
    core_interest: int = Field(..., ge=1, le=5)
    management_interest: int = Field(..., ge=1, le=5)
    confidence: int = Field(..., ge=1, le=5)
    career_changes: int = Field(..., ge=0)
    decision_time: int = Field(..., ge=0)

    current_status: str
    current_course: Optional[str] = None
    current_job_role: Optional[str] = None
    industry: Optional[str] = None
    years_experience: Optional[int] = 0


# -----------------------
# Middleware Logging
# -----------------------

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration_ms = round((time.time() - start) * 1000, 2)

    logger.info(
        f"{request.method} {request.url.path} - {response.status_code} - {duration_ms}ms"
    )

    return response


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": "Invalid input", "errors": exc.errors()},
    )


# -----------------------
# Persona-Aware Feature Mapping
# -----------------------

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


# -----------------------
# Routes
# -----------------------

@app.get("/")
def root():
    return {"status": "Mentorix AI backend running"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze-risk")
def analyze_risk(data: StudentInput):

    if model is None:
        raise HTTPException(status_code=500, detail="Model not loaded")

    features = normalize_input(data)

    try:
        risk = model.predict(features)[0]
    except Exception as exc:
        logger.exception("Prediction failed")
        raise HTTPException(status_code=500, detail="Prediction failed") from exc

    # CSI Calculation
    base_score = 1.0 - (0.33 if risk == "High" else 0.15 if risk == "Medium" else 0.05)
    csi_score = round(base_score * 100, 2)

    # Persona-based calibration
    if data.current_status == "working_professional" and (data.years_experience or 0) >= 5:
        if risk == "High":
            risk = "Medium"
        elif risk == "Medium":
            risk = "Low"

    explanation = build_risk_explanation(data, risk)
    input_dict = data.model_dump()
    recommendation = generate_recommendations(input_dict, risk)
    career_direction, insight = infer_career_direction(data)

    # Save assessment (temporary demo user)
    user_id = "demo_user"
    save_assessment(user_id, data.current_status, csi_score, risk)
    history = get_user_history(user_id)

    return {
        "risk_level": risk,
        "stability_score": round(csi_score / 100, 2),
        "career_stability_index": csi_score,
        "history": history,
        "reasons": explanation.get("reasons", []),
        "recommendation": recommendation,
        "career_direction": career_direction,
        "insight": insight,
    }


# -----------------------
# Run App
# -----------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000)