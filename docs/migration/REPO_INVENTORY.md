# APEX Life Dashboard — Repository Inventory

Generated: 2026-04-17

---

## 1. File Tree with Sizes

```
life-dashboard/
├── app.py                    (1,474 lines, 57KB)   Flask app, 52 API routes
├── db.py                     (1,531 lines, 67KB)   SQLite schema, 17 tables, 75 CRUD functions
├── ai_client.py              (6 lines, 119B)       Anthropic client singleton
├── claude_nutrition.py       (909 lines, 39KB)     Nutrition AI, scanning, burn estimation
├── claude_profile.py         (323 lines, 15KB)     Profile generation, check-in scoring
├── goal_config.py            (242 lines, 11KB)     Goal architecture, evidence-based targets
├── garmin_sync.py            (275 lines, 10KB)     Garmin Connect polling + sync
├── gmail_sync.py             (279 lines, 11KB)     Gmail OAuth, fetching, AI summarization
├── requirements.txt          (11 lines)            Python dependencies
├── Procfile                  (1 line)              gunicorn deployment
├── nixpacks.toml             (2 lines)             Container build config
├── .env                      (4 lines)             Environment variables
├── .gitignore                (23B)
├── README.md                 (226 lines)           Project documentation
├── life_dashboard.db         (212KB)               SQLite database
├── Apex_App_Logo.png         (167KB)               Logo source
├── templates/
│   ├── index.html            (10,296 lines, 508KB) Main SPA shell (all tabs)
│   ├── login.html            (274 lines, 11KB)     Login/registration
│   └── onboarding.html       (2,209 lines, 133KB)  Multi-step onboarding
├── static/
│   ├── i18n.js               (374 lines, 26KB)     10-language translations
│   ├── sw.js                 (93 lines, 3KB)       Service Worker (PWA)
│   ├── manifest.json         (38 lines, 823B)      PWA manifest
│   ├── apex-logo.png         Logo (PNG)
│   ├── icon-192.png          PWA icon 192x192
│   └── icon-512.png          PWA icon 512x512
└── __pycache__/              Compiled bytecode
```

---

## 2. Lines of Code by Type

| Type | Files | Lines |
|------|-------|-------|
| Python (.py) | 8 | 5,039 |
| HTML (.html) | 3 | 12,779 |
| JavaScript (.js) | 2 | 467 |
| JSON | 1 | 38 |
| Config | 3 | 14 |
| Docs | 1 | 226 |
| **Total** | **18** | **~18,563** |

Note: index.html contains ~1,100 lines CSS + ~6,000 lines JS inline.

---

## 3. Python Files — Purpose

| File | Purpose |
|------|---------|
| `app.py` | Main Flask application: 52 API routes for auth, meals, workouts, goals, Gmail, Garmin, momentum scoring, and onboarding. |
| `db.py` | SQLite database layer: schema initialization, migrations, and 75 CRUD functions across 17 tables. |
| `ai_client.py` | Singleton factory returning an initialized Anthropic API client. |
| `claude_nutrition.py` | All nutrition/fitness AI: meal estimation, photo scanning, burn estimation, workout plan generation, momentum insights. |
| `claude_profile.py` | Onboarding profile generation (200-variable AI profile) and check-in scoring. |
| `goal_config.py` | Evidence-based goal architecture: calorie/macro targets for 4 goal types using peer-reviewed formulas. |
| `garmin_sync.py` | Garmin Connect integration: OAuth, daily data fetch, sleep parsing, background polling thread. |
| `gmail_sync.py` | Gmail integration: OAuth flow, email fetching, token refresh, AI email summarization. |

---

## 4. HTML Templates — Purpose

| File | Purpose |
|------|---------|
| `index.html` | Single-page app shell containing all 6 tabs (Home, Nutrition, Fitness, Progress, Status, Profile), all CSS, all client-side JS, charts, overlays, modals, FAB, barcode scanner, and i18n tag attributes. |
| `login.html` | Login and registration page with tab-based form switching and error display. |
| `onboarding.html` | 7-step onboarding wizard: body stats, goals, workout preferences, dietary info, with AI profile generation and workout plan builder. |

---

## 5. JavaScript Files — Purpose

| File | Purpose |
|------|---------|
| `static/i18n.js` | Translation dictionary for 10 languages (EN, ES, FR, DE, PT, IT, NL, PL, ZH, AR) with `t()` lookup function and `applyLang()` DOM sweeper. |
| `static/sw.js` | Service Worker for PWA: caches Chart.js, SortableJS, and app shell; handles offline fallback and workout timer notifications. |

---

## 6. CSS Files — Purpose

No standalone CSS files. All styling is inline within `<style>` blocks:

| Location | Lines | Purpose |
|----------|-------|---------|
| `index.html` lines 30-1113 | ~1,083 | Full app design system: 2 themes (dark/light), cards, buttons, inputs, nav, charts, calendars, overlays, modals, FAB, barcode scanner, streak bar, collapsible cards. |
| `login.html` lines 11-91 | ~80 | Login page styling matching app design system. |
| `onboarding.html` lines 10-173 | ~163 | Onboarding flow styling: progress bar, chips, goal cards, path cards, plan builder. |

---

## 7. All Routes

### Auth (5 routes)
| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/login` | Login/registration page |
| POST | `/api/check-username` | Check username availability |
| POST | `/api/reset-password` | Password reset with RECOVERY_KEY |
| GET | `/logout` | Clear session |
| POST | `/api/delete-account` | Delete user + cascade all data |

### Core App (3 routes)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Main dashboard (requires login) |
| GET | `/onboarding` | Onboarding page |
| GET | `/sw.js` | Service Worker with cache headers |

### Onboarding & Profile (5 routes)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/onboarding/save` | Save onboarding inputs |
| GET | `/api/onboarding/status` | Check completion status |
| POST | `/api/onboarding/complete` | Generate AI profile (async thread) |
| GET | `/api/onboarding/poll` | Poll profile generation status |
| GET | `/api/profile` | Get user profile map |

### Nutrition (12 routes)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/today-nutrition` | Today's meal totals |
| POST | `/api/log-meal` | Log meal with macros |
| POST | `/api/edit-meal/<id>` | Edit existing meal |
| POST | `/api/delete-meal/<id>` | Delete meal |
| POST | `/api/scan-meal` | Scan meal photo (Claude vision) |
| POST | `/api/meals/scan` | Identify ingredients from photos |
| POST | `/api/meals/suggest` | AI meal suggestions |
| POST | `/api/estimate` | Estimate nutrition from text |
| POST | `/api/shorten` | Shorten meal label |
| GET | `/api/saved-meals` | List saved meals |
| POST | `/api/saved-meals` | Save a meal |
| DELETE | `/api/saved-meals/<id>` | Remove saved meal |

### Fitness (12 routes)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/today-workouts` | Today's workouts |
| POST | `/api/log-workout` | Log workout |
| POST | `/api/edit-workout/<id>` | Edit workout |
| POST | `/api/delete-workout/<id>` | Delete workout |
| POST | `/api/burn-estimate` | Estimate calories burned |
| POST | `/api/parse-workout-plan` | Parse text workout plan |
| POST | `/api/generate-plan` | Generate basic plan |
| POST | `/api/generate-comprehensive-plan` | Generate plan from quiz |
| POST | `/api/revise-plan` | Revise plan via text |
| GET | `/api/saved-workouts` | List saved workouts |
| POST | `/api/saved-workouts` | Save a workout |
| DELETE | `/api/saved-workouts/<id>` | Remove saved workout |

### AI Edit (2 routes)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/ai-edit-meal` | Re-estimate meal with corrections |
| POST | `/api/ai-edit-workout` | Re-estimate workout with corrections |

### Mind / Tasks (5 routes)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/mind/today` | Today's check-ins |
| POST | `/api/mind/checkin` | Log check-in |
| POST | `/api/mind/task` | Add task |
| PATCH | `/api/mind/task/<id>` | Toggle task completion |
| DELETE | `/api/mind/task/<id>` | Delete task |

### History & Data (3 routes)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/history` | 90-day meal + workout history |
| GET | `/api/day/<date>` | Full day detail view |
| POST | `/api/log-weight` | Log daily weight |

### Garmin (3 routes)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/garmin` | Today's Garmin stats |
| GET | `/api/garmin/status` | Check Garmin config |
| POST | `/api/garmin/sync` | Manual sync |

### Gmail (7 routes)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/gmail/status` | Check Gmail config |
| GET | `/api/gmail/connect` | Initiate OAuth flow |
| GET | `/api/gmail/callback` | Handle OAuth callback |
| POST | `/api/gmail/disconnect` | Disconnect Gmail |
| POST | `/api/gmail/sync` | Fetch + summarize emails |
| POST | `/api/gmail/label` | Mark sender importance |
| GET | `/api/gmail/debug` | Debug connection (dev) |

### Momentum & Goals (5 routes)
| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/momentum/today` | Compute today's score |
| GET | `/api/momentum/history` | Score history (14 days) |
| POST | `/api/momentum/insight` | Generate AI insight |
| POST | `/api/momentum/summary` | Day/week/month summary |
| POST | `/api/goal/update` | Save goal targets |

**Total: 52 routes**

---

## 8. Database Tables

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `users` | id, username, password_hash | Authentication |
| `meal_logs` | user_id, log_date, description, calories, protein_g, carbs_g, fat_g, sugar_g, fiber_g, sodium_mg | Meal tracking |
| `workout_logs` | user_id, log_date, description, calories_burned, garmin_activity_id | Workout tracking |
| `daily_activity` | user_id, log_date, weight_lbs | Weight + daily metrics |
| `garmin_daily` | user_id, stat_date, steps, active_calories, total_calories, resting_hr | Garmin sync cache |
| `user_onboarding` | user_id, completed, raw_inputs (JSON), profile_map (JSON) | Onboarding state + AI profile |
| `mind_checkins` | user_id, checkin_date, type, goals, notes, focus, wellbeing, summary, energy/stress/mood/focus levels | Check-in logs |
| `mind_tasks` | user_id, task_date, description, completed, source | Task tracking |
| `gmail_tokens` | user_id, access_token, refresh_token, token_expiry, email_address | OAuth tokens |
| `gmail_cache` | user_id, thread_id, message_id, sender, subject, snippet, importance_score | Email metadata cache |
| `gmail_summaries` | user_id, summary_date, summary_text, email_count, unreplied | Daily email summaries |
| `gmail_importance` | user_id, sender, sender_domain, label, count | Importance rules |
| `user_goals` | user_id, goal_key, calorie_target, protein_g, fat_g, carbs_g, deficit_surplus, rmr, config_json, sources_json | Goal configuration |
| `daily_momentum` | user_id, score_date, momentum_score, nutrition_pct, protein_pct, activity_pct, raw_deltas (JSON) | Daily scores |
| `saved_meals` | user_id, description, calories, protein_g, carbs_g, fat_g, sugar_g, fiber_g, sodium_mg, items_json | Meal templates |
| `saved_workouts` | user_id, description, calories_burned | Workout templates |
| `momentum_summaries` | user_id, summary_date, scale, summary_text | Cached AI summaries |

**Total: 17 tables**

---

## 9. External API Calls

### Anthropic Claude API
| Model | Called From | Purpose | Max Tokens |
|-------|------------|---------|------------|
| `claude-opus-4-6` | `claude_nutrition.py` | Meal nutrition estimation | 1024 |
| `claude-opus-4-6` | `claude_nutrition.py` | Meal photo scanning (vision) | 1024 |
| `claude-opus-4-6` | `claude_nutrition.py` | Ingredient identification (vision) | 512 |
| `claude-opus-4-6` | `claude_nutrition.py` | Meal suggestions | 2048 |
| `claude-opus-4-6` | `claude_nutrition.py` | Burn estimation | 300 |
| `claude-haiku-4-5-20251001` | `claude_nutrition.py` | Label shortening | 60 |
| `claude-haiku-4-5-20251001` | `claude_nutrition.py` | Workout plan parsing | 1024 |
| `claude-haiku-4-5-20251001` | `claude_nutrition.py` | Comprehensive plan generation | 4096 |
| `claude-haiku-4-5-20251001` | `claude_nutrition.py` | Plan revision | 4096 |
| `claude-haiku-4-5-20251001` | `claude_nutrition.py` | Momentum insight | 600 |
| `claude-haiku-4-5-20251001` | `claude_nutrition.py` | Scale summary | 800 |
| `claude-haiku-4-5-20251001` | `claude_profile.py` | Profile generation (200 vars) | 2500 |
| `claude-haiku-4-5-20251001` | `claude_profile.py` | Check-in scoring | 200 |
| `claude-haiku-4-5-20251001` | `claude_profile.py` | Evening prompt generation | 150 |
| `claude-haiku-4-5-20251001` | `gmail_sync.py` | Email summarization | 600 |

### Google/Gmail API
| URL | Called From | Purpose |
|-----|------------|---------|
| `accounts.google.com/o/oauth2/v2/auth` | `gmail_sync.py` | OAuth consent screen |
| `oauth2.googleapis.com/token` | `gmail_sync.py` | Token exchange + refresh |
| `gmail.googleapis.com/gmail/v1/users/me/profile` | `gmail_sync.py` | Fetch user email |
| `gmail.googleapis.com/gmail/v1/users/me/messages` | `gmail_sync.py` | List inbox emails |
| `gmail.googleapis.com/gmail/v1/users/me/threads/<id>` | `gmail_sync.py` | Get thread metadata |

### Garmin Connect API
| Function | Called From | Purpose |
|----------|------------|---------|
| `get_user_summary(date)` | `garmin_sync.py` | Daily stats (steps, calories, HR) |
| `get_activities(0, 10)` | `garmin_sync.py` | Recent activities |
| `get_sleep_data(date)` | `garmin_sync.py` | Sleep metrics |

### Open Food Facts API
| URL | Called From | Purpose |
|-----|------------|---------|
| `world.openfoodfacts.org/api/v2/product/<barcode>.json` | `index.html` (JS) | Barcode nutrition lookup |

### CDN Resources
| URL | Purpose |
|-----|---------|
| `cdn.jsdelivr.net/npm/chart.js@4.4.0` | Chart rendering |
| `cdn.jsdelivr.net/npm/sortablejs@1.15.2` | Drag-and-drop workout builder |
| `fonts.googleapis.com` | Bebas Neue + Rajdhani fonts |

---

## 10. Environment Variables

| Variable | File | Required | Purpose |
|----------|------|----------|---------|
| `ANTHROPIC_API_KEY` | `ai_client.py` | **YES** | Claude API authentication |
| `SECRET_KEY` | `app.py` | No (random fallback) | Flask session signing |
| `DB_PATH` | `db.py` | No (default: `life_dashboard.db`) | SQLite file location |
| `PORT` | `app.py` | No (default: 5000) | Server port |
| `RECOVERY_KEY` | `app.py` | No | Password reset authorization |
| `APP_URL` | `app.py` | No | Base URL for OAuth redirects |
| `GOOGLE_CLIENT_ID` | `gmail_sync.py` | No | Gmail OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | `gmail_sync.py` | No | Gmail OAuth client secret |
| `GARMIN_EMAIL` | `garmin_sync.py` | No | Garmin login email |
| `GARMIN_PASSWORD` | `garmin_sync.py` | No | Garmin login password |
| `GARMIN_TOKENS` | `garmin_sync.py` | No | Serialized Garmin OAuth tokens |

---

## 11. Dependencies (requirements.txt)

| Package | Purpose |
|---------|---------|
| `anthropic` | Anthropic Claude API client |
| `flask` | Web framework (routes, templates, sessions) |
| `gunicorn` | Production WSGI server |
| `python-dotenv` | Load .env file into environment |
| `garminconnect` | Garmin Connect API client |
| `garth` | Garmin OAuth token management |
| `requests` | HTTP client (Gmail API, token exchange) |
| `werkzeug` | Password hashing (generate_password_hash, check_password_hash) |
| `flask-limiter` | Rate limiting on API endpoints |
| `google-auth` | Google OAuth token handling |
| `google-auth-oauthlib` | Google OAuth flow builder |

---

## 12. Background Jobs & Scheduled Tasks

### Server-Side
| Job | Location | Interval | Status |
|-----|----------|----------|--------|
| Garmin background poll | `garmin_sync.py:_poll_loop()` | 60 min | **DISABLED** (commented out in app.py:1062) |
| Profile generation | `app.py:_run_profile_generation()` | On-demand (async thread) | Active |

### Client-Side (JavaScript timers)
| Timer | Location | Interval | Purpose |
|-------|----------|----------|---------|
| Date cookie sync | `index.html` | 60s | Keep server date in sync |
| Clock tick | `index.html` | 1s | Live header clock |
| Date rollover check | `index.html` | 60s | Detect midnight crossing |
| Gmail refresh | `index.html` | 60s | Auto-refresh email list |
| Meal reminder scheduler | `index.html` | Daily (setTimeout) | Browser notifications at set times |
| Onboarding poll | `onboarding.html` | 2s | Poll async profile generation |

### No External Job Queue
All scheduling is in-memory (Python threads or JS timers). No cron jobs, no Celery, no Redis queues. This is a known limitation for the migration to containerized deployment.
