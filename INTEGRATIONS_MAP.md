# APEX Life Dashboard — External Integrations Map

Generated: 2026-04-17 | 5 external services

---

## Integration 1: Anthropic Claude API

| Property | Detail |
|----------|--------|
| **Service** | Anthropic Claude (LLM) |
| **Purpose** | AI meal estimation, photo scanning, burn estimation, workout plan generation, profile generation, check-in scoring, email summarization, momentum insights |
| **Files** | `ai_client.py` (client init), `claude_nutrition.py` (15 functions), `claude_profile.py` (4 functions), `gmail_sync.py` (1 function) |
| **Auth Method** | API key via `ANTHROPIC_API_KEY` environment variable |
| **Credential Storage** | Environment variable (`.env` file locally, Railway env in production) |

### Models Used

| Model | Functions | Max Tokens | Cost Tier |
|-------|-----------|------------|-----------|
| `claude-opus-4-6` | estimate_nutrition, scan_meal_image, identify_ingredients, suggest_meal, estimate_burn | 300-1200 | High (~$0.01-0.05/call) |
| `claude-haiku-4-5-20251001` | shorten_label, parse_workout_plan, generate_workout_plan, generate_comprehensive_plan, generate_plan_understanding, revise_plan, generate_momentum_insight, generate_scale_summary, generate_profile_map, score_brief, generate_evening_prompt, summarize_emails | 32-4096 | Low (~$0.001-0.005/call) |

### Error Handling

```
Pattern: try/except in app.py route → logger.exception() → return {"error": _AI_ERR}
User sees: "Something went wrong, please try again later" (generic)
Original error: Logged with full traceback via Python logging
```

| Location | Pattern | Retry |
|----------|---------|-------|
| `claude_nutrition.py` functions | **No error handling** — exceptions propagate to caller | None |
| `claude_profile.py: score_brief()` | try/except → returns safe defaults `{focus:5, wellbeing:5}` | None |
| `claude_profile.py: generate_evening_prompt()` | try/except → returns `None` | None |
| `gmail_sync.py: summarize_emails()` | try/except → returns fallback string | None |
| `app.py` route handlers | try/except → `logger.exception()` → `jsonify({"error": _AI_ERR}), 500` | None |

### Rate Limits Respected
- **None.** No rate limiting on Claude API calls from the app side.
- Anthropic has account-level rate limits (requests/min, tokens/min) but the app doesn't handle 429 responses.

### Retry Logic
- **None.** All failures are terminal. If Claude is down, every AI feature fails with a generic error.

### Data Transformation

| Direction | Transformation |
|-----------|---------------|
| App → Claude | User text/images → structured prompt with JSON schema instructions |
| Claude → App | Raw text response → `_parse_json()` extracts JSON from markdown fences → typed dict with validated fields |

`_parse_json()` (claude_nutrition.py lines 42-59):
1. Try direct `json.loads()`
2. Strip markdown code fences (```json...```)
3. Regex search for outermost `{...}`
4. Parse extracted JSON

### Risk Assessment

| Scenario | Impact | Severity |
|----------|--------|----------|
| Claude API down | All AI features fail: meal estimation, photo scanning, burn estimation, plan generation, insights, profile generation | **CRITICAL** — core value prop is AI |
| API key invalid/expired | Same as above — immediate total failure | **CRITICAL** |
| Rate limit hit (429) | Unhandled — would surface as generic error to user | **HIGH** — no backoff or queue |
| Slow response (>30s) | No timeout configured — request hangs until Anthropic responds or TCP times out | **MEDIUM** |
| Malformed JSON response | `_parse_json()` has 3 fallback layers but could still fail → uncaught exception | **LOW** — rare in practice |

---

## Integration 2: Google Gmail API

| Property | Detail |
|----------|--------|
| **Service** | Google Gmail API v1 |
| **Purpose** | Email fetching, importance routing, AI summarization |
| **Files** | `gmail_sync.py` (11 functions), `app.py` (7 routes) |
| **Auth Method** | OAuth 2.0 (authorization code flow) |
| **Credential Storage** | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` in env vars; per-user access/refresh tokens in `gmail_tokens` DB table |

### OAuth Flow

```
1. User clicks "Connect Gmail"
2. App redirects to Google consent screen (gmail.readonly scope)
3. Google redirects back with authorization code
4. App exchanges code for access_token + refresh_token
5. Tokens stored in gmail_tokens table
6. Auto-refresh: if token expires in <2 min, refresh before use
```

### API Endpoints Called

| Method | URL | Timeout | Purpose |
|--------|-----|---------|---------|
| POST | `oauth2.googleapis.com/token` | 15s | Exchange code / refresh token |
| GET | `gmail.googleapis.com/.../profile` | 10s | Get user email address |
| GET | `gmail.googleapis.com/.../messages` | 15s | List inbox messages (7-day, primary category) |
| GET | `gmail.googleapis.com/.../messages/{id}` | 10s | Get message metadata |
| GET | `gmail.googleapis.com/.../threads/{id}` | 10s | Check if user replied to thread |

### Error Handling

| Function | Error Pattern | Recovery |
|----------|---------------|----------|
| `exchange_code()` | `resp.raise_for_status()` — uncaught HTTPError | Propagates → app.py catches → redirect with error param |
| `refresh_access_token()` | `resp.raise_for_status()` — uncaught | Propagates → `get_valid_token()` catches → returns `None` |
| `get_valid_token()` | try/except on refresh → `logger.error()` → returns `None` | Silent failure, no notification to user |
| `fetch_recent_emails()` | `raise_for_status()` on list call — uncaught; thread fetch wrapped in try/except → logs warning, continues | Partial: individual message failures don't break the batch |
| `summarize_emails()` | Full try/except → returns "Could not generate summary" | Graceful degradation |

### Rate Limits Respected
- **None explicitly.** Gmail API has a 250 quota units/second per user. The app fetches up to 20 messages sequentially (no parallelism), which is well within limits for single users.

### Retry Logic
- **Token refresh:** Single attempt, no retry on failure
- **API calls:** No retry on any endpoint

### Data Transformation

| Direction | Transformation |
|-----------|---------------|
| Gmail → App | Raw message headers → parsed sender (name extraction), subject, snippet, read/replied status, received_at timestamp |
| App → DB | Parsed email → `gmail_cache` row with importance_score computed from user's sender rules |
| Emails → AI | Important emails → concatenated text → Claude Haiku → summary string |

### Risk Assessment

| Scenario | Impact | Severity |
|----------|--------|----------|
| Gmail API down | Email feature unavailable; rest of app works fine | **LOW** — email is optional |
| OAuth token expired + refresh fails | User disconnected; must re-authorize | **LOW** — clear "reconnect" flow exists |
| Google revokes OAuth consent | Same as above | **LOW** |
| User exceeds Gmail API quota | Fetch fails with 429; unhandled, surfaces as generic error | **LOW** — unlikely for single-user patterns |

---

## Integration 3: Garmin Connect API

| Property | Detail |
|----------|--------|
| **Service** | Garmin Connect (fitness wearable data) |
| **Purpose** | Steps, calories, heart rate, sleep, workout auto-import |
| **Files** | `garmin_sync.py` (10 functions), `app.py` (3 routes) |
| **Auth Method** | Email/password OR saved OAuth tokens (via `garth` library) |
| **Credential Storage** | `GARMIN_EMAIL` + `GARMIN_PASSWORD` in env vars; tokens in `GARMIN_TOKENS` env var (JSON) or `~/.garminconnect/` directory |

### Authentication Flow

```
Priority 1: GARMIN_TOKENS env var → writes to ~/.garminconnect/ → Garmin().login(token_dir)
Priority 2: GARMIN_EMAIL + GARMIN_PASSWORD → Garmin(email, pw).login()
Priority 3: If MFA required → interactive prompt (blocks, not suitable for production)
Failure: RuntimeError("Garmin not configured")
```

### API Methods Called (via `garminconnect` library)

| Method | Purpose | Error Handling |
|--------|---------|----------------|
| `client.get_user_summary(date)` | Daily stats (steps, calories, HR) | Propagates on failure |
| `client.get_activities(0, 10)` | Last 10 activities | Propagates on failure |
| `client.get_sleep_data(date)` | Sleep metrics | try/except → log warning, continue |

### Error Handling (Best in Codebase)

| Error Type | Handling | Recovery |
|------------|----------|----------|
| 429 (Rate Limit) | `GarminConnectTooManyRequestsError` → log + sleep 60 min | Wait and retry on next poll |
| 401/403 (Auth) | `GarminConnectAuthenticationError` / `GarthHTTPError` → invalidate tokens → re-authenticate | Automatic re-auth attempt |
| Connection Error | `GarminConnectConnectionError` → log warning | Continue, retry on next poll |
| Any Other | `Exception` → log error | Continue, retry on next poll |
| Sleep fetch fail | `Exception` → log warning | Returns partial data (no sleep) |

### Rate Limits Respected
- **Yes.** 60-minute polling interval. 45-minute staleness threshold (skips if data is fresh).
- **429 backoff:** Additional 60-minute sleep on rate limit response.

### Retry Logic
- **Background polling:** Automatic retry every 60 minutes (daemon thread)
- **Manual sync:** 5-minute throttle (unless `force=true`)
- **Auth retry:** Invalidate tokens → re-authenticate → continue

### Data Transformation

| Direction | Transformation |
|-----------|---------------|
| Garmin → App | Raw `dailySummary` → extracted steps, active_calories, total_calories, resting_hr |
| Garmin → App | Raw `sleepDTO` → parsed total/deep/light/rem/awake seconds + sleep score |
| Garmin → App | Raw activities → filtered by date, extracted description + calories + garmin_activity_id |

### Risk Assessment

| Scenario | Impact | Severity |
|----------|--------|----------|
| Garmin API down | Garmin data stops syncing; manual entry still works | **LOW** — optional feature |
| Auth tokens expire | Auto re-authentication via background thread | **LOW** — self-healing |
| Rate limited | 60-min backoff, resumes automatically | **LOW** — handled |
| Background thread crashes | No auto-restart; manual sync still works | **MEDIUM** — silent failure |
| `GARMIN_TOKENS` env var missing | Falls back to email/password; if those also missing → "not configured" | **LOW** — graceful |

**Note:** Background polling is currently **DISABLED** (commented out in app.py line 1062). Only manual sync via `/api/garmin/sync` is active.

---

## Integration 4: Open Food Facts API

| Property | Detail |
|----------|--------|
| **Service** | Open Food Facts (product database) |
| **Purpose** | Barcode nutrition lookup |
| **Files** | `templates/index.html` (client-side JavaScript only) |
| **Auth Method** | None (public API, no key required) |
| **Credential Storage** | N/A |

### API Endpoint

```
GET https://world.openfoodfacts.org/api/v2/product/{barcode}.json
```

### Error Handling

| Scenario | Handling | User Sees |
|----------|----------|-----------|
| Product found | Parse nutrition data, show result card | Product name + macros + "Log This" button |
| Product not found (`status !== 1`) | `hint.textContent = "Product not found."` → resume scanning after 2s | "Product not found. Try again." |
| Network error | `.catch()` → `hint.textContent = "Lookup failed."` → resume scanning after 2s | "Lookup failed. Try again." |

### Rate Limits Respected
- **None.** Open Food Facts has no published rate limits for read-only access. Single barcode lookups are negligible load.

### Retry Logic
- **None explicit.** User can scan again manually (auto-resumes scanning after 2-second delay).

### Data Transformation

| Field | Source | Fallback |
|-------|--------|----------|
| name | `product.product_name` or `product_name_en` | "Unknown product" |
| brand | `product.brands` | "" |
| calories | `nutriments["energy-kcal_serving"]` | `nutriments["energy-kcal_100g"]` → 0 |
| protein_g | `nutriments.proteins_serving` | `nutriments.proteins_100g` → 0 |
| carbs_g | `nutriments.carbohydrates_serving` | `nutriments.carbohydrates_100g` → 0 |
| fat_g | `nutriments.fat_serving` | `nutriments.fat_100g` → 0 |
| serving | `product.serving_size` | "per 100g" |

Per-serving values preferred when available; falls back to per-100g.

### Risk Assessment

| Scenario | Impact | Severity |
|----------|--------|----------|
| Open Food Facts down | Barcode scanning shows "Lookup failed"; user can still type meal manually | **VERY LOW** — nice-to-have feature |
| Product not in database | Shows "Product not found"; user scans again or types manually | **LOW** — expected for niche products |
| Incorrect nutrition data | User logs wrong macros; can edit later | **LOW** — crowd-sourced data quality varies |

---

## Integration 5: Google Fonts CDN

| Property | Detail |
|----------|--------|
| **Service** | Google Fonts |
| **Purpose** | Typography (Bebas Neue for headers, Rajdhani for numbers) |
| **Files** | `templates/index.html` line 27, `templates/login.html`, `templates/onboarding.html` |
| **Auth Method** | None (public CDN) |
| **Credential Storage** | N/A |

### URL
```
https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Rajdhani:wght@500;600;700&display=swap
```

### Error Handling
- **None.** If CDN is down, fonts fall back to system font stack: `-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif`
- Service Worker caches the font CSS file for offline use

### Risk Assessment

| Scenario | Impact | Severity |
|----------|--------|----------|
| Google Fonts CDN down | Headers and numbers use system font; app fully functional | **NONE** — graceful fallback |

---

## Integration 6: Chart.js + Sortable.js CDNs

| Property | Detail |
|----------|--------|
| **Service** | jsDelivr CDN |
| **Purpose** | Chart rendering (Chart.js 4.4.0) and drag-and-drop (Sortable.js 1.15.2) |
| **Files** | `templates/index.html` lines 29-30, `static/sw.js` lines 6-8 |
| **Auth Method** | None |

### URLs
```
https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js
https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js
```

### Error Handling
- Service Worker pre-caches both files in the `PRECACHE` list
- If CDN is down and not cached: charts won't render, drag-and-drop won't work
- App otherwise functional (data still loads, just no visualizations)

### Risk Assessment

| Scenario | Impact | Severity |
|----------|--------|----------|
| jsDelivr CDN down (not cached) | No charts, no drag-and-drop | **MEDIUM** — significant UX loss |
| jsDelivr CDN down (cached) | Service Worker serves cached copies | **NONE** — transparent |

---

## Summary: Service Dependency Matrix

| Service | Required? | Fallback | Error Handling | Retry | Rate Limit Handling |
|---------|-----------|----------|----------------|-------|---------------------|
| **Anthropic Claude** | Yes (core) | Generic error message | try/except in routes | **None** | **None** |
| **Gmail API** | No (optional) | "Not connected" state | Partial (token refresh) | Token refresh only | **None** |
| **Garmin Connect** | No (optional) | "Not configured" state | **Comprehensive** | Background polling + auth retry | **Yes** (60-min backoff) |
| **Open Food Facts** | No (optional) | Manual meal entry | Product not found + network error | User re-scans | **None needed** |
| **Google Fonts** | No (cosmetic) | System font stack | CSS fallback + SW cache | N/A | N/A |
| **jsDelivr CDN** | No (charts) | No charts rendered | SW cache | N/A | N/A |

### Critical Gap: Anthropic API has zero resilience
The most important integration (Claude AI) has the weakest error handling:
- No retry logic
- No timeout configuration
- No rate limit handling
- No circuit breaker
- No fallback for degraded operation
- No request queuing

**Recommendation for production:** Add exponential backoff retry (3 attempts), 30-second timeout, rate limit queue, and consider caching recent identical requests to reduce API calls.
