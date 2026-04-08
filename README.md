# Apex Fitness — Life Dashboard

A personal health and fitness tracking dashboard with AI-powered insights. Tracks nutrition, workouts, sleep, and mental health in a single PWA that works like a native mobile app.

---

## Features

| Module | What it does |
|---|---|
| **Nutrition** | Log meals via text or photo, AI estimates macros (calories, protein, carbs, fat), daily goal tracking |
| **Workout** | Log sessions with AI-powered calorie burn estimation, Garmin activity auto-import |
| **Mind** | Morning/evening check-ins with mood scoring, daily task management, AI-scored wellbeing |
| **Sleep** | Sleep architecture tracking (total, deep, light, REM) sourced from Garmin |
| **Momentum** | Composite daily score (0–100) combining nutrition, activity, check-ins, tasks, and wellbeing |
| **History** | 90-day rolling view with per-day drill-down |

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

**AI**
- Anthropic Claude API:
  - `claude-opus-4-6` — nutrition estimation, meal scanning, burn estimation, meal suggestions
  - `claude-sonnet-4-6` — user profile generation (200-variable schema)
  - `claude-haiku-4-5-20251001` — label shortening

**Wearable Integration**
- Garmin Connect via `garminconnect` + `garth` libraries
- Background polling thread (60-minute interval, auto-backoff on rate limits)

---

### Directory Structure

```
life-dashboard/
├── app.py                  # Flask app — all routes and request handlers
├── db.py                   # SQLite schema, CRUD functions, all queries
├── claude_nutrition.py     # Nutrition AI: estimation, scanning, suggestions
├── claude_profile.py       # Profile generation, Mind check-in scoring
├── garmin_sync.py          # Garmin API integration and polling thread
├── requirements.txt
├── Procfile                # gunicorn deployment config
├── nixpacks.toml           # Container build config
├── templates/
│   ├── index.html          # Main app shell (single-page, all tabs)
│   ├── login.html          # Auth page
│   └── onboarding.html     # Multi-step user intake form
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
| `workout_logs` | Sessions with calorie burn, Garmin activity ID |
| `garmin_daily` | Daily Garmin stats: steps, active/total calories, resting HR |
| `sleep_logs` | Sleep architecture breakdown per date |
| `mind_checkins` | Morning/evening brief scores and notes |
| `mind_tasks` | Daily tasks with completion status and source |
| `user_onboarding` | Raw intake responses + generated 200-variable profile map (JSON) |
| `daily_activity` | Weight, miles run, gym session flag |
| `daily_momentum` | Cached daily momentum scores with component breakdown |
| `app_settings` | Key-value store (Garmin tokens, system config) |

All user tables are isolated by `user_id`. Account deletion cascades to all data.

---

### Data Flow

```
Browser (fetch API)
    │
    ▼
Flask routes (app.py)
    │
    ├── db.py          ──── SQLite
    ├── claude_*.py    ──── Anthropic API
    └── garmin_sync.py ──── Garmin Connect API (background thread)
```

**Client state**: DOM-based, no frontend state library. A `client_date` cookie (set every minute) ensures all queries use the user's local date, not server UTC.

**Async operations**: Profile generation runs in a background thread; the frontend polls `/api/onboarding/poll` until completion. Garmin sync also runs as a daemon thread.

---

### Momentum Score

A composite daily score (0–100) calculated from five weighted components:

```
momentum_score =
  min(calories_logged / calorie_goal, 1.0) * 30   # Nutrition
  + min(garmin_active_kcal / 500, 1.0)   * 30   # Activity
  + checkin_done (0 or 1)                * 20   # Check-ins
  + task_completion_rate                 * 10   # Tasks
  + wellbeing_delta                      * 10   # Wellbeing
```

The calorie goal is dynamic: `RMR + active_burn - calorie_deficit_target` when a profile is set.

---

### API Endpoints (summary)

| Area | Endpoints |
|---|---|
| Auth | `POST /login` `POST /register` `POST /logout` `POST /api/delete-account` |
| Nutrition | `GET /api/today-nutrition` `POST /api/log-meal` `POST /api/estimate` `POST /api/scan-meal` `POST /api/meals/suggest` |
| Workouts | `GET /api/today-workouts` `POST /api/log-workout` `POST /api/burn-estimate` `POST /api/parse-workout-plan` |
| Mind | `GET /api/mind/today` `POST /api/mind/checkin` `POST/PATCH/DELETE /api/mind/task/<id>` |
| Garmin | `GET /api/garmin` `GET /api/garmin/status` `POST /api/garmin/sync` |
| Momentum | `GET /api/momentum/today` `GET /api/momentum/history` `POST /api/momentum/insight` |
| Onboarding | `GET /onboarding` `POST /api/onboarding/complete` `GET /api/onboarding/poll` `GET /api/profile` |
| History | `GET /api/history` `GET /api/day/<date>` |

---

## Setup

### Prerequisites

- Python 3.12+
- Anthropic API key
- (Optional) Garmin Connect credentials for wearable sync

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
| `SECRET_KEY` | Yes | Flask session secret |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key |
| `GARMIN_EMAIL` | No | Garmin Connect login |
| `GARMIN_PASSWORD` | No | Garmin Connect password |
| `GARMIN_TOKENS` | No | Serialized Garmin OAuth tokens (for ephemeral environments) |
| `DB_PATH` | No | SQLite file path (default: `life_dashboard.db`) |
| `PORT` | No | Server port (default: `5000`) |

### Production Deployment

```bash
gunicorn --timeout 180 --workers 2 app:app
```

The `nixpacks.toml` configures containerized builds (Python 3.12 + gcc). The 180s timeout accommodates long Claude API calls during profile generation.

---

## Scaling Notes

The current architecture is optimized for personal/single-user use. Migration paths for multi-user production:

- **Database**: Schema is standard SQL — swap `sqlite3` for `psycopg2` and point `DB_PATH` at PostgreSQL
- **Garmin sync**: Currently a single shared daemon thread. Move to per-user jobs via Celery + Redis
- **Garmin tokens**: Currently in `app_settings` or env vars. Move to a `user_garmin_tokens` table
