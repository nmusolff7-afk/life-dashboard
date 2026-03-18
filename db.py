import sqlite3
from datetime import date, datetime

DB_PATH = "life_dashboard.db"


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS meal_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                log_date DATE NOT NULL,
                description TEXT NOT NULL,
                calories INTEGER,
                protein_g REAL,
                carbs_g REAL,
                fat_g REAL
            )
        """)
        conn.commit()


def insert_meal(description, calories, protein_g, carbs_g, fat_g):
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO meal_logs (logged_at, log_date, description, calories, protein_g, carbs_g, fat_g)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), date.today().isoformat(), description, calories, protein_g, carbs_g, fat_g),
        )
        conn.commit()


def get_today_meals():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM meal_logs WHERE log_date = ? ORDER BY logged_at",
            (date.today().isoformat(),),
        ).fetchall()
    return [dict(r) for r in rows]


def get_today_totals():
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT
                COUNT(*) as meal_count,
                COALESCE(SUM(calories), 0) as total_calories,
                COALESCE(SUM(protein_g), 0) as total_protein,
                COALESCE(SUM(carbs_g), 0) as total_carbs,
                COALESCE(SUM(fat_g), 0) as total_fat
            FROM meal_logs
            WHERE log_date = ?
            """,
            (date.today().isoformat(),),
        ).fetchone()
    return dict(row)


def delete_meal(meal_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM meal_logs WHERE id = ?", (meal_id,))
        conn.commit()
