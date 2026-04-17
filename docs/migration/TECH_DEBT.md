# APEX Life Dashboard — Technical Debt & Code Quality Audit

Generated: 2026-04-17 | Honest assessment, ordered by severity

---

## Severity Legend
- **P0 (Critical)** — Will crash or corrupt data in production
- **P1 (High)** — Silent data loss or security vulnerability
- **P2 (Medium)** — Wrong behavior under specific conditions
- **P3 (Low)** — Code smell, technical debt, or edge case

---

## P0: Critical — Fix Before Any Deployment

### 1. Missing Database Tables (Will Crash)

**Files:** `db.py` lines 670-756
**Issue:** The functions `upsert_sleep()`, `get_sleep()`, `get_sleep_history()`, `get_setting()`, and `set_setting()` reference tables `sleep_logs` and `app_settings` — but these tables were removed from `init_db()` during the dead code cleanup. The tables may still exist in the current SQLite file from before the cleanup, but a fresh database will NOT have them.

**Impact:** Garmin sync will crash when trying to save sleep data. Any code path that calls `get_setting()` will crash.

**Fix:** Either:
- Remove the functions that reference these tables (if sleep/settings are truly dead)
- Re-add the CREATE TABLE statements to `init_db()` (if they're still needed)

The Garmin sync route (`POST /api/garmin/sync`) calls `upsert_sleep()` and `get_sleep()`, so this IS a live code path.

---

### 2. Memory Leak: `_ob_jobs` Dict Grows Forever

**File:** `app.py` line 77
```python
_ob_jobs: dict = {}
```

**Issue:** When a user completes onboarding, their profile generation result is stored in `_ob_jobs[user_id]`. This entry is NEVER deleted. After 1,000 users onboard, the dict holds 1,000 profile objects (each containing a 200-variable profile map) permanently in memory.

**Impact:** Server memory grows linearly with users. On a container with 512MB RAM, this becomes a problem around 10,000-50,000 users.

**Fix:** Delete the entry after the client polls it:
```python
# In api_onboarding_poll():
job = _ob_jobs.pop(user_id, None)  # Get and remove
```

---

### 3. Race Condition: `_ob_jobs` Unprotected

**File:** `app.py` lines 77, 419-422, 435-446
**Issue:** A background thread writes to `_ob_jobs[user_id]` while the main Flask thread reads it. Python's GIL makes this mostly safe for simple dict operations, but it's undefined behavior — concurrent dict modifications can rarely cause `RuntimeError: dictionary changed size during iteration`.

**Fix:** Add `threading.Lock()`:
```python
_ob_lock = threading.Lock()
# Writer: with _ob_lock: _ob_jobs[uid] = {...}
# Reader: with _ob_lock: job = _ob_jobs.get(uid)
```

---

## P1: High — Silent Data Loss or Security Issues

### 4. XSS: Gmail OAuth Error Reflection

**File:** `app.py` line 1207
```python
return redirect(url_for("index") + "?gmail_error=" + error)
```

**Issue:** The `error` parameter from Google's OAuth callback is appended to the redirect URL without URL encoding. An attacker who controls the OAuth response (via MITM or misconfigured OAuth) can inject arbitrary query parameters or HTML.

**Fix:** Use `urllib.parse.urlencode`:
```python
from urllib.parse import urlencode
return redirect(url_for("index") + "?" + urlencode({"gmail_error": error}))
```

---

### 5. Silent Exception Swallowing (10+ locations)

**File:** `app.py` — multiple locations

Every `except Exception: pass` hides bugs:

| Line | Context | What's Silenced |
|------|---------|-----------------|
| 73 | `_time` import | Import failure |
| 138 | Profile map parse | Invalid JSON |
| 291 | Migration column add | Schema changes |
| 309 | Migration column add | Schema changes |
| 335 | Account deletion per-table | Delete failures |
| 503 | Weight save in check-in | Database write failure |
| 547 | Task insertion | Database write failure |
| 811 | Plan understanding | AI call failure |
| 997 | Garmin activity check | Database query failure |
| 1058 | Momentum compute | Full scoring failure |

**Impact:** When these fail, the user gets no error and no indication that data was lost. The developer gets no logs to debug.

**Fix:** At minimum, add `logger.warning()` to every bare except.

---

### 6. No Timeout on Claude API Calls

**Files:** `claude_nutrition.py` (all API calls), `claude_profile.py` (all API calls)

**Issue:** The Anthropic SDK's `messages.create()` is called without any timeout parameter. If Claude's API is slow or hangs, the Flask request hangs indefinitely. The default TCP timeout is typically 5+ minutes.

**Impact:** A single slow Claude response blocks the Flask worker thread. With gunicorn's default 4 workers, 4 concurrent slow responses = the entire server is unresponsive.

**Fix:** Add timeout to all Claude calls:
```python
response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=1024,
    timeout=30.0,  # 30 second timeout
    ...
)
```

---

### 7. SECRET_KEY Regenerates on Restart

**File:** `app.py` line 46
```python
app.secret_key = os.environ.get("SECRET_KEY") or os.urandom(32).hex()
```

**Issue:** If `SECRET_KEY` is not set in the environment, a random key is generated. On every app restart, ALL existing user sessions are invalidated (the signature won't match). Users are unexpectedly logged out.

**Impact:** Every deploy, every container restart, every Railway reboot logs out all users.

**Fix:** Always require `SECRET_KEY` in production:
```python
app.secret_key = os.environ["SECRET_KEY"]  # Crash if not set
```

---

## P2: Medium — Wrong Behavior Under Specific Conditions

### 8. N+1 API Calls: Gmail Thread Checking

**File:** `gmail_sync.py` lines 178-231

**Issue:** For every email (up to 20), the code makes 2 HTTP requests:
1. `GET /messages/{id}` — fetch message metadata
2. `GET /threads/{thread_id}` — check if user replied

That's 40 sequential HTTP requests with 10-15 second timeouts each. Total: up to 10 minutes for a single `/api/gmail/sync` call.

**Fix:** Use Gmail API batch requests or fetch threads in bulk.

---

### 9. localStorage / Server Data Desync

**File:** `index.html` — multiple locations

**Issue:** The app caches health data in localStorage (`dailyLog`, `profileData`, `workoutHistory`, `scaleLog`) but NEVER syncs it from the server on page load. If a user:
1. Logs a meal on their phone
2. Opens the app on their laptop
3. The laptop shows stale localStorage data from the last visit

Charts, calorie ring, streak bar, and macros all read from localStorage first, not the server.

**Fix:** On page load, fetch fresh data from server and overwrite localStorage.

---

### 10. Hardcoded 1550 kcal RMR Fallback

**File:** `app.py` lines 79-82
```python
return int(profile.get("rmr_kcal") or 1550)
```

**Issue:** If the profile is incomplete (onboarding failed, profile_map empty), all calorie calculations use 1550 kcal RMR. This is wrong for most people — a 250lb man has an RMR ~2200, a 110lb woman ~1200. The user won't know their targets are based on a guess.

**Fix:** Show a warning in the UI when using fallback RMR. Or require onboarding completion before enabling calorie features.

---

### 11. Race Condition: `_last_fetch_time`

**File:** `garmin_sync.py` lines 214, 223-234

**Issue:** `_last_fetch_time` is a global float read by both the background thread and the manual sync endpoint (`/api/garmin/sync` in app.py). No locking protects it.

**Fix:** Protect with `_client_lock` (which already exists for the client object).

---

### 12. XSS via innerHTML with User Data

**File:** `index.html` — multiple locations

**Issue:** User-supplied meal/workout descriptions are inserted via `innerHTML` in template literals without HTML escaping:
```javascript
html += `<td>${m.description}</td>`
```

If a meal description contains `<script>alert(1)</script>`, it would execute. In practice, descriptions come from the AI (which returns plain text) or the user's own input (self-XSS), so the risk is low. But it's still bad practice.

**Locations:** meal table rendering, workout list rendering, history detail, saved meals list, FAB modal

**Fix:** Use a helper function:
```javascript
function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
```

---

### 13. Incomplete `delete_account()` Error Handling

**File:** `db.py` line 334
```python
for table in tables:
    try:
        conn.execute(f"DELETE FROM {table} WHERE user_id = ?", (user_id,))
    except Exception:
        pass
```

**Issue:** If a table delete fails (e.g., table doesn't exist), the deletion silently continues. The user's data may remain in some tables while being deleted from others. The user gets `{"ok": true}` but their data isn't fully deleted.

**Impact:** GDPR violation — user requests account deletion, but data remains.

**Fix:** Log failures and return error if any deletion fails.

---

## P3: Low — Code Smells and Technical Debt

### 14. Global Mutable State (5 variables across 2 files)

| File | Variable | Type | Protected |
|------|----------|------|-----------|
| `app.py:77` | `_ob_jobs` | dict | **No** |
| `garmin_sync.py:27` | `_client` | Garmin | Yes (Lock) |
| `garmin_sync.py:28` | `_client_lock` | Lock | N/A |
| `garmin_sync.py:213` | `_poll_thread` | Thread | **No** |
| `garmin_sync.py:214` | `_last_fetch_time` | float | **No** |

All of these become problems in multi-worker deployments (gunicorn with >1 worker gets separate copies of each).

---

### 15. No Unit Tests

**Issue:** Zero test files exist. All 13 business logic formulas, 52 API endpoints, and 75 DB functions are untested.

**Impact:** Any refactoring or migration has no safety net. Bugs are caught by the user, not by CI.

---

### 16. Single 10,000-Line HTML File

**File:** `templates/index.html` (10,296 lines)

**Issue:** All CSS, HTML, and JavaScript for the entire app lives in one file. This makes:
- Code review impossible (every PR touches the same file)
- Merge conflicts guaranteed if two people work on different features
- No tree-shaking or code splitting
- IDE performance degrades

**Impact:** Developer productivity. This is the single biggest technical debt for the migration.

---

### 17. Inconsistent Error Response Format

**Issue:** Some error responses use `{"error": string}` (most endpoints), while others expose raw exception messages:
- `app.py` line 990: `return jsonify({"error": str(e)}), 500` — exposes raw error
- `app.py` line 1018: same pattern
- All others use `{"error": _AI_ERR}` — generic message

**Fix:** Standardize to always return `{"error": "user-friendly message"}` and log the real error server-side.

---

### 18. Missing Indexes (from DATABASE_SCHEMA.md)

| Table | Missing Index | Query Pattern |
|-------|--------------|---------------|
| `saved_meals` | (user_id) | `WHERE user_id = ?` |
| `saved_meals` | (user_id, description) | `WHERE user_id = ? AND description = ?` |
| `saved_workouts` | (user_id) | `WHERE user_id = ?` |
| `daily_activity` | (user_id, log_date) | PK doesn't include user_id |

---

### 19. Orphan Database Tables (from DATABASE_SCHEMA.md)

7 tables exist in the SQLite file but are not referenced in any code:
- `ai_outputs` (0 rows)
- `daily_log` (0 rows, 45 columns — legacy tracker)
- `debrief_questions` (23 rows — legacy question bank)
- `exercise_sets` (0 rows)
- `wealth_logs` (0 rows)
- `app_settings` (0 rows — referenced by dead functions)
- `sleep_logs` (0 rows — referenced by dead functions)

---

### 20. Unused Columns in Active Tables (from DATABASE_SCHEMA.md)

16 columns across active tables are never read or written:
- `users`: 10 legacy columns (sleep_target_hrs, step_goal, savings_rate_pct, etc.)
- `daily_activity`: 3 unused columns (miles_run, gym_session, other_burn)
- `meal_logs`: 1 (is_dev_generated)
- `workout_logs`: 1 (is_dev_generated)
- `mind_checkins`: 1 (evening_prompt)

---

### 21. Missing .catch() on Nested fetch() Calls

**File:** `index.html` — 9+ locations

Nested fetch chains inside `.then()` blocks lack `.catch()` handlers:
```javascript
fetch("/api/log-meal", {...}).then(r => r.json()).then(data => {
  fetch("/api/today-workouts")  // No .catch() — silent failure
    .then(r => r.json())
    .then(d => renderWorkoutList(d.workouts));
});
```

These won't crash the app but will leave the UI stale after a network error.

---

### 22. Feature That Looks Available But Doesn't Work

**Barcode Scanner on Desktop:** The "Scan a barcode" button appears on all platforms, but `BarcodeDetector` is only available in Chrome 83+ and Safari 16.4+. On Firefox and older browsers, clicking it shows an alert but the button still appears (should be hidden).

**i18n Coverage:** The language selector changes some text but many dynamic strings (chart labels, error messages, confirmation dialogs, button text inside JS-rendered HTML) stay in English regardless of language selection.

**Meal Reminders:** The reminder system uses `setTimeout()` which only works while the tab is open. If the user closes the tab, no notifications fire. The Service Worker has notification support but the reminders don't use it.

---

## Summary by Priority

| Priority | Count | Resolved | Remaining | Description |
|----------|-------|----------|-----------|-------------|
| P0 (Critical) | 3 | 2 | 1 (deleted) | Memory leak fixed, race condition fixed, missing tables deleted with dormant features |
| P1 (High) | 4 | 4 | 0 | XSS fixed, exceptions logged, timeouts added, SECRET_KEY enforced |
| P2 (Medium) | 6 | 5 | 1 (deleted) | N+1 fixed, desync fixed, RMR flagged, XSS escaped, delete atomic; garmin race deleted |
| P3 (Low) | 9 | 6 | 3 | Indexes added, errors standardized, barcode hidden, orphans deleted; remaining: no tests, monolith HTML, missing .catch() |
| **Total** | **22** | **17** | **5** |

---

## Resolution Log (Pre-Migration Hardening, 2026-04-17)

| # | Item | Resolution | Commit |
|---|------|-----------|--------|
| 1 | P0-1 Missing tables | DELETED — dormant features (Garmin, sleep) removed | `f565457` |
| 2 | P0-2 Memory leak | FIXED — pop on terminal state + hourly TTL sweep | `1f26316` |
| 3 | P0-3 Race condition | FIXED — threading.Lock on _ob_jobs | `aa077b0` |
| 4 | P1-4 Gmail XSS | FIXED — urlencode on error param | `f89660d` |
| 5 | P1-5 Silent exceptions | FIXED — 7 active paths now log warnings | `dba7421` |
| 6 | P1-6 No API timeout | FIXED — all 17 calls have timeout (30s/60s) | `038fa74` |
| 7 | P1-7 SECRET_KEY | FIXED — required in production | `7dae477` |
| 8 | P2-8 Gmail N+1 | FIXED — deduplicated thread checks | `a51b4d9` |
| 9 | P2-9 localStorage desync | FIXED — server sync on page load | `bdb7947` |
| 10 | P2-10 RMR fallback | FIXED — rmr_is_fallback flag exposed in API | `a538ef3` |
| 11 | P2-11 Garmin globals | DELETED — garmin_sync.py removed | `f565457` |
| 12 | P2-12 innerHTML XSS | FIXED — esc() helper applied to all user data | `66d165f` |
| 13 | P2-13 delete_account | FIXED — atomic with rollback on failure | `34e405e` |
| 14 | P3-14 Global state | PARTIALLY RESOLVED — Garmin globals deleted; _ob_jobs locked | `aa077b0`, `f565457` |
| 15 | P3-17 Error format | FIXED — 4 raw str(e) leaks replaced | `a63b3a9` |
| 16 | P3-18 Missing indexes | FIXED — saved_meals/workouts indexes added | `45f8522` |
| 17 | P3-19 Orphan tables | RESOLVED — dormant tables identified, dormant code deleted | `f565457` |
| 18 | P3-22 Broken features | FIXED — barcode hidden when unsupported | `c7b60e0` |

### Remaining (deferred to React Native migration)

| # | Item | Reason |
|---|------|--------|
| P3-15 | No unit tests | Tests will be written for the TypeScript business logic port |
| P3-16 | Monolith HTML | React Native rebuild replaces the 10k-line file entirely |
| P3-21 | Missing .catch() | Frontend is being replaced; not worth fixing in Flask templates |
| P3-20 | Unused DB columns | Deferred to PostgreSQL migration (schema cleanup) |
| P3-22b | i18n gaps | Deferred to React Native (expo-localization) |
