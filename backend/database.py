import os
import sqlite3
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

logger = logging.getLogger("mentorix-api")

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "mentorix.db")

DEMO_MODE = False  # Set to False to use SQLite

def get_connection():
    if DEMO_MODE:
        from database_demo import MockConnection
        return MockConnection()
    
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            email         TEXT NOT NULL UNIQUE,
            password_hash TEXT,
            name          TEXT,
            picture       TEXT,
            auth_provider TEXT NOT NULL DEFAULT 'email',
            department    TEXT,
            year          TEXT,
            semester      TEXT,
            institution_id INTEGER,
            is_suspended  INTEGER DEFAULT 0,
            created_at    TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS voice_sessions (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            email           TEXT NOT NULL,
            summary         TEXT,
            tab_warnings    INTEGER DEFAULT 0,
            tab_switches    INTEGER DEFAULT 0,
            exchange_count  INTEGER DEFAULT 0,
            scores          TEXT,
            overall_score   INTEGER,
            mode            TEXT DEFAULT 'voice',
            forced_end      INTEGER DEFAULT 0,
            questions_answered INTEGER DEFAULT 0,
            department      TEXT,
            answers         TEXT,
            created_at      TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS honor_events (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            email           TEXT NOT NULL,
            event_type      TEXT NOT NULL,
            delta           INTEGER NOT NULL,
            running_score   INTEGER,
            note            TEXT,
            created_at      TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS course_completions (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            email           TEXT NOT NULL,
            course_title    TEXT,
            course_url      TEXT,
            provider        TEXT,
            track           TEXT,
            status          TEXT,
            completed_at    TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS institutions (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT NOT NULL,
            contact_email   TEXT,
            env             TEXT DEFAULT 'dev',
            college_code    TEXT,
            active          INTEGER DEFAULT 1,
            created_at      TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS assessments (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            email           TEXT NOT NULL,
            department      TEXT,
            score           INTEGER,
            answers         TEXT,
            submitted_at    TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Add default demo user
    try:
        cur.execute("INSERT OR IGNORE INTO users (email, name, auth_provider) VALUES (?, ?, ?)", 
                   ("demo@mentorix.ai", "Demo User", "email"))
        cur.execute("INSERT OR IGNORE INTO users (email, name, auth_provider) VALUES (?, ?, ?)", 
                   ("admin@mentorix.ai", "Admin User", "email"))
        
        # Add sample voice session
        cur.execute("INSERT OR IGNORE INTO voice_sessions (email, summary, mode, overall_score, exchange_count) VALUES (?, ?, ?, ?, ?)",
                   ("demo@mentorix.ai", "Practice interview session", "interview", 85, 12))
        
        conn.commit()
        logger.info("Database initialized with demo data")
    except Exception as e:
        logger.warning(f"Init data warning: {e}")

    cur.close()
    conn.close()


def get_user_by_email(email: str) -> Optional[Dict]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE email = ?", (email,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    return dict(row) if row else None


def create_user(email: str, name: str = "", password_hash: str = "", auth_provider: str = "email") -> bool:
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("INSERT INTO users (email, name, password_hash, auth_provider) VALUES (?, ?, ?, ?)",
                   (email, name, password_hash, auth_provider))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        cur.close()
        conn.close()


def save_assessment(email: str, department: str, score: int, answers: dict) -> bool:
    conn = get_connection()
    cur = conn.cursor()
    import json
    try:
        cur.execute("INSERT INTO assessments (email, department, score, answers) VALUES (?, ?, ?, ?)",
                   (email, department, score, json.dumps(answers)))
        conn.commit()
        return True
    except Exception as e:
        logger.warning(f"save_assessment failed: {e}")
        return False
    finally:
        cur.close()
        conn.close()


def get_user_history(email: str) -> List[Dict]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT 'voice_session' as type, mode, overall_score as score, created_at
        FROM voice_sessions WHERE email = ? ORDER BY created_at DESC LIMIT 20
    """, (email,))
    rows = [dict(r) for r in cur.fetchall()]
    cur.close()
    conn.close()
    return rows


def get_course_completions(email: str) -> List[Dict]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM course_completions WHERE email = ?", (email,))
    rows = [dict(r) for r in cur.fetchall()]
    cur.close()
    conn.close()
    return rows


def get_completion_stats(email: str) -> Dict:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT status, COUNT(*) as cnt FROM course_completions WHERE email = ? GROUP BY status", (email,))
    stats = {r[0]: r[1] for r in cur.fetchall()}
    cur.execute("SELECT COUNT(*) FROM course_completions WHERE email = ?", (email,))
    total = cur.fetchone()[0]
    cur.close()
    conn.close()
    return {"total": total, "completed": stats.get("completed", 0), "in_progress": stats.get("in_progress", 0)}


def upsert_course_completion(email: str, course_title: str, course_url: str = "", provider: str = "", track: str = "", status: str = "in_progress"):
    conn = get_connection()
    cur = conn.cursor()
    from datetime import datetime
    cur.execute("""
        INSERT INTO course_completions (email, course_title, course_url, provider, track, status, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (email, course_title, course_url, provider, track, status, datetime.now().isoformat() if status == "completed" else None))
    conn.commit()
    cur.close()
    conn.close()


def save_voice_session(email: str, summary: str, mode: str, overall: int, scores: dict, exchange_count: int, tab_warnings: int = 0) -> bool:
    conn = get_connection()
    cur = conn.cursor()
    import json
    try:
        cur.execute("""
            INSERT INTO voice_sessions (email, summary, mode, overall_score, scores, exchange_count, tab_warnings)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (email, summary, mode, overall, json.dumps(scores), exchange_count, tab_warnings))
        conn.commit()
        return True
    except Exception as e:
        logger.warning(f"save_voice_session failed: {e}")
        return False
    finally:
        cur.close()
        conn.close()


def get_honor_score(email: str) -> int:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT MAX(running_score) FROM honor_events WHERE email = ?", (email,))
    row = cur.fetchone()
    score = row[0] if row and row[0] else 100
    cur.close()
    conn.close()
    return score


def add_honor_event(email: str, event_type: str, delta: int, note: str = "") -> bool:
    conn = get_connection()
    cur = conn.cursor()
    current = get_honor_score(email)
    new_score = current + delta
    try:
        cur.execute("INSERT INTO honor_events (email, event_type, delta, running_score, note) VALUES (?, ?, ?, ?, ?)",
                   (email, event_type, delta, new_score, note))
        conn.commit()
        return True
    except Exception as e:
        logger.warning(f"add_honor_event failed: {e}")
        return False
    finally:
        cur.close()
        conn.close()


def upsert_google_user(email: str, name: str = "", picture: str = "") -> Dict:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE email = ?", (email,))
    existing = cur.fetchone()
    
    if existing:
        cur.execute("UPDATE users SET name = ?, picture = ? WHERE email = ?", (name, picture, email))
    else:
        cur.execute("INSERT INTO users (email, name, picture, auth_provider) VALUES (?, ?, ?, 'google')", 
                   (email, name, picture))
    
    conn.commit()
    cur.execute("SELECT * FROM users WHERE email = ?", (email,))
    user = dict(cur.fetchone())
    cur.close()
    conn.close()
    return user


def create_institution(name: str, contact_email: str = "", env: str = "dev", college_code: str = "") -> int:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("INSERT INTO institutions (name, contact_email, env, college_code) VALUES (?, ?, ?, ?)",
               (name, contact_email, env, college_code))
    conn.commit()
    new_id = cur.lastrowid
    cur.close()
    conn.close()
    return new_id


def get_institutions(env: str = None) -> List[Dict]:
    conn = get_connection()
    cur = conn.cursor()
    if env:
        cur.execute("SELECT * FROM institutions WHERE active = 1 AND env = ?", (env,))
    else:
        cur.execute("SELECT * FROM institutions WHERE active = 1")
    rows = [dict(r) for r in cur.fetchall()]
    cur.close()
    conn.close()
    return rows