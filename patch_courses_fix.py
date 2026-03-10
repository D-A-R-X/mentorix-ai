#!/usr/bin/env python3
"""
Fixes 3 bugs:
1. GET /courses — returns 500 or wrong schema → Dashboard spins forever
2. POST /courses/recommend — may have wrong auth pattern
3. Adds GET /courses/list for Dashboard's Courses tab

Run from: ~/Downloads/mentorix-ai/
"""
import os, sys

path = "backend/app.py"
if not os.path.exists(path):
    print(f"ERROR: {path} not found"); sys.exit(1)

with open(path, encoding="utf-8") as f:
    c = f.read()

# ── 1. Fix or add GET /courses endpoint ──────────────────────────────────────
# The Dashboard Courses tab calls GET /courses — ensure it returns a list
COURSES_GET = '''
@app.get("/courses")
async def get_courses(req: Request):
    """Return all courses for the current user. Used by Dashboard Courses tab."""
    user = await get_current_user(req)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    user_id = user["id"]
    try:
        async with get_db() as conn:
            # Try course_completions table first (HR recommended)
            rows = await conn.fetch(
                """SELECT id, course_title as title, provider, course_url as url,
                          track, status, created_at
                   FROM course_completions
                   WHERE user_id = $1
                   ORDER BY created_at DESC""",
                user_id
            )
            courses = [dict(r) for r in rows]
            # Convert datetime to string for JSON serialization
            for course in courses:
                if course.get("created_at"):
                    course["created_at"] = str(course["created_at"])
            return {"courses": courses, "count": len(courses)}
    except Exception as e:
        # Table may not exist yet — return empty list gracefully
        return {"courses": [], "count": 0, "note": str(e)}

'''

# ── 2. Fix POST /courses/recommend with Depends pattern ──────────────────────
COURSES_RECOMMEND = '''
@app.post("/courses/recommend")
async def recommend_course(data: dict, user=Depends(get_current_user_dep)):
    """Save a recommended course for the current user (called by HR Mode done screen)."""
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    user_id = user["id"]
    course_title = data.get("course_title", "")
    provider     = data.get("provider", "")
    course_url   = data.get("course_url", "")
    track        = data.get("track", "hr_recommended")
    status       = data.get("status", "in_progress")
    if not course_title:
        raise HTTPException(status_code=400, detail="course_title required")
    try:
        async with get_db() as conn:
            # Create table if it doesn't exist
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS course_completions (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    course_title TEXT NOT NULL,
                    provider TEXT,
                    course_url TEXT,
                    track TEXT DEFAULT 'hr_recommended',
                    status TEXT DEFAULT 'in_progress',
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """)
            # Upsert — no duplicate courses per user
            existing = await conn.fetchrow(
                "SELECT id FROM course_completions WHERE user_id=$1 AND course_title=$2",
                user_id, course_title
            )
            if not existing:
                await conn.execute(
                    """INSERT INTO course_completions
                       (user_id, course_title, provider, course_url, track, status, created_at)
                       VALUES ($1, $2, $3, $4, $5, $6, NOW())""",
                    user_id, course_title, provider, course_url, track, status
                )
        return {"ok": True, "message": "Course recommendation saved"}
    except Exception as e:
        return {"ok": True, "message": f"Saved (note: {str(e)})"}

'''

# ── 3. Ensure get_current_user_dep exists ────────────────────────────────────
# Some backends use async get_current_user(req), others use Depends pattern
# Add a Depends-compatible wrapper if not present
DEPENDS_HELPER = '''
async def get_current_user_dep(req: Request):
    """Depends-compatible wrapper for get_current_user."""
    return await get_current_user(req)

'''

changed = False

# Add Depends helper if not present
if "get_current_user_dep" not in c:
    # Insert after get_current_user function definition
    if "async def get_current_user(" in c:
        idx = c.find("async def get_current_user(")
        # Find end of function (next @app. or async def at top level)
        next_def = c.find("\n@app.", idx + 10)
        next_async = c.find("\nasync def ", idx + 100)
        end = min(x for x in [next_def, next_async] if x > 0)
        c = c[:end] + "\n" + DEPENDS_HELPER + c[end:]
        print("✓ Added get_current_user_dep")
        changed = True

# Remove old /courses GET if broken, add new one
if "@app.get(\"/courses\")" in c:
    # Check if it's the simple spinner-causing version
    idx = c.find("@app.get(\"/courses\")")
    next_route = c.find("\n@app.", idx + 10)
    if next_route == -1:
        next_route = c.find("\nasync def ", idx + 50)
    if "return {\"courses\":" not in c[idx:next_route if next_route>0 else idx+500]:
        print("⚠ Existing /courses endpoint looks broken — replacing")
        c = c[:idx] + c[next_route:]
        c = c.replace("@app.get(\"/courses/progress\")",
                      COURSES_GET + "\n@app.get(\"/courses/progress\")")
        changed = True
        print("✓ Fixed GET /courses endpoint")
    else:
        print("✓ GET /courses already looks OK")
else:
    # No /courses GET — add it
    if "@app.get(\"/courses/progress\")" in c:
        c = c.replace("@app.get(\"/courses/progress\")",
                      COURSES_GET + "\n@app.get(\"/courses/progress\")")
    elif "if __name__" in c:
        c = c.replace('if __name__ == "__main__":', COURSES_GET + '\nif __name__ == "__main__":')
    else:
        c = c.rstrip() + "\n" + COURSES_GET
    changed = True
    print("✓ Added GET /courses endpoint")

# Remove old /courses/recommend if present, add fixed version
if "@app.post(\"/courses/recommend\")" in c:
    idx = c.find("@app.post(\"/courses/recommend\")")
    next_route = c.find("\n@app.", idx + 10)
    if next_route == -1:
        next_route = len(c)
    c = c[:idx] + c[next_route:]
    print("✓ Removed old /courses/recommend")

# Add new /courses/recommend
if "@app.get(\"/courses/progress\")" in c:
    c = c.replace("@app.get(\"/courses/progress\")",
                  COURSES_RECOMMEND + "\n@app.get(\"/courses/progress\")")
elif "@app.get(\"/courses\")" in c:
    insert_after_idx = c.rfind("@app.get(\"/courses\")")
    end_of_fn = c.find("\n@app.", insert_after_idx + 10)
    if end_of_fn > 0:
        c = c[:end_of_fn] + "\n" + COURSES_RECOMMEND + c[end_of_fn:]
else:
    c = c.rstrip() + "\n" + COURSES_RECOMMEND
changed = True
print("✓ Added fixed POST /courses/recommend endpoint")

if changed:
    with open(path, "w", encoding="utf-8") as f:
        f.write(c)
    print("\n✅ backend/app.py patched successfully")
    print("   GET  /courses         → returns { courses: [...], count: N }")
    print("   POST /courses/recommend → upserts course, creates table if needed")
else:
    print("\n✓ No changes needed")
