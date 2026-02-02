from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pickle
import numpy as np

app = FastAPI(title="Mentorix AI")

# CORS (for Vercel frontend later)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # allow all for dev
    allow_credentials=True,
    allow_methods=["*"],   # VERY IMPORTANT
    allow_headers=["*"],
)


# Load model
with open("model/risk_model.pkl", "rb") as f:
    model = pickle.load(f)

class StudentInput(BaseModel):
    cgpa: float
    backlogs: int
    tech_interest: int
    core_interest: int
    management_interest: int
    confidence: int
    career_changes: int
    decision_time: int

def explain_risk(data, prediction):
    reasons = []

    if data.confidence <= 2:
        reasons.append("Low confidence in career decision")
    if data.career_changes >= 3:
        reasons.append("Frequent career preference changes")
    if data.cgpa < 6.5:
        reasons.append("Low academic alignment")
    if prediction == "High" and not reasons:
        reasons.append("Multiple moderate risk indicators")

    return reasons

@app.get("/")
def root():
    return {"status": "Mentorix AI backend running"}

@app.post("/analyze-risk")
def analyze_risk(data: StudentInput):
    features = np.array([[
        data.cgpa,
        data.backlogs,
        data.tech_interest,
        data.core_interest,
        data.management_interest,
        data.confidence,
        data.career_changes,
        data.decision_time
    ]])

    risk = model.predict(features)[0]
    reasons = explain_risk(data, risk)

    return {
        "risk_level": risk,
        "stability_score": round(1.0 - (0.33 if risk == "High" else 0.15 if risk == "Medium" else 0.05), 2),
        "reasons": reasons
    }
