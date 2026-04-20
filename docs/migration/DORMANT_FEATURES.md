# APEX Life Dashboard — Dormant Features

Generated: 2026-04-19 | Features deleted from Flask codebase, to rebuild in React Native when unblocked

---

## Deletion Principles

1. Before deleting any feature, verify its intent is preserved in BUSINESS_LOGIC.md, FRONTEND_INVENTORY.md, or INTEGRATIONS_MAP.md.
2. Delete one feature at a time, with full verification after each.
3. Commit each deletion separately.
4. DB tables are dropped via migration file, not removed from init_db().

---

## 1. Garmin Sync

### Why Dormant

Garmin Connect API requires an approved developer account. The current integration uses `garminconnect` (an unofficial library that scrapes the Garmin Connect web interface) and `garth` (token management). This approach is fragile, gets rate-limited, and may violate Garmin's ToS. Background polling is already disabled in production (app.py line 1062: commented out). The feature will be rebuilt with official Garmin API access when approved.

### Artifacts Deleted

**Entire file:**
- `garmin_sync.py` (275 lines) — all 10 functions, deleted

**Routes in app.py:**
| Route | Handler | Status |
|-------|---------|--------|
| (internal) | `_garmin_save()` | Deleted |
| (internal) | `_get_garmin_user_id()`, commented `start_background_poll` | Deleted |
| `GET /api/garmin` | `api_garmin()` | Deleted |
| `GET /api/garmin/status` | `api_garmin_status()` | Deleted |
| `POST /api/garmin/sync` | `api_garmin_sync()` | Deleted |

**Import in app.py:**
- `import garmin_sync` — removed

**Functions in db.py:**
| Function | Purpose | Status |
|----------|---------|--------|
| `upsert_garmin_daily()` | Insert/update Garmin daily stats | Deleted |
| `get_garmin_daily()` | Get Garmin stats for a date | Deleted |
| `get_garmin_history()` | Get Garmin stats for last N days | Deleted |
| `get_garmin_last_sync()` | Get most recent sync timestamp | Deleted |
| `garmin_activity_exists()` | Check if Garmin workout already imported | Deleted |
| `insert_garmin_workout()` | Insert a workout sourced from Garmin | Deleted |

**DB Tables:**
- `garmin_daily` — dropped via migration

**Dependencies removed from requirements.txt:**
- `garminconnect` — removed
- `garth` — removed

**Frontend (index.html):**
- All Garmin-conditional rendering, `serverGarmin` variable extraction, `garminDay` active calories, commented-out sleep section — removed

### Intent Preserved Before Deletion

**Documented in INTEGRATIONS_MAP.md:**
- Garmin Connect API endpoints, auth flow, data shapes, error handling, rate limit patterns, polling intervals

**Documented in FRONTEND_INVENTORY.md:**
- Garmin status display, steps auto-fill pattern, manual sync button

**No business logic formulas** — Garmin provides raw data (steps, calories, HR, sleep); no APEX-specific formulas are applied to it.

### TECH_DEBT Items Resolved

- **P0-1** (sleep_logs table missing from init_db) — moot, sleep_logs deleted
- **P2-11** (garmin_sync._last_fetch_time race condition) — moot, garmin_sync.py deleted
- **P3-14** (garmin global mutable state: _client, _client_lock, _poll_thread, _last_fetch_time) — moot, deleted

---

## 2. Sleep Tracking

### Why Dormant

Sleep data comes exclusively from Garmin sync. There is no manual sleep entry UI. The sleep rendering code in the frontend was explicitly disabled with comments: "Sleep section hidden until Garmin is back online". With Garmin deleted, sleep tracking has no data source.

### Artifacts Deleted

**Functions in db.py:**
| Function | Purpose | Status |
|----------|---------|--------|
| `upsert_sleep()` | Insert/update sleep record | Deleted |
| `get_sleep()` | Get sleep for a user/date | Deleted |
| `get_sleep_history()` | Get sleep history for N days | Deleted |

**DB Tables:**
- `sleep_logs` — dropped via migration

**Frontend:**
- All sleep-related rendering, variables, and commented-out sections — removed

### Intent Preserved Before Deletion

**Documented in INTEGRATIONS_MAP.md:**
- Garmin sleep data shape: `{total_seconds, deep_seconds, light_seconds, rem_seconds, awake_seconds, sleep_score}`

**No business logic formulas** — sleep data is displayed raw, no APEX-specific scoring applied.

---

## 3. Check-Ins / Mood Tracking (mind_checkins)

### Why Dormant

The check-in UI (morning brief, evening debrief) was **explicitly removed** from the frontend. The backend route existed but there was no UI to trigger it. `generate_evening_prompt()` and `score_brief()` in claude_profile.py were defined but never called from any route.

### Artifacts Deleted

**Route in app.py:**
| Route | Handler | Status |
|-------|---------|--------|
| `POST /api/mind/checkin` | `api_mind_checkin()` | Deleted |

**Functions in db.py:**
| Function | Purpose | Status |
|----------|---------|--------|
| `insert_mind_checkin()` | Insert a check-in record | Deleted |
| `get_mind_today()` | Get check-ins for a date | Deleted |
| `get_mind_history()` | Get check-in history | Deleted |

**Functions in claude_profile.py (dead code removed):**
| Function | Purpose | Status |
|----------|---------|--------|
| `compute_mind_insights()` | Derive Mind tab insights from profile — never called | Deleted |
| `generate_evening_prompt()` | Generate evening follow-up question — never called | Deleted |
| `score_brief()` | Score check-in and extract tasks — only called from deleted route | Deleted |

**claude_profile.py reduced from 323 to 94 lines** (229 lines of dead code removed). Only `generate_profile_map()` remains (active, used during onboarding).

**DB Tables:**
- `mind_checkins` — dropped via migration

### Intent Preserved Before Deletion

**Documented in BUSINESS_LOGIC.md:**
- Check-in scoring formula, task auto-generation logic, prompt templates

**Note:** Manual task creation (`POST /api/mind/task`) is completely independent and remains active.

---

## 4. App Settings (get_setting / set_setting)

### Why Dormant

The `get_setting()` and `set_setting()` functions were imported but **never called** from any route or function. The `app_settings` table existed in the DB but was not created by `init_db()`. Pure dead code that was never fully implemented.

### Artifacts Deleted

**Functions in db.py:**
| Function | Status |
|----------|--------|
| `get_setting()` | Deleted |
| `set_setting()` | Deleted |

**DB Tables:**
- `app_settings` — dropped via migration

### Intent Preserved Before Deletion

None needed — no business logic, no UI, no integration. Pure dead code.

---

## 5. Orphan Database Tables (No Code References)

### Why Dormant

These tables existed in the SQLite file but were not referenced by any code. Remnants of earlier versions.

### Tables Dropped

| Table | Rows | Notes |
|-------|------|-------|
| `ai_outputs` | 0 | Never referenced in any code |
| `daily_log` | 0 | 45-column legacy tracker, never referenced |
| `debrief_questions` | 23 | Legacy question bank for check-in prompts, never referenced |
| `exercise_sets` | 0 | Never referenced — was likely for per-set tracking |
| `wealth_logs` | 0 | Never referenced — was likely for financial tracking |

### TECH_DEBT Items Resolved

- **P3-19** (orphan database tables) — fully resolved by deletion

---

## Summary: Deletion Impact (Completed)

### Code Removed

| Category | Lines |
|----------|-------|
| `garmin_sync.py` (entire file) | 275 |
| `claude_profile.py` dead code (323 → 94 lines) | 229 |
| Garmin routes/helpers in `app.py` | ~120 |
| Garmin/sleep functions in `db.py` | ~130 |
| Check-in route in `app.py` | ~70 |
| Check-in functions in `db.py` | ~45 |
| App settings functions in `db.py` | ~15 |
| **Total** | **~884 lines** |

### DB Tables Dropped

| Table | Feature |
|-------|---------|
| `garmin_daily` | Garmin sync |
| `sleep_logs` | Sleep tracking |
| `mind_checkins` | Check-ins |
| `app_settings` | App settings (dead) |
| `ai_outputs` | Orphan |
| `daily_log` | Orphan |
| `debrief_questions` | Orphan |
| `exercise_sets` | Orphan |
| `wealth_logs` | Orphan |
| **9 tables dropped** | |

### Dependencies Removed

| Package | Feature |
|---------|---------|
| `garminconnect` | Garmin sync |
| `garth` | Garmin token management |
| **2 dependencies removed** | |

### AI Calls Removed

| Function | Model | File |
|----------|-------|------|
| `generate_evening_prompt()` | Haiku | claude_profile.py |
| `score_brief()` | Haiku | claude_profile.py |
| `compute_mind_insights()` | (no AI call, pure logic) | claude_profile.py |
| **2 AI calls removed** | | |

### TECH_DEBT Items Resolved by Deletion

| Item | Description |
|------|-------------|
| P0-1 | sleep_logs and app_settings missing from init_db — tables deleted instead |
| P2-11 | garmin_sync._last_fetch_time race condition — file deleted |
| P3-14 | Garmin global mutable state — file deleted |
| P3-19 | Orphan database tables — all dropped |
