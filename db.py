import sqlite3
from datetime import date, datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash

DB_PATH = "life_dashboard.db"


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS meal_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER REFERENCES users(id),
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
                user_id INTEGER REFERENCES users(id),
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

        # Migrate: add user_id column to existing tables if absent
        for table in ("meal_logs", "workout_logs"):
            try:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN user_id INTEGER REFERENCES users(id)")
                conn.commit()
            except Exception:
                pass  # column already exists

        # Migrate: assign orphaned rows (no user_id) to user 1 if they exist
        conn.execute("UPDATE meal_logs    SET user_id = 1 WHERE user_id IS NULL AND EXISTS (SELECT 1 FROM users WHERE id = 1)")
        conn.execute("UPDATE workout_logs SET user_id = 1 WHERE user_id IS NULL AND EXISTS (SELECT 1 FROM users WHERE id = 1)")
        conn.commit()


# ── Auth ────────────────────────────────────────────────

def create_user(username, password):
    """Returns new user_id on success, None if username is already taken."""
    with get_conn() as conn:
        try:
            cur = conn.execute(
                "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                (username.strip().lower(), generate_password_hash(password), datetime.now().isoformat()),
            )
            conn.commit()
            return cur.lastrowid
        except sqlite3.IntegrityError:
            return None


def verify_user(username, password):
    """Returns user_id if credentials are valid, else None."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, password_hash FROM users WHERE username = ?",
            (username.strip().lower(),),
        ).fetchone()
    if row and check_password_hash(row["password_hash"], password):
        return row["id"]
    return None


def get_user(user_id):
    with get_conn() as conn:
        row = conn.execute("SELECT id, username FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


# ── Meals ────────────────────────────────────────────────

def insert_meal(user_id, description, calories, protein_g, carbs_g, fat_g):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO meal_logs (user_id, logged_at, log_date, description, calories, protein_g, carbs_g, fat_g) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (user_id, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), date.today().isoformat(), description, calories, protein_g, carbs_g, fat_g),
        )
        conn.commit()


def get_today_meals(user_id):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM meal_logs WHERE user_id = ? AND log_date = ? ORDER BY logged_at",
            (user_id, date.today().isoformat()),
        ).fetchall()
    return [dict(r) for r in rows]


def get_today_totals(user_id):
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT
                COUNT(*) as meal_count,
                COALESCE(SUM(calories), 0) as total_calories,
                COALESCE(SUM(protein_g), 0) as total_protein,
                COALESCE(SUM(carbs_g), 0) as total_carbs,
                COALESCE(SUM(fat_g), 0) as total_fat
            FROM meal_logs WHERE user_id = ? AND log_date = ?
            """,
            (user_id, date.today().isoformat()),
        ).fetchone()
    return dict(row)


def delete_meal(meal_id, user_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM meal_logs WHERE id = ? AND user_id = ?", (meal_id, user_id))
        conn.commit()


# ── Workouts ─────────────────────────────────────────────

def insert_workout(user_id, description, calories_burned=0):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO workout_logs (user_id, logged_at, log_date, description, calories_burned) VALUES (?, ?, ?, ?, ?)",
            (user_id, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), date.today().isoformat(), description, calories_burned),
        )
        conn.commit()


def get_today_workouts(user_id):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM workout_logs WHERE user_id = ? AND log_date = ? ORDER BY logged_at",
            (user_id, date.today().isoformat()),
        ).fetchall()
    return [dict(r) for r in rows]


def delete_workout(workout_id, user_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM workout_logs WHERE id = ? AND user_id = ?", (workout_id, user_id))
        conn.commit()


def get_today_workout_burn(user_id):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT COALESCE(SUM(calories_burned), 0) as total FROM workout_logs WHERE user_id = ? AND log_date = ?",
            (user_id, date.today().isoformat()),
        ).fetchone()
    return int(dict(row)["total"])


def get_meal_history(user_id, days=90):
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
            WHERE user_id = ? AND log_date >= ?
            GROUP BY log_date
            ORDER BY log_date
        """, (user_id, cutoff)).fetchall()
    return {r["log_date"]: {"calories": r["calories"], "protein": r["protein"],
                            "carbs": r["carbs"], "fat": r["fat"]} for r in rows}


def get_workout_history(user_id, days=90):
    """Per-date list of workouts for the last N days."""
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT log_date, description, calories_burned
            FROM workout_logs
            WHERE user_id = ? AND log_date >= ?
            ORDER BY log_date, logged_at
        """, (user_id, cutoff)).fetchall()
    result = {}
    for r in rows:
        d = r["log_date"]
        if d not in result:
            result[d] = []
        result[d].append({"description": r["description"], "calories_burned": r["calories_burned"]})
    return result


def get_day_detail(user_id, date_str):
    """Returns individual meal and workout rows for a specific date."""
    with get_conn() as conn:
        meals    = conn.execute(
            "SELECT * FROM meal_logs WHERE user_id = ? AND log_date = ? ORDER BY logged_at",
            (user_id, date_str)
        ).fetchall()
        workouts = conn.execute(
            "SELECT * FROM workout_logs WHERE user_id = ? AND log_date = ? ORDER BY logged_at",
            (user_id, date_str)
        ).fetchall()
    return {
        "meals":    [dict(r) for r in meals],
        "workouts": [dict(r) for r in workouts],
    }
