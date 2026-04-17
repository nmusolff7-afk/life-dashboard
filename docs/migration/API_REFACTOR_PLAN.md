# APEX Life Dashboard — API Refactor Plan

Generated: 2026-04-17 | Preparing Flask backend for React Native consumption

---

## Table of Contents

1. [HTML-Returning Endpoints — Full Audit](#1-html-returning-endpoints--full-audit)
2. [JSON Equivalents — Detailed Design](#2-json-equivalents--detailed-design)
3. [Versioning Strategy](#3-versioning-strategy)
4. [Transition Plan](#4-transition-plan)
5. [Authentication Design](#5-authentication-design)
6. [CORS Configuration](#6-cors-configuration)
7. [Error Response Standardization](#7-error-response-standardization)
8. [Pagination Plan](#8-pagination-plan)
9. [Webhook Handling](#9-webhook-handling)
10. [Streaming / Real-Time Events](#10-streaming--real-time-events)

---

## 1. HTML-Returning Endpoints — Full Audit

Audited every `render_template()` and `redirect()` call in `app.py`. There are exactly **7 non-JSON endpoints** and **13 redirect calls** that need attention.

### Endpoints That Return HTML

| # | Method | Path | Current Response | Line | Impact |
|---|--------|------|-----------------|------|--------|
| 1 | GET | `/` | `render_template("index.html", meals, totals, workouts, tdee, ...)` | 269-274 | Main dashboard. Mobile doesn't need this — all data available via existing JSON endpoints. |
| 2 | GET | `/login` | `render_template("login.html", error=error)` | 150-183 | Login form. Mobile uses Clerk. |
| 3 | POST | `/login` | `redirect("/")` on success, `render_template("login.html")` on fail | 150-183 | Login action. Mobile needs a JSON response. |
| 4 | GET | `/logout` | `redirect("/login")` | 229-232 | Session clear. Mobile needs JSON acknowledgment. |
| 5 | GET | `/onboarding` | `render_template("onboarding.html", username, saved, editing)` | 279-296 | Onboarding wizard. Mobile renders natively. |
| 6 | GET | `/api/gmail/connect` | `redirect(auth_url)` | 1187-1198 | OAuth initiation. Mobile needs the URL as data. |
| 7 | GET | `/api/gmail/callback` | `redirect("/?gmail_connected=1")` or `redirect("/?gmail_error=...")` | 1201-1232 | OAuth callback. Mobile needs JSON result. |

### Static File Endpoints (Keep As-Is)

| Method | Path | Returns | Mobile Action |
|--------|------|---------|---------------|
| GET | `/sw.js` | Service Worker JS file | Not needed — PWA only. No conversion. |

### Internal Redirects (Auth Guard)

These are not endpoints but redirect behaviors within existing routes:

| Line | Context | Current Behavior | Mobile Equivalent |
|------|---------|-----------------|-------------------|
| 91 | `login_required` decorator | `redirect("/login")` if no session | Return `401 { error }` when no valid token |
| 154 | `login_page()` GET | `redirect("/")` if already logged in | N/A — Clerk handles |
| 273 | `index()` | `redirect("/onboarding")` if not onboarded | Mobile checks `GET /api/onboarding/status` then navigates |
| 285 | `onboarding()` | `redirect("/")` if complete and not editing | Mobile checks status client-side |

---

## 2. JSON Equivalents — Detailed Design

### 2.1 `POST /api/v1/auth/login`

Replaces: `POST /login` (form-encoded, returns HTML)

```
Method: POST
Path:   /api/v1/auth/login
Auth:   None
Rate:   10/minute

Request (JSON, not form-encoded):
{
  "username": "string (required, min 2 chars)",
  "password": "string (required, min 4 chars)"
}

Success 200:
{
  "ok": true,
  "token": "eyJhbG...",          // JWT, 90-day expiry
  "refresh_token": "abc123...",   // For token refresh
  "user": {
    "id": 1,
    "username": "nate",
    "onboarding_complete": true
  }
}

Error 400:
{ "error": { "code": "VALIDATION_ERROR", "message": "Username must be at least 2 characters" } }

Error 401:
{ "error": { "code": "INVALID_CREDENTIALS", "message": "Incorrect username or password" } }
```

**Implementation notes:**
- Accept JSON body (not form-encoded).
- Generate JWT with `user_id` and `username` claims.
- Include `onboarding_complete` so mobile can route directly without an extra API call.

---

### 2.2 `POST /api/v1/auth/register`

Replaces: `POST /login` with `action: "register"` (form-encoded, returns HTML)

```
Method: POST
Path:   /api/v1/auth/register
Auth:   None
Rate:   10/minute

Request:
{
  "username": "string (required, min 2 chars)",
  "password": "string (required, min 4 chars)"
}

Success 201:
{
  "ok": true,
  "token": "eyJhbG...",
  "refresh_token": "abc123...",
  "user": {
    "id": 2,
    "username": "newuser",
    "onboarding_complete": false
  }
}

Error 409:
{ "error": { "code": "USERNAME_TAKEN", "message": "That username is already taken" } }
```

**Implementation notes:**
- Separate endpoint from login (currently they share `POST /login` with an `action` field).
- Return `201 Created` on success.

---

### 2.3 `POST /api/v1/auth/logout`

Replaces: `GET /logout` (returns redirect)

```
Method: POST
Path:   /api/v1/auth/logout
Auth:   Required (JWT)

Request: (empty body)

Success 200:
{ "ok": true }
```

**Implementation notes:**
- Clear Flask session (for web clients still using cookies).
- For JWT clients: token invalidation is client-side (delete the token). No server-side token blacklist needed at current scale.

---

### 2.4 `POST /api/v1/auth/refresh`

New endpoint — does not exist today.

```
Method: POST
Path:   /api/v1/auth/refresh
Auth:   None (uses refresh_token)

Request:
{ "refresh_token": "abc123..." }

Success 200:
{
  "ok": true,
  "token": "eyJhbG...",
  "refresh_token": "newrefresh..."
}

Error 401:
{ "error": { "code": "INVALID_TOKEN", "message": "Refresh token is invalid or expired" } }
```

---

### 2.5 `GET /api/v1/dashboard`

Replaces: `GET /` (returns `render_template("index.html", ...)`)

```
Method: GET
Path:   /api/v1/dashboard
Auth:   Required

Response 200:
{
  "user": {
    "id": 1,
    "username": "nate",
    "display_name": "Nathan",
    "onboarding_complete": true
  },
  "today": "2026-04-17",
  "rmr": 1823,
  "tdee": 2303,
  "workout_burn": 480,
  "nutrition": {
    "meals": [...],
    "totals": { "meal_count": 3, "total_calories": 1650, ... }
  },
  "workouts": [...],
  "profile_snapshot": {
    "primary_goal": "lose_weight",
    "calorie_target": 1840,
    "protein_g": 154
  }
}
```

**Implementation notes:**
- This is a convenience aggregation endpoint. The mobile app CAN call `GET /api/today-nutrition` + `GET /api/today-workouts` + `GET /api/profile` separately, but this single call reduces startup latency.
- The Flask `render_index()` helper (line 124-145) already assembles this data — extract the logic into a JSON response.

---

### 2.6 `GET /api/v1/onboarding/data`

Replaces: `GET /onboarding` (returns `render_template("onboarding.html", ...)`)

```
Method: GET
Path:   /api/v1/onboarding/data
Auth:   Required

Response 200:
{
  "username": "nate",
  "complete": false,
  "editing": false,
  "saved": {
    "first_name": "Nathan",
    "current_weight_lbs": 185,
    "height_ft": 5,
    "height_in": 10,
    ...
  }
}

Query: ?edit=1 → sets "editing": true even if onboarding is complete
```

**Implementation notes:**
- Mirrors the data that `onboarding()` (line 279-296) passes to the template.
- Existing `GET /api/onboarding/status` returns only `{ complete: boolean }`. This new endpoint replaces both the HTML route and the status check.

---

### 2.7 `GET /api/v1/gmail/connect`

Replaces: `GET /api/gmail/connect` (returns `redirect(auth_url)`)

```
Method: GET
Path:   /api/v1/gmail/connect
Auth:   Required

Success 200:
{
  "auth_url": "https://accounts.google.com/o/oauth2/auth?client_id=...&redirect_uri=...&state=...",
  "state": "abc123..."
}

Error 400:
{ "error": { "code": "NOT_CONFIGURED", "message": "Google OAuth not configured" } }
```

**Implementation notes:**
- Return the auth URL as data. The mobile app opens it with `expo-web-browser` or `Linking.openURL()`.
- Include the CSRF state token so the mobile app can verify it on callback.
- The `redirect_uri` in the auth URL must point to a mobile deep link or a web intermediary page that the mobile app can intercept.

---

### 2.8 `GET /api/v1/gmail/callback`

Replaces: `GET /api/gmail/callback` (returns `redirect("/?gmail_connected=1")`)

```
Method: POST
Path:   /api/v1/gmail/callback
Auth:   Required

Request:
{
  "code": "4/0AX4XfWh...",
  "state": "abc123..."
}

Success 200:
{
  "ok": true,
  "email": "user@gmail.com"
}

Error 400:
{ "error": { "code": "INVALID_STATE", "message": "OAuth state mismatch" } }

Error 400:
{ "error": { "code": "OAUTH_FAILED", "message": "Failed to exchange authorization code" } }
```

**Implementation notes:**
- Changed from GET to POST — the mobile app extracts `code` and `state` from the deep link URL and sends them explicitly.
- No more redirect chains. The mobile app receives the JSON response and navigates to the Status tab.
- The original `GET /api/gmail/callback` stays for web clients during the transition period (Google's registered redirect URI points here).

---

## 3. Versioning Strategy

### Decision: URL prefix `/api/v1/` for new endpoints only

```
Existing (keep):   /api/today-nutrition      ← already JSON, no change
                   /api/log-meal             ← already JSON, no change
                   /api/estimate             ← already JSON, no change
                   ... (45 endpoints)

New (v1 prefix):   /api/v1/auth/login        ← replaces POST /login
                   /api/v1/auth/register     ← replaces POST /login (action=register)
                   /api/v1/auth/logout       ← replaces GET /logout
                   /api/v1/auth/refresh      ← new
                   /api/v1/dashboard         ← replaces GET /
                   /api/v1/onboarding/data   ← replaces GET /onboarding
                   /api/v1/gmail/connect     ← replaces GET /api/gmail/connect
                   /api/v1/gmail/callback    ← replaces GET /api/gmail/callback
```

### Rationale

- **45 of 52 endpoints already return JSON.** Re-prefixing them to `/api/v1/` gains nothing and forces changes to both Flask routes and mobile API client for no functional benefit.
- **Only 7 endpoints need new JSON equivalents.** These get the `/api/v1/` prefix to avoid collision with existing routes.
- **No `/api/v2/` is planned.** When the Express backend replaces Flask (MIGRATION_PLAN.md Phase 4), all routes are rewritten anyway. A version prefix on the Express side can be decided then.
- **The mobile API client** uses a single base URL + path constants. Mixing `/api/` and `/api/v1/` prefixes is trivial — it's just different string constants per endpoint.

### When a route exists in both places

During the transition period:

| Path | Old behavior (web) | New behavior (mobile) |
|------|-------------------|----------------------|
| `GET /api/gmail/connect` | Returns `redirect(auth_url)` | Keep for web |
| `GET /api/v1/gmail/connect` | Returns `{ auth_url }` | Mobile uses this |
| `GET /api/gmail/callback` | Returns `redirect("/")` | Keep (Google's registered redirect URI) |
| `POST /api/v1/gmail/callback` | Returns JSON | Mobile sends code+state here |

Both coexist until Flask is decommissioned.

---

## 4. Transition Plan

### Principle: Additive, never breaking

The web app (Flask templates) must keep working until the mobile app is ready. We add new routes alongside old ones, never replace.

### Step 1: Add dual-auth middleware (Week 1)

```python
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        # Try JWT first (mobile)
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            try:
                payload = jwt.decode(token, app.secret_key, algorithms=["HS256"])
                g.user_id = payload["user_id"]
                g.username = payload["username"]
                g.auth_method = "jwt"
                return f(*args, **kwargs)
            except jwt.InvalidTokenError:
                return jsonify({"error": {"code": "INVALID_TOKEN", "message": "Invalid or expired token"}}), 401

        # Fall back to session cookie (web)
        if "user_id" in session:
            g.user_id = session["user_id"]
            g.username = session.get("username", "")
            g.auth_method = "session"
            return f(*args, **kwargs)

        # Neither — for JWT clients, return 401 JSON
        if request.headers.get("Accept", "").startswith("application/json") or request.path.startswith("/api/"):
            return jsonify({"error": {"code": "AUTH_REQUIRED", "message": "Authentication required"}}), 401
        return redirect(url_for("login_page"))
    return decorated
```

### Step 2: Add new JSON endpoints (Week 1)

Register the 8 new routes (7 replacements + 1 refresh) in `app.py`, all under `/api/v1/`. Existing routes untouched.

### Step 3: Add CORS (Week 1)

Install `flask-cors`, configure for development origins.

### Step 4: Update `uid()` helper (Week 1)

```python
def uid():
    """Return current user ID — works for both session and JWT auth."""
    return getattr(g, "user_id", None) or session.get("user_id")
```

### Step 5: Standardize error responses (Week 1)

Add a global error handler and update existing endpoints progressively. Details in section 7.

### Step 6: Ship and verify (Week 1-2)

- [ ] Web app still works (test all tabs, login, onboarding, Gmail connect).
- [ ] Mobile app can authenticate via `POST /api/v1/auth/login`.
- [ ] Mobile app can call all 45 existing JSON endpoints with JWT.
- [ ] Mobile app can complete Gmail OAuth via new flow.
- [ ] No existing behavior broken.

### Step 7: Decommission (after Express migration)

After Phase 4 of MIGRATION_PLAN.md (Express backend running):
- Delete `GET /`, `GET /login`, `GET /logout`, `GET /onboarding` routes.
- Delete `templates/` directory.
- Delete `static/sw.js`, `static/manifest.json`.
- Delete `render_index()` helper.

---

## 5. Authentication Design

### During Flask period (Weeks 1-17)

Both authentication methods accepted simultaneously:

| Method | Mechanism | Used By | Expiry |
|--------|-----------|---------|--------|
| **Session cookie** | Flask `session` (signed, server-side) | Web app (existing) | 90 days (`permanent_session_lifetime`) |
| **JWT Bearer token** | `Authorization: Bearer <token>` header | Mobile app (new) | 90 days (matching session lifetime) |

### JWT Token Design

```
Header:  { "alg": "HS256", "typ": "JWT" }
Payload: {
  "user_id": 1,
  "username": "nate",
  "iat": 1713369600,
  "exp": 1721145600,     // 90 days from iat
  "type": "access"       // "access" or "refresh"
}
Signed with: app.secret_key (same SECRET_KEY env var)
```

### Token lifecycle

```
1. Mobile → POST /api/v1/auth/login → receives { token, refresh_token }
2. Mobile stores both in secure storage (expo-secure-store)
3. Every API request: Authorization: Bearer <token>
4. If 401 received: POST /api/v1/auth/refresh with refresh_token
5. If refresh fails: redirect to login screen
```

### After Clerk migration (Week 2+)

Clerk replaces the custom JWT system. The flow changes:

```
1. Mobile → Clerk <SignIn /> component → Clerk issues JWT
2. Flask validates Clerk JWT via POST /api/v1/auth/clerk-verify
   (creates local user if new, returns user_id mapping)
3. Every API request: Authorization: Bearer <clerk_jwt>
4. Flask middleware verifies Clerk JWT signature using Clerk's public key (JWKS)
5. Token refresh handled by Clerk SDK automatically
```

The custom JWT endpoints (`/api/v1/auth/login`, `/register`, `/refresh`) become dead code once Clerk is integrated but remain available as fallback.

### What does NOT change

- `uid()` helper — works the same regardless of auth method.
- All 45 existing `/api/*` routes — they call `uid()`, which now reads from either source.
- Rate limiting — stays on IP address (not token-based).

---

## 6. CORS Configuration

### Development (local React Native)

```python
from flask_cors import CORS

CORS(app, resources={
    r"/api/*": {
        "origins": [
            "http://localhost:8081",        # Expo dev server (default)
            "http://localhost:19006",        # Expo web
            "http://10.0.2.2:8081",         # Android emulator → host
            "exp://localhost:8081",          # Expo Go protocol
            "exp://192.168.*:8081",          # Expo Go on LAN
        ],
        "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        "allow_headers": [
            "Authorization",
            "Content-Type",
            "X-Client-Date",               # Replacing client_date cookie
            "X-Client-Timezone",            # For server-side TZ awareness
        ],
        "expose_headers": [
            "X-Request-Id",                 # For debugging
        ],
        "supports_credentials": True,       # Needed if session cookies are sent
        "max_age": 86400,                   # Cache preflight for 24h
    }
})
```

### Production (deployed mobile app)

```python
# Production — no CORS needed for native HTTP requests
# React Native's fetch() from a native app is NOT subject to CORS.
# CORS is only enforced by browsers.
#
# However, if Expo Web is used during development or if the PWA
# continues to exist alongside the mobile app, keep CORS enabled.

CORS(app, resources={
    r"/api/*": {
        "origins": [
            os.environ.get("APP_URL", ""),    # PWA origin if still running
        ],
        "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        "allow_headers": ["Authorization", "Content-Type", "X-Client-Date", "X-Client-Timezone"],
        "supports_credentials": True,
        "max_age": 86400,
    }
})
```

### Important: React Native does NOT need CORS in production

Native HTTP requests (from React Native's `fetch()` or `axios`) are **not subject to browser CORS policy**. CORS only applies to browser-based JavaScript. In production, the mobile app makes direct HTTPS requests to the backend — no `Origin` header, no preflight.

CORS configuration is needed only for:
1. Expo Web during development (browser-based).
2. The existing PWA (if it continues running during migration).

### Replacing the `client_date` cookie

The Flask app currently reads `request.cookies.get("client_date")` (set by the browser JS every minute) to determine the user's local date. Mobile apps don't use cookies by default.

**Solution:** Replace with a request header.

```python
def client_today():
    """Return today's date in the client's timezone."""
    # Check header first (mobile), then cookie (web), then server date
    d = request.headers.get("X-Client-Date", "").strip()
    if not d:
        d = request.cookies.get("client_date", "").strip()
    if d:
        try:
            date.fromisoformat(d)
            return d
        except ValueError:
            pass
    return date.today().isoformat()
```

Mobile API client sets this on every request:

```typescript
headers: {
  "Authorization": `Bearer ${token}`,
  "Content-Type": "application/json",
  "X-Client-Date": new Date().toISOString().split("T")[0],  // "2026-04-17"
}
```

---

## 7. Error Response Standardization

### Current State — Audit

The Flask app has **4 different error response shapes**:

| Pattern | Count | Example | Lines |
|---------|-------|---------|-------|
| Generic AI error | 14 | `{"error": "Something went wrong, please try again later"}` | 675, 690, 755, 769, ... |
| Specific user error | 18 | `{"error": "No description"}` | 602, 627, 764, 780, ... |
| Raw exception leak | 5 | `{"error": str(e)}` — exposes Python tracebacks | 618, 994, 1114, 1342, 1423 |
| No error field | 1 | `{"skipped": True, "reason": "synced 45s ago"}` | 1108 |

### Target Shape

Every error response from every endpoint must use this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message for display in the app",
    "field": "description"
  }
}
```

### Error Code Catalog

| HTTP | Code | When | Example message |
|------|------|------|----------------|
| 400 | `VALIDATION_ERROR` | Missing or invalid input | "Description is required" |
| 400 | `INVALID_SCALE` | Invalid enum value | "Scale must be day, week, or month" |
| 400 | `NO_ONBOARDING_DATA` | Onboarding incomplete | "Complete onboarding before using this feature" |
| 400 | `NOT_CONFIGURED` | Service not set up | "Gmail is not configured on this server" |
| 401 | `AUTH_REQUIRED` | No token/session | "Authentication required" |
| 401 | `INVALID_TOKEN` | JWT expired/malformed | "Token is invalid or expired" |
| 401 | `INVALID_CREDENTIALS` | Wrong username/password | "Incorrect username or password" |
| 403 | `FORBIDDEN` | Wrong recovery key, etc. | "Invalid recovery key" |
| 404 | `NOT_FOUND` | Resource doesn't exist | "User not found" |
| 409 | `CONFLICT` | Duplicate resource | "That username is already taken" |
| 429 | `RATE_LIMITED` | Too many requests | "Too many requests. Try again in 60 seconds" |
| 500 | `INTERNAL_ERROR` | Unhandled server error | "Something went wrong. Please try again." |
| 500 | `AI_ERROR` | Claude API failure | "AI service is temporarily unavailable" |
| 502 | `UPSTREAM_ERROR` | Gmail/Garmin API failure | "Failed to connect to Gmail. Please try again." |

### Implementation: Global Error Handler

```python
class APIError(Exception):
    def __init__(self, code: str, message: str, status: int = 400, field: str = None):
        self.code = code
        self.message = message
        self.status = status
        self.field = field

@app.errorhandler(APIError)
def handle_api_error(e):
    body = {"error": {"code": e.code, "message": e.message}}
    if e.field:
        body["error"]["field"] = e.field
    return jsonify(body), e.status

@app.errorhandler(429)
def handle_rate_limit(e):
    return jsonify({"error": {"code": "RATE_LIMITED", "message": str(e.description)}}), 429

@app.errorhandler(500)
def handle_internal(e):
    _log.exception("Unhandled error")
    return jsonify({"error": {"code": "INTERNAL_ERROR", "message": "Something went wrong. Please try again."}}), 500
```

### Migration: Endpoint-by-Endpoint

Replace raw error returns with `raise APIError(...)`:

```python
# Before:
if not description:
    return jsonify({"error": "No description"}), 400

# After:
if not description:
    raise APIError("VALIDATION_ERROR", "Description is required", field="description")

# Before (raw exception leak):
except Exception as e:
    return jsonify({"error": str(e)}), 500

# After:
except Exception as e:
    _log.exception("log-meal failed")
    raise APIError("INTERNAL_ERROR", "Could not save meal. Please try again.", status=500)
```

### Endpoints with raw exception leaks to fix immediately

These expose Python tracebacks to the client — security risk:

| Line | Endpoint | Current | Fix |
|------|----------|---------|-----|
| 618 | `POST /api/log-meal` | `str(e)` | `"Could not save meal"` |
| 994 | `POST /api/generate-comprehensive-plan` | `str(e)` | `_AI_ERR` |
| 1114 | `POST /api/garmin/sync` | `str(e)` | `"Garmin sync failed"` |
| 1342 | `GET/POST /api/momentum/today` | `str(e)` | `"Could not compute score"` |
| 1423 | `POST /api/goal/update` | `str(e)` | `"Could not update goals"` |

### Success Response Consistency

Success responses are already mostly consistent but have two patterns:

| Pattern | Count | Example |
|---------|-------|---------|
| Action confirmation | 15 | `{"ok": true}` |
| Data return | 30+ | `{"meals": [...], "totals": {...}}` |

**Keep both patterns.** They serve different purposes:
- `{"ok": true}` for mutations where the client doesn't need the updated data.
- Data responses for queries and mutations where the client needs the result.

Add a top-level `"ok": true` to data responses only if the endpoint is a mutation (POST/PATCH/DELETE) that currently returns data. Don't change GET endpoints.

---

## 8. Pagination Plan

### Which Endpoints Need Pagination

| Endpoint | Current Behavior | Max Response Size | Pagination Needed? |
|----------|-----------------|-------------------|-------------------|
| `GET /api/history` | Returns 90 days of meals + workouts + briefs + momentum | ~20-50 KB | **Yes** — grows with user activity |
| `GET /api/saved-meals` | Returns all saved meals | ~5-10 KB (user-dependent) | **Later** — small now |
| `GET /api/saved-workouts` | Returns all saved workouts | ~2-5 KB | **Later** — small now |
| `GET /api/gmail/status` | Returns up to 100 cached emails | ~15-30 KB | **Yes** — 100 email cap is arbitrary |
| `POST /api/gmail/sync` | Returns up to 20 emails per sync | ~5-10 KB | No — already capped at 20 |
| `GET /api/momentum/history` | Returns N days of scores | ~2 KB for 14 days | No — small and parameterized |
| `GET /api/mind/today` | Returns today's tasks + 14-day history | ~3-5 KB | No — single day + bounded history |
| `GET /api/today-nutrition` | Returns today's meals + totals | ~2-5 KB | No — single day |

### Pagination Design: Cursor-Based

Use cursor-based pagination (not offset-based) for stability during writes.

```
Request:
  GET /api/history?cursor=2026-03-15&limit=30

Response:
{
  "data": { ... },
  "pagination": {
    "cursor": "2026-02-13",     // Pass this as ?cursor= for next page
    "has_more": true,
    "limit": 30
  }
}
```

### `GET /api/history` — Paginated Redesign

The current endpoint returns 90 days in a single response. For mobile:

```
GET /api/v1/history?limit=30&cursor=2026-04-17

Response:
{
  "days": [
    {
      "date": "2026-04-17",
      "nutrition": { "total_calories": 1650, "total_protein": 120, ... },
      "workouts": [{ "description": "4mi run", "calories_burned": 480 }],
      "momentum_score": 82,
      "checkins": ["morning"],
      "weight_lbs": 183.5
    },
    {
      "date": "2026-04-16",
      ...
    }
  ],
  "pagination": {
    "cursor": "2026-03-19",
    "has_more": true,
    "limit": 30
  }
}
```

**Key change:** Restructure from `{ meals: {...}, workouts: {...} }` (date-keyed objects per category) to `{ days: [...] }` (array of day objects). This is more natural for FlatList rendering and easier to paginate.

The existing `GET /api/history` stays as-is for the web app. The new `GET /api/v1/history` is the paginated version for mobile.

### `GET /api/gmail/status` — Paginated Emails

```
GET /api/v1/gmail/emails?filter=important&limit=20&cursor=<message_id>

Response:
{
  "emails": [...],
  "pagination": { "cursor": "msg_abc123", "has_more": true, "limit": 20 }
}
```

The connection status and summary stay in `GET /api/gmail/status` (not paginated).

### Default Limits

| Endpoint | Default `limit` | Max `limit` |
|----------|----------------|-------------|
| `GET /api/v1/history` | 30 | 90 |
| `GET /api/v1/gmail/emails` | 20 | 50 |
| `GET /api/saved-meals` | 50 | 200 |
| `GET /api/saved-workouts` | 50 | 200 |

---

## 9. Webhook Handling

### Current State

**No webhook endpoints exist** in the Flask app. No external service sends callbacks to the app.

### Future Webhooks Needed

| Service | Webhook | When | Purpose |
|---------|---------|------|---------|
| **RevenueCat** | Subscription events | Phase 5 (Week 19) | Entitlement changes (purchase, renewal, cancellation, billing issue) |
| **Clerk** | User events | Phase 1 (Week 2) | User created, deleted, updated (sync with local DB) |

### RevenueCat Webhook Design (Express backend)

```
POST /api/v1/webhooks/revenuecat
Auth: Shared secret in Authorization header
Rate: No limit (RevenueCat controls frequency)

Headers:
  Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>

Body (from RevenueCat):
{
  "api_version": "1.0",
  "event": {
    "type": "INITIAL_PURCHASE" | "RENEWAL" | "CANCELLATION" | ...,
    "app_user_id": "clerk_user_abc123",
    "product_id": "apex_premium_monthly",
    "entitlements": ["premium"]
  }
}

Response: 200 { "ok": true }
```

### Clerk Webhook Design (Express backend)

```
POST /api/v1/webhooks/clerk
Auth: Svix signature verification (Clerk uses Svix for webhook delivery)

Body (from Clerk):
{
  "type": "user.created" | "user.deleted" | "user.updated",
  "data": { "id": "user_abc123", ... }
}

Response: 200 { "ok": true }
```

### Implementation Notes

- Webhook endpoints are NOT needed during the Flask period. They'll be implemented directly in the Express backend (Phase 4).
- During Flask + Clerk coexistence (Weeks 2-17), Clerk user syncing happens via the `POST /api/v1/auth/clerk-verify` bridge endpoint (request-time, not webhook).
- Webhook signature verification is mandatory — never trust raw POST bodies.

---

## 10. Streaming / Real-Time Events

### Current State

**No streaming exists** in the Flask app. All requests are synchronous request-response. The only "async" pattern is onboarding profile generation, which uses a background thread + polling:

```
POST /api/onboarding/complete  →  { "queued": true }
GET  /api/onboarding/poll      →  { "status": "pending" } | { "status": "done", ... }
```

### Where Streaming Would Help

| Feature | Current Pattern | Streaming Benefit | Priority |
|---------|----------------|-------------------|----------|
| AI meal estimation | Request → 2-5s wait → full response | Stream tokens as they arrive → faster perceived response | Medium |
| AI burn estimation | Request → 2-5s wait → full response | Same as above | Medium |
| AI insights | Request → 3-8s wait → full response | Same as above | Low |
| Onboarding profile gen | Poll every 2s for 10-30s | SSE would be cleaner, but polling works | Low |
| Workout plan generation | Request → 5-15s wait → full response | Stream plan sections as generated | Low |

### Decision: No streaming for Flask. Add SSE in Express.

**Rationale:**
- Flask's WSGI architecture makes SSE difficult (requires `gunicorn` with `gevent` worker).
- The mobile app will only talk to Flask for Weeks 1-17. The 2-5 second wait is acceptable with a loading spinner.
- Express (Phase 4) natively supports SSE via `res.write()` + `Transfer-Encoding: chunked`.
- The Anthropic SDK supports `stream=True` which maps naturally to SSE in Express.

### Express SSE Design (Phase 4)

For AI endpoints that take >2 seconds, add an optional `?stream=1` query parameter:

```
POST /api/estimate?stream=1
Content-Type: application/json

{ "description": "grilled chicken with rice and broccoli" }

Response (SSE):
Content-Type: text/event-stream

event: token
data: {"partial": "Analyzing"}

event: token  
data: {"partial": "Analyzing your meal"}

event: item
data: {"name": "grilled chicken breast", "calories": 280, "protein_g": 52}

event: item
data: {"name": "white rice (1 cup)", "calories": 205, "protein_g": 4.3}

event: done
data: {"calories": 620, "protein_g": 62, "carbs_g": 55, "fat_g": 14, "items": [...], "notes": "..."}
```

### Mobile Client SSE Handling

```typescript
// Using EventSource polyfill for React Native
import EventSource from "react-native-sse";

const es = new EventSource(`${API_URL}/api/estimate?stream=1`, {
  headers: { Authorization: `Bearer ${token}` },
  method: "POST",
  body: JSON.stringify({ description }),
});

es.addEventListener("item", (event) => {
  // Render each food item as it arrives
  addItem(JSON.parse(event.data));
});

es.addEventListener("done", (event) => {
  // Final complete response
  setResult(JSON.parse(event.data));
  es.close();
});
```

### Endpoints to Add SSE in Express

| Endpoint | SSE Events | Notes |
|----------|-----------|-------|
| `POST /api/estimate` | `item` (per food), `done` (final totals) | Most impactful — used every meal |
| `POST /api/scan-meal` | `item`, `done` | Photo scanning takes 3-5s |
| `POST /api/burn-estimate` | `done` only | Usually fast (<2s) |
| `POST /api/momentum/insight` | `token` (partial text), `done` | Text streams nicely |
| `POST /api/momentum/summary` | `token`, `done` | Same |
| `POST /api/generate-comprehensive-plan` | `section` (per day), `done` | Long generation (5-15s) |

All SSE endpoints also support the non-streaming path (omit `?stream=1`) for simplicity.

---

## Implementation Checklist

### Week 1 — Flask API Refactor

- [ ] Install `flask-cors` and `PyJWT`
- [ ] Implement dual-auth `login_required` middleware (session + JWT)
- [ ] Update `uid()` helper to read from `flask.g`
- [ ] Update `client_today()` to read `X-Client-Date` header
- [ ] Add `APIError` exception class and global error handlers
- [ ] Add `POST /api/v1/auth/login` endpoint
- [ ] Add `POST /api/v1/auth/register` endpoint
- [ ] Add `POST /api/v1/auth/logout` endpoint
- [ ] Add `POST /api/v1/auth/refresh` endpoint
- [ ] Add `GET /api/v1/dashboard` endpoint
- [ ] Add `GET /api/v1/onboarding/data` endpoint
- [ ] Add `GET /api/v1/gmail/connect` (returns JSON, not redirect)
- [ ] Add `POST /api/v1/gmail/callback` (accepts code+state, returns JSON)
- [ ] Configure CORS for development origins
- [ ] Fix 5 raw exception leaks (lines 618, 994, 1114, 1342, 1423)
- [ ] Test: web app still works with session cookies
- [ ] Test: mobile can authenticate with JWT
- [ ] Test: mobile can call all 45 existing endpoints with Bearer token

### Week 2 — Clerk Bridge (if Clerk adopted in Week 2)

- [ ] Add `POST /api/v1/auth/clerk-verify` endpoint
- [ ] Update `login_required` to verify Clerk JWTs via JWKS
- [ ] Test: Clerk-authenticated mobile requests work against all endpoints

### Phase 4 — Express (Weeks 14-17)

- [ ] Implement standardized error middleware in Express
- [ ] Implement cursor-based pagination for `/api/v1/history`
- [ ] Implement SSE for AI endpoints (`?stream=1`)
- [ ] Add RevenueCat webhook endpoint
- [ ] Add Clerk webhook endpoint
- [ ] Drop all HTML-returning routes (no more `render_template`)

---

## Summary of New Endpoints

| # | Method | Path | Replaces | Phase |
|---|--------|------|----------|-------|
| 1 | POST | `/api/v1/auth/login` | `POST /login` (HTML) | Week 1 |
| 2 | POST | `/api/v1/auth/register` | `POST /login` action=register (HTML) | Week 1 |
| 3 | POST | `/api/v1/auth/logout` | `GET /logout` (redirect) | Week 1 |
| 4 | POST | `/api/v1/auth/refresh` | New (JWT refresh) | Week 1 |
| 5 | GET | `/api/v1/dashboard` | `GET /` (HTML) | Week 1 |
| 6 | GET | `/api/v1/onboarding/data` | `GET /onboarding` (HTML) | Week 1 |
| 7 | GET | `/api/v1/gmail/connect` | `GET /api/gmail/connect` (redirect) | Week 1 |
| 8 | POST | `/api/v1/gmail/callback` | `GET /api/gmail/callback` (redirect) | Week 1 |
| 9 | GET | `/api/v1/history` | `GET /api/history` (unpaginated) | Phase 4 |
| 10 | GET | `/api/v1/gmail/emails` | Part of `/api/gmail/status` | Phase 4 |
| 11 | POST | `/api/v1/webhooks/revenuecat` | New | Phase 5 |
| 12 | POST | `/api/v1/webhooks/clerk` | New | Phase 4 |

**Total routes after Week 1:** 52 existing + 8 new = **60 routes** (old and new coexist).

**Total routes after Express migration:** ~50 routes (HTML routes removed, paginated versions replace originals, webhooks added).
