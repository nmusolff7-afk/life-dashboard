# APEX Life Dashboard — API Contract

Generated: 2026-04-17 | 52 endpoints | Flask + Session Auth

---

## Authentication

All `/api/*` routes (except auth routes) require `@login_required` — Flask session cookie.
Session is set on successful login via `POST /login`.
User ID accessed via `session["user_id"]`.

For React Native migration: replace with JWT Bearer token auth.

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| `POST /login` | 10/minute |
| `POST /api/check-username` | 10/minute |
| `POST /api/reset-password` | 5/minute |
| All other endpoints | **No rate limit** |

---

## HTML-Returning Endpoints (MUST CONVERT FOR REACT NATIVE)

These return `render_template()` or `redirect()` instead of JSON:

| Method | Path | Returns | Action Required |
|--------|------|---------|-----------------|
| GET | `/` | `render_template("index.html", ...)` | Convert to JSON API — frontend renders |
| GET | `/onboarding` | `render_template("onboarding.html", ...)` | Convert to JSON API |
| GET/POST | `/login` | `render_template("login.html")` / `redirect()` | Convert POST to JSON, remove GET |
| GET | `/logout` | `redirect("/login")` | Convert to `POST /api/logout` returning JSON |
| GET | `/sw.js` | `make_response(file)` | Keep as-is (PWA only) |
| GET | `/api/gmail/connect` | `redirect(google_auth_url)` | Return URL as JSON, let client redirect |
| GET | `/api/gmail/callback` | `redirect("/")` | Return JSON, let client handle |

**All other 45 endpoints already return JSON** — ready for React Native.

---

## Endpoints — Full Specification

### Auth

#### `POST /login`
```
Auth: None
Rate Limit: 10/minute
⚠️ RETURNS HTML — needs conversion

Request (form-encoded):
  action: "login" | "register"
  username: string
  password: string

Response (current): redirect or render_template
Response (target JSON):
  200: { ok: true, user_id: int, username: string }
  401: { error: "Invalid credentials" }
  409: { error: "Username already exists" }

Tables: users (R/W)
External APIs: None
```

#### `POST /api/check-username`
```
Auth: None
Rate Limit: 10/minute

Request: { username: string }
Response: { exists: boolean }

Tables: users (R)
External APIs: None
```

#### `POST /api/reset-password`
```
Auth: None (requires RECOVERY_KEY)
Rate Limit: 5/minute

Request:
  recovery_key: string
  username: string
  new_password: string

Response:
  200: { ok: true }
  403: { error: "Invalid recovery key" }
  400: { error: "Missing fields" }
  404: { error: "User not found" }

Tables: users (W)
External APIs: None
```

#### `GET /logout`
```
⚠️ RETURNS REDIRECT — needs conversion

Auth: None
Response (current): redirect("/login")
Response (target): { ok: true }

Tables: None
External APIs: None
```

#### `POST /api/delete-account`
```
Auth: Required

Request: None
Response: { ok: true }

Tables: ALL user tables (cascade delete)
External APIs: None
```

---

### Onboarding & Profile

#### `GET /onboarding`
```
⚠️ RETURNS HTML — needs conversion

Auth: Required
Query: ?edit=1 (optional, re-enter onboarding)

Response (current): render_template("onboarding.html")
Response (target): { saved: object|null, editing: boolean, username: string }

Tables: user_onboarding (R)
External APIs: None
```

#### `POST /api/onboarding/save`
```
Auth: Required

Request: { ...arbitrary_quiz_answers }
Response: { ok: true }

Tables: user_onboarding (W)
External APIs: None
```

#### `GET /api/onboarding/status`
```
Auth: Required

Response: { complete: boolean }

Tables: user_onboarding (R)
External APIs: None
```

#### `POST /api/onboarding/complete`
```
Auth: Required

Request: None (uses saved onboarding data)
Response:
  200: { queued: true }
  400: { error: "No onboarding data found" }

Tables: user_onboarding (R), then async: user_onboarding (W), user_goals (W)
External APIs: claude_profile.generate_profile_map (Claude Haiku)
Note: Spawns background thread. Poll /api/onboarding/poll for result.
```

#### `GET /api/onboarding/poll`
```
Auth: Required

Response:
  { status: "pending" }
  { status: "done", profile: object, targets: object }
  { status: "error", error: string, traceback: string }
  { status: "done" } (if already complete, reads from DB)

Tables: user_onboarding (R), user_goals (R)
External APIs: None
```

#### `GET /api/profile`
```
Auth: Required

Response: {
  energy_level_typical_1_10: int,
  mood_baseline_1_10: int,
  stress_level_1_10: int,
  daily_calorie_goal: int,
  daily_protein_goal_g: int,
  rmr_kcal: int,
  primary_goal: string,
  steps_per_day_estimated: int,
  behavioral_archetype: string,
  first_name: string,
  one_sentence_summary: string,
  biggest_leverage_point: string,
  current_weight_lbs: float,
  target_weight_lbs: float,
  height_ft: int,
  height_in: int,
  age: int,
  gender: string,
  work_style: string,
  goal_targets: {
    goal_key: string,
    goal_label: string,
    calorie_target: int,
    protein_g: int,
    fat_g: int,
    carbs_g: int,
    deficit_surplus: int,
    rmr: int,
    sources: array,
    description: string,
    rationale: string
  }
}

Tables: user_onboarding (R), user_goals (R)
External APIs: None
```

---

### Nutrition

#### `GET /api/today-nutrition`
```
Auth: Required

Response: {
  meals: [{ id, logged_at, log_date, description, calories, protein_g,
            carbs_g, fat_g, sugar_g, fiber_g, sodium_mg, user_id }],
  totals: { meal_count, total_calories, total_protein, total_carbs,
            total_fat, total_sugar, total_fiber, total_sodium }
}

Tables: meal_logs (R)
External APIs: None
```

#### `POST /api/log-meal`
```
Auth: Required

Request: {
  description: string (required),
  calories: int,
  protein_g: float,
  carbs_g: float,
  fat_g: float,
  sugar_g: float (default 0),
  fiber_g: float (default 0),
  sodium_mg: float (default 0),
  client_date: "YYYY-MM-DD" (optional),
  client_time: "HH:MM:SS" (optional)
}

Response: { meals: [...], totals: {...} }
Error: { error: "No description" } 400

Tables: meal_logs (W+R)
External APIs: None
```

#### `POST /api/edit-meal/{meal_id}`
```
Auth: Required

Request: {
  description: string (required),
  calories: int, protein_g: float, carbs_g: float, fat_g: float,
  sugar_g: float, fiber_g: float, sodium_mg: float
}

Response: { meals: [...], totals: {...} }

Tables: meal_logs (W+R)
External APIs: None
```

#### `POST /api/delete-meal/{meal_id}`
```
Auth: Required

Response: { meals: [...], totals: {...} }

Tables: meal_logs (W+R)
External APIs: None
```

#### `POST /api/estimate`
```
Auth: Required

Request: { description: string (required) }

Response: {
  calories: int, protein_g: float, carbs_g: float, fat_g: float,
  sugar_g: float, fiber_g: float, sodium_mg: int,
  items: [{ name, calories, protein_g, carbs_g, fat_g, sugar_g, fiber_g, sodium_mg }],
  notes: string
}
Error: { error: string } 400|500

Tables: user_onboarding (R — for profile context)
External APIs: claude_nutrition.estimate_nutrition (Claude Opus)
```

#### `POST /api/scan-meal`
```
Auth: Required

Request: {
  image_b64: string (required, base64),
  media_type: string (default "image/jpeg"),
  context: string (optional)
}

Response: {
  description: string,
  calories: int, protein_g: float, carbs_g: float, fat_g: float,
  sugar_g: float, fiber_g: float, sodium_mg: int,
  items: [...], notes: string
}
Error: { error: string } 400|500

Tables: None
External APIs: claude_nutrition.scan_meal_image (Claude Opus, vision)
```

#### `POST /api/meals/scan`
```
Auth: Required

Request: { images: [{ b64: string, media_type: string }] }

Response: { ingredients: [string] }

Tables: None
External APIs: claude_nutrition.identify_ingredients (Claude Opus, vision)
```

#### `POST /api/meals/suggest`
```
Auth: Required

Request: {
  ingredients: string (optional),
  images: [{ b64, media_type }] (optional, max 6),
  hour: int 0-23 (optional),
  calories_consumed: int (optional),
  tdee: int (optional),
  protein_goal: float (optional),
  protein_consumed: float (optional),
  carbs_goal: float (optional, default 250),
  carbs_consumed: float (optional),
  fat_goal: float (optional, default 75),
  fat_consumed: float (optional)
}

Response: {
  options: [{ meal_name, calories, protein_g, carbs_g, fat_g, why, steps }],
  identified_ingredients: [string],
  meal_type: string,
  cal_remaining: int
}

Tables: user_onboarding (R), meal_logs (R — fallback totals)
External APIs: claude_nutrition.suggest_meal (Claude Opus)
```

#### `POST /api/shorten`
```
Auth: Required

Request: { description: string }
Response: { label: string }

Tables: None
External APIs: claude_nutrition.shorten_label (Claude Haiku)
```

#### `POST /api/ai-edit-meal`
```
Auth: Required

Request: { original: string (required), edits: string (required) }

Response: same as /api/estimate
Error: { error: string } 400|500

Tables: user_onboarding (R)
External APIs: claude_nutrition.estimate_nutrition (Claude Opus)
```

---

### Saved Meals

#### `GET /api/saved-meals`
```
Auth: Required
Response: [{ id, user_id, description, calories, protein_g, carbs_g,
             fat_g, sugar_g, fiber_g, sodium_mg, items_json, saved_at }]
Tables: saved_meals (R)
```

#### `POST /api/saved-meals`
```
Auth: Required
Request: {
  description: string (required),
  calories: int, protein_g: float, carbs_g: float, fat_g: float,
  sugar_g: float, fiber_g: float, sodium_mg: float,
  items: array (optional)
}
Response: { ok: true }
Tables: saved_meals (W)
```

#### `DELETE /api/saved-meals/{saved_id}`
```
Auth: Required
Response: { ok: true }
Tables: saved_meals (W)
```

---

### Fitness

#### `GET /api/today-workouts`
```
Auth: Required

Response: {
  workouts: [{ id, logged_at, log_date, description, calories_burned, user_id, garmin_activity_id }],
  burn: int
}

Tables: workout_logs (R)
External APIs: None
```

#### `POST /api/log-workout`
```
Auth: Required

Request: {
  description: string (required),
  calories_burned: int (default 0),
  client_date: string (optional),
  client_time: string (optional)
}

Response: { ok: true }

Tables: workout_logs (W)
External APIs: None
```

#### `POST /api/edit-workout/{workout_id}`
```
Auth: Required

Request: { description: string (required), calories_burned: int }
Response: { ok: true }

Tables: workout_logs (W)
```

#### `POST /api/delete-workout/{workout_id}`
```
Auth: Required

Response: { workouts: [...], burn: int }

Tables: workout_logs (W+R)
```

#### `POST /api/burn-estimate`
```
Auth: Required

Request: { description: string (required) }

Response: { calories_burned: int, notes: string }
Error: { error: string } 400|500

Tables: user_onboarding (R)
External APIs: claude_nutrition.estimate_burn (Claude Opus)
```

#### `POST /api/ai-edit-workout`
```
Auth: Required

Request: { original: string (required), edits: string (required) }
Response: { calories_burned: int, notes: string }

Tables: user_onboarding (R)
External APIs: claude_nutrition.estimate_burn (Claude Opus)
```

---

### Saved Workouts

#### `GET /api/saved-workouts`
```
Auth: Required
Response: [{ id, user_id, description, calories_burned, saved_at }]
Tables: saved_workouts (R)
```

#### `POST /api/saved-workouts`
```
Auth: Required
Request: { description: string (required), calories_burned: int }
Response: { ok: true }
Tables: saved_workouts (W)
```

#### `DELETE /api/saved-workouts/{saved_id}`
```
Auth: Required
Response: { ok: true }
Tables: saved_workouts (W)
```

---

### Workout Plans

#### `POST /api/parse-workout-plan`
```
Auth: Required

Request: { text: string (required) }
Response: { days: { Monday: [...], Tuesday: [...], ... } }

Tables: None
External APIs: claude_nutrition.parse_workout_plan (Claude Haiku)
```

#### `POST /api/generate-plan`
```
Auth: Required

Request: {
  goal: string (default "lose_weight"),
  days_per_week: int (default 3),
  experience: string (default "beginner")
}

Response: { days: {...} }

Tables: None
External APIs: claude_nutrition.generate_workout_plan (Claude Haiku)
```

#### `POST /api/generate-comprehensive-plan`
```
Auth: Required

Request: { ...full quiz payload }
Response: { plan: object, understanding: string }

Tables: None
External APIs: claude_nutrition.generate_comprehensive_plan + generate_plan_understanding (Claude Haiku)
```

#### `POST /api/revise-plan`
```
Auth: Required

Request: {
  payload: object,
  currentPlan: object,
  changeRequest: string (required)
}

Response: { plan: object }

Tables: None
External APIs: claude_nutrition.revise_plan (Claude Haiku)
```

---

### Tasks

#### `GET /api/mind/today`
```
Auth: Required
Query: ?d=YYYY-MM-DD (optional)

Response: {
  date: string,
  tasks: [{ id, description, completed, source, created_at }],
  checkins: [{ id, type, goals, notes, focus, wellbeing, summary, ... }],
  history: [...],
  completion: int,
  total: int,
  done: int
}
Headers: Cache-Control: no-store, no-cache

Tables: mind_tasks (R), mind_checkins (R)
```

#### `POST /api/mind/checkin`
```
Auth: Required

Request: {
  type: "morning" | "evening",
  goals: string,
  notes: string (required),
  bodyweight_lbs: float (optional, morning only),
  energy_level: int 1-10 (optional),
  stress_level: int 1-10 (optional),
  sleep_quality: int 1-10 (optional),
  mood_level: int 1-10 (optional),
  focus_level: int 1-10 (optional)
}

Response: {
  focus: int, wellbeing: int, summary: string,
  tasks_added: [{ id, description }],
  bodyweight_lbs: float|null
}

Tables: mind_checkins (W), mind_tasks (W), daily_activity (W — weight)
External APIs: claude_profile.score_brief (Claude Haiku)
```

#### `POST /api/mind/task`
```
Auth: Required
Request: { description: string (required) }
Response: { id: int, description: string, completed: 0, source: "manual" }
Tables: mind_tasks (W)
```

#### `PATCH /api/mind/task/{task_id}`
```
Auth: Required
Response: { ok: true }
Tables: mind_tasks (W)
```

#### `DELETE /api/mind/task/{task_id}`
```
Auth: Required
Response: { ok: true }
Tables: mind_tasks (W)
```

---

### History & Day Detail

#### `GET /api/history`
```
Auth: Required

Response: {
  meals: { "YYYY-MM-DD": { calories, protein, carbs, fat } },
  workouts: { "YYYY-MM-DD": [{ description, calories_burned }] },
  briefs: { "YYYY-MM-DD": ["morning", "evening"] },
  sleep: [...],
  momentum: { "YYYY-MM-DD": int },
  garmin: {}
}

Tables: meal_logs (R), workout_logs (R), mind_checkins (R), sleep_logs (R), daily_momentum (R)
```

#### `GET /api/day/{date_str}`
```
Auth: Required
URL: date_str = YYYY-MM-DD

Response: {
  meals: [...full meal objects...],
  workouts: [...full workout objects...],
  totals: { meal_count, total_calories, total_protein, total_carbs, total_fat,
            total_sugar, total_fiber, total_sodium },
  sleep: { total_seconds, deep_seconds, ... } | null,
  garmin: null
}

Tables: meal_logs (R), workout_logs (R), sleep_logs (R)
```

#### `POST /api/log-weight`
```
Auth: Required

Request: { weight_lbs: float (required), date: "YYYY-MM-DD" (optional) }

Response: { ok: true }
Error: { error: "Invalid weight" } 400

Tables: daily_activity (W), user_onboarding (W — updates profile weight)
```

---

### Garmin

#### `GET /api/garmin`
```
Auth: Required

Response: {
  configured: boolean,
  today: { steps, active_calories, total_calories, resting_hr } | null,
  last_sync: string | null
}

Tables: garmin_daily (R)
External APIs: garmin_sync.is_configured()
```

#### `GET /api/garmin/status`
```
Auth: Required

Response: {
  configured: boolean,
  last_sync: string | null,
  today: {...} | null,
  sleep: {...} | null
}

Tables: garmin_daily (R), sleep_logs (R)
External APIs: garmin_sync.is_configured()
```

#### `POST /api/garmin/sync`
```
Auth: Required

Request: { date: "YYYY-MM-DD" (optional), force: boolean (optional) }

Response: {
  synced: true,
  date: string,
  steps: int,
  active_calories: int,
  ...sleep data...,
  workouts_synced: int,
  workouts: [...],
  burn: int
}
Error: { error: "Garmin not configured" } 400
Error: { error: "Synced recently..." } 429

Tables: garmin_daily (W), sleep_logs (W), workout_logs (W+R)
External APIs: garmin_sync.fetch_day (Garmin Connect API)
```

---

### Gmail

#### `GET /api/gmail/status`
```
Auth: Required

Response: {
  configured: boolean,
  connected: boolean,
  email: string,
  summary: { summary_text, email_count, unreplied } | null,
  emails: [{ sender, subject, snippet, received_at, has_replied, is_read, importance_score }],
  important: [...filtered by score > 0...],
  stream: [...filtered by score <= 0...]
}

Tables: gmail_tokens (R), gmail_summaries (R), gmail_cache (R), gmail_importance (R)
External APIs: gmail_sync.is_configured()
```

#### `GET /api/gmail/connect`
```
⚠️ RETURNS REDIRECT — needs conversion

Auth: Required
Response (current): redirect(google_auth_url)
Response (target): { auth_url: string }

External APIs: gmail_sync.get_auth_url (Google OAuth)
```

#### `GET /api/gmail/callback`
```
⚠️ RETURNS REDIRECT — needs conversion

Auth: Required
Query: ?code=string&state=string&error=string

Response (current): redirect("/")
Response (target): { ok: true, email: string }

Tables: gmail_tokens (W)
External APIs: gmail_sync.exchange_code, gmail_sync.get_user_email (Google APIs)
```

#### `POST /api/gmail/disconnect`
```
Auth: Required
Response: { ok: true }
Tables: gmail_tokens (W)
```

#### `POST /api/gmail/sync`
```
Auth: Required

Response: {
  emails: [...all cached...],
  important: [...filtered...],
  stream: [...filtered...],
  summary: { summary_text, email_count, unreplied }
}

Tables: gmail_tokens (R+W), gmail_cache (W), gmail_importance (R), gmail_summaries (W)
External APIs: gmail_sync.fetch_recent_emails (Gmail API), gmail_sync.summarize_emails (Claude Haiku)
```

#### `POST /api/gmail/label`
```
Auth: Required

Request: { sender: string (required), label: "important" | "unimportant" (required) }
Response: { ok: true }

Tables: gmail_importance (W), gmail_cache (W — recalculate scores)
```

#### `GET /api/gmail/debug`
```
Auth: Required
Response: { redirect_uri, request_url_root, request_scheme, ... }
Note: Development only, remove before production
```

---

### Momentum & Goals

#### `GET|POST /api/momentum/today`
```
Auth: Required

Request (POST, all optional): {
  calorie_goal: int,
  hour: int 0-23,
  planned_workout_today: boolean,
  tdee: int,
  target_intake: int
}

Response: {
  momentum_score: int 0-100,
  nutrition_pct: float,
  protein_pct: float,
  activity_pct: float,
  checkin_done: int,
  task_rate: float,
  raw_deltas: object
}

Tables: ALL (computed from meal_logs, workout_logs, mind_checkins, mind_tasks, user_goals)
```

#### `GET /api/momentum/history`
```
Auth: Required
Query: ?days=14 (optional)

Response: [{ user_id, score_date, momentum_score, nutrition_pct, ... }]

Tables: daily_momentum (R)
```

#### `POST /api/momentum/insight`
```
Auth: Required

Request: { hour: int (optional), tdee: int (optional), target_intake: int (optional) }

Response: { insight: string, ... }

Tables: meal_logs (R), user_onboarding (R)
External APIs: claude_nutrition.generate_momentum_insight (Claude Haiku)
```

#### `POST /api/momentum/summary`
```
Auth: Required

Request: {
  scale: "day" | "week" | "month" (default "day"),
  force: boolean (default false),
  hour: int (optional)
}

Response: { summary: string, cached: boolean }

Tables: momentum_summaries (R+W), daily_momentum (R+W), user_goals (R)
External APIs: claude_nutrition.generate_scale_summary (Claude Haiku)
```

#### `POST /api/goal/update`
```
Auth: Required

Request: {
  goal: string (default "lose_weight"),
  rmr: int (optional),
  tdee: int (optional, fallback),
  deficit: int (default 0),
  protein: int (default 150),
  carbs: int (default 200),
  fat: int (default 65)
}

Response: { ok: true, targets: { calorie_target, protein_g, fat_g, carbs_g, deficit_surplus, rmr } }

Tables: user_goals (W)
```

---

## External API Summary

| Service | Endpoints Using It | Model/Protocol | Cost |
|---------|-------------------|----------------|------|
| **Claude Opus** | estimate, scan-meal, meals/scan, meals/suggest, burn-estimate, ai-edit-meal, ai-edit-workout | claude-opus-4-6 | ~$0.01-0.05/call |
| **Claude Haiku** | shorten, parse-plan, generate-plan, comprehensive-plan, revise-plan, momentum/insight, momentum/summary, onboarding/complete, mind/checkin, gmail/sync | claude-haiku-4-5-20251001 | ~$0.001-0.005/call |
| **Gmail API** | gmail/connect, gmail/callback, gmail/sync | OAuth 2.0 + REST | Free |
| **Garmin Connect** | garmin/sync | garminconnect library | Free |
| **Open Food Facts** | (client-side only) | REST, no auth | Free |

---

## Migration Checklist for React Native

### Must Convert (7 routes return HTML/redirects):
- [ ] `GET /` → new `GET /api/dashboard` returning JSON
- [ ] `GET /onboarding` → new `GET /api/onboarding/data` returning JSON
- [ ] `GET/POST /login` → `POST /api/auth/login` + `POST /api/auth/register`
- [ ] `GET /logout` → `POST /api/auth/logout`
- [ ] `GET /api/gmail/connect` → return `{ auth_url }` instead of redirect
- [ ] `GET /api/gmail/callback` → return JSON instead of redirect
- [ ] `GET /sw.js` → remove (PWA only)

### Must Add:
- [ ] `POST /api/auth/login` — returns JWT
- [ ] `POST /api/auth/register` — returns JWT
- [ ] `POST /api/auth/refresh` — refresh JWT
- [ ] JWT middleware replacing session-based auth
- [ ] CORS headers for React Native requests

### Already JSON-Ready (45 routes):
All `/api/*` routes except the 5 listed above already return pure JSON and need zero changes for React Native consumption.
