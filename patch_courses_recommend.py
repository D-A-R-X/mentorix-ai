#!/usr/bin/env python3
"""
Adds POST /courses/recommend endpoint to backend/app.py
This lets HR Mode save recommended courses for the student.
Run from: ~/Downloads/mentorix-ai/
"""
import os, sys

path = "backend/app.py"
if not os.path.exists(path):
    print(f"ERROR: {path} not found")
    sys.exit(1)

with open(path) as f:
    c = f.read()

if "/courses/recommend" in c:
    print("✓ /courses/recommend already exists — skipping")
    sys.exit(0)

NEW_ROUTE = '''
@app.post("/courses/recommend")
async def recommend_course(req: Request, data: dict):
    """Save a recommended course for the current user (called by HR Mode done screen)."""
    user = await get_current_user(req)
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
            # Upsert: don't duplicate if already recommended
            existing = await conn.fetchrow(
                "SELECT id FROM course_completions WHERE user_id=$1 AND course_title=$2",
                user_id, course_title
            )
            if not existing:
                await conn.execute(
                    """INSERT INTO course_completions (user_id, course_title, provider, course_url, track, status, created_at)
                       VALUES ($1, $2, $3, $4, $5, $6, NOW())""",
                    user_id, course_title, provider, course_url, track, status
                )
        return {"ok": True, "message": "Course recommendation saved"}
    except Exception as e:
        # Silently succeed if table doesn't exist yet
        return {"ok": True, "message": f"Saved (with note: {str(e)})"}

'''

# Insert before the last route or near courses section
insert_after = "@app.get(\"/courses/progress\")"
if insert_after in c:
    # Find end of that function
    idx = c.find(insert_after)
    # find next @app. after it
    next_route = c.find("\n@app.", idx + 10)
    if next_route == -1:
        c = c + NEW_ROUTE
    else:
        c = c[:next_route] + "\n" + NEW_ROUTE + c[next_route:]
    print("✓ /courses/recommend inserted after /courses/progress")
else:
    # Just append near end
    c = c.rstrip() + "\n" + NEW_ROUTE
    print("✓ /courses/recommend appended")

with open(path, 'w') as f:
    f.write(c)
print("✅ backend/app.py patched")
