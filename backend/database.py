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