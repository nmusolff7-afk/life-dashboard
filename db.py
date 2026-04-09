# MIGRATION TODO (before scaling to multi-user API):
# 1. Replace SQLite with PostgreSQL — swap get_conn() to use psycopg2/SQLAlchemy, queries are already standard SQL
# 2. Move Garmin tokens to per-user table: user_garmin_tokens(user_id, token_key, token_value)
# 3. Replace background polling thread with Celery + Redis job queue, one job per user

import os
import sqlite3
from datetime import date, datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash

DB_PATH = os.environ.get("DB_PATH", "life_dashboard.db")


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
                user_id INTEGER REFERENCES users(id),
                log_date DATE NOT NULL,
                miles_run REAL DEFAULT 0,
                gym_session INTEGER DEFAULT 0,
                other_burn INTEGER DEFAULT 0,
                PRIMARY KEY (user_id, log_date)
            )
        """)
        # Garmin daily stats (steps, calories, HR) — one row per user per date
        conn.execute("""
            CREATE TABLE IF NOT EXISTS garmin_daily (
                user_id  INTEGER REFERENCES users(id),
                stat_date DATE NOT NULL,
                steps INTEGER DEFAULT 0,
                active_calories INTEGER DEFAULT 0,
                total_calories INTEGER DEFAULT 0,
                resting_hr INTEGER,
                synced_at TIMESTAMP NOT NULL,
                PRIMARY KEY (user_id, stat_date)
            )
        """)
        # Sleep logs — one row per user per date (device-agnostic universal fields)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sleep_logs (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id       INTEGER REFERENCES users(id),
                sleep_date    DATE NOT NULL,
                total_seconds INTEGER DEFAULT 0,
                deep_seconds  INTEGER DEFAULT 0,
                light_seconds INTEGER DEFAULT 0,
                rem_seconds   INTEGER DEFAULT 0,
                awake_seconds INTEGER DEFAULT 0,
                sleep_score   INTEGER,
                source        TEXT DEFAULT 'garmin',
                synced_at     TIMESTAMP NOT NULL,
                UNIQUE(user_id, sleep_date)
            )
        """)
        # Key-value store for app-level settings (e.g. garth OAuth tokens)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS app_settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)
        # User onboarding: raw page inputs + Claude-generated 200-var profile map
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_onboarding (
                user_id    INTEGER PRIMARY KEY REFERENCES users(id),
                completed  INTEGER DEFAULT 0,
                raw_inputs TEXT DEFAULT '{}',
                profile_map TEXT DEFAULT '{}',
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS mind_checkins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER REFERENCES users(id),
                checkin_date DATE NOT NULL,
                type TEXT NOT NULL,
                goals TEXT DEFAULT '',
                notes TEXT NOT NULL,
                focus INTEGER NOT NULL,
                wellbeing INTEGER NOT NULL,
                summary TEXT NOT NULL,
                created_at TIMESTAMP NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS mind_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER REFERENCES users(id),
                task_date DATE NOT NULL,
                description TEXT NOT NULL,
                completed INTEGER DEFAULT 0,
                source TEXT DEFAULT 'manual',
                created_at TIMESTAMP NOT NULL
            )
        """)
        # Gmail OAuth tokens — one row per user
        conn.execute("""
            CREATE TABLE IF NOT EXISTS gmail_tokens (
                user_id       INTEGER PRIMARY KEY REFERENCES users(id),
                access_token  TEXT NOT NULL,
                refresh_token TEXT NOT NULL,
                token_expiry  TEXT NOT NULL,
                email_address TEXT DEFAULT '',
                connected_at  TIMESTAMP NOT NULL
            )
        """)
        # Gmail email cache — recent threads for summarization
        conn.execute("""
            CREATE TABLE IF NOT EXISTS gmail_cache (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id       INTEGER REFERENCES users(id),
                thread_id     TEXT NOT NULL,
                message_id    TEXT NOT NULL,
                sender        TEXT NOT NULL,
                subject       TEXT DEFAULT '',
                snippet       TEXT DEFAULT '',
                received_at   TEXT NOT NULL,
                has_replied   INTEGER DEFAULT 0,
                is_read       INTEGER DEFAULT 0,
                cached_at     TIMESTAMP NOT NULL,
                UNIQUE(user_id, message_id)
            )
        """)
        # Gmail daily summaries — AI-generated, one per user per date
        conn.execute("""
            CREATE TABLE IF NOT EXISTS gmail_summaries (
                user_id      INTEGER REFERENCES users(id),
                summary_date DATE NOT NULL,
                summary_text TEXT NOT NULL,
                email_count  INTEGER DEFAULT 0,
                unreplied    INTEGER DEFAULT 0,
                generated_at TIMESTAMP NOT NULL,
                PRIMARY KEY (user_id, summary_date)
            )
        """)
        # User goals — stores the active goal and computed targets
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_goals (
                user_id         INTEGER PRIMARY KEY REFERENCES users(id),
                goal_key        TEXT NOT NULL DEFAULT 'lose_weight',
                calorie_target  INTEGER NOT NULL,
                protein_g       INTEGER NOT NULL,
                fat_g           INTEGER NOT NULL,
                carbs_g         INTEGER NOT NULL,
                deficit_surplus INTEGER DEFAULT 0,
                rmr             INTEGER NOT NULL,
                rmr_method      TEXT DEFAULT 'mifflin_st_jeor',
                tdee_used       INTEGER DEFAULT 0,
                config_json     TEXT DEFAULT '{}',
                sources_json    TEXT DEFAULT '[]',
                created_at      TIMESTAMP NOT NULL,
                updated_at      TIMESTAMP NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS daily_momentum (
                user_id         INTEGER REFERENCES users(id),
                score_date      DATE NOT NULL,
                momentum_score  INTEGER NOT NULL,
                nutrition_pct   REAL DEFAULT 0,
                protein_pct     REAL DEFAULT 0,
                activity_pct    REAL DEFAULT 0,
                checkin_done    INTEGER DEFAULT 0,
                task_rate       REAL DEFAULT 0,
                wellbeing_delta REAL DEFAULT 0,
                computed_at     TIMESTAMP NOT NULL,
                PRIMARY KEY (user_id, score_date)
            )
        """)
        conn.commit()

        # Migrate: add garmin_activity_id to workout_logs to prevent duplicate imports
        try:
            conn.execute("ALTER TABLE workout_logs ADD COLUMN garmin_activity_id TEXT")
            conn.commit()
        except Exception:
            pass  # column already exists

        # Migrate: add user_id column to existing tables if absent
        for table in ("meal_logs", "workout_logs"):
            try:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN user_id INTEGER REFERENCES users(id)")
                conn.commit()
            except Exception:
                pass  # column already exists

        # Migrate: add user_id to daily_activity if absent
        try:
            conn.execute("ALTER TABLE daily_activity ADD COLUMN user_id INTEGER REFERENCES users(id)")
            conn.commit()
        except Exception:
            pass  # column already exists

        # Migrate: add weight_lbs to daily_activity if absent
        try:
            conn.execute("ALTER TABLE daily_activity ADD COLUMN weight_lbs REAL")
            conn.commit()
        except Exception:
            pass  # column already exists

        # Migrate: add energy_level, stress_level, sleep_quality, mood_level, focus_level to mind_checkins
        for col in ("energy_level INTEGER", "stress_level INTEGER",
                    "sleep_quality INTEGER", "mood_level INTEGER", "focus_level INTEGER",
                    "evening_prompt TEXT"):
            try:
                conn.execute(f"ALTER TABLE mind_checkins ADD COLUMN {col}")
                conn.commit()
            except Exception:
                pass

        # Migrate: assign orphaned rows (no user_id) to user 1 if they exist
        conn.execute("UPDATE meal_logs      SET user_id = 1 WHERE user_id IS NULL AND EXISTS (SELECT 1 FROM users WHERE id = 1)")
        conn.execute("UPDATE workout_logs   SET user_id = 1 WHERE user_id IS NULL AND EXISTS (SELECT 1 FROM users WHERE id = 1)")
        conn.execute("UPDATE daily_activity SET user_id = 1 WHERE user_id IS NULL AND EXISTS (SELECT 1 FROM users WHERE id = 1)")
        conn.commit()


# ── Auth ────────────────────────────────────────────────

def delete_account(user_id):
    """Permanently delete a user and all their data."""
    with get_conn() as conn:
        conn.execute("DELETE FROM meal_logs    WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM workout_logs WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM garmin_daily WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM users        WHERE id      = ?", (user_id,))
        conn.commit()


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

def insert_meal(user_id, description, calories, protein_g, carbs_g, fat_g, log_date=None, logged_at=None):
    ld = log_date or date.today().isoformat()
    ts = logged_at or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO meal_logs (user_id, logged_at, log_date, description, calories, protein_g, carbs_g, fat_g) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (user_id, ts, ld, description, calories, protein_g, carbs_g, fat_g),
        )
        conn.commit()


def get_today_meals(user_id, log_date=None):
    ld = log_date or date.today().isoformat()
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM meal_logs WHERE user_id = ? AND log_date = ? ORDER BY logged_at",
            (user_id, ld),
        ).fetchall()
    return [dict(r) for r in rows]


def get_today_totals(user_id, log_date=None):
    ld = log_date or date.today().isoformat()
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
            (user_id, ld),
        ).fetchone()
    return dict(row)


def update_meal(meal_id, user_id, description, calories, protein_g, carbs_g, fat_g):
    with get_conn() as conn:
        conn.execute(
            "UPDATE meal_logs SET description=?, calories=?, protein_g=?, carbs_g=?, fat_g=? WHERE id=? AND user_id=?",
            (description, calories, protein_g, carbs_g, fat_g, meal_id, user_id),
        )
        conn.commit()


def delete_meal(meal_id, user_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM meal_logs WHERE id = ? AND user_id = ?", (meal_id, user_id))
        conn.commit()


# ── Workouts ─────────────────────────────────────────────

def insert_workout(user_id, description, calories_burned=0, log_date=None, logged_at=None):
    ld = log_date or date.today().isoformat()
    ts = logged_at or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO workout_logs (user_id, logged_at, log_date, description, calories_burned) VALUES (?, ?, ?, ?, ?)",
            (user_id, ts, ld, description, calories_burned),
        )
        conn.commit()


def get_today_workouts(user_id, log_date=None):
    ld = log_date or date.today().isoformat()
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM workout_logs WHERE user_id = ? AND log_date = ? ORDER BY logged_at",
            (user_id, ld),
        ).fetchall()
    return [dict(r) for r in rows]


def update_workout(workout_id, user_id, description, calories_burned):
    with get_conn() as conn:
        conn.execute(
            "UPDATE workout_logs SET description=?, calories_burned=? WHERE id=? AND user_id=?",
            (description, calories_burned, workout_id, user_id),
        )
        conn.commit()


def delete_workout(workout_id, user_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM workout_logs WHERE id = ? AND user_id = ?", (workout_id, user_id))
        conn.commit()


def get_today_workout_burn(user_id, log_date=None):
    ld = log_date or date.today().isoformat()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT COALESCE(SUM(calories_burned), 0) as total FROM workout_logs WHERE user_id = ? AND log_date = ?",
            (user_id, ld),
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


# ── Garmin ────────────────────────────────────────────

def upsert_garmin_daily(user_id, stat_date, steps, active_calories, total_calories, resting_hr):
    """Insert or replace Garmin daily stats for a user/date."""
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO garmin_daily
                (user_id, stat_date, steps, active_calories, total_calories, resting_hr, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, stat_date) DO UPDATE SET
                steps            = excluded.steps,
                active_calories  = excluded.active_calories,
                total_calories   = excluded.total_calories,
                resting_hr       = excluded.resting_hr,
                synced_at        = excluded.synced_at
        """, (user_id, stat_date, steps, active_calories, total_calories, resting_hr,
              datetime.now().isoformat()))
        conn.commit()


def get_garmin_daily(user_id, stat_date):
    """Return Garmin stats row for a user/date, or None."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM garmin_daily WHERE user_id = ? AND stat_date = ?",
            (user_id, stat_date)
        ).fetchone()
    return dict(row) if row else None


def get_garmin_history(user_id, days=90):
    """Per-date Garmin stats for the last N days. Returns {date: {steps, active_calories, ...}}."""
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT stat_date, steps, active_calories, total_calories, resting_hr "
            "FROM garmin_daily WHERE user_id = ? AND stat_date >= ? ORDER BY stat_date",
            (user_id, cutoff)
        ).fetchall()
    return {r["stat_date"]: {"steps": r["steps"], "active_calories": r["active_calories"],
                              "total_calories": r["total_calories"], "resting_hr": r["resting_hr"]}
            for r in rows}


def get_garmin_last_sync(user_id):
    """Return the most recent synced_at timestamp for any date, or None."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT MAX(synced_at) as last FROM garmin_daily WHERE user_id = ?",
            (user_id,)
        ).fetchone()
    return row["last"] if row else None


# ── Sleep ─────────────────────────────────────────────

def upsert_sleep(user_id: int, sleep_date: str, total_seconds: int,
                 deep_seconds: int, light_seconds: int, rem_seconds: int,
                 awake_seconds: int, sleep_score=None, source: str = "garmin"):
    """Insert or update a sleep record for a user/date."""
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO sleep_logs
                (user_id, sleep_date, total_seconds, deep_seconds, light_seconds,
                 rem_seconds, awake_seconds, sleep_score, source, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, sleep_date) DO UPDATE SET
                total_seconds = excluded.total_seconds,
                deep_seconds  = excluded.deep_seconds,
                light_seconds = excluded.light_seconds,
                rem_seconds   = excluded.rem_seconds,
                awake_seconds = excluded.awake_seconds,
                sleep_score   = excluded.sleep_score,
                source        = excluded.source,
                synced_at     = excluded.synced_at
        """, (user_id, sleep_date, total_seconds, deep_seconds, light_seconds,
              rem_seconds, awake_seconds, sleep_score, source,
              datetime.now().isoformat()))
        conn.commit()


def get_sleep(user_id: int, sleep_date: str):
    """Return sleep row for a user/date as dict, or None."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM sleep_logs WHERE user_id = ? AND sleep_date = ?",
            (user_id, sleep_date)
        ).fetchone()
    return dict(row) if row else None


def get_sleep_history(user_id: int, days: int = 90) -> dict:
    """Return {date: sleep_dict} for the last N days."""
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT sleep_date, total_seconds, deep_seconds, light_seconds,
                   rem_seconds, awake_seconds, sleep_score, source
            FROM sleep_logs
            WHERE user_id = ? AND sleep_date >= ?
            ORDER BY sleep_date
        """, (user_id, cutoff)).fetchall()
    return {r["sleep_date"]: dict(r) for r in rows}


def garmin_activity_exists(user_id, garmin_activity_id):
    """Return True if a workout with this Garmin activity ID already exists."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id FROM workout_logs WHERE user_id = ? AND garmin_activity_id = ?",
            (user_id, garmin_activity_id)
        ).fetchone()
    return row is not None


def insert_garmin_workout(user_id, log_date, description, calories_burned, garmin_activity_id, logged_at=None):
    """Insert a Garmin-sourced workout, tagged with its Garmin activity ID."""
    ts = logged_at or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO workout_logs
                (user_id, logged_at, log_date, description, calories_burned, garmin_activity_id)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (user_id, ts, log_date, description, calories_burned, garmin_activity_id))
        conn.commit()


# ── App settings (key-value) ──────────────────────────

def get_setting(key):
    with get_conn() as conn:
        row = conn.execute("SELECT value FROM app_settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None


def set_setting(key, value):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value)
        )
        conn.commit()


# ── User onboarding ────────────────────────────────────

def get_onboarding(user_id):
    """Return the onboarding row as a dict, or None if not started."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM user_onboarding WHERE user_id = ?", (user_id,)
        ).fetchone()
    return dict(row) if row else None


def upsert_onboarding_inputs(user_id, raw_inputs_json):
    """Save raw page inputs; create row if it doesn't exist."""
    now = datetime.now().isoformat()
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO user_onboarding (user_id, completed, raw_inputs, profile_map, created_at, updated_at)
            VALUES (?, 0, ?, '{}', ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                raw_inputs = excluded.raw_inputs,
                updated_at = excluded.updated_at
        """, (user_id, raw_inputs_json, now, now))
        conn.commit()


def complete_onboarding(user_id, profile_map_json):
    """Mark onboarding complete and store the generated profile map."""
    now = datetime.now().isoformat()
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO user_onboarding (user_id, completed, raw_inputs, profile_map, created_at, updated_at)
            VALUES (?, 1, '{}', ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                completed   = 1,
                profile_map = excluded.profile_map,
                updated_at  = excluded.updated_at
        """, (user_id, profile_map_json, now, now))
        conn.commit()


def get_profile_map(user_id):
    """Return the parsed 200-var profile map dict, or {}."""
    import json
    row = get_onboarding(user_id)
    if not row or not row.get("profile_map"):
        return {}
    try:
        return json.loads(row["profile_map"])
    except Exception:
        return {}


def is_onboarding_complete(user_id):
    row = get_onboarding(user_id)
    return bool(row and row.get("completed"))


# ── Daily body-weight ───────────────────────────────────

def save_daily_weight(user_id: int, date_str: str, weight_lbs: float):
    """Upsert today's body-weight into daily_activity."""
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO daily_activity (user_id, log_date, weight_lbs)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id, log_date) DO UPDATE SET weight_lbs = excluded.weight_lbs
        """, (user_id, date_str, weight_lbs))
        conn.commit()


def get_daily_weight(user_id: int, date_str: str):
    """Return weight_lbs for a given date, or None."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT weight_lbs FROM daily_activity WHERE user_id = ? AND log_date = ?",
            (user_id, date_str)
        ).fetchone()
    return row["weight_lbs"] if row else None


# ── Mind check-ins ──────────────────────────────────────

def insert_mind_checkin(user_id, checkin_type, goals, notes, focus, wellbeing, summary,
                        energy_level=None, stress_level=None, checkin_date=None,
                        sleep_quality=None, mood_level=None, focus_level=None,
                        evening_prompt=None):
    today = checkin_date or date.today().isoformat()
    now = datetime.now().isoformat()
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO mind_checkins
                (user_id, checkin_date, type, goals, notes, focus, wellbeing, summary,
                 energy_level, stress_level, sleep_quality, mood_level, focus_level,
                 evening_prompt, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (user_id, today, checkin_type, goals, notes, focus, wellbeing, summary,
              energy_level, stress_level, sleep_quality, mood_level, focus_level,
              evening_prompt, now))
        conn.commit()


def get_evening_prompt(user_id, checkin_date):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT evening_prompt FROM mind_checkins "
            "WHERE user_id = ? AND checkin_date = ? AND type = 'morning'",
            (user_id, checkin_date)
        ).fetchone()
    return row["evening_prompt"] if row else None


def get_mind_today(user_id, checkin_date=None):
    today = checkin_date or date.today().isoformat()
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM mind_checkins WHERE user_id = ? AND checkin_date = ? ORDER BY created_at",
            (user_id, today)
        ).fetchall()
    return [dict(r) for r in rows]


def get_mind_history(user_id, days=14):
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT checkin_date, type, focus, wellbeing, summary, created_at
            FROM mind_checkins
            WHERE user_id = ? AND checkin_date >= ?
            ORDER BY created_at DESC
        """, (user_id, cutoff)).fetchall()
    return [dict(r) for r in rows]


def insert_mind_task(user_id, description, source='manual', task_date=None):
    td = task_date or date.today().isoformat()
    now = datetime.now().isoformat()
    with get_conn() as conn:
        cur = conn.execute("""
            INSERT INTO mind_tasks (user_id, task_date, description, completed, source, created_at)
            VALUES (?, ?, ?, 0, ?, ?)
        """, (user_id, td, description, source, now))
        conn.commit()
        return cur.lastrowid


def get_mind_tasks(user_id, task_date=None):
    td = task_date or date.today().isoformat()
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT * FROM mind_tasks WHERE user_id = ?
               AND task_date <= ?
               AND (completed = 0 OR task_date = ?)
               ORDER BY completed, task_date, created_at""",
            (user_id, td, td)
        ).fetchall()
    return [dict(r) for r in rows]


def toggle_mind_task(task_id, user_id):
    with get_conn() as conn:
        conn.execute(
            "UPDATE mind_tasks SET completed = 1 - completed WHERE id = ? AND user_id = ?",
            (task_id, user_id)
        )
        conn.commit()


def delete_mind_task(task_id, user_id):
    with get_conn() as conn:
        conn.execute(
            "DELETE FROM mind_tasks WHERE id = ? AND user_id = ?",
            (task_id, user_id)
        )
        conn.commit()


# ── Momentum scoring ────────────────────────────────────

import logging as _logging
_momentum_logger = _logging.getLogger(__name__)

MOMENTUM_WEIGHTS = {
    "nutrition": 35,
    "activity":  35,
    "checkin":   20,
    "tasks":     10,
}
assert sum(MOMENTUM_WEIGHTS.values()) == 100

_ACTIVITY_CAL_TARGET = 500  # kcal of active burn considered "full credit"


def compute_momentum(user_id: int, date_str: str, calorie_goal_override: int | None = None) -> dict:
    """
    Compute a 0–100 momentum score for user_id on date_str.
    calorie_goal_override: when provided, takes precedence over profile map value.
    Upserts the result into daily_momentum and returns a full debug_breakdown dict.
    """
    # ── gather inputs ────────────────────────────────────
    totals  = get_today_totals(user_id, date_str)
    profile = get_profile_map(user_id)
    garmin  = get_garmin_daily(user_id, date_str)

    with get_conn() as conn:
        checkin_rows = conn.execute(
            "SELECT type, wellbeing, focus, energy_level, stress_level, "
            "sleep_quality, mood_level, focus_level FROM mind_checkins "
            "WHERE user_id = ? AND checkin_date = ?",
            (user_id, date_str)
        ).fetchall()
        checkins = [dict(r) for r in checkin_rows]

        # Count all visible tasks for today: tasks dated today OR overdue incomplete tasks
        task_rows = conn.execute(
            """SELECT completed FROM mind_tasks WHERE user_id = ?
               AND task_date <= ?
               AND (completed = 0 OR task_date = ?)""",
            (user_id, date_str, date_str)
        ).fetchall()
        tasks = [dict(r) for r in task_rows]

    # ── component scoring ────────────────────────────────

    # Nutrition: calories logged vs workout-adjusted daily calorie target
    # Compute RMR + active_burn - deficit_target so workouts raise the goal dynamically.
    # Fall back to the static onboarding goal or the client override when RMR is missing.
    rmr_kcal       = profile.get("rmr_kcal") or 0
    deficit_target = profile.get("calorie_deficit_target") or 0
    if rmr_kcal:
        active_burned_n = (garmin.get("active_calories") or 0) if garmin \
                          else get_today_workout_burn(user_id, date_str)
        cal_goal = int(rmr_kcal + active_burned_n - deficit_target)
    else:
        cal_goal = profile.get("daily_calorie_goal") or calorie_goal_override
    cal_today = totals["total_calories"]
    if cal_goal and cal_goal > 0:
        nutrition_pct = min(1.0, cal_today / cal_goal)
    else:
        nutrition_pct = 0.0

    # Activity: Garmin active calories vs target; fallback to logged workout burn
    if garmin:
        active_cal   = garmin.get("active_calories") or 0
        activity_pct = min(1.0, active_cal / _ACTIVITY_CAL_TARGET)
    else:
        active_cal   = None
        workout_burn = get_today_workout_burn(user_id, date_str)
        activity_pct = min(1.0, workout_burn / _ACTIVITY_CAL_TARGET) if workout_burn > 0 else 0.0

    # Checkin: each brief worth 10 pts independently (morning 0.5 + evening 0.5 = 1.0 max)
    types_done  = {c["type"] for c in checkins}
    has_morning = "morning" in types_done
    has_evening = "evening" in types_done
    checkin_score = (0.5 if has_morning else 0.0) + (0.5 if has_evening else 0.0)
    checkin_done  = 1 if types_done else 0

    # Tasks: completed / total
    total_tasks     = len(tasks)
    completed_tasks = sum(1 for t in tasks if t["completed"])
    task_rate       = (completed_tasks / total_tasks) if total_tasks > 0 else 0.5

    # ── weighted contributions ───────────────────────────
    weighted = {
        "nutrition": round(nutrition_pct  * MOMENTUM_WEIGHTS["nutrition"], 2),
        "activity":  round(activity_pct   * MOMENTUM_WEIGHTS["activity"],  2),
        "checkin":   round(checkin_score  * MOMENTUM_WEIGHTS["checkin"],   2),
        "tasks":     round(task_rate      * MOMENTUM_WEIGHTS["tasks"],     2),
    }

    momentum_score = int(round(sum(weighted.values())))

    # ── debug breakdown ──────────────────────────────────
    debug_breakdown = {
        "date":           date_str,
        "momentum_score": momentum_score,
        "weights":        MOMENTUM_WEIGHTS,
        "components": {
            "nutrition": {
                "calories_logged": cal_today,
                "calorie_goal":    cal_goal,
                "pct":             round(nutrition_pct, 4),
                "weighted":        weighted["nutrition"],
                "missing":         cal_goal is None,
            },
            "activity": {
                "active_calories":  active_cal,
                "target_calories":  _ACTIVITY_CAL_TARGET,
                "garmin_available": garmin is not None,
                "pct":              round(activity_pct, 4),
                "weighted":         weighted["activity"],
            },
            "checkin": {
                "morning_done": has_morning,
                "evening_done": has_evening,
                "score":        round(checkin_score, 4),
                "pct":          round(checkin_score, 4),
                "weighted":     weighted["checkin"],
            },
            "tasks": {
                "total":     total_tasks,
                "completed": completed_tasks,
                "rate":      round(task_rate, 4),
                "pct":       round(task_rate, 4),
                "weighted":  weighted["tasks"],
            },
        },
        "weighted_contributions": weighted,
    }

    _momentum_logger.debug("Momentum %s uid=%s score=%s", date_str, user_id, momentum_score)

    # ── upsert result ─────────────────────────────────────
    now = datetime.now().isoformat()
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO daily_momentum
                (user_id, score_date, momentum_score, nutrition_pct,
                 activity_pct, checkin_done, task_rate, wellbeing_delta, computed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, score_date) DO UPDATE SET
                momentum_score  = excluded.momentum_score,
                nutrition_pct   = excluded.nutrition_pct,
                activity_pct    = excluded.activity_pct,
                checkin_done    = excluded.checkin_done,
                task_rate       = excluded.task_rate,
                wellbeing_delta = excluded.wellbeing_delta,
                computed_at     = excluded.computed_at
        """, (user_id, date_str, momentum_score, nutrition_pct,
              activity_pct, checkin_done, task_rate, 0.0, now))
        conn.commit()

    return debug_breakdown


def get_momentum_history(user_id: int, days: int = 14) -> list:
    """Return list of daily_momentum rows for the last N days, oldest first."""
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT score_date, momentum_score, nutrition_pct,
                   activity_pct, checkin_done, task_rate, wellbeing_delta, computed_at
            FROM daily_momentum
            WHERE user_id = ? AND score_date >= ?
            ORDER BY score_date
        """, (user_id, cutoff)).fetchall()
    return [dict(r) for r in rows]


# ── Gmail tokens ───────────────────────────────────────

def save_gmail_tokens(user_id: int, access_token: str, refresh_token: str,
                      token_expiry: str, email_address: str = ""):
    now = datetime.now().isoformat()
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO gmail_tokens
                (user_id, access_token, refresh_token, token_expiry, email_address, connected_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                access_token  = excluded.access_token,
                refresh_token = excluded.refresh_token,
                token_expiry  = excluded.token_expiry,
                email_address = excluded.email_address,
                connected_at  = excluded.connected_at
        """, (user_id, access_token, refresh_token, token_expiry, email_address, now))
        conn.commit()


def get_gmail_tokens(user_id: int):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM gmail_tokens WHERE user_id = ?", (user_id,)
        ).fetchone()
    return dict(row) if row else None


def delete_gmail_tokens(user_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM gmail_tokens WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM gmail_cache WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM gmail_summaries WHERE user_id = ?", (user_id,))
        conn.commit()


def update_gmail_access_token(user_id: int, access_token: str, token_expiry: str):
    with get_conn() as conn:
        conn.execute("""
            UPDATE gmail_tokens SET access_token = ?, token_expiry = ?
            WHERE user_id = ?
        """, (access_token, token_expiry, user_id))
        conn.commit()


# ── Gmail cache ────────────────────────────────────────

def upsert_gmail_cache(user_id: int, thread_id: str, message_id: str,
                       sender: str, subject: str, snippet: str,
                       received_at: str, has_replied: int, is_read: int):
    now = datetime.now().isoformat()
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO gmail_cache
                (user_id, thread_id, message_id, sender, subject, snippet,
                 received_at, has_replied, is_read, cached_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, message_id) DO UPDATE SET
                sender      = excluded.sender,
                subject     = excluded.subject,
                snippet     = excluded.snippet,
                has_replied = excluded.has_replied,
                is_read     = excluded.is_read,
                cached_at   = excluded.cached_at
        """, (user_id, thread_id, message_id, sender, subject, snippet,
              received_at, has_replied, is_read, now))
        conn.commit()


def get_gmail_cache(user_id: int, limit: int = 25):
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT * FROM gmail_cache WHERE user_id = ?
            ORDER BY received_at DESC LIMIT ?
        """, (user_id, limit)).fetchall()
    return [dict(r) for r in rows]


def clear_gmail_cache(user_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM gmail_cache WHERE user_id = ?", (user_id,))
        conn.commit()


# ── Gmail summaries ────────────────────────────────────

def save_gmail_summary(user_id: int, summary_date: str, summary_text: str,
                       email_count: int, unreplied: int):
    now = datetime.now().isoformat()
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO gmail_summaries
                (user_id, summary_date, summary_text, email_count, unreplied, generated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, summary_date) DO UPDATE SET
                summary_text = excluded.summary_text,
                email_count  = excluded.email_count,
                unreplied    = excluded.unreplied,
                generated_at = excluded.generated_at
        """, (user_id, summary_date, summary_text, email_count, unreplied, now))
        conn.commit()


def get_gmail_summary(user_id: int, summary_date: str):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM gmail_summaries WHERE user_id = ? AND summary_date = ?",
            (user_id, summary_date)
        ).fetchone()
    return dict(row) if row else None


# ── User goals ─────────────────────────────────────────

def upsert_user_goal(user_id: int, goal_key: str, calorie_target: int,
                     protein_g: int, fat_g: int, carbs_g: int,
                     deficit_surplus: int, rmr: int, rmr_method: str,
                     tdee_used: int, config_json: str, sources_json: str):
    now = datetime.now().isoformat()
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO user_goals
                (user_id, goal_key, calorie_target, protein_g, fat_g, carbs_g,
                 deficit_surplus, rmr, rmr_method, tdee_used,
                 config_json, sources_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                goal_key        = excluded.goal_key,
                calorie_target  = excluded.calorie_target,
                protein_g       = excluded.protein_g,
                fat_g           = excluded.fat_g,
                carbs_g         = excluded.carbs_g,
                deficit_surplus = excluded.deficit_surplus,
                rmr             = excluded.rmr,
                rmr_method      = excluded.rmr_method,
                tdee_used       = excluded.tdee_used,
                config_json     = excluded.config_json,
                sources_json    = excluded.sources_json,
                updated_at      = excluded.updated_at
        """, (user_id, goal_key, calorie_target, protein_g, fat_g, carbs_g,
              deficit_surplus, rmr, rmr_method, tdee_used,
              config_json, sources_json, now, now))
        conn.commit()


def get_user_goal(user_id: int):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM user_goals WHERE user_id = ?", (user_id,)
        ).fetchone()
    return dict(row) if row else None


def delete_user_goal(user_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM user_goals WHERE user_id = ?", (user_id,))
        conn.commit()
