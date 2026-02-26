# mentorix-ai

## Backend run (local)
```bash
cd backend
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

## Render deployment
This repository includes a `render.yaml` blueprint for the backend service.

Equivalent Render start command:
```bash
uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}
```

```
mentorix-ai
├─ .dockerignore
├─ AGENTS.md
├─ README.md
├─ backend
│  ├─ __pycache__
│  │  ├─ app.cpython-312.pyc
│  │  ├─ career_mapper.cpython-312.pyc
│  │  ├─ recommender.cpython-312.pyc
│  │  └─ risk_explanation.cpython-312.pyc
│  ├─ app.py
│  ├─ app.py.bak
│  ├─ career_mapper.py
│  ├─ course_catalog.json
│  ├─ data
│  │  └─ student_data.csv
│  ├─ model
│  │  └─ risk_model.pkl
│  ├─ recommendation_engine.py
│  ├─ recommender.py
│  ├─ requirements.txt
│  ├─ risk_explanation.py
│  └─ training
│     └─ train_model.py
├─ frontend
│  ├─ index.html
│  ├─ script.js
│  └─ style.css
├─ graphite-demo
│  └─ server.js
└─ render.yaml

```