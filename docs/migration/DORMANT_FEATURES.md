# APEX Life Dashboard — Dormant Features

Generated: 2026-04-17 | Features to delete from Flask codebase, rebuild in React Native when unblocked

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

### Artifacts to Delete

**Entire file:**
- `garmin_sync.py` (275 lines) — all 10 functions

**Routes in app.py:**
| Line | Route | Handler |
|------|-------|---------|
| 1023-1047 | (internal) | `_garmin_save()` |
| 1050-1062 | (internal) | `_get_garmin_user_id()`, commented `start_background_poll` |
| 1065-1075 | `GET /api/garmin` | `api_garmin()` |
| 1078-1091 | `GET /api/garmin/status` | `api_garmin_status()` |
| 1094-1129 | `POST /api/garmin/sync` | `api_garmin_sync()` |

**Import in app.py:**
- Line 35: `import garmin_sync`

**Functions in db.py:**
| Line | Function | Purpose |
|------|----------|---------|
| 616-631 | `upsert_garmin_daily()` | Insert/update Garmin daily stats |
| 634-641 | `get_garmin_daily()` | Get Garmin stats for a date |
| 644-655 | `get_garmin_history()` | Get Garmin stats for last N days |
| 658-665 | `get_garmin_last_sync()` | Get most recent sync timestamp |
| 719-726 | `garmin_activity_exists()` | Check if Garmin workout already imported |
| 729-740 | `insert_garmin_workout()` | Insert a workout sourced from Garmin |

**Import in db.py (referenced from app.py):**
- Line 14: `upsert_garmin_daily, get_garmin_daily, get_garmin_last_sync`
- Line 15: `garmin_activity_exists, insert_garmin_workout`
- (Also remove from app.py import block at lines 13-15)

**DB Tables:**
- `garmin_daily` — schema at db.py lines 63-75 + index at line 308

**DB Indexes:**
- `idx_garmin_daily_user_date` on garmin_daily (line 308)
- `idx_workout_garmin_uniq` on workout_logs(user_id, garmin_activity_id) (line 314)

**DB Columns in active tables:**
- `workout_logs.garmin_activity_id` — only used for Garmin dedup. Manual workouts set this to NULL.

**requirements.txt:**
- `garminconnect` — remove
- `garth` — remove

**Frontend (index.html):**
| Line | Reference | Action |
|------|-----------|--------|
| 1785 | Comment about Garmin-conditional rendering | Remove comment |
| 6712 | `serverGarmin` variable extraction from history | Remove Garmin branch, keep fallback |
| 6737-6739 | `garminDay` active calories extraction | Remove Garmin branch |
| 7232-7234 | `garminDs` active calories extraction | Remove Garmin branch |
| 7527, 7548-7549 | `serverGarmin` second instance | Remove Garmin branch |
| 7736 | `gDay` Garmin extraction | Remove |
| 7828 | `garmin: null` in error fallback | Remove garmin key |
| 8026-8028 | `garmin`, `effectiveSteps`, `activeCalories` from Garmin | Remove Garmin variables |
| 8118-8120 | Commented-out sleep section (Garmin-dependent) | Remove comments |

**delete_account() in db.py:**
- Line 327: `"garmin_daily"` in cascade delete table list — remove

### Intent to Preserve Before Deletion

**Already documented in INTEGRATIONS_MAP.md:**
- Garmin Connect API endpoints, auth flow, data shapes, error handling, rate limit patterns, polling intervals
- All of this documentation must be preserved (not deleted) so the React Native rebuild has a reference

**Already documented in FRONTEND_INVENTORY.md:**
- Garmin status display, steps auto-fill pattern, manual sync button

**No business logic formulas** — Garmin provides raw data (steps, calories, HR, sleep); no APEX-specific formulas are applied to it.

### TECH_DEBT Items Rendered Moot

- **P0-1** (sleep_logs table missing from init_db) — moot, sleep_logs is deleted
- **P2-11** (garmin_sync._last_fetch_time race condition) — moot, garmin_sync.py is deleted
- **P3-14** (garmin global mutable state: _client, _client_lock, _poll_thread, _last_fetch_time) — moot, deleted

---

## 2. Sleep Tracking

### Why Dormant

Sleep data comes exclusively from Garmin sync. There is no manual sleep entry UI. The sleep rendering code in the frontend is explicitly disabled with comments: "Sleep section hidden until Garmin is back online" (index.html line 8120). With Garmin deleted, sleep tracking has no data source.

### Artifacts to Delete

**Functions in db.py:**
| Line | Function | Purpose |
|------|----------|---------|
| 670-692 | `upsert_sleep()` | Insert/update sleep record |
| 695-702 | `get_sleep()` | Get sleep for a user/date |
| 705-716 | `get_sleep_history()` | Get sleep history for N days |

**Imports in app.py:**
- Line 22: `upsert_sleep, get_sleep, get_sleep_history,`

**Usage in app.py routes (remove sleep calls, keep routes intact):**
| Line | Route | Sleep Usage | Action |
|------|-------|-------------|--------|
| 819 | `GET /api/day/<date>` | `detail["sleep"] = get_sleep(uid(), date_str)` | Set `detail["sleep"] = None` |
| 949 | `GET /api/history` | `"sleep": get_sleep_history(uid(), 90)` | Set `"sleep": {}` |
| 1085 | `GET /api/garmin/status` | `sleep = get_sleep(...)` | Entire route deleted with Garmin |
| 1124 | `POST /api/garmin/sync` | `"sleep": get_sleep(...)` | Entire route deleted with Garmin |
| 1032-1037 | `_garmin_save()` | `upsert_sleep(...)` | Entire function deleted with Garmin |

**Sleep parsing in garmin_sync.py:**
- Lines 119-146: `_parse_sleep()` — deleted with garmin_sync.py
- Lines 168-173: sleep fetch in `fetch_day()` — deleted with garmin_sync.py

**DB Tables:**
- `sleep_logs` — exists in current DB file but NOT in init_db(). Drop via migration.

**DB Indexes:**
- `idx_sleep_logs_user_date` on sleep_logs (db.py line 309)

**Frontend (index.html):**
| Line | Reference | Action |
|------|-----------|--------|
| 7691 | `Object.keys(serverData.sleep || {})` in date aggregation | Remove sleep from date sources |
| 7729 | `const sleep = (serverData.sleep || {})[d] || null;` | Remove |
| 7767 | Commented-out sleep display | Remove |
| 8119-8120 | Commented-out sleep section | Remove |

**delete_account() in db.py:**
- Line 327: `"sleep_logs"` in cascade delete table list — remove

### Intent to Preserve Before Deletion

**Already documented in INTEGRATIONS_MAP.md:**
- Garmin sleep data shape: `{total_seconds, deep_seconds, light_seconds, rem_seconds, awake_seconds, sleep_score}`
- This is sufficient for rebuilding in React Native

**No business logic formulas** — sleep data is displayed raw, no APEX-specific scoring applied.

### TECH_DEBT Items Rendered Moot

- **P0-1** (sleep_logs CREATE TABLE missing from init_db) — moot, deleting the table entirely

---

## 3. Check-Ins / Mood Tracking (mind_checkins)

### Why Dormant

The check-in UI (morning brief, evening debrief) was **explicitly removed** from the frontend (index.html line 9734: `// (Removed: morning brief, evening debrief, brief schedule, brief notifications)`). The backend route still exists and works, but there is no UI to trigger it. The `generate_evening_prompt()` function in claude_profile.py is defined but never called from any route.

### CRITICAL DEPENDENCY: Task Auto-Generation

The `POST /api/mind/checkin` route calls `score_brief()` which uses AI to extract tasks from check-in notes and auto-creates `mind_tasks` entries. **However**, since the check-in UI is removed, this code path is never reached. Manual task creation (`POST /api/mind/task`) is completely independent and does not use check-ins.

The momentum score tracks `checkin_done` status but applies **zero weight** to it (db.py line 934: `"checkin": 0`). Removing check-ins has zero effect on scoring.

### Artifacts to Delete

**Route in app.py:**
| Line | Route | Handler |
|------|-------|---------|
| 486-550 | `POST /api/mind/checkin` | `api_mind_checkin()` |

**Functions in db.py:**
| Line | Function | Purpose |
|------|----------|---------|
| 841-857 | `insert_mind_checkin()` | Insert a check-in record |
| 860-867 | `get_mind_today()` | Get check-ins for a date |
| 870-879 | `get_mind_history()` | Get check-in history (used by /api/history for briefs map) |

**Functions in claude_profile.py:**
| Line | Function | Purpose |
|------|----------|---------|
| 96-255 | `compute_mind_insights()` | Derive Mind tab insights from profile — **never called from anywhere** |
| 260-281 | `generate_evening_prompt()` | Generate evening follow-up question — **never called from any route** |
| 286-323 | `score_brief()` | Score check-in and extract tasks — only called from `POST /api/mind/checkin` |

**Imports in app.py:**
- Line 34: `from claude_profile import generate_profile_map, score_brief` — remove `score_brief`
- Line 19: `insert_mind_checkin, get_mind_today, get_mind_history,` — remove all three

**Usage in other routes (adjust, don't delete the route):**
| Line | Route | Checkin Usage | Action |
|------|-------|---------------|--------|
| 470 | `GET /api/mind/today` | `checkins = get_mind_today(uid(), today)` | Set `checkins = []`, keep route (tasks are active) |
| 477 | `GET /api/mind/today` | `"history": get_mind_history(uid(), days=14)` | Set `"history": []` |
| 937-942 | `GET /api/history` | Builds `briefs` map from `get_mind_history()` | Set `"briefs": {}` |

**Momentum computation in db.py:**
- Lines 967-971: Fetches check-in types for scoring — can be simplified
- Lines 1110-1116: Checkin penalty calculation (weight is 0, so penalty is always 0) — remove dead branches
- Line 1142: `checkin_done = 1 if types_done else 0` — set to 0 always, or remove field

**DB Tables:**
- `mind_checkins` — schema at db.py lines 88-99 + migration columns at lines 260-268

**DB Indexes:**
- `idx_mind_checkins_user_date` on mind_checkins (db.py line 303)

**Frontend (index.html):**
| Line | Reference | Action |
|------|-----------|--------|
| 757-758 | `.mind-checkin-row` CSS class | Remove |
| 8613 | Task source icons (`morning_brief` ☀️, `evening_brief` 🌙) | Keep — existing tasks may have these sources |
| 8776-8780 | Checkin display in momentum breakdown ("AM", "PM", "AM+PM") | Remove checkin row from breakdown |
| 9734 | Comment about removed features | Remove comment |

**delete_account() in db.py:**
- Line 327: `"mind_checkins"` in cascade delete table list — remove

### Intent to Preserve Before Deletion

**Add to BUSINESS_LOGIC.md before deletion:**
- Check-in scoring formula: AI extracts focus (1-10), wellbeing (1-10), summary (<15 words), and concrete tasks from free-text notes
- Task auto-generation: morning check-in creates tasks for today, evening for tomorrow
- Momentum checkin_done flag: tracked but weighted at 0 (disabled)
- Prompt template for score_brief() (claude_profile.py lines 290-303) — preserve for React Native rebuild

**Already documented in FRONTEND_INVENTORY.md:**
- The check-in UI was documented before removal; the line 9734 comment confirms this

### TECH_DEBT Items Rendered Moot

- None directly — check-in code has no P0/P1/P2 issues flagged

---

## 4. App Settings (get_setting / set_setting)

### Why Dormant

The `get_setting()` and `set_setting()` functions are imported in app.py (line 16) but **never called** from any route or function. The `app_settings` table exists in the current DB but is not created by `init_db()`. This is dead code that was never fully implemented.

### Artifacts to Delete

**Functions in db.py:**
| Line | Function |
|------|----------|
| 743-747 | `get_setting()` |
| 749-755 | `set_setting()` |

**Imports in app.py:**
- Line 16: `get_setting, set_setting,` — remove both

**DB Tables:**
- `app_settings` — exists in current DB, not in init_db(). Drop via migration.

### Intent to Preserve Before Deletion

None needed — no business logic, no UI, no integration. Pure dead code.

### TECH_DEBT Items Rendered Moot

- **P0-1** partially (app_settings table missing from init_db) — moot, deleting instead

---

## 5. Orphan Database Tables (No Code References)

### Why Dormant

These tables exist in the SQLite file but are not referenced by any code. They are remnants of earlier versions of the app.

### Tables to Drop

| Table | Rows | Notes |
|-------|------|-------|
| `ai_outputs` | 0 | Never referenced in any code |
| `daily_log` | 0 | 45-column legacy tracker, never referenced |
| `debrief_questions` | 23 | Legacy question bank for check-in prompts, never referenced |
| `exercise_sets` | 0 | Never referenced — was likely for per-set tracking |
| `wealth_logs` | 0 | Never referenced — was likely for financial tracking |

### Intent to Preserve Before Deletion

**debrief_questions** (23 rows) — these are pre-written prompts for morning/evening check-ins. Since check-ins are being deleted and the prompts are AI-generated in the current code anyway, no intent needs preservation.

**exercise_sets** — the concept of per-set tracking (weight, reps per set) exists in the frontend workout checklist. It's stored in localStorage, not this table. No intent lost.

**wealth_logs** — financial tracking was never built. No intent to preserve.

### TECH_DEBT Items Rendered Moot

- **P3-19** (orphan database tables) — fully resolved by deletion

---

## Summary: Deletion Impact

### Code Removed

| Category | Estimated Lines |
|----------|----------------|
| `garmin_sync.py` (entire file) | 275 |
| Garmin routes/helpers in `app.py` | ~120 |
| Garmin functions in `db.py` | ~80 |
| Sleep functions in `db.py` | ~50 |
| Check-in route in `app.py` | ~70 |
| Check-in functions in `db.py` | ~45 |
| Dead functions in `claude_profile.py` | ~195 |
| App settings functions in `db.py` | ~15 |
| Frontend Garmin/sleep/checkin references | ~50 |
| **Total estimated** | **~900 lines** |

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

### TECH_DEBT Items Resolved by Deletion

| Item | Description |
|------|-------------|
| P0-1 | sleep_logs and app_settings missing from init_db — tables deleted instead |
| P2-11 | garmin_sync._last_fetch_time race condition — file deleted |
| P3-14 | Garmin global mutable state — file deleted |
| P3-19 | Orphan database tables — all dropped |
