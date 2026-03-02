import sqlite3
import os
from datetime import datetime, timezone
from typing import List, Dict, Any

# ✅ Use absolute path so it works from any working directory
DB_NAME = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mentorix.db")


def get_connection():
    """✅ Centralized connection with WAL mode for better concurrent access."""
    conn = sqlite3.connect(DB_NAME)
    conn.execute("PRAGMA journal_mode=WAL")  # handles multiple readers/writers
    conn.row_factory = sqlite3.Row          # allows dict-style row access
    return conn


def init_db():
    with get_connection() as conn:
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
        conn.commit()


def save_assessment(email: str, risk_level: str, stability_score: float, track: str = "unknown") -> None:
    with get_connection() as conn:
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


def get_user_history(email: str, limit: int = 10) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.execute("""
            SELECT risk_level, stability_score, track, created_at
            FROM assessments
            WHERE email = ?
            ORDER BY created_at DESC
            LIMIT ?
        """, (email, limit))
        rows = cursor.fetchall()

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
    """✅ New: useful for frontend to show total sessions count."""
    with get_connection() as conn:
        cursor = conn.execute(
            "SELECT COUNT(*) FROM assessments WHERE email = ?", (email,)
        )
        return cursor.fetchone()[0]
import sqlite3
from pathlib import Path
from datetime import datetime

DB_PATH = Path(__file__).with_name("mentorix.db")


def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS assessments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            persona TEXT,
            csi_score REAL,
            risk_level TEXT,
            created_at TEXT
        )
    """)

    conn.commit()
    conn.close()


def save_assessment(user_id: str, persona: str, csi_score: float, risk_level: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO assessments (user_id, persona, csi_score, risk_level, created_at)
        VALUES (?, ?, ?, ?, ?)
    """, (user_id, persona, csi_score, risk_level, datetime.utcnow().isoformat()))

    conn.commit()
    conn.close()


def get_user_history(user_id: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("""
        SELECT csi_score, created_at
        FROM assessments
        WHERE user_id = ?
        ORDER BY created_at ASC
    """, (user_id,))

    rows = cursor.fetchall()
    conn.close()

    return rows