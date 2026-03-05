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

    # Assessments table (existing)
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

    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_assessments_email
        ON assessments (email)
    """)

    # Users table (new)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            email         TEXT    NOT NULL UNIQUE,
            password_hash TEXT    NOT NULL,
            name          TEXT,
            created_at    TEXT    NOT NULL
        )
    """)

    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_users_email
        ON users (email)
    """)

    conn.commit()
    conn.close()


# ── User functions ──────────────────────────────────────────────

def create_user(email: str, password_hash: str, name: str = None) -> bool:
    """Returns True if created, False if email already exists."""
    try:
        conn = get_connection()
        conn.execute("""
            INSERT INTO users (email, password_hash, name, created_at)
            VALUES (?, ?, ?, ?)
        """, (
            email.lower().strip(),
            password_hash,
            name,
            datetime.now(timezone.utc).isoformat()
        ))
        conn.commit()
        conn.close()
        return True
    except sqlite3.IntegrityError:
        return False  # email already exists


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.execute(
        "SELECT id, email, password_hash, name, created_at FROM users WHERE email = ?",
        (email.lower().strip(),)
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id":            row["id"],
        "email":         row["email"],
        "password_hash": row["password_hash"],
        "name":          row["name"],
        "created_at":    row["created_at"],
    }


# ── Assessment functions (unchanged) ───────────────────────────

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
        FROM assessments
        WHERE email = ?
        ORDER BY created_at DESC
        LIMIT ?
    """, (email, limit))
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "risk_level":      row["risk_level"],
            "stability_score": row["stability_score"],
            "track":           row["track"],
            "created_at":      row["created_at"],
        }
        for row in rows
    ]


def get_assessment_count(email: str) -> int:
    conn = get_connection()
    cursor = conn.execute(
        "SELECT COUNT(*) FROM assessments WHERE email = ?", (email,)
    )
    count = cursor.fetchone()[0]
    conn.close()
    return count