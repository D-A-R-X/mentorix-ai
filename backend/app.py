import logging
import os
import time
from typing import List, Tuple
from typing import Optional
from pydantic import BaseModel, Field
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

init_db()
app = FastAPI(title="Mentorix AI")

# Structured logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("mentorix-api")


def get_cors_settings() -> Tuple[List[str], bool]:
    """Read CORS origins from environment variable.

    Use comma-separated values in CORS_ORIGINS, e.g.
    https://your-frontend.vercel.app,https://mentorix.example.com
    """
    raw_origins = os.getenv("CORS_ORIGINS", "https://mentorix-ai.vercel.app,http://localhost:3000,http://127.0.0.1:3000")
    parsed_origins = [origin.strip().strip('"').strip("'") for origin in raw_origins.split(",") if origin.strip()]

    # If wildcard is present (alone or mixed), enforce true wildcard mode.
    # Mixed values like "*,https://site" can break preflight in some deployments.
    if "*" in parsed_origins or not parsed_origins:
        return ["*"], False

    # This API does not use cookies/auth headers, so credential mode is kept disabled
    # to avoid stricter browser CORS behavior during preflight.
    return parsed_origins, False

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
    # Core metrics (still required)
    cgpa: float = Field(..., ge=0, le=10)
    backlogs: int = Field(..., ge=0)
    tech_interest: int = Field(..., ge=1, le=5)
    core_interest: int = Field(..., ge=1, le=5)
    management_interest: int = Field(..., ge=1, le=5)
    confidence: int = Field(..., ge=1, le=5)
    career_changes: int = Field(..., ge=0)
    decision_time: int = Field(..., ge=0)

    # Persona Layer
    current_status: str = Field(..., description="student / working_professional / career_switcher")
    current_course: Optional[str] = None
    current_job_role: Optional[str] = None
    industry: Optional[str] = None
    years_experience: Optional[int] = 0

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
    """
    Persona-aware feature mapping.
    Keeps original 8-feature structure intact.
    """

    # ---- Persona Feature Mapping ----
    if data.current_status == "student":
        cgpa_value = data.cgpa
        backlog_value = data.backlogs

    elif data.current_status == "working_professional":
        # Use experience + confidence as academic stability proxy
        experience_factor = min((data.years_experience or 0) / 10, 1)
        cgpa_value = 6 + (experience_factor * 4)  # Map to 6–10 scale
        backlog_value = 0  # Backlogs irrelevant for professionals

    elif data.current_status == "career_switcher":
        # Moderate neutral baseline
        cgpa_value = 7
        backlog_value = data.career_changes

    else:
        cgpa_value = data.cgpa
        backlog_value = data.backlogs

    # ---- Normalization (unchanged feature order) ----
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


@app.post("/analyze-risk")
def analyze_risk(data: StudentInput):
    features = normalize_input(data)
    if data.current_status == "working_professional" and data.years_experience >= 5:
        risk = "Low"
    else:
        try:
            risk = model.predict(features)[0]
        except Exception as exc:
            logger.exception("prediction_failed")
            raise HTTPException(status_code=500, detail="Prediction failed. Please try again later.") from exc
    
    # Persona-based calibration
    if data.current_status == "working_professional" and (data.years_experience or 0) >= 5:
        if risk == "High":
            risk = "Medium"
        elif risk == "Medium":
            risk = "Low"
    
    explanation = build_risk_explanation(data, risk)
    input_dict = data.model_dump()
    risk_level = risk
    recommendation = generate_recommendations(input_dict, risk_level)
    career_direction, insight = infer_career_direction(data)
    base_score = 1.0 - (0.33 if risk == "High" else 0.15 if risk == "Medium" else 0.05)
    csi_score = round(base_score * 100, 2)
    reasons = explanation["reasons"]
    user_id = "demo_user"  # temporary until auth added
    save_assessment(user_id, data.current_status, csi_score, risk)
    history = get_user_history(user_id)
    return {
        "risk_level": risk,
        "stability_score": score,
        "reasons": reasons,
        "recommendation": recommendation,
        "recommendations": recommendation,
        "career_direction": career_direction,
        "insight": insight,
        "career_stability_index": csi_score,
        "history": history,
        "summary": insight,
    }

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=False,
    )
