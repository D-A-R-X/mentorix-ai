import logging
import os
import time
from typing import List

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

app = FastAPI(title="Mentorix AI")

# Structured logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("mentorix-api")


def get_cors_origins() -> List[str]:
    """Read CORS origins from environment variable.

    Use comma-separated values in CORS_ORIGINS, e.g.
    https://your-frontend.vercel.app,https://mentorix.example.com
    """
    raw_origins = os.getenv("CORS_ORIGINS", "*")
    return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

# CORS (for Vercel frontend later)
cors_origins = get_cors_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False if cors_origins == ["*"] else True,
    allow_methods=["*"],   # VERY IMPORTANT
    allow_headers=["*"],
)


# Load model
with open("model/risk_model.pkl", "rb") as f:
    model = pickle.load(f)

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
    reasons = explanation["reasons"]

    return {
        "risk_level": risk,
        "stability_score": score,
        "reasons": reasons,
        "recommendation": recommendation,
        "career_direction": career_direction,
        "insight": insight,
    }

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=False,
    )
