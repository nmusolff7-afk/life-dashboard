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
        # Gmail importance labels — user-trained sender/topic importance
        conn.execute("""
            CREATE TABLE IF NOT EXISTS gmail_importance (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER REFERENCES users(id),
                sender      TEXT NOT NULL,
                sender_domain TEXT DEFAULT '',
                label       TEXT NOT NULL CHECK(label IN ('important', 'unimportant')),
                count       INTEGER DEFAULT 1,
                created_at  TIMESTAMP NOT NULL,
                updated_at  TIMESTAMP NOT NULL,
                UNIQUE(user_id, sender, label)
            )
        """)
        # Migrate: add importance_score to gmail_cache
        try:
            conn.execute("ALTER TABLE gmail_cache ADD COLUMN importance_score REAL DEFAULT 0")
            conn.commit()
        except sqlite3.OperationalError:
            pass

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
        conn.execute("""
            CREATE TABLE IF NOT EXISTS saved_meals (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER REFERENCES users(id),
                description TEXT NOT NULL,
                calories    INTEGER,
                protein_g   REAL,
                carbs_g     REAL,
                fat_g       REAL,
                items_json  TEXT DEFAULT '[]',
                saved_at    TIMESTAMP NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS saved_workouts (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id         INTEGER REFERENCES users(id),
                description     TEXT NOT NULL,
                calories_burned INTEGER DEFAULT 0,
                saved_at        TIMESTAMP NOT NULL
            )
        """)
        conn.commit()

        # Migrate: add garmin_activity_id to workout_logs to prevent duplicate imports
        try:
            conn.execute("ALTER TABLE workout_logs ADD COLUMN garmin_activity_id TEXT")
            conn.commit()
        except sqlite3.OperationalError:
            pass  # column already exists

        # Migrate: add user_id column to existing tables if absent
        for table in ("meal_logs", "workout_logs"):
            try:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN user_id INTEGER REFERENCES users(id)")
                conn.commit()
            except sqlite3.OperationalError:
                pass  # column already exists

        # Migrate: add user_id to daily_activity if absent
        try:
            conn.execute("ALTER TABLE daily_activity ADD COLUMN user_id INTEGER REFERENCES users(id)")
            conn.commit()
        except sqlite3.OperationalError:
            pass  # column already exists

        # Migrate: add weight_lbs to daily_activity if absent
        try:
            conn.execute("ALTER TABLE daily_activity ADD COLUMN weight_lbs REAL")
            conn.commit()
        except sqlite3.OperationalError:
            pass  # column already exists

        # Migrate: add energy_level, stress_level, sleep_quality, mood_level, focus_level to mind_checkins
        for col in ("energy_level INTEGER", "stress_level INTEGER",
                    "sleep_quality INTEGER", "mood_level INTEGER", "focus_level INTEGER",
                    "evening_prompt TEXT"):
            try:
                conn.execute(f"ALTER TABLE mind_checkins ADD COLUMN {col}")
                conn.commit()
            except sqlite3.OperationalError:
                pass

        # Migrate: add sugar_g, fiber_g, sodium_mg to meal_logs and saved_meals
        for col in ("sugar_g REAL DEFAULT 0", "fiber_g REAL DEFAULT 0", "sodium_mg REAL DEFAULT 0"):
            for table in ("meal_logs", "saved_meals"):
                try:
                    conn.execute(f"ALTER TABLE {table} ADD COLUMN {col}")
                    conn.commit()
                except sqlite3.OperationalError:
                    pass

        # Momentum summaries — AI-generated at day/week/month scale, cached
        conn.execute("""
            CREATE TABLE IF NOT EXISTS momentum_summaries (
                user_id      INTEGER REFERENCES users(id),
                summary_date DATE NOT NULL,
                scale        TEXT NOT NULL,
                summary_text TEXT NOT NULL,
                generated_at TIMESTAMP NOT NULL,
                PRIMARY KEY (user_id, summary_date, scale)
            )
        """)
        # Migrate: add raw_deltas to daily_momentum for penalty-based scoring
        try:
            conn.execute("ALTER TABLE daily_momentum ADD COLUMN raw_deltas TEXT DEFAULT '{}'")
            conn.commit()
        except sqlite3.OperationalError:
            pass

        # Migrate: assign orphaned rows (no user_id) to user 1 if they exist
        conn.execute("UPDATE meal_logs      SET user_id = 1 WHERE user_id IS NULL AND EXISTS (SELECT 1 FROM users WHERE id = 1)")
        conn.execute("UPDATE workout_logs   SET user_id = 1 WHERE user_id IS NULL AND EXISTS (SELECT 1 FROM users WHERE id = 1)")
        conn.execute("UPDATE daily_activity SET user_id = 1 WHERE user_id IS NULL AND EXISTS (SELECT 1 FROM users WHERE id = 1)")

        # Indexes for user_id + date lookups (most-queried patterns)
        for idx_sql in [
            "CREATE INDEX IF NOT EXISTS idx_meal_logs_user_date      ON meal_logs(user_id, log_date)",
            "CREATE INDEX IF NOT EXISTS idx_workout_logs_user_date   ON workout_logs(user_id, log_date)",
            "CREATE INDEX IF NOT EXISTS idx_mind_checkins_user_date  ON mind_checkins(user_id, checkin_date)",
            "CREATE INDEX IF NOT EXISTS idx_mind_tasks_user_date     ON mind_tasks(user_id, task_date)",
            "CREATE INDEX IF NOT EXISTS idx_garmin_daily_user_date   ON garmin_daily(user_id, stat_date)",
            "CREATE INDEX IF NOT EXISTS idx_sleep_logs_user_date     ON sleep_logs(user_id, sleep_date)",
            "CREATE INDEX IF NOT EXISTS idx_daily_momentum_user_date ON daily_momentum(user_id, score_date)",
            "CREATE INDEX IF NOT EXISTS idx_user_goals_user          ON user_goals(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_gmail_cache_user         ON gmail_cache(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_gmail_summaries_user     ON gmail_summaries(user_id)",
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_garmin_uniq  ON workout_logs(user_id, garmin_activity_id) WHERE garmin_activity_id IS NOT NULL AND garmin_activity_id != ''",
        ]:
            conn.execute(idx_sql)

        conn.commit()


# ── Auth ────────────────────────────────────────────────

def delete_account(user_id):
    """Permanently delete a user and all their data."""
    tables = [
        "meal_logs", "workout_logs", "daily_activity", "garmin_daily",
        "sleep_logs", "mind_checkins", "mind_tasks", "daily_momentum",
        "momentum_summaries", "user_goals", "user_onboarding",
        "gmail_tokens", "gmail_cache", "gmail_summaries", "gmail_importance",
    ]
    with get_conn() as conn:
        for table in tables:
            try:
                conn.execute(f"DELETE FROM {table} WHERE user_id = ?", (user_id,))
            except sqlite3.OperationalError:
                pass  # table may not exist on older DBs
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        try:
            conn.execute("""
                INSERT INTO sqlite_sequence (name, seq)
                VALUES ('users', (SELECT COALESCE(MAX(id), 0) FROM users))
                ON CONFLICT(name) DO UPDATE SET seq = MAX(seq, excluded.seq)
            """)
        except sqlite3.OperationalError:
            pass
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

def insert_meal(user_id, description, calories, protein_g, carbs_g, fat_g,
                sugar_g=0, fiber_g=0, sodium_mg=0, log_date=None, logged_at=None):
    ld = log_date or date.today().isoformat()
    ts = logged_at or datetime.now().isoformat()
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO meal_logs (user_id, logged_at, log_date, description, calories, protein_g, carbs_g, fat_g, sugar_g, fiber_g, sodium_mg) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (user_id, ts, ld, description, calories, protein_g, carbs_g, fat_g, sugar_g, fiber_g, sodium_mg),
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
                COALESCE(SUM(fat_g), 0) as total_fat,
                COALESCE(SUM(sugar_g), 0) as total_sugar,
                COALESCE(SUM(fiber_g), 0) as total_fiber,
                COALESCE(SUM(sodium_mg), 0) as total_sodium
            FROM meal_logs WHERE user_id = ? AND log_date = ?
            """,
            (user_id, ld),
        ).fetchone()
    return dict(row)


def update_meal(meal_id, user_id, description, calories, protein_g, carbs_g, fat_g,
                sugar_g=0, fiber_g=0, sodium_mg=0):
    with get_conn() as conn:
        conn.execute(
            "UPDATE meal_logs SET description=?, calories=?, protein_g=?, carbs_g=?, fat_g=?, sugar_g=?, fiber_g=?, sodium_mg=? WHERE id=? AND user_id=?",
            (description, calories, protein_g, carbs_g, fat_g, sugar_g, fiber_g, sodium_mg, meal_id, user_id),
        )
        conn.commit()


def delete_meal(meal_id, user_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM meal_logs WHERE id = ? AND user_id = ?", (meal_id, user_id))
        conn.commit()


# ── Workouts ─────────────────────────────────────────────

def insert_workout(user_id, description, calories_burned=0, log_date=None, logged_at=None):
    ld = log_date or date.today().isoformat()
    ts = logged_at or datetime.now().isoformat()
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


# ── Saved Meals ─────────────────────────────────────────

def save_meal(user_id, description, calories, protein_g, carbs_g, fat_g,
              sugar_g=0, fiber_g=0, sodium_mg=0, items_json="[]"):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO saved_meals (user_id, description, calories, protein_g, carbs_g, fat_g, sugar_g, fiber_g, sodium_mg, items_json, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (user_id, description, calories, protein_g, carbs_g, fat_g, sugar_g, fiber_g, sodium_mg, items_json, datetime.now().isoformat()),
        )
        conn.commit()


def get_saved_meals(user_id):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM saved_meals WHERE user_id = ? ORDER BY saved_at DESC", (user_id,)
        ).fetchall()
    return [dict(r) for r in rows]


def delete_saved_meal(saved_id, user_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM saved_meals WHERE id = ? AND user_id = ?", (saved_id, user_id))
        conn.commit()


def is_meal_saved(user_id, description):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id FROM saved_meals WHERE user_id = ? AND description = ? LIMIT 1",
            (user_id, description),
        ).fetchone()
    return row is not None


# ── Saved Workouts ──────────────────────────────────────

def save_workout(user_id, description, calories_burned):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO saved_workouts (user_id, description, calories_burned, saved_at) VALUES (?, ?, ?, ?)",
            (user_id, description, calories_burned, datetime.now().isoformat()),
        )
        conn.commit()


def get_saved_workouts(user_id):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM saved_workouts WHERE user_id = ? ORDER BY saved_at DESC", (user_id,)
        ).fetchall()
    return [dict(r) for r in rows]


def delete_saved_workout(saved_id, user_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM saved_workouts WHERE id = ? AND user_id = ?", (saved_id, user_id))
        conn.commit()


def is_workout_saved(user_id, description):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id FROM saved_workouts WHERE user_id = ? AND description = ? LIMIT 1",
            (user_id, description),
        ).fetchone()
    return row is not None


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
    ts = logged_at or datetime.now().isoformat()
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO workout_logs
                (user_id, logged_at, log_date, description, calories_burned, garmin_activity_id)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (user_id, ts, log_date, description, calories_burned, garmin_activity_id))
        conn.commit()


# ── App settings (key-value) ──────────────────────────




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
    except (json.JSONDecodeError, TypeError):
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
    "nutrition": 40,
    "macros":    25,
    "activity":  25,
    "checkin":    0,
    "tasks":     10,
}
# Remaining 55 pts are reserved for future metrics (sleep, etc.)
# For now they are "free" — no penalty assessed, score starts at 100.
_SCORED_MAX = sum(MOMENTUM_WEIGHTS.values())  # 45


def compute_momentum(user_id: int, date_str: str, calorie_goal_override: int | None = None,
                     hour: int | None = None, planned_workout_today: bool | None = None,
                     client_tdee: int | None = None, client_target_intake: int | None = None) -> dict:
    """
    Compute a 0–100 daily score using a penalty-based system.
    Starts at 100, subtracts penalties for deviations from targets.
    hour: current hour (0-23) in the user's timezone. When provided,
          metrics that haven't been tracked yet are forgiven if it's
          still early enough in the day to track them.
    Upserts the result into daily_momentum and returns a full breakdown dict.
    """
    import json as _json

    # Only forgive the evening check-in if its window hasn't opened yet
    _is_today = (date_str == date.today().isoformat())
    _h = hour if hour is not None else 23
    _evening_expected = _is_today and _h < 19   # evening check-in unlocks at 7pm

    # ── gather inputs ────────────────────────────────────
    totals  = get_today_totals(user_id, date_str)
    profile = get_profile_map(user_id)
    garmin  = None  # Garmin disconnected — use manual data only
    goal    = get_user_goal(user_id)

    with get_conn() as conn:
        checkin_rows = conn.execute(
            "SELECT type FROM mind_checkins WHERE user_id = ? AND checkin_date = ?",
            (user_id, date_str)
        ).fetchall()
        types_done = {r["type"] for r in checkin_rows}

        task_rows = conn.execute(
            """SELECT completed FROM mind_tasks WHERE user_id = ?
               AND task_date <= ?
               AND (completed = 0 OR task_date = ?)""",
            (user_id, date_str, date_str)
        ).fetchall()
        tasks = [dict(r) for r in task_rows]

        # Fetch workout burn in same connection (used as fallback when no garmin)
        workout_burn_row = conn.execute(
            "SELECT COALESCE(SUM(calories_burned), 0) as total FROM workout_logs WHERE user_id = ? AND log_date = ?",
            (user_id, date_str)
        ).fetchone()
        workout_burn = int(workout_burn_row["total"])

    # ── resolve TDEE and targets ───────────────────────────
    # Use the EXACT values from the frontend Live Preview — single source of truth.
    # client_tdee = _LIVE_TDEE (RMR + NEAT + EAT + TEF)
    # client_target_intake = _LIVE_TARGET_INTAKE (TDEE + deficit slider)
    tdee = client_tdee or 0
    cal_goal = client_target_intake or 0
    # Fallback only if client didn't send values
    if not tdee:
        rmr_val = (goal.get("rmr") if goal else None) or profile.get("rmr_kcal") or 0
        tdee = rmr_val + workout_burn if rmr_val else 0
    if not cal_goal:
        if goal:
            cal_goal = goal["calorie_target"]
        else:
            cal_goal = calorie_goal_override or tdee
    goal_deficit = tdee - cal_goal if tdee and cal_goal else 0

    # Macros stay from stored goals (they don't depend on daily TDEE)
    if goal:
        pro_goal   = goal["protein_g"]
        fat_goal   = goal.get("fat_g") or None
        carbs_goal = goal.get("carbs_g") or None
    else:
        pro_goal   = profile.get("daily_protein_goal_g") or None
        fat_goal   = None
        carbs_goal = None

    cal_today  = totals["total_calories"]
    pro_today  = totals.get("total_protein", 0)
    carbs_today = totals.get("total_carbs", 0)
    fat_today   = totals.get("total_fat", 0)

    _momentum_logger.info("SCORE: client_tdee=%s tdee=%s cal_goal=%s cal_today=%s goal_key=%s",
                          client_tdee, tdee, cal_goal, cal_today,
                          goal.get("goal_key") if goal else "none")

    # ── penalty calculations ─────────────────────────────
    raw_deltas = {}
    penalties = {}

    # Time-of-day scaling: early in day = more forgiving for nutrition scores
    day_progress = min(1.0, max(0.33, (_h - 6) / 15))

    if cal_goal and cal_goal > 0 and cal_today > 0:
        # cal_goal IS the target (already TDEE - deficit from goal computation)
        prorated_target = cal_goal * day_progress
        consumption_delta = cal_today - prorated_target
        cal_dev = abs(consumption_delta) / max(prorated_target, 1)
        cal_pen = min(1.0, cal_dev / 0.50) * MOMENTUM_WEIGHTS["nutrition"]
        actual_deficit = tdee - cal_today if tdee else 0
        raw_deltas["calories"] = {"target": cal_goal, "actual": cal_today,
                                  "delta": round(consumption_delta),
                                  "tdee": tdee, "goal_deficit": goal_deficit, "actual_deficit": round(actual_deficit)}
    elif cal_today == 0 and cal_goal:
        cal_pen = MOMENTUM_WEIGHTS["nutrition"]
        raw_deltas["calories"] = {"target": cal_goal, "actual": 0, "delta": 0, "tdee": tdee, "goal_deficit": goal_deficit}
    else:
        cal_pen = 0
        raw_deltas["calories"] = {"target": None, "actual": cal_today, "delta": 0}
    penalties["nutrition"] = round(cal_pen, 2)

    # 2. Macros (10 pts) — weighted combination: protein 40%, carbs 30%, fat 30%
    # Pro-rate macro targets by time of day (same as calories)
    macro_components = []
    if pro_goal and pro_goal > 0:
        prorated = pro_goal * day_progress
        dev = abs(pro_today - prorated) / max(prorated, 1) if pro_today > 0 else 1.0
        macro_components.append({"name": "protein", "target": pro_goal, "actual": round(pro_today, 1),
                                 "weight": 0.4, "dev": dev})
    if carbs_goal and carbs_goal > 0:
        prorated = carbs_goal * day_progress
        dev = abs(carbs_today - prorated) / max(prorated, 1) if carbs_today > 0 else 1.0
        macro_components.append({"name": "carbs", "target": carbs_goal, "actual": round(carbs_today, 1),
                                 "weight": 0.3, "dev": dev})
    if fat_goal and fat_goal > 0:
        prorated = fat_goal * day_progress
        dev = abs(fat_today - prorated) / max(prorated, 1) if fat_today > 0 else 1.0
        macro_components.append({"name": "fat", "target": fat_goal, "actual": round(fat_today, 1),
                                 "weight": 0.3, "dev": dev})

    if macro_components:
        # Normalize weights to sum to 1.0 in case some macros are missing
        total_weight = sum(m["weight"] for m in macro_components)
        weighted_dev = sum(min(1.0, m["dev"] / 0.75) * (m["weight"] / total_weight) for m in macro_components)
        macro_pen = weighted_dev * MOMENTUM_WEIGHTS["macros"]
        raw_deltas["macros"] = {"components": macro_components}
    elif cal_today == 0:
        macro_pen = MOMENTUM_WEIGHTS["macros"]
        raw_deltas["macros"] = {"components": []}
    else:
        macro_pen = 0
        raw_deltas["macros"] = {"components": []}
    penalties["macros"] = round(macro_pen, 2)

    # 3. Workout (10 pts) — based on whether planned workout was completed
    #    Only counts manually logged workouts (garmin_activity_id IS NULL).
    #    Garmin auto-imported activities (bike rides etc.) don't count as
    #    completing a planned lifting session.
    workout_burn_today = get_today_workout_burn(user_id, date_str)
    garmin_active = (garmin.get("active_calories") or 0) if garmin else 0
    with get_conn() as conn:
        manual_count = conn.execute(
            "SELECT COUNT(*) as c FROM workout_logs WHERE user_id = ? AND log_date = ? AND (garmin_activity_id IS NULL OR garmin_activity_id = '')",
            (user_id, date_str)
        ).fetchone()["c"]
    has_logged_workout = manual_count > 0  # only manually logged workouts count
    workout_planned = planned_workout_today if planned_workout_today is not None else True

    if not workout_planned:
        activity_pen = 0  # rest day — no penalty
        raw_deltas["workout"] = {"done": True, "burn": workout_burn_today, "garmin_active": garmin_active, "rest_day": True}
    elif has_logged_workout:
        activity_pen = 0
        raw_deltas["workout"] = {"done": True, "burn": workout_burn_today, "garmin_active": garmin_active, "rest_day": False}
    else:
        activity_pen = MOMENTUM_WEIGHTS["activity"]
        raw_deltas["workout"] = {"done": False, "burn": 0, "garmin_active": garmin_active, "rest_day": False}
    penalties["activity"] = round(activity_pen, 2)

    # 4. Check-in (5 pts) — 2.5 each for morning and evening
    has_morning = "morning" in types_done
    has_evening = "evening" in types_done
    checkin_pen = 0
    if not has_morning: checkin_pen += MOMENTUM_WEIGHTS["checkin"] * 0.5
    if not has_evening and not _evening_expected:
        checkin_pen += MOMENTUM_WEIGHTS["checkin"] * 0.5
    raw_deltas["checkin"] = {"morning": has_morning, "evening": has_evening,
                             "evening_pending": _evening_expected and not has_evening}
    penalties["checkin"] = round(checkin_pen, 2)

    # 5. Tasks (5 pts) — penalty proportional to incomplete tasks
    total_tasks     = len(tasks)
    completed_tasks = sum(1 for t in tasks if t["completed"])
    if total_tasks > 0:
        task_pen = (1 - completed_tasks / total_tasks) * MOMENTUM_WEIGHTS["tasks"]
    else:
        task_pen = 0  # no tasks = no penalty
    raw_deltas["tasks"] = {"total": total_tasks, "completed": completed_tasks}
    penalties["tasks"] = round(task_pen, 2)

    # ── compute score ────────────────────────────────────
    total_penalty  = sum(penalties.values())
    momentum_score = max(0, round(100 - total_penalty))

    # ── build frontend-compatible response ───────────────
    # pct: 1.0 = perfect (no penalty), 0.0 = full penalty
    # weighted: points earned = max - penalty
    def _comp_pct(key):
        return round(1.0 - penalties[key] / MOMENTUM_WEIGHTS[key], 4) if MOMENTUM_WEIGHTS[key] > 0 else 1.0

    weighted = {k: round(MOMENTUM_WEIGHTS[k] - penalties[k], 2) for k in MOMENTUM_WEIGHTS}

    nutrition_pct = _comp_pct("nutrition")
    activity_pct  = _comp_pct("activity")
    checkin_done  = 1 if types_done else 0
    task_rate     = (completed_tasks / total_tasks) if total_tasks > 0 else 1.0

    debug_breakdown = {
        "date":           date_str,
        "momentum_score": momentum_score,
        "weights":        MOMENTUM_WEIGHTS,
        "penalties":      penalties,
        "raw_deltas":     raw_deltas,
        "components": {
            "nutrition": {
                "calories_logged": cal_today,
                "calorie_goal":    cal_goal,
                "penalty":         penalties["nutrition"],
                "pct":             nutrition_pct,
                "weighted":        weighted["nutrition"],
                "missing":         cal_goal is None,
            },
            "macros": {
                "protein_logged":  round(pro_today, 1),
                "protein_goal":    pro_goal,
                "carbs_logged":    round(carbs_today, 1),
                "carbs_goal":      carbs_goal,
                "fat_logged":      round(fat_today, 1),
                "fat_goal":        fat_goal,
                "penalty":         penalties["macros"],
                "pct":             _comp_pct("macros"),
                "weighted":        weighted["macros"],
                "missing":         pro_goal is None and carbs_goal is None and fat_goal is None,
            },
            "activity": {
                "has_workout":      has_logged_workout,
                "workout_burn":     workout_burn,
                "garmin_active":    garmin_active,
                "garmin_available": garmin is not None,
                "penalty":          penalties["activity"],
                "pct":              _comp_pct("activity"),
                "weighted":         weighted["activity"],
            },
            "checkin": {
                "morning_done": has_morning,
                "evening_done": has_evening,
                "penalty":      penalties["checkin"],
                "pct":          _comp_pct("checkin"),
                "weighted":     weighted["checkin"],
            },
            "tasks": {
                "total":     total_tasks,
                "completed": completed_tasks,
                "rate":      round(task_rate, 4),
                "penalty":   penalties["tasks"],
                "pct":       round(task_rate, 4),
                "weighted":  weighted["tasks"],
            },
        },
        "weighted_contributions": weighted,
    }

    _momentum_logger.debug("Momentum %s uid=%s score=%s penalties=%s", date_str, user_id, momentum_score, penalties)

    # ── upsert result ─────────────────────────────────────
    now = datetime.now().isoformat()
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO daily_momentum
                (user_id, score_date, momentum_score, nutrition_pct,
                 activity_pct, checkin_done, task_rate, wellbeing_delta,
                 raw_deltas, computed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, score_date) DO UPDATE SET
                momentum_score  = excluded.momentum_score,
                nutrition_pct   = excluded.nutrition_pct,
                activity_pct    = excluded.activity_pct,
                checkin_done    = excluded.checkin_done,
                task_rate       = excluded.task_rate,
                wellbeing_delta = excluded.wellbeing_delta,
                raw_deltas      = excluded.raw_deltas,
                computed_at     = excluded.computed_at
        """, (user_id, date_str, momentum_score, nutrition_pct,
              activity_pct, checkin_done, task_rate, 0.0,
              _json.dumps(raw_deltas), now))
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


def get_momentum_history_with_deltas(user_id: int, days: int = 7) -> list:
    """Return momentum rows with raw_deltas for the last N days."""
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT score_date, momentum_score, raw_deltas
            FROM daily_momentum
            WHERE user_id = ? AND score_date >= ?
            ORDER BY score_date
        """, (user_id, cutoff)).fetchall()
    return [dict(r) for r in rows]


def get_insight_bundle(user_id: int, today: str, hist_days: int = 14) -> dict:
    """Load all data needed for momentum insight in a single DB connection."""
    cutoff = (date.today() - timedelta(days=hist_days)).isoformat()
    with get_conn() as conn:
        def _fetchall(sql, params):
            return [dict(r) for r in conn.execute(sql, params).fetchall()]
        def _fetchone(sql, params):
            r = conn.execute(sql, params).fetchone()
            return dict(r) if r else None

        meals = _fetchall(
            "SELECT * FROM meal_logs WHERE user_id = ? AND log_date = ? ORDER BY id", (user_id, today))
        workouts = _fetchall(
            "SELECT * FROM workout_logs WHERE user_id = ? AND log_date = ? ORDER BY id", (user_id, today))
        garmin = _fetchone(
            "SELECT * FROM garmin_daily WHERE user_id = ? AND stat_date = ?", (user_id, today))
        sleep = _fetchone(
            "SELECT * FROM sleep_logs WHERE user_id = ? AND sleep_date = ?", (user_id, today))
        garmin_hist = _fetchall(
            "SELECT * FROM garmin_daily WHERE user_id = ? AND stat_date >= ? ORDER BY stat_date", (user_id, cutoff))
        sleep_hist = _fetchall(
            "SELECT * FROM sleep_logs WHERE user_id = ? AND sleep_date >= ? ORDER BY sleep_date", (user_id, cutoff))
        meal_hist = _fetchall(
            "SELECT log_date, SUM(calories) as calories, SUM(protein_g) as protein_g, SUM(carbs_g) as carbs_g, SUM(fat_g) as fat_g FROM meal_logs WHERE user_id = ? AND log_date >= ? GROUP BY log_date ORDER BY log_date", (user_id, cutoff))
        workout_hist = _fetchall(
            "SELECT log_date, SUM(calories_burned) as calories_burned, COUNT(*) as count FROM workout_logs WHERE user_id = ? AND log_date >= ? GROUP BY log_date ORDER BY log_date", (user_id, cutoff))
        momentum_hist = _fetchall(
            "SELECT score_date, momentum_score, nutrition_pct, activity_pct, checkin_done, task_rate, wellbeing_delta, computed_at FROM daily_momentum WHERE user_id = ? AND score_date >= ? ORDER BY score_date", (user_id, cutoff))

    return {
        "meals": meals, "workouts": workouts,
        "garmin": garmin, "sleep": sleep,
        "garmin_hist": garmin_hist, "sleep_hist": sleep_hist,
        "meal_hist": meal_hist, "workout_hist": workout_hist,
        "momentum_hist": momentum_hist,
    }


# ── Momentum summaries ─────────────────────────────────

def save_momentum_summary(user_id: int, summary_date: str, scale: str, summary_text: str):
    now = datetime.now().isoformat()
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO momentum_summaries
                (user_id, summary_date, scale, summary_text, generated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id, summary_date, scale) DO UPDATE SET
                summary_text = excluded.summary_text,
                generated_at = excluded.generated_at
        """, (user_id, summary_date, scale, summary_text, now))
        conn.commit()


def get_momentum_summary(user_id: int, summary_date: str, scale: str):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM momentum_summaries WHERE user_id = ? AND summary_date = ? AND scale = ?",
            (user_id, summary_date, scale)
        ).fetchone()
    return dict(row) if row else None


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


# ── Gmail importance ──────────────────────────────────

def label_email_importance(user_id: int, sender: str, label: str):
    """Record that a user marked a sender as important or unimportant."""
    domain = sender.split("@")[-1].lower() if "@" in sender else ""
    sender_clean = sender.strip().lower()
    now = datetime.now().isoformat()
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO gmail_importance (user_id, sender, sender_domain, label, count, created_at, updated_at)
            VALUES (?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(user_id, sender, label) DO UPDATE SET
                count = count + 1, updated_at = excluded.updated_at
        """, (user_id, sender_clean, domain, label, now, now))
        conn.commit()


def get_importance_rules(user_id: int) -> dict:
    """Return importance rules as {sender: score} where positive = important, negative = unimportant."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT sender, sender_domain, label, count FROM gmail_importance WHERE user_id = ?",
            (user_id,)
        ).fetchall()
    rules = {}
    for r in rows:
        sender = r["sender"]
        score = r["count"] if r["label"] == "important" else -r["count"]
        rules[sender] = rules.get(sender, 0) + score
        # Also track domain-level scores
        domain = r["sender_domain"]
        if domain:
            dk = "@" + domain
            rules[dk] = rules.get(dk, 0) + (score * 0.5)  # domain is weaker signal
    return rules


def score_email_importance(sender: str, rules: dict) -> float:
    """Score an email's importance based on learned rules. 0 = unknown, >0 = important, <0 = unimportant."""
    sender_clean = sender.strip().lower()
    score = rules.get(sender_clean, 0)
    # Check domain
    domain = sender_clean.split("@")[-1] if "@" in sender_clean else ""
    if domain:
        score += rules.get("@" + domain, 0)
    return score


def update_email_importance_scores(user_id: int):
    """Recalculate importance_score for all cached emails based on current rules."""
    rules = get_importance_rules(user_id)
    if not rules:
        return
    with get_conn() as conn:
        rows = conn.execute("SELECT id, sender FROM gmail_cache WHERE user_id = ?", (user_id,)).fetchall()
        for r in rows:
            score = score_email_importance(r["sender"], rules)
            conn.execute("UPDATE gmail_cache SET importance_score = ? WHERE id = ?", (score, r["id"]))
        conn.commit()


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


