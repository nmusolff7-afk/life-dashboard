# APEX Life Dashboard — Database Schema

Generated: 2026-04-17 | Database: SQLite 3 | File: life_dashboard.db (212KB)

---

## 1. Table Inventory

| # | Table | Rows | Status | Purpose |
|---|-------|------|--------|---------|
| 1 | `users` | 2 | Active | User authentication and settings |
| 2 | `meal_logs` | 6 | Active | Meal tracking with full macros + micros |
| 3 | `workout_logs` | 1 | Active | Workout tracking with calorie burn |
| 4 | `daily_activity` | 1 | Active | Daily weight storage (legacy table) |
| 5 | `garmin_daily` | 0 | Active (dormant) | Garmin sync data cache |
| 6 | `user_onboarding` | 0 | Active | Onboarding state + AI profile map |
| 7 | `mind_checkins` | 0 | Active | Check-in logs (morning/evening) |
| 8 | `mind_tasks` | 0 | Active | Task tracking |
| 9 | `gmail_tokens` | 0 | Active | Gmail OAuth tokens |
| 10 | `gmail_cache` | 0 | Active | Email metadata cache |
| 11 | `gmail_summaries` | 0 | Active | Daily email AI summaries |
| 12 | `gmail_importance` | 0 | Active | Sender importance rules |
| 13 | `user_goals` | 1 | Active | Goal config + macro targets |
| 14 | `daily_momentum` | 3 | Active | Daily score (0-100) |
| 15 | `saved_meals` | 0 | Active | Meal template library |
| 16 | `saved_workouts` | 0 | Active | Workout template library |
| 17 | `momentum_summaries` | 1 | Active | Cached AI summaries |
| 18 | `sleep_logs` | 0 | **Dead** | Removed from code, still in DB |
| 19 | `app_settings` | 0 | **Dead** | Removed from code, still in DB |
| 20 | `daily_log` | 0 | **Orphan** | Not referenced in any code |
| 21 | `ai_outputs` | 0 | **Orphan** | Not referenced in any code |
| 22 | `debrief_questions` | 23 | **Orphan** | Not referenced in any code |
| 23 | `exercise_sets` | 0 | **Orphan** | Not referenced in any code |
| 24 | `wealth_logs` | 0 | **Orphan** | Not referenced in any code |

**17 active tables, 2 dead (removed from code), 5 orphan (never existed in current code)**

---

## 2. Active Tables — Full Schema

### `users`
| Column | Type | Nullable | Default | Constraint |
|--------|------|----------|---------|------------|
| `id` | INTEGER | No | Auto | PRIMARY KEY AUTOINCREMENT |
| `username` | TEXT | No | - | UNIQUE |
| `password_hash` | TEXT | No | - | - |
| `created_at` | TIMESTAMP | No | - | - |
| `sleep_target_hrs` | REAL | Yes | NULL | Unused legacy |
| `step_goal` | INTEGER | Yes | NULL | Unused legacy |
| `screen_time_limit_mins` | INTEGER | Yes | NULL | Unused legacy |
| `savings_rate_pct` | REAL | Yes | NULL | Unused legacy |
| `workout_days_per_week` | INTEGER | Yes | NULL | Unused legacy |
| `connection_goal_per_week` | INTEGER | Yes | NULL | Unused legacy |
| `primary_goal` | TEXT | Yes | NULL | Unused legacy |
| `brief_cutoff_time` | TEXT | Yes | NULL | Unused legacy |
| `debrief_start_time` | TEXT | Yes | NULL | Unused legacy |
| `dev_mode` | INTEGER | Yes | 0 | Unused legacy |

**Indexes:** `sqlite_autoindex_users_1` UNIQUE on (username)
**Foreign Keys:** None
**Sample:** `{id:1, username:"testuser", created_at:"2026-03-18"}`

> **Note:** 10 of 14 columns are unused legacy fields from an earlier version. Only id, username, password_hash, created_at are active.

---

### `meal_logs`
| Column | Type | Nullable | Default | Constraint |
|--------|------|----------|---------|------------|
| `id` | INTEGER | No | Auto | PRIMARY KEY AUTOINCREMENT |
| `logged_at` | TIMESTAMP | Yes | CURRENT_TIMESTAMP | - |
| `log_date` | DATE | No | - | - |
| `description` | TEXT | No | - | - |
| `calories` | INTEGER | Yes | NULL | - |
| `protein_g` | REAL | Yes | NULL | - |
| `carbs_g` | REAL | Yes | NULL | - |
| `fat_g` | REAL | Yes | NULL | - |
| `user_id` | INTEGER | Yes | NULL | FK -> users.id |
| `is_dev_generated` | INTEGER | Yes | 0 | Unused legacy |
| `sugar_g` | REAL | Yes | 0 | - |
| `fiber_g` | REAL | Yes | 0 | - |
| `sodium_mg` | REAL | Yes | 0 | - |

**Indexes:** `idx_meal_logs_user_date` on (user_id, log_date)
**Foreign Keys:** user_id -> users.id
**Sample:** `{id:3, log_date:"2026-03-17", description:"2 slices sourdough bread", calories:240, protein_g:9.0, carbs_g:46.0, fat_g:1.5, sugar_g:0, fiber_g:0, sodium_mg:0}`

---

### `workout_logs`
| Column | Type | Nullable | Default | Constraint |
|--------|------|----------|---------|------------|
| `id` | INTEGER | No | Auto | PRIMARY KEY AUTOINCREMENT |
| `logged_at` | TIMESTAMP | No | - | - |
| `log_date` | DATE | No | - | - |
| `description` | TEXT | No | - | - |
| `calories_burned` | INTEGER | Yes | 0 | - |
| `user_id` | INTEGER | Yes | NULL | FK -> users.id |
| `is_dev_generated` | INTEGER | Yes | 0 | Unused legacy |
| `garmin_activity_id` | TEXT | Yes | NULL | Dedup key for Garmin imports |

**Indexes:** `idx_workout_logs_user_date` on (user_id, log_date), `idx_workout_garmin_uniq` UNIQUE on (user_id, garmin_activity_id)
**Foreign Keys:** user_id -> users.id
**Sample:** `{id:1, log_date:"2026-03-17", description:"4mi run at 7:50/mi and 145bpm hr", calories_burned:480}`

---

### `daily_activity`
| Column | Type | Nullable | Default | Constraint |
|--------|------|----------|---------|------------|
| `log_date` | DATE | No | - | PRIMARY KEY |
| `miles_run` | REAL | Yes | 0 | Unused legacy |
| `gym_session` | INTEGER | Yes | 0 | Unused legacy |
| `other_burn` | INTEGER | Yes | 0 | Unused legacy |
| `user_id` | INTEGER | Yes | NULL | FK -> users.id |
| `weight_lbs` | REAL | Yes | NULL | **Only active column** |

**Indexes:** Auto PK on (log_date)
**Foreign Keys:** user_id -> users.id

> **Note:** This table is only used for weight storage via `save_daily_weight()` and `get_daily_weight()`. The miles_run, gym_session, other_burn columns are unused.

---

### `garmin_daily`
| Column | Type | Nullable | Default | Constraint |
|--------|------|----------|---------|------------|
| `user_id` | INTEGER | No | - | PK (composite) |
| `stat_date` | DATE | No | - | PK (composite) |
| `steps` | INTEGER | Yes | 0 | - |
| `active_calories` | INTEGER | Yes | 0 | - |
| `total_calories` | INTEGER | Yes | 0 | - |
| `resting_hr` | INTEGER | Yes | NULL | - |
| `synced_at` | TIMESTAMP | No | - | - |

**Indexes:** `idx_garmin_daily_user_date` on (user_id, stat_date), auto PK UNIQUE
**Foreign Keys:** user_id -> users.id

---

### `user_onboarding`
| Column | Type | Nullable | Default | Constraint |
|--------|------|----------|---------|------------|
| `user_id` | INTEGER | No | - | PRIMARY KEY, FK -> users.id |
| `completed` | INTEGER | Yes | 0 | Boolean |
| `raw_inputs` | TEXT | Yes | '{}' | JSON blob of quiz answers |
| `profile_map` | TEXT | Yes | '{}' | JSON blob of 200+ AI-generated vars |
| `created_at` | TIMESTAMP | No | - | - |
| `updated_at` | TIMESTAMP | No | - | - |

**Foreign Keys:** user_id -> users.id

---

### `mind_checkins`
| Column | Type | Nullable | Default | Constraint |
|--------|------|----------|---------|------------|
| `id` | INTEGER | No | Auto | PRIMARY KEY AUTOINCREMENT |
| `user_id` | INTEGER | Yes | NULL | FK -> users.id |
| `checkin_date` | DATE | No | - | - |
| `type` | TEXT | No | - | "morning" or "evening" |
| `goals` | TEXT | Yes | '' | - |
| `notes` | TEXT | No | - | - |
| `focus` | INTEGER | No | - | 1-10 |
| `wellbeing` | INTEGER | No | - | 1-10 |
| `summary` | TEXT | No | - | AI-generated summary |
| `created_at` | TIMESTAMP | No | - | - |
| `energy_level` | INTEGER | Yes | NULL | 1-10 |
| `stress_level` | INTEGER | Yes | NULL | 1-10 |
| `sleep_quality` | INTEGER | Yes | NULL | 1-10 |
| `mood_level` | INTEGER | Yes | NULL | 1-10 |
| `focus_level` | INTEGER | Yes | NULL | 1-10 |
| `evening_prompt` | TEXT | Yes | NULL | Unused |

**Indexes:** `idx_mind_checkins_user_date` on (user_id, checkin_date)
**Foreign Keys:** user_id -> users.id

---

### `mind_tasks`
| Column | Type | Nullable | Default | Constraint |
|--------|------|----------|---------|------------|
| `id` | INTEGER | No | Auto | PRIMARY KEY AUTOINCREMENT |
| `user_id` | INTEGER | Yes | NULL | FK -> users.id |
| `task_date` | DATE | No | - | - |
| `description` | TEXT | No | - | - |
| `completed` | INTEGER | Yes | 0 | Boolean |
| `source` | TEXT | Yes | 'manual' | "manual" or "morning_brief" or "evening_brief" |
| `created_at` | TIMESTAMP | No | - | - |

**Indexes:** `idx_mind_tasks_user_date` on (user_id, task_date)
**Foreign Keys:** user_id -> users.id

---

### `gmail_tokens`
| Column | Type | Nullable | Default | Constraint |
|--------|------|----------|---------|------------|
| `user_id` | INTEGER | No | - | PRIMARY KEY, FK -> users.id |
| `access_token` | TEXT | No | - | Encrypted at rest |
| `refresh_token` | TEXT | No | - | Encrypted at rest |
| `token_expiry` | TEXT | No | - | ISO timestamp |
| `email_address` | TEXT | Yes | '' | - |
| `connected_at` | TIMESTAMP | No | - | - |

**Foreign Keys:** user_id -> users.id

---

### `gmail_cache`
| Column | Type | Nullable | Default | Constraint |
|--------|------|----------|---------|------------|
| `id` | INTEGER | No | Auto | PRIMARY KEY AUTOINCREMENT |
| `user_id` | INTEGER | Yes | NULL | FK -> users.id |
| `thread_id` | TEXT | No | - | - |
| `message_id` | TEXT | No | - | UNIQUE with user_id |
| `sender` | TEXT | No | - | - |
| `subject` | TEXT | Yes | '' | - |
| `snippet` | TEXT | Yes | '' | - |
| `received_at` | TEXT | No | - | - |
| `has_replied` | INTEGER | Yes | 0 | Boolean |
| `is_read` | INTEGER | Yes | 0 | Boolean |
| `cached_at` | TIMESTAMP | No | - | - |
| `importance_score` | REAL | Yes | 0 | Computed score |

**Indexes:** `idx_gmail_cache_user` on (user_id), UNIQUE on (user_id, message_id)
**Foreign Keys:** user_id -> users.id

---

### `gmail_summaries`
| Column | Type | Nullable | Default | Constraint |
|--------|------|----------|---------|------------|
| `user_id` | INTEGER | No | - | PK (composite) |
| `summary_date` | DATE | No | - | PK (composite) |
| `summary_text` | TEXT | No | - | AI-generated |
| `email_count` | INTEGER | Yes | 0 | - |
| `unreplied` | INTEGER | Yes | 0 | - |
| `generated_at` | TIMESTAMP | No | - | - |

**Indexes:** `idx_gmail_summaries_user` on (user_id), auto PK UNIQUE
**Foreign Keys:** user_id -> users.id

---

### `gmail_importance`
| Column | Type | Nullable | Default | Constraint |
|--------|------|----------|---------|------------|
| `id` | INTEGER | No | Auto | PRIMARY KEY AUTOINCREMENT |
| `user_id` | INTEGER | Yes | NULL | FK -> users.id |
| `sender` | TEXT | No | - | Email address |
| `sender_domain` | TEXT | Yes | '' | Extracted domain |
| `label` | TEXT | No | - | "important" or "unimportant" |
| `count` | INTEGER | Yes | 1 | Times labeled |
| `created_at` | TIMESTAMP | No | - | - |
| `updated_at` | TIMESTAMP | No | - | - |

**Indexes:** UNIQUE on (user_id, sender, label)
**Foreign Keys:** user_id -> users.id

---

### `user_goals`
| Column | Type | Nullable | Default | Constraint |
|--------|------|----------|---------|------------|
| `user_id` | INTEGER | No | - | PRIMARY KEY, FK -> users.id |
| `goal_key` | TEXT | No | 'lose_weight' | lose_weight/build_muscle/recomp/maintain |
| `calorie_target` | INTEGER | No | - | - |
| `protein_g` | INTEGER | No | - | - |
| `fat_g` | INTEGER | No | - | - |
| `carbs_g` | INTEGER | No | - | - |
| `deficit_surplus` | INTEGER | Yes | 0 | Negative = deficit |
| `rmr` | INTEGER | No | - | Resting metabolic rate |
| `rmr_method` | TEXT | Yes | 'mifflin_st_jeor' | - |
| `tdee_used` | INTEGER | Yes | 0 | - |
| `config_json` | TEXT | Yes | '{}' | Extended config |
| `sources_json` | TEXT | Yes | '[]' | Research sources |
| `created_at` | TIMESTAMP | No | - | - |
| `updated_at` | TIMESTAMP | No | - | - |

**Indexes:** `idx_user_goals_user` on (user_id)
**Foreign Keys:** user_id -> users.id
**Sample:** `{goal_key:"lose_weight", calorie_target:1840, protein_g:154, fat_g:59, carbs_g:173, deficit_surplus:-460, rmr:1823}`

---

### `daily_momentum`
| Column | Type | Nullable | Default | Constraint |
|--------|------|----------|---------|------------|
| `user_id` | INTEGER | No | - | PK (composite) |
| `score_date` | DATE | No | - | PK (composite) |
| `momentum_score` | INTEGER | No | - | 0-100 |
| `nutrition_pct` | REAL | Yes | 0 | Category score |
| `protein_pct` | REAL | Yes | 0 | Category score |
| `activity_pct` | REAL | Yes | 0 | Category score |
| `checkin_done` | INTEGER | Yes | 0 | Boolean |
| `task_rate` | REAL | Yes | 0 | 0.0-1.0 |
| `wellbeing_delta` | REAL | Yes | 0 | Change from baseline |
| `computed_at` | TIMESTAMP | No | - | - |
| `raw_deltas` | TEXT | Yes | '{}' | JSON debug data |

**Indexes:** `idx_daily_momentum_user_date` on (user_id, score_date), auto PK UNIQUE
**Foreign Keys:** user_id -> users.id

---

### `saved_meals`
| Column | Type | Nullable | Default | Constraint |
|--------|------|----------|---------|------------|
| `id` | INTEGER | No | Auto | PRIMARY KEY AUTOINCREMENT |
| `user_id` | INTEGER | Yes | NULL | FK -> users.id |
| `description` | TEXT | No | - | - |
| `calories` | INTEGER | Yes | NULL | - |
| `protein_g` | REAL | Yes | NULL | - |
| `carbs_g` | REAL | Yes | NULL | - |
| `fat_g` | REAL | Yes | NULL | - |
| `items_json` | TEXT | Yes | '[]' | JSON item breakdown |
| `saved_at` | TIMESTAMP | No | - | - |
| `sugar_g` | REAL | Yes | 0 | - |
| `fiber_g` | REAL | Yes | 0 | - |
| `sodium_mg` | REAL | Yes | 0 | - |

**Foreign Keys:** user_id -> users.id

---

### `saved_workouts`
| Column | Type | Nullable | Default | Constraint |
|--------|------|----------|---------|------------|
| `id` | INTEGER | No | Auto | PRIMARY KEY AUTOINCREMENT |
| `user_id` | INTEGER | Yes | NULL | FK -> users.id |
| `description` | TEXT | No | - | - |
| `calories_burned` | INTEGER | Yes | 0 | - |
| `saved_at` | TIMESTAMP | No | - | - |

**Foreign Keys:** user_id -> users.id

---

### `momentum_summaries`
| Column | Type | Nullable | Default | Constraint |
|--------|------|----------|---------|------------|
| `user_id` | INTEGER | No | - | PK (composite) |
| `summary_date` | DATE | No | - | PK (composite) |
| `scale` | TEXT | No | - | PK: "day", "week", or "month" |
| `summary_text` | TEXT | No | - | AI-generated |
| `generated_at` | TIMESTAMP | No | - | - |

**Indexes:** Auto PK UNIQUE on (user_id, summary_date, scale)
**Foreign Keys:** user_id -> users.id

---

## 3. Foreign Key Map

```
users.id
  ├── meal_logs.user_id
  ├── workout_logs.user_id
  ├── daily_activity.user_id
  ├── garmin_daily.user_id
  ├── user_onboarding.user_id
  ├── mind_checkins.user_id
  ├── mind_tasks.user_id
  ├── gmail_tokens.user_id
  ├── gmail_cache.user_id
  ├── gmail_summaries.user_id
  ├── gmail_importance.user_id
  ├── user_goals.user_id
  ├── daily_momentum.user_id
  ├── saved_meals.user_id
  ├── saved_workouts.user_id
  └── momentum_summaries.user_id

workout_logs.id
  └── exercise_sets.workout_log_id (orphan table)
```

All tables reference `users.id`. Single-user hierarchy. No cross-table joins except through user_id.

---

## 4. Index Inventory

| Table | Index | Columns | Unique | Type |
|-------|-------|---------|--------|------|
| `users` | `sqlite_autoindex_users_1` | (username) | Yes | Auto |
| `meal_logs` | `idx_meal_logs_user_date` | (user_id, log_date) | No | Manual |
| `workout_logs` | `idx_workout_logs_user_date` | (user_id, log_date) | No | Manual |
| `workout_logs` | `idx_workout_garmin_uniq` | (user_id, garmin_activity_id) | Yes | Manual |
| `daily_activity` | `sqlite_autoindex_daily_activity_1` | (log_date) | Yes | Auto PK |
| `garmin_daily` | `idx_garmin_daily_user_date` | (user_id, stat_date) | No | Manual |
| `mind_checkins` | `idx_mind_checkins_user_date` | (user_id, checkin_date) | No | Manual |
| `mind_tasks` | `idx_mind_tasks_user_date` | (user_id, task_date) | No | Manual |
| `gmail_cache` | `idx_gmail_cache_user` | (user_id) | No | Manual |
| `gmail_cache` | `sqlite_autoindex_gmail_cache_1` | (user_id, message_id) | Yes | Auto |
| `gmail_summaries` | `idx_gmail_summaries_user` | (user_id) | No | Manual |
| `gmail_importance` | `sqlite_autoindex_gmail_importance_1` | (user_id, sender, label) | Yes | Auto |
| `user_goals` | `idx_user_goals_user` | (user_id) | No | Manual |
| `daily_momentum` | `idx_daily_momentum_user_date` | (user_id, score_date) | No | Manual |
| `sleep_logs` | `idx_sleep_logs_user_date` | (user_id, sleep_date) | No | Manual |

---

## 5. Row Counts

| Table | Rows |
|-------|------|
| `debrief_questions` | 23 (orphan, static seed data) |
| `meal_logs` | 6 |
| `daily_momentum` | 3 |
| `users` | 2 |
| `user_goals` | 1 |
| `daily_activity` | 1 |
| `workout_logs` | 1 |
| `momentum_summaries` | 1 |
| All other tables | 0 |

---

## 6. Orphan & Dead Tables (safe to drop)

These tables exist in the SQLite file but are NOT created or referenced by any current code:

| Table | Columns | Rows | Origin |
|-------|---------|------|--------|
| `ai_outputs` | 9 cols (user_id, output_type, input_data, output_text, model_used, tokens_used...) | 0 | Legacy AI output logging |
| `daily_log` | 45 cols (sleep, HRV, weight, steps, water, alcohol, screen time, social, mood, journal...) | 0 | Legacy comprehensive daily tracker |
| `debrief_questions` | 4 cols (question_text, category, last_asked_date) | 23 | Legacy evening debrief question bank |
| `exercise_sets` | 9 cols (exercise_name, set_number, weight_lbs, reps...) | 0 | Legacy per-set tracking |
| `wealth_logs` | 12 cols (entry_type, amount, category, merchant, hours_worked, side_income...) | 0 | Legacy financial tracking |
| `app_settings` | 2 cols (key, value) | 0 | Legacy key-value settings |
| `sleep_logs` | 11 cols (total_seconds, deep/light/rem/awake, sleep_score...) | 0 | Removed sleep feature |

**Total orphan columns: 92 columns across 7 tables, all with 0 rows (except debrief_questions).**

---

## 7. Unused Columns in Active Tables

### `users` — 10 of 14 columns unused
- `sleep_target_hrs`, `step_goal`, `screen_time_limit_mins`, `savings_rate_pct`, `workout_days_per_week`, `connection_goal_per_week`, `primary_goal`, `brief_cutoff_time`, `debrief_start_time`, `dev_mode`

### `daily_activity` — 3 of 6 columns unused
- `miles_run`, `gym_session`, `other_burn` (only `weight_lbs` is used)

### `meal_logs` — 1 unused
- `is_dev_generated`

### `workout_logs` — 1 unused
- `is_dev_generated`

### `mind_checkins` — 1 unused
- `evening_prompt`

---

## 8. Missing Indexes (based on query patterns)

| Query Pattern | Table | Current Index | Recommendation |
|---------------|-------|---------------|----------------|
| `WHERE user_id = ? AND description = ?` | `saved_meals` | None | Add index on (user_id, description) |
| `WHERE user_id = ? AND description = ?` | `saved_workouts` | None | Add index on (user_id, description) |
| `WHERE user_id = ?` | `saved_meals` | None | Add index on (user_id) |
| `WHERE user_id = ?` | `saved_workouts` | None | Add index on (user_id) |
| `WHERE user_id = ?` | `momentum_summaries` | None (PK covers) | OK — composite PK |
| `WHERE user_id = ? AND log_date = ?` | `daily_activity` | PK on log_date only | Add composite (user_id, log_date) — current PK doesn't include user_id |

All other query patterns are covered by existing indexes.

---

## 9. Migration Notes for PostgreSQL

### Syntax Changes Required
| SQLite | PostgreSQL |
|--------|------------|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` |
| `?` placeholders | `%s` placeholders |
| `INSERT OR REPLACE` | `INSERT ... ON CONFLICT DO UPDATE` |
| `TEXT` for JSON | `JSONB` (better indexing) |
| `sqlite3.Row` | `psycopg2.extras.RealDictCursor` |
| No type enforcement | Strict types |

### Tables to Migrate (17 active)
All 17 active tables listed in section 2.

### Tables to Drop (7 orphan)
`ai_outputs`, `daily_log`, `debrief_questions`, `exercise_sets`, `wealth_logs`, `app_settings`, `sleep_logs`

### Columns to Drop (16 unused across active tables)
See section 7.
