import sys
import os

os.environ.setdefault('DATABASE_URL', os.getenv('DATABASE_URL', ''))

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

try:
    from app import app
    print("App imported successfully")
except Exception as e:
    print(f"Error importing app: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    print(f"Starting server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)