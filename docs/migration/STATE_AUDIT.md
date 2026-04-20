# APEX Life Dashboard — State & Storage Audit

Generated: 2026-04-19 | Security & Privacy Assessment

---

## Storage Location Summary

| Location | Type | Persistence | Encrypted | PII/PHI |
|----------|------|-------------|-----------|---------|
| SQLite database | Server file | Permanent | **No** | **Yes — Critical** |
| Flask session cookie | Server-signed cookie | 90 days | Signed (not encrypted) | Yes (user_id, username) |
| Environment variables | Server memory | Process lifetime | N/A | Yes (API keys, passwords) |
| Python in-memory dicts | Server memory | Process lifetime | N/A | Yes (onboarding jobs) |
| localStorage | Client browser | Permanent | **No** | **Yes — health data** |
| sessionStorage | Client browser | Tab lifetime | **No** | Low (tab state, cached insight) |
| Cookie (client_date) | Client browser | 24 hours | **No** | No (date only) |
| Service Worker cache | Client browser | Until SW update | **No** | No (static assets only) |

---

## 1. Server-Side: SQLite Database

**File:** `life_dashboard.db` (configurable via `DB_PATH` env var)
**Persistence:** Permanent (until deleted)
**Encryption:** None
**Access:** Any process that can read the file
**Backup:** None automated

### Tables by Privacy Risk

#### CRITICAL — Protected Health Information (PHI)

| Table | Sensitive Fields | Risk |
|-------|-----------------|------|
| `user_onboarding` | `raw_inputs` (JSON: body stats, health goals), `profile_map` (200 AI-generated health variables including RMR, BMI, body fat estimates) | Full health profile |
| `mind_checkins` | `energy_level`, `stress_level`, `sleep_quality`, `mood_level`, `focus_level`, `wellbeing`, `notes` (free text) | Mental health metrics |
| `gmail_tokens` | `access_token`, `refresh_token`, `email_address` | OAuth credentials + email PII |
| `sleep_logs` | `total_seconds`, `deep_seconds`, `rem_seconds`, `sleep_score` | Sleep quality = PHI |
| `user_goals` | `calorie_target`, `protein_g`, `rmr`, `goal_key` | Health/fitness objectives |

#### HIGH — Personally Identifying Information (PII)

| Table | Sensitive Fields | Risk |
|-------|-----------------|------|
| `users` | `username`, `password_hash` | Identity + credentials |
| `daily_activity` | `weight_lbs` | Body weight |
| `gmail_cache` | `sender`, `subject`, `snippet` | Email metadata, communication patterns |
| `gmail_summaries` | `summary_text` | AI summaries may contain PII from emails |
| `gmail_importance` | `sender`, `sender_domain` | Contact list / business relationships |

#### MEDIUM — Behavioral Data

| Table | Sensitive Fields | Risk |
|-------|-----------------|------|
| `meal_logs` | `description`, `calories`, macros | Dietary patterns, allergies inferable |
| `workout_logs` | `description`, `calories_burned` | Fitness routines |
| `daily_momentum` | `momentum_score`, `raw_deltas` (JSON) | Wellness scoring |
| `momentum_summaries` | `summary_text` | AI health/wellness summaries |
| `mind_tasks` | `description` | Personal task content |
| `saved_meals` / `saved_workouts` | `description`, macros | Dietary/fitness preferences |

### Password Storage
- **Method:** `werkzeug.security.generate_password_hash` (bcrypt-based)
- **Verification:** `check_password_hash`
- **Assessment:** Secure — industry-standard password hashing

---

## 2. Server-Side: Flask Session

**Storage:** Signed cookie (client-side, server-validated)
**Signing Key:** `SECRET_KEY` env var — **required in production** (app crashes on boot if not set)
**Lifetime:** 90 days (`session.permanent = True`)
**Encryption:** **Signed but NOT encrypted** — session data is base64-encoded and readable by the client

### Session Data Written

| Key | Value | Set At | PII |
|-----|-------|--------|-----|
| `user_id` | Integer | Login (app.py:171,180) | Yes — user identifier |
| `username` | String (lowercase) | Login (app.py:172,181) | Yes — username |
| `gmail_oauth_state` | 32-byte random hex | Gmail connect (app.py:1195) | No — CSRF token |

### Security Issues
1. ~~**SECRET_KEY regeneration:** If `SECRET_KEY` env var is not set, a random key is generated on every app restart, invalidating all existing sessions~~ **RESOLVED** — `SECRET_KEY` is now required; app crashes on boot if not set
2. **Session content visible:** Username is readable in the cookie (not encrypted, only signed)
3. **No session revocation:** No server-side session store means sessions can't be invalidated without changing `SECRET_KEY`

---

## 3. Server-Side: Garmin Token Files — DELETED

> **garmin_sync.py was removed entirely during pre-migration hardening.** All Garmin-related server-side state (token files, client objects, polling thread) no longer exists. This section is retained for historical reference only.

~~**Location:** `~/.garminconnect/` (expanded from `pathlib.Path.home()`)~~
~~**Written By:** `garmin_sync.py`~~

---

## 4. Server-Side: Python In-Memory State

### `_ob_jobs` (app.py)
```python
_ob_jobs: dict = {}  # {user_id: {"status": str, "profile": dict, "error": str}}
```
- **Contains:** Onboarding profile generation results (200-variable health profile)
- **Persistence:** Process lifetime only — lost on restart
- **Privacy Risk:** HIGH — contains full health profile during generation
- **Thread Safety:** Protected by `threading.Lock` (`_ob_lock`). Fixed in commit 1f26316.
- **TTL Sweep:** Entries are evicted after 1 hour. A background sweep removes stale entries. Fixed in commit aa077b0.
- **Pop on Terminal State:** Done/error entries are removed from the dict after the client polls them, preventing unbounded growth.
- ~~**Cleanup:** Never explicitly cleaned — grows indefinitely (memory leak for many users)~~ **RESOLVED** — TTL sweep + pop-on-read now bound memory usage.

### Garmin Globals — DELETED

The following globals formerly in `garmin_sync.py` no longer exist. The entire module was removed during pre-migration hardening:

- ~~`_client` (Garmin API client)~~
- ~~`_client_lock` (threading.Lock for client init)~~
- ~~`_poll_thread` (background daemon thread)~~
- ~~`_last_fetch_time` (Unix timestamp of last Garmin fetch)~~

---

## 5. Server-Side: Environment Variables

| Variable | Contains | Risk Level |
|----------|----------|------------|
| `ANTHROPIC_API_KEY` | Claude API key | CRITICAL — full API access, billing |
| `SECRET_KEY` | Flask session signing key (**required — crashes on boot if missing**) | CRITICAL — session forgery if leaked |
| `RECOVERY_KEY` | Password reset master key | CRITICAL — account takeover |
| `GOOGLE_CLIENT_SECRET` | Google OAuth app secret | HIGH — OAuth impersonation |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | MEDIUM — public identifier |
| `DB_PATH` | Database file location | LOW — path info |
| `APP_URL` | Application base URL | LOW — public info |
| `PORT` | Server port | LOW |

### Security Issues
1. **`RECOVERY_KEY`** is a shared secret for password resets — should be per-user or use email verification
2. **No rotation mechanism** for any key

---

## 6. Client-Side: localStorage

**Persistence:** Permanent (until user clears browser data)
**Encryption:** None
**Access:** Any JavaScript on the same origin (vulnerable to XSS)
**Size Limit:** ~5-10MB per origin

### Server Sync on Page Load

On page load, the app fetches `/api/today-nutrition` and `/api/today-workouts` and overwrites localStorage with fresh server data before rendering. This ensures the client always starts with authoritative server state.

### User-Namespaced Keys (prefixed `u{user_id}:`)

| Key | Data | PII/PHI |
|-----|------|---------|
| `u{id}:apex-theme` | `"dark"` or `"medium"` | No |
| `u{id}:apex-units` | `"imperial"` or `"metric"` | No |
| `u{id}:userTimezone` | `"America/New_York"` | Low — location inference |
| `u{id}:mealReminders` | `["08:00","12:30","18:30"]` | No |

### Global Keys (shared across users on same device)

| Key | Data | PII/PHI |
|-----|------|---------|
| `appLang` | `"en"`, `"es"`, etc. | No |
| `profileData` | Full profile JSON (see keys below) | **CRITICAL — full health profile** |
| `dailyLog` | `{"2026-04-17": {deficit, calories, tdee, protein, carbs, fat, sugar, fiber, sodium, weight, steps}}` | **HIGH — daily health metrics** |
| `workoutPlan` | Weekly exercise plan JSON | Medium — fitness routine |
| `weeklyPlan` | Parsed workout schedule | Medium |
| `workoutHistory` | Per-exercise sets/reps/weight logs | **HIGH — fitness PHI** |
| `stepsToday` | Step count string | Low |
| `scaleLog` | `{"date": weight}` historical weights | **HIGH — body weight history** |
| `apexPantry` | Food item array | Low |
| `recentMeals` | Last 20 meals with full macros | Medium — dietary patterns |
| `rmr-locked` | `"0"` or `"1"` | No |

### `profileData` Keys

| Key | Type | Description |
|-----|------|-------------|
| `curWeight` | number | Current weight |
| `tgtWeight` | number | Target weight |
| `heightFt` | number | Height (feet) |
| `heightIn` | number | Height (inches) |
| `age` | number | User age |
| `sex` | string | Biological sex |
| `bfPct` | number | Body fat percentage |
| `occupation` | string | Occupation (activity level inference) |
| `goal` | string | Fitness/health goal |
| `rmr` | number | Resting metabolic rate |
| `deficit` | number | Calorie deficit target |
| `protein` | number | Daily protein target (g) |
| `carbs` | number | Daily carb target (g) |
| `fat` | number | Daily fat target (g) |
| `neatAdjust` | number | NEAT adjustment factor |
| `sugarGoal` | number | Daily sugar goal (g) |
| `fiberGoal` | number | Daily fiber goal (g) |
| `sodiumGoal` | number | Daily sodium goal (mg) |
| `calorieRollover` | boolean | Roll over unused calories (default: false) |
| `autoAdjustTargets` | boolean | Auto-adjust macro targets (default: true) |
| `theme` | string | `"dark"` or `"medium"` |

### Security Issues
1. **`profileData` contains full health profile** in plaintext localStorage — any XSS vulnerability exposes it
2. **`dailyLog` accumulates health data indefinitely** — no expiration or cleanup
3. **Global keys not namespaced** — if two users share a device, one user's data bleeds into the other's view
4. **`workoutHistory`** contains detailed exercise performance data

---

## 7. Client-Side: sessionStorage

**Persistence:** Current browser tab only
**Encryption:** None

| Key | Data | PII/PHI |
|-----|------|---------|
| `activeTab` | `"home"`, `"meals"`, etc. | No |
| `momentum_insight` | Cached AI insight JSON with timestamp | Medium — health summary |

---

## 8. Client-Side: Cookies

| Cookie | Value | Max-Age | HttpOnly | Secure | SameSite | PII |
|--------|-------|---------|----------|--------|----------|-----|
| `client_date` | `"2026-04-17"` | 86400 (1 day) | **No** | **No** | Not set | No |
| Flask session | Signed JSON (user_id, username) | 90 days | **Yes** (Flask default) | Depends on deployment | Lax (Flask default) | **Yes** |

### Security Issues
1. **`client_date` cookie lacks `Secure` flag** — transmitted over HTTP
2. **`client_date` cookie lacks `SameSite` attribute** — potential CSRF vector
3. **Flask session cookie** carries username in signed-but-readable format

---

## 9. Client-Side: Service Worker Cache

**Cache Name:** `"life-dashboard-v5"`
**Persistence:** Until Service Worker updates or user clears cache

### Cached URLs
| URL | Strategy | Contains PII |
|-----|----------|-------------|
| `/` | Network-first, cache fallback | **Yes** — rendered HTML contains user data |
| `chart.js@4.4.0` | Cache-first | No |
| `sortablejs@1.15.2` | Cache-first | No |

### Security Issue
- **The app shell (`/`) is cached** and contains server-rendered user data (username, meals, workouts). If a user logs out and another user accesses the same browser, cached HTML from the previous user could be served offline.

---

## 10. File System Summary

| Path | Contains | Written By | PII/PHI |
|------|----------|-----------|---------|
| `life_dashboard.db` | All user data (17 tables) | `db.py` via sqlite3 | **CRITICAL** |
| `.env` | API keys, passwords | Manual | CRITICAL |
| `__pycache__/*.pyc` | Compiled bytecode | Python | No |

### No user-uploaded files are stored on disk
- **Photo scanning:** Images are sent as base64 in API request body → forwarded to Claude API → never saved
- **Barcode scanning:** Camera feed processed in-browser only → barcode string sent to Open Food Facts → never saved
- **No PDFs, exports, or generated files** exist

---

## 11. Third-Party Data Storage

| Service | What's Sent | Stored By Them | Retention |
|---------|-------------|----------------|-----------|
| **Anthropic (Claude)** | Meal descriptions, food photos (base64), workout descriptions, user profile data, email snippets | Anthropic's usage logs (30 days per their policy) | 30 days |
| **Google (Gmail)** | OAuth tokens (they issued them) | Google stores token grants | Until user revokes |
| **Open Food Facts** | Barcode numbers (in URL) | Access logs | Unknown |
| **Google Fonts** | IP address (in request) | Google Analytics | Per Google policy |
| **jsDelivr** | IP address (in request) | CDN logs | Unknown |

### Anthropic Data Concerns
- **Meal photos sent as base64** to Claude API — Anthropic sees the user's food photos
- **User profile data** appended to nutrition estimation prompts — Anthropic sees weight, height, age, goals
- **Email snippets** sent to Claude for summarization — Anthropic sees email content
- **Per Anthropic's policy:** API inputs are not used for training; retained 30 days for abuse monitoring

---

## 12. Data Flow Diagram

```
User Input → Browser
  ├── localStorage (profile, dailyLog, workoutHistory — UNENCRYPTED)
  │     ↑ overwritten on page load from /api/today-nutrition & /api/today-workouts
  ├── sessionStorage (active tab, cached insight)
  ├── Cookie (client_date — UNENCRYPTED)
  ├── Service Worker Cache (app shell — may contain user data)
  │
  └── fetch() → Flask Server
        ├── Flask Session Cookie (user_id, username — SIGNED)
        ├── SQLite Database (ALL persistent data — UNENCRYPTED FILE)
        ├── In-Memory (_ob_jobs — temporary profile data, TTL-swept)
        │
        └── External APIs
              ├── Anthropic Claude (meal text, photos, profile, emails)
              ├── Google Gmail (OAuth tokens, email metadata)
              └── Open Food Facts (barcode numbers)
```

---

## 13. Compliance Considerations

### HIPAA (Health Insurance Portability and Accountability Act)
- **Applicable?** Yes, if the app handles health data for US users
- **Current status:** NOT compliant
- **Issues:** Unencrypted database, unencrypted localStorage, health data sent to third parties (Anthropic), no audit logging, no access controls beyond session auth, no BAA with Anthropic

### GDPR (General Data Protection Regulation)
- **Applicable?** Yes, if any EU users (10-language support suggests EU audience)
- **Current status:** NOT compliant
- **Issues:** No data export feature, no data deletion confirmation (cascade delete exists but no "download your data" before deletion), no consent management, no data processing records, no DPO

### SOC 2
- **Current status:** Not applicable yet, but required for enterprise customers
- **Issues:** No audit logging, no access controls, no encryption at rest

---

## 14. Recommendations for Production

### Immediate (Before Launch)
1. **Encrypt database at rest** — use PostgreSQL with TDE or application-level encryption for PHI columns
2. ~~**Set `SECRET_KEY` permanently** — never fall back to random generation~~ **RESOLVED** — now required, crashes on boot if missing
3. **Add `Secure` and `SameSite=Lax` flags** to all cookies
4. **Namespace all localStorage keys** with user ID — prevent cross-user data leakage
5. **Add localStorage cleanup on logout** — clear `profileData`, `dailyLog`, `workoutHistory`
6. **Add audit logging** — track who accessed what data when

### Before Scaling
7. **Encrypt OAuth tokens** in database (gmail_tokens)
8. **Add data export endpoint** (`GET /api/export-my-data`) for GDPR compliance
9. **Add rate limiting** on all AI endpoints (cost protection)
10. **Add request timeout** on all Claude API calls (30s max)
11. ~~**Clean up `_ob_jobs` dict** after profile generation completes (memory leak)~~ **RESOLVED** — TTL sweep + pop-on-read (commits 1f26316, aa077b0)
12. **Implement proper session revocation** with server-side session store (Redis)
13. **Service Worker: exclude user data** from cache, or version cache per user
