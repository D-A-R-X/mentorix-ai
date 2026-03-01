import sqlite3
from datetime import datetime

DB_NAME = "mentorix.db"


def init_db():
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS assessments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            risk_level TEXT,
            stability_score REAL,
            created_at TEXT
        )
    """)

    conn.commit()
    conn.close()


def save_assessment(user_id: str, risk_level: str, stability_score: float):
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO assessments (user_id, risk_level, stability_score, created_at)
        VALUES (?, ?, ?, ?)
    """, (user_id, risk_level, stability_score, datetime.utcnow().isoformat()))

    conn.commit()
    conn.close()


def get_user_history(user_id: str):
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()

    cursor.execute("""
        SELECT risk_level, stability_score, created_at
        FROM assessments
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 5
    """, (user_id,))

    rows = cursor.fetchall()
    conn.close()

    return [
        {
            "risk_level": row[0],
            "stability_score": row[1],
            "created_at": row[2]
        }
        for row in rows
    ]