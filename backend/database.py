import os
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

logger = logging.getLogger("mentorix-api")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://mentorix_db_user:eGSul5Yl3hPi11eQRncFyhIxVBpdCx9o@dpg-d6l6katm5p6s73979qjg-a.virginia-postgres.render.com/mentorix_db")

# ── Connection ───────────────────────────────────────────────────

def get_connection():
    import psycopg2
    import psycopg2.extras
    conn = psycopg2.connect(DATABASE_URL)
    return conn


def init_db():
    conn = get_connection()
    cur  = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id            SERIAL PRIMARY KEY,
            email         TEXT NOT NULL UNIQUE,
            password_hash TEXT,
            name          TEXT,
            picture       TEXT,
            auth_provider TEXT NOT NULL DEFAULT 'email',
            created_at    TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS assessments (
            id              SERIAL PRIMARY KEY,
            email           TEXT NOT NULL,
            risk_level      TEXT NOT NULL,
            stability_score REAL NOT NULL,
            scan_result     TEXT,
            track           TEXT NOT NULL DEFAULT 'unknown',
            created_at      TEXT NOT NULL
        )
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS voice_sessions (
        id             SERIAL PRIMARY KEY,
        email          TEXT NOT NULL,
        transcript     TEXT,
        summary        TEXT,
        tab_warnings   INTEGER DEFAULT 0,
        exchange_count INTEGER DEFAULT 0,
        scores         TEXT DEFAULT '{}',
        overall_score  INTEGER DEFAULT 0,
        mode           TEXT DEFAULT 'voice',
        created_at     TIMESTAMP DEFAULT NOW()
    )
""")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS honor_events (
            id           SERIAL PRIMARY KEY,
            email        TEXT NOT NULL,
            event_type   TEXT NOT NULL,
            delta        INTEGER NOT NULL,
            running_score INTEGER NOT NULL,
            note         TEXT,
            created_at   TIMESTAMP DEFAULT NOW()
        )
""")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS course_completions (
            id           SERIAL PRIMARY KEY,
            email        TEXT NOT NULL,
            course_title TEXT NOT NULL,
            course_url   TEXT NOT NULL,
            provider     TEXT,
            track        TEXT,
            status       TEXT NOT NULL DEFAULT 'started',
            started_at   TEXT NOT NULL,
            completed_at TEXT,
            UNIQUE(email, course_url)
        )
    """)

    # Indexes
    cur.execute("CREATE INDEX IF NOT EXISTS idx_assessments_email ON assessments (email)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_completions_email ON course_completions (email)")

    conn.commit()
    cur.close()
    conn.close()
    logger.info("PostgreSQL database initialized")


def migrate_db():
    """Safe column additions for schema upgrades."""
    conn = get_connection()
    cur  = conn.cursor()
    migrations = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS picture TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'email'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS year TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS semester TEXT",
        "ALTER TABLE course_completions ADD COLUMN IF NOT EXISTS provider TEXT",
        "ALTER TABLE course_completions ADD COLUMN IF NOT EXISTS track TEXT",
        "ALTER TABLE assessments ADD COLUMN IF NOT EXISTS scan_result TEXT",  # ← ADD THIS
    ]
    for sql in migrations:
        try:
            cur.execute(sql)
            conn.commit()
        except Exception:
            conn.rollback()
    cur.close()
    conn.close()


# ── User functions ───────────────────────────────────────────────

def create_user(
    email: str,
    password_hash: Optional[str] = None,
    name: str = None,
    picture: str = None,
    auth_provider: str = "email"
) -> bool:
    try:
        conn = get_connection()
        cur  = conn.cursor()
        cur.execute("""
            INSERT INTO users (email, password_hash, name, picture, auth_provider, created_at)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            email.lower().strip(), password_hash, name, picture,
            auth_provider, datetime.now(timezone.utc).isoformat()
        ))
        conn.commit()
        cur.close()
        conn.close()
        return True
    except Exception:
        return False


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(
        "SELECT id, email, password_hash, name, picture, auth_provider, created_at FROM users WHERE email = %s",
        (email.lower().strip(),)
    )
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row:
        return None
    return {
        "id": row[0], "email": row[1], "password_hash": row[2],
        "name": row[3], "picture": row[4], "auth_provider": row[5], "created_at": row[6]
    }


def upsert_google_user(email: str, name: str, picture: str) -> Dict[str, Any]:
    existing = get_user_by_email(email)
    if existing:
        conn = get_connection()
        cur  = conn.cursor()
        cur.execute(
            "UPDATE users SET name = %s, picture = %s, auth_provider = 'google' WHERE email = %s",
            (name, picture, email.lower().strip())
        )
        conn.commit()
        cur.close()
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
    track: str = "unknown",
    scan_result: dict = None
) -> None:
    import json
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("""
        INSERT INTO assessments (email, risk_level, stability_score, track, scan_result, created_at)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (email, risk_level, round(stability_score, 4), track,
          json.dumps(scan_result) if scan_result else None,
          datetime.now(timezone.utc).isoformat()))
    conn.commit()
    cur.close()
    conn.close()


def get_user_history(email: str, limit: int = 10) -> List[Dict[str, Any]]:
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("""
        SELECT risk_level, stability_score, track, scan_result, created_at
        FROM assessments WHERE email = %s
        ORDER BY created_at DESC LIMIT %s
    """, (email, limit))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    import json
    return [
        {"risk_level": r[0], "stability_score": r[1], "track": r[2],
         "scan_result": json.loads(r[3]) if r[3] else None, "created_at": r[4]}
        for r in rows
    ]


def get_assessment_count(email: str) -> int:
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM assessments WHERE email = %s", (email,))
    count = cur.fetchone()[0]
    cur.close()
    conn.close()
    return count


# ── Course completion functions ──────────────────────────────────

def upsert_course_completion(
    email: str, course_title: str, course_url: str,
    provider: str, track: str, status: str
) -> None:
    conn = get_connection()
    cur  = conn.cursor()
    now  = datetime.now(timezone.utc).isoformat()

    cur.execute(
        "SELECT id, status FROM course_completions WHERE email = %s AND course_url = %s",
        (email, course_url)
    )
    existing = cur.fetchone()

    if existing:
        if status == "completed":
            cur.execute(
                "UPDATE course_completions SET status = 'completed', completed_at = %s WHERE email = %s AND course_url = %s",
                (now, email, course_url)
            )
        else:
            cur.execute(
                "UPDATE course_completions SET status = %s WHERE email = %s AND course_url = %s AND status != 'completed'",
                (status, email, course_url)
            )
    else:
        cur.execute("""
            INSERT INTO course_completions
                (email, course_title, course_url, provider, track, status, started_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (email, course_title, course_url, provider, track, status, now))

    conn.commit()
    cur.close()
    conn.close()


def get_course_completions(email: str) -> List[Dict[str, Any]]:
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("""
        SELECT course_title, course_url, provider, track, status, started_at, completed_at
        FROM course_completions WHERE email = %s
        ORDER BY started_at DESC
    """, (email,))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [
        {"course_title": r[0], "course_url": r[1], "provider": r[2],
         "track": r[3], "status": r[4], "started_at": r[5], "completed_at": r[6]}
        for r in rows
    ]


def get_completion_stats(email: str) -> Dict[str, Any]:
    completions = get_course_completions(email)
    total     = len(completions)
    completed = sum(1 for c in completions if c["status"] == "completed")
    started   = sum(1 for c in completions if c["status"] == "started")
    by_track  = {}
    for c in completions:
        t = c["track"] or "unknown"
        if t not in by_track:
            by_track[t] = {"started": 0, "completed": 0}
        by_track[t][c["status"]] = by_track[t].get(c["status"], 0) + 1
    return {
        "total": total, "started": started, "completed": completed,
        "pct": round((completed / total * 100) if total else 0, 1),
        "by_track": by_track,
    }

# Migration: add new columns to voice_sessions if not exist
def migrate_voice_sessions():
    try:
        conn = get_connection(); cur = conn.cursor()
        for col, typ in [("scores","TEXT"),("overall_score","INTEGER"),("mode","TEXT")]:
            try:
                cur.execute(f"ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS {col} {typ}")
            except: pass
        conn.commit(); cur.close(); conn.close()
    except Exception as e:
        print(f"Migration warning: {e}")
