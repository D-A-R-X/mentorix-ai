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
