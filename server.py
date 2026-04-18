#!/usr/bin/env python3
import sys
import os

print("=== Starting server.py ===")

# Ensure backend is in path
backend_path = os.path.join(os.path.dirname(__file__), 'backend')
sys.path.insert(0, backend_path)
print(f"Backend path: {backend_path}")

# Check if backend folder exists
if not os.path.exists(backend_path):
    print(f"ERROR: Backend folder not found at {backend_path}")
    sys.exit(1)

# Check DATABASE_URL
db_url = os.getenv('DATABASE_URL', 'NOT SET')
print(f"DATABASE_URL: {'SET' if db_url and db_url != 'NOT SET' else 'NOT SET'}")

print("Importing app...")
try:
    from app import app
    print("App imported successfully!")
except Exception as e:
    print(f"FAILED to import app: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("Starting uvicorn...")
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    print(f"Listening on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)