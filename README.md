# Apex Fitness — Life Dashboard

A personal health and fitness tracking dashboard with AI-powered insights. Tracks nutrition, workouts, sleep, and mental health in a single PWA that works like a native mobile app.

---

## Features

| Module | What it does |
|---|---|
| **Nutrition** | Log meals via text or photo (Claude vision). AI estimates macros (calories, protein, carbs, fat). Daily goal tracking with pro-rated time-of-day scoring. Meal suggestions based on remaining macros. |
| **Workout** | Log sessions with AI-powered calorie burn estimation. Garmin activity auto-import with deduplication. Evidence-based workout plan builder (7-step quiz, 24 peer-reviewed sources). Plan revision via natural language. |
| **Daily Score** | Penalty-based 0–100 composite score across 5 categories: calories (deficit-based, 15 pts), macros (P40/C30/F30 weighted, 10 pts), workout (plan-based, 10 pts), check-in (5 pts), tasks (5 pts). Time-of-day scaling — early in day is forgiving, tightens toward evening. |
| **Check-ins** | Morning and evening check-ins with configurable unlock windows. Claude-scored focus and wellbeing (1–10). Auto-extracts actionable tasks from notes. Evening check-in includes adaptive follow-up question based on morning data. |
| **Tasks** | Daily task management on the Home tab. Tasks auto-generated from check-in notes or added manually. Completion rate feeds into Daily Score. |
| **Sleep** | Sleep architecture tracking (total, deep, light, REM, awake) sourced from Garmin. Sleep score display. Sleep duration affects workout plan volume adjustments. |
| **Progress** | Charts for macro trends, weight progression, and momentum score. 90-day rolling history with per-day drill-down. Day/week/month AI summaries cached in database. |
| **Gmail** | OAuth 2.0 Gmail integration. Fetches last 48h of inbox, shows unreplied count and AI-generated daily summary. |
| **Profile** | 200-variable AI-generated profile from onboarding. Includes RMR (Mifflin-St Jeor), TDEE, calorie/macro targets, behavioral archetype, leverage points, strengths, and risks. |

---

## Architecture

### Tech Stack

**Frontend**
- Vanilla HTML/CSS/JavaScript — no framework
- Chart.js for data visualization
- Sortable.js for drag-and-drop task management
- PWA: Service Worker for offline capability and app-shell caching

**Backend**
- Python 3.12 + Flask
- SQLite3 (local) — schema is standard SQL with a documented migration path to PostgreSQL
- gunicorn (2 workers, 180s timeout for long AI calls)
- Flask-Limiter for rate limiting on auth endpoints

**AI**
- Anthropic Claude API via shared `ai_client.py`:
  - `claude-opus-4-6` — nutrition estimation, meal scanning, burn estimation, meal suggestions, momentum insights
  - `claude-haiku-4-5-20251001` — profile generation, check-in scoring, workout plan generation, plan revision, plan understanding, Gmail summarization, label shortening

**Wearable Integration**
- Garmin Connect via `garminconnect` + `garth` libraries
- Background polling thread (60-minute interval, auto-backoff on rate limits)

**Gmail Integration**
- Google OAuth 2.0 (read-only scope)
- Per-user token storage with auto-refresh
- Email cache and AI summary cache in database

---

### Directory Structure

```
life-dashboard/
├── app.py                  # Flask app — all routes and request handlers
├── db.py                   # SQLite schema, CRUD functions, all queries
├── ai_client.py            # Shared Anthropic client initialization
├── claude_nutrition.py     # Nutrition AI, workout plan generation, momentum insights
├── claude_profile.py       # Profile generation, check-in scoring
├── goal_config.py          # Goal architecture — schema, config, compute_targets
├── garmin_sync.py          # Garmin API integration and polling thread
├── gmail_sync.py           # Gmail OAuth, email fetching, AI summarization
├── requirements.txt
├── Procfile                # gunicorn deployment config
├── nixpacks.toml           # Container build config
├── templates/
│   ├── index.html          # Main app shell (single-page, all tabs)
│   ├── login.html          # Auth page (login, register, password reset)
│   └── onboarding.html     # Multi-step onboarding + workout builder quiz
└── static/
    ├── manifest.json       # PWA manifest
    └── sw.js               # Service worker
```

---

### Database Schema

| Table | Purpose |
|---|---|
| `users` | Auth — id, username, password_hash |
| `meal_logs` | Per-meal nutrition data with macros |
| `workout_logs` | Sessions with calorie burn, Garmin activity ID (unique index for dedup) |
| `garmin_daily` | Daily Garmin stats: steps, active/total calories, resting HR |
| `sleep_logs` | Sleep architecture breakdown per date |
| `mind_checkins` | Morning/evening brief scores, notes, energy/stress/mood levels |
| `mind_tasks` | Daily tasks with completion status and source (manual/ai) |
| `user_onboarding` | Raw intake responses + generated 200-variable profile map (JSON) |
| `user_goals` | Active goal config — calorie target, macros, deficit/surplus, RMR, TDEE |
| `daily_activity` | Weight, miles run, gym session flag |
| `daily_momentum` | Cached daily scores with component breakdown and raw deltas (JSON) |
| `momentum_summaries` | AI-generated day/week/month summaries (cached) |
| `gmail_tokens` | Per-user OAuth tokens and email address |
| `gmail_cache` | Cached email metadata (48h window, unique on message_id) |
| `gmail_summaries` | Daily email digest summaries |
| `app_settings` | Key-value store (Garmin tokens, system config) |

All user tables are isolated by `user_id` with composite indexes on `(user_id, date)`. Account deletion cascades to all data.

---

### Daily Score System

A penalty-based 0–100 score computed from five weighted categories:

| Category | Max Points | How It's Scored |
|---|---|---|
| Calories | 15 | How close actual deficit is to goal deficit (pro-rated by time of day) |
| Macros | 10 | Weighted delta: protein 40%, carbs 30%, fat 30% vs. goals (pro-rated) |
| Workout | 10 | Whether today's planned workout was completed (rest days = no penalty) |
| Check-in | 5 | Morning (2.5) + evening (2.5). Evening forgiven if before 7pm. |
| Tasks | 5 | Completion rate of all pending tasks |

Remaining 55 points are unpenalized (reserved for future metrics like sleep). Display shows **earned / max** per category with color coding: green >= 75%, yellow 25–75%, red < 25%.

---

### Goal Architecture

Four goal archetypes with evidence-based calorie/macro targets:

| Goal | Calorie Adjustment | Protein | Fat | Carbs |
|---|---|---|---|---|
| Lose Weight | TDEE − 20% | 2.0 g/kg (goal weight) | 25% of cals | Remainder |
| Build Muscle | TDEE + 10% | 1.8 g/kg | 25% of cals | Remainder |
| Body Recomp | TDEE − 10% | 2.2 g/kg | 25% of cals | Remainder |
| Maintain | TDEE ± 0% | 1.6 g/kg | 25% of cals | Remainder |

RMR calculated via Mifflin-St Jeor (or Katch-McArdle when body fat % is available). Calorie target never drops below RMR.

---

### Workout Plan Builder

Evidence-based 7-step quiz during onboarding:

1. **Training Experience** — beginner to elite (determines split, cue density, progression model)
2. **Training Schedule** — specific day-of-week selection + session length
3. **Equipment Access** — commercial gym, home weights, minimal, or mixed
4. **Recovery** — sleep duration + preferred training time
5. **Training Style** — compound, bodybuilding, circuit/HIIT, or functional (multi-select)
6. **Cardio** — preference + committed cardio activities (running interference handled)
7. **Physical Constraints** — free text for injuries/limitations

Followed by an exercise picker (150+ exercises across 14 categories), summary review, and AI plan generation. Output shows unified daily view (strength + cardio per day) with plan revision via natural language. Backed by 24 peer-reviewed sources displayed in a collapsible "Built on Science" panel.

---

### API Endpoints (summary)

| Area | Endpoints |
|---|---|
| Auth | `POST /login` `POST /register` `POST /logout` `POST /api/delete-account` `POST /api/reset-password` `POST /api/check-username` |
| Nutrition | `GET /api/today-nutrition` `POST /api/log-meal` `POST /api/estimate` `POST /api/scan-meal` `POST /api/meals/suggest` `POST /api/edit-meal/<id>` `POST /api/delete-meal/<id>` |
| Workouts | `GET /api/today-workouts` `POST /api/log-workout` `POST /api/burn-estimate` `POST /api/parse-workout-plan` `POST /api/generate-plan` `POST /api/generate-comprehensive-plan` `POST /api/revise-plan` |
| Mind | `GET /api/mind/today` `POST /api/mind/checkin` `POST/PATCH/DELETE /api/mind/task/<id>` |
| Garmin | `GET /api/garmin` `GET /api/garmin/status` `POST /api/garmin/sync` |
| Gmail | `GET /api/gmail/status` `GET /api/gmail/connect` `GET /api/gmail/callback` `POST /api/gmail/disconnect` `POST /api/gmail/sync` |
| Momentum | `GET /api/momentum/today` `GET /api/momentum/history` `POST /api/momentum/insight` `GET /api/momentum/summary` |
| Goals | `POST /api/goal/update` |
| Onboarding | `GET /onboarding` `POST /api/onboarding/save` `POST /api/onboarding/complete` `GET /api/onboarding/poll` `GET /api/profile` |
| History | `GET /api/history` `GET /api/day/<date>` |

---

### Security

- **Password hashing** via werkzeug.security (bcrypt-based)
- **Rate limiting** on auth endpoints (Flask-Limiter, in-memory)
- **Password reset** gated behind server-side `RECOVERY_KEY` environment variable
- **OAuth state validation** on Gmail callback (CSRF protection)
- **Random secret key** generated at startup if `SECRET_KEY` env var not set
- **Account deletion** cascades to all user data with table-level error tolerance

---

## Setup

### Prerequisites

- Python 3.12+
- Anthropic API key
- (Optional) Garmin Connect credentials for wearable sync
- (Optional) Google OAuth credentials for Gmail integration

### Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env   # edit with your keys

# Run
python app.py
```

App starts at `http://localhost:5000`. The SQLite database initializes automatically on first run.

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SECRET_KEY` | Recommended | Flask session secret (random generated if not set) |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key |
| `RECOVERY_KEY` | No | Password reset recovery key |
| `GARMIN_EMAIL` | No | Garmin Connect login |
| `GARMIN_PASSWORD` | No | Garmin Connect password |
| `GARMIN_TOKENS` | No | Serialized Garmin OAuth tokens (for ephemeral environments) |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID (for Gmail) |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `DB_PATH` | No | SQLite file path (default: `life_dashboard.db`) |
| `PORT` | No | Server port (default: `5000`) |

### Production Deployment

```bash
gunicorn --timeout 180 --workers 2 app:app
```

The `nixpacks.toml` configures containerized builds (Python 3.12 + gcc). The 180s timeout accommodates long Claude API calls during plan generation.
