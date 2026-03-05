import sqlite3
import os
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

DB_NAME = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mentorix.db")

def get_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()

    # Assessments
    conn.execute("""
        CREATE TABLE IF NOT EXISTS assessments (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            email           TEXT    NOT NULL,
            risk_level      TEXT    NOT NULL,
            stability_score REAL    NOT NULL,
            track           TEXT    NOT NULL DEFAULT 'unknown',
            created_at      TEXT    NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_assessments_email ON assessments (email)")

    # Users
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            email         TEXT    NOT NULL UNIQUE,
            password_hash TEXT,
            name          TEXT,
            picture       TEXT,
            auth_provider TEXT    NOT NULL DEFAULT 'email',
            created_at    TEXT    NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)")

    # Course completions
    conn.execute("""
        CREATE TABLE IF NOT EXISTS course_completions (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            email        TEXT    NOT NULL,
            course_title TEXT    NOT NULL,
            course_url   TEXT    NOT NULL,
            provider     TEXT,
            track        TEXT,
            status       TEXT    NOT NULL DEFAULT 'started',
            started_at   TEXT    NOT NULL,
            completed_at TEXT,
            UNIQUE(email, course_url)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_completions_email ON course_completions (email)")

    conn.commit()
    conn.close()


# ── User functions ───────────────────────────────────────────────

def create_user(
    email: str,
    password_hash: Optional[str] = None,
    name: str = None,
    picture: str = None,
    auth_provider: str = "email"
) -> bool:
    """Returns True if created, False if email already exists."""
    try:
        conn = get_connection()
        conn.execute("""
            INSERT INTO users (email, password_hash, name, picture, auth_provider, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            email.lower().strip(),
            password_hash,
            name,
            picture,
            auth_provider,
            datetime.now(timezone.utc).isoformat()
        ))
        conn.commit()
        conn.close()
        return True
    except sqlite3.IntegrityError:
        return False

def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.execute(
        "SELECT id, email, password_hash, name, picture, auth_provider, created_at FROM users WHERE email = ?",
        (email.lower().strip(),)
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    return dict(row)

def upsert_google_user(email: str, name: str, picture: str) -> Dict[str, Any]:
    """Create user if not exists, update name/picture if they do. Returns user."""
    existing = get_user_by_email(email)
    if existing:
        conn = get_connection()
        conn.execute(
            "UPDATE users SET name = ?, picture = ?, auth_provider = 'google' WHERE email = ?",
            (name, picture, email.lower().strip())
        )
        conn.commit()
        conn.close()
        existing["name"]    = name
        existing["picture"] = picture
        return existing
    create_user(email=email, name=name, picture=picture, auth_provider="google")
    return get_user_by_email(email)


# ── Assessment functions ─────────────────────────────────────────

def save_assessment(
    email: str,
    risk_level: str,
    stability_score: float,
    track: str = "unknown"
) -> None:
    conn = get_connection()
    conn.execute("""
        INSERT INTO assessments (email, risk_level, stability_score, track, created_at)
        VALUES (?, ?, ?, ?, ?)
    """, (
        email,
        risk_level,
        round(stability_score, 4),
        track,
        datetime.now(timezone.utc).isoformat()
    ))
    conn.commit()
    conn.close()

def get_user_history(email: str, limit: int = 10) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.execute("""
        SELECT risk_level, stability_score, track, created_at
        FROM assessments WHERE email = ?
        ORDER BY created_at DESC LIMIT ?
    """, (email, limit))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_assessment_count(email: str) -> int:
    conn = get_connection()
    cursor = conn.execute("SELECT COUNT(*) FROM assessments WHERE email = ?", (email,))
    count = cursor.fetchone()[0]
    conn.close()
    return count


# ── Course completion functions ──────────────────────────────────

def upsert_course_completion(
    email: str,
    course_title: str,
    course_url: str,
    provider: str,
    track: str,
    status: str  # "started" | "completed"
) -> None:
    conn = get_connection()
    now  = datetime.now(timezone.utc).isoformat()

    existing = conn.execute(
        "SELECT id, status FROM course_completions WHERE email = ? AND course_url = ?",
        (email, course_url)
    ).fetchone()

    if existing:
        if status == "completed":
            conn.execute(
                "UPDATE course_completions SET status = 'completed', completed_at = ? WHERE email = ? AND course_url = ?",
                (now, email, course_url)
            )
        else:
            conn.execute(
                "UPDATE course_completions SET status = ? WHERE email = ? AND course_url = ? AND status != 'completed'",
                (status, email, course_url)
            )
    else:
        conn.execute("""
            INSERT INTO course_completions
                (email, course_title, course_url, provider, track, status, started_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (email, course_title, course_url, provider, track, status, now))

    conn.commit()
    conn.close()

def get_course_completions(email: str) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.execute("""
        SELECT course_title, course_url, provider, track, status, started_at, completed_at
        FROM course_completions WHERE email = ?
        ORDER BY started_at DESC
    """, (email,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_completion_stats(email: str) -> Dict[str, Any]:
    completions = get_course_completions(email)
    total     = len(completions)
    started   = sum(1 for c in completions if c["status"] == "started")
    completed = sum(1 for c in completions if c["status"] == "completed")
    by_track  = {}
    for c in completions:
        t = c["track"] or "unknown"
        if t not in by_track:
            by_track[t] = {"started": 0, "completed": 0}
        by_track[t][c["status"]] = by_track[t].get(c["status"], 0) + 1

    return {
        "total":     total,
        "started":   started,
        "completed": completed,
        "pct":       round((completed / total * 100) if total else 0, 1),
        "by_track":  by_track,
    }