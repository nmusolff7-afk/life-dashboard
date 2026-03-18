import sqlite3
from datetime import date, datetime, timedelta

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
                logged_at TIMESTAMP NOT NULL,
                log_date DATE NOT NULL,
                description TEXT NOT NULL,
                calories INTEGER,
                protein_g REAL,
                carbs_g REAL,
                fat_g REAL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS workout_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                logged_at TIMESTAMP NOT NULL,
                log_date DATE NOT NULL,
                description TEXT NOT NULL,
                calories_burned INTEGER DEFAULT 0
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS daily_activity (
                log_date DATE NOT NULL PRIMARY KEY,
                miles_run REAL DEFAULT 0,
                gym_session INTEGER DEFAULT 0,
                other_burn INTEGER DEFAULT 0
            )
        """)
        conn.commit()


# ── Meals ──────────────────────────────────────────────

def insert_meal(description, calories, protein_g, carbs_g, fat_g):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO meal_logs (logged_at, log_date, description, calories, protein_g, carbs_g, fat_g) VALUES (?, ?, ?, ?, ?, ?, ?)",
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
            FROM meal_logs WHERE log_date = ?
            """,
            (date.today().isoformat(),),
        ).fetchone()
    return dict(row)


def delete_meal(meal_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM meal_logs WHERE id = ?", (meal_id,))
        conn.commit()


# ── Workouts ───────────────────────────────────────────

def insert_workout(description, calories_burned=0):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO workout_logs (logged_at, log_date, description, calories_burned) VALUES (?, ?, ?, ?)",
            (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), date.today().isoformat(), description, calories_burned),
        )
        conn.commit()


def get_today_workouts():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM workout_logs WHERE log_date = ? ORDER BY logged_at",
            (date.today().isoformat(),),
        ).fetchall()
    return [dict(r) for r in rows]


def delete_workout(workout_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM workout_logs WHERE id = ?", (workout_id,))
        conn.commit()


def get_meal_history(days=90):
    """Per-date macro totals for the last N days."""
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT log_date,
                   COALESCE(SUM(calories), 0)   as calories,
                   COALESCE(SUM(protein_g), 0)  as protein,
                   COALESCE(SUM(carbs_g), 0)    as carbs,
                   COALESCE(SUM(fat_g), 0)      as fat
            FROM meal_logs
            WHERE log_date >= ?
            GROUP BY log_date
            ORDER BY log_date
        """, (cutoff,)).fetchall()
    return {r["log_date"]: {"calories": r["calories"], "protein": r["protein"],
                            "carbs": r["carbs"], "fat": r["fat"]} for r in rows}


def get_workout_history(days=90):
    """Per-date list of workouts for the last N days."""
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT log_date, description, calories_burned
            FROM workout_logs
            WHERE log_date >= ?
            ORDER BY log_date, logged_at
        """, (cutoff,)).fetchall()
    result = {}
    for r in rows:
        d = r["log_date"]
        if d not in result:
            result[d] = []
        result[d].append({"description": r["description"], "calories_burned": r["calories_burned"]})
    return result


def get_day_detail(date_str):
    """Returns individual meal and workout rows for a specific date."""
    with get_conn() as conn:
        meals    = conn.execute(
            "SELECT * FROM meal_logs WHERE log_date = ? ORDER BY logged_at",
            (date_str,)
        ).fetchall()
        workouts = conn.execute(
            "SELECT * FROM workout_logs WHERE log_date = ? ORDER BY logged_at",
            (date_str,)
        ).fetchall()
    return {
        "meals":    [dict(r) for r in meals],
        "workouts": [dict(r) for r in workouts],
    }


def get_today_workout_burn():
    with get_conn() as conn:
        row = conn.execute(
            "SELECT COALESCE(SUM(calories_burned), 0) as total FROM workout_logs WHERE log_date = ?",
            (date.today().isoformat(),),
        ).fetchone()
    return int(dict(row)["total"])


# ── Daily Activity ─────────────────────────────────────

def get_today_activity():
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM daily_activity WHERE log_date = ?",
            (date.today().isoformat(),),
        ).fetchone()
    return dict(row) if row else {"log_date": date.today().isoformat(), "miles_run": 0, "gym_session": 0, "other_burn": 0}


def upsert_activity(miles_run, gym_session, other_burn):
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO daily_activity (log_date, miles_run, gym_session, other_burn)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(log_date) DO UPDATE SET
                miles_run  = excluded.miles_run,
                gym_session = excluded.gym_session,
                other_burn = excluded.other_burn
        """, (date.today().isoformat(), float(miles_run), int(gym_session), int(other_burn)))
        conn.commit()
