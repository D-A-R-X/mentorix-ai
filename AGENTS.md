# Mentorix AI – Codex Context

## Project Goal
AI-based system to analyze student career decision stability and classify risk.

## Stack
- FastAPI backend (Python)
- Scikit-learn ML model
- Simple HTML/CSS/JS frontend
- Deployment target: Render (backend), Vercel (frontend)

## How to Run Backend
cd backend
uvicorn app:app --reload

## Model Training
python training/train_model.py

## Guidelines
- Do not change ML logic unless requested
- Keep explanations human-readable (for academic demo)
- Prefer simple implementations over complex frameworks
