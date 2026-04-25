# APEX Life Dashboard — Build Plan v2

**Path from current state to v1 release.**

Generated: 2026-04-24
Supersedes: `BUILD_PLAN_v1.md` (historical, keep for reference)

---

## Executive Summary

The mobile app has the full core-five-tabs UX shipped (Nutrition, Fitness, Social,
Momentum, Settings) with Clerk auth, Flask JWT bridge, HealthKit/Health Connect
wiring, and AI-driven workout plan + profile generation. What remains is a mix
of **(a) unblocked dev work**, **(b) connector-infrastructure scaffolding**, and
**(c) per-integration wiring gated by external approvals**.

**Total scope estimate: ~463 engineering hours to v1.**

Organized as three tracks that run in parallel once external approvals are
filed:

| Track | Scope | Hours | Can start? |
|-------|-------|-------|------------|
| **A — Unblocked dev work** | Missing features that hit no third-party API | ~108 | **Today** |
| **B — Connector scaffolding** | Shared infrastructure: `users_connectors`, OAuth state store, webhook receiver, retry/backoff, error-code contract | ~39 | **Today** |
| **C — Per-integration wiring** | 6 OAuth integrations + 3 device-native + paywall + push | ~316 | **Blocks on external approvals** |

### The single most important action this week

**File the long-lead approvals today.** Everything in Track C is blocked on at
least one of these, and their wall-clock wait times do not run in parallel with
engineering work:

| Approval | Wait time | Filing URL | Blocks |
|----------|-----------|------------|--------|
| **Plaid production** | 2–4 weeks | https://dashboard.plaid.com/team/keys | Finance tab |
| **Garmin Connect Developer** | **4–12 weeks** | https://developer.garmin.com | Fitness (HRV/sleep/activity) |
| **Microsoft Entra / Outlook OAuth** | 1–2 weeks | https://entra.microsoft.com | Time tab (Outlook side) |
| **Apple Family Controls** | ~2 weeks | https://developer.apple.com/contact/request/family-controls-distribution | Attention / screen-time data |
| **Apple Developer Program** | ~24h | https://developer.apple.com/programs/enroll ($99/yr) | All iOS distribution + HealthKit prod |
| **Google Play Console** | ~24h | https://play.google.com/console ($25 one-time) | All Android distribution |
| **RevenueCat** | ~1h to wire | https://app.revenuecat.com/signup | Paywall / entitlements |

These are in **Section 11 (Founder Action Items)** with copy-paste-ready
checklist. **File them before reading Section 1.**

---

## Table of Contents

1. [Track A — Unblocked Dev Work](#section-1--track-a)
2. [Track B — Connector Scaffolding](#section-2--track-b)
3. [Track C — Per-Integration Wiring](#section-3--track-c)
4. [Finance Tab](#section-4--finance-tab)
5. [Time Tab](#section-5--time-tab)
6. [AI Chatbot — Full Scope](#section-6--ai-chatbot)
7. [Notifications System](#section-7--notifications)
8. [Paywall + Tier Gating](#section-8--paywall)
9. [Final QA](#section-9--final-qa)
10. [Phasing & Execution Order](#section-10--phasing)
11. [Founder Action Items (URGENT)](#section-11--founder-action-items)
12. [Open Questions](#section-12--open-questions)
13. [Risks & Unknowns](#section-13--risks)

---

<a id="section-1--track-a"></a>
## Section 1 — Track A: Unblocked Dev Work (~108h)

Features that can ship today with zero external dependencies. **Start these in
parallel with Section 11 paperwork.**

### 1.1 Fitness tab — missing subsystems (~28h)

| Feature | PRD ref | Why it's unblocked | Hours |
|---------|---------|--------------------|-------|
| Workout history tab + filters (type, date range, duration, calories) | §4.1.4 | Pure DB query against existing `workout_logs` | 6 |
| Personal records auto-detection (1RM, longest run, heaviest squat) | §4.1.5 | Derivable from `workout_logs.sets` JSON | 5 |
| Weekly volume chart (sets × reps × weight per muscle group) | §4.1.6 | Already-logged data; needs chart component | 4 |
| Cardio session detail view (route map placeholder, pace, HR zones) | §4.1.7 | UI only; HR comes from Track C (HealthKit/Garmin) | 4 |
| Workout timer w/ rest-timer (audio cue at rest end) | §4.1.8 | expo-av, no external deps | 5 |
| "Done" flow → prompt user to log perceived RPE (1–10) → store on row | §4.1.9 | DB column already exists | 2 |
| Exercise library browse (filter by muscle / equipment) | §4.1.10 | Local static data in `shared/src/data/exerciseLibrary.ts` | 2 |

### 1.2 Nutrition tab — missing subsystems (~18h)

| Feature | PRD ref | Why it's unblocked | Hours |
|---------|---------|--------------------|-------|
| Meal history calendar (tap day → see meals) | §4.2.6 | Existing `meal_logs` | 4 |
| Favorites / "quick-add" tile (top 10 most-logged meals) | §4.2.7 | DB aggregation | 3 |
| Hydration widget (glasses of water, circular progress) | §4.2.8 | New single-column table | 3 |
| Weekly macro trend chart (protein/carb/fat stacked bar) | §4.2.9 | Existing data | 3 |
| Shopping list generator from weekly meal plan | §4.2.10 | AI call using existing Claude client | 5 |

### 1.3 Momentum tab — missing scoring (~14h)

| Feature | PRD ref | Why it's unblocked | Hours |
|---------|---------|--------------------|-------|
| Daily momentum score composition UI (tap pillar → see factors) | §4.4.3 | Pure frontend | 4 |
| Weekly / monthly momentum trend chart | §4.4.4 | Pure frontend | 3 |
| "What changed?" delta view (yesterday vs today factor breakdown) | §4.4.5 | Compute against `scale_snapshots` | 4 |
| Insight-of-the-day card (Claude-generated) | §4.4.6 | AI call; Claude infra exists | 3 |

### 1.4 Settings / profile polish (~12h)

| Feature | PRD ref | Why it's unblocked | Hours |
|---------|---------|--------------------|-------|
| "Export my data" → emits JSON via email (uses existing Gmail scope if connected; else shows to copy) | §7.2 | Pure DB dump + file share | 4 |
| "Delete my account" destructive flow (confirm modal, deletes all user rows + cascades) | §7.3 (GDPR) | Must ship for App Store | 4 |
| In-app version string + build number + "copy diagnostics" (last 50 API log lines) | §7.4 | expo-application | 2 |
| Light/dark theme toggle persistence (already shipped 2026-04-23) | — | **DONE** | 0 |
| Notification time-of-day preferences UI (stores to settings, read by Section 7) | §4.10.3 | Pure settings row | 2 |

### 1.5 Onboarding polish (~10h)

| Feature | PRD ref | Why | Hours |
|---------|---------|-----|-------|
| Review screen at end of onboarding (shows everything captured, "edit" affordance per row) | §3.3.8 | UX gap | 4 |
| Back button behavior across all onboarding steps (currently inconsistent) | §3.3.1 | Bug | 2 |
| "Skip this for now" affordance on non-critical steps (biometric, connections) | §3.3.9 | UX | 2 |
| Welcome carousel / value-prop screens before sign-up | §3.2 | Marketing | 2 |

### 1.6 AI chat tab shell (~14h)

Ship the UI shell without the full agent tool-calling loop (that's Section 6).

| Feature | PRD ref | Why | Hours |
|---------|---------|-----|-------|
| Chat tab entry in nav (gated behind paywall — see §8) | §4.5.1 | Route stub | 1 |
| Conversation list + new-conversation flow | §4.5.2 | Needs `conversations` + `messages` tables | 4 |
| Streaming response bubble (Claude streaming API) | §4.5.3 | Anthropic SDK supports; needs UI | 5 |
| Persistence: conversations survive app restart | §4.5.4 | DB | 2 |
| Rate limit UI (free-tier cap → upsell) | §4.5.5 | See Section 8 | 2 |

### 1.7 Misc infra (~12h)

| Feature | Why | Hours |
|---------|-----|-------|
| Sentry (or equivalent) error reporting on mobile + Flask | Required for v1 post-launch triage | 4 |
| PostHog/Amplitude event taxonomy (sign-up, onboarding-complete, first-meal, first-workout, chat-message) | Required for v1 funnel analysis | 4 |
| Backend healthcheck endpoint + Railway uptime monitoring | Required for v1 ops | 2 |
| Bug-report form in Settings → emails to founder with diagnostics attached | v1 support channel | 2 |

**Track A total: ~108h**

Nothing in Track A depends on Track B or C. Can be handed to any ICs
simultaneously.

---

<a id="section-2--track-b"></a>
## Section 2 — Track B: Connector Scaffolding (~39h)

Infrastructure that makes every per-integration wire-up in Track C fast and
uniform. **Build this before Section 3**, so each integration is "fill in the
adapter" instead of "also design the schema."

### 2.1 `users_connectors` table + CRUD layer (~8h)

**Currently:** `gmail_tokens` is a one-off table. Per integration we'd duplicate
this 6+ times.

**Replace with:**

```sql
CREATE TABLE users_connectors (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,  -- 'gmail' | 'gcal' | 'outlook' | 'plaid' | 'strava' | 'garmin'
  external_user_id TEXT,   -- provider's user id (for webhooks)
  access_token TEXT,
  refresh_token TEXT,
  expires_at INTEGER,       -- unix ts
  scopes TEXT,              -- space-separated
  status TEXT NOT NULL,     -- 'active' | 'expired' | 'revoked' | 'error'
  last_sync_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, provider)
);
```

Helper module `connectors.py`:
- `get_connector(user_id, provider) -> dict | None`
- `save_connector(user_id, provider, **fields)`
- `mark_connector_error(user_id, provider, err_msg)`
- `delete_connector(user_id, provider)`
- `get_valid_access_token(user_id, provider) -> str | None` (auto-refresh)

Migrate existing `gmail_tokens` rows via one-shot backfill script.

### 2.2 OAuth state store (~4h)

Every OAuth flow needs a CSRF-safe `state` parameter that survives the round
trip.

Table:
```sql
CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  redirect_after TEXT,
  created_at INTEGER NOT NULL  -- TTL 10 min
);
```

Helper: `create_state()`, `consume_state()` (single-use, enforces TTL).

### 2.3 Webhook receiver scaffolding (~8h)

Generic `POST /api/webhooks/<provider>` with:
- Signature verification per provider (Plaid HMAC, Gmail Pub/Sub token, Strava subscription, Outlook lifecycle)
- Idempotency key table (provider + event_id)
- Routes to a per-provider handler function
- Returns 200 fast, queues processing via thread (or APScheduler job) so provider doesn't retry

```sql
CREATE TABLE webhook_events (
  id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  processed_at INTEGER,
  status TEXT,  -- 'pending' | 'done' | 'failed'
  error TEXT,
  UNIQUE(provider, external_event_id)
);
```

### 2.4 Retry/backoff utility (~3h)

Currently **no retries anywhere** (per `INTEGRATIONS_MAP.md`). Ship a single
helper:

```python
def with_retry(fn, retries=3, base_delay=0.5, max_delay=4.0, retry_on=(5xx, Timeout, ConnectionError)):
    ...
```

Apply to: Claude API calls, every OAuth token exchange, every connector HTTP
call.

### 2.5 Structured error-code contract (~8h)

**Surfaced by Part 1 Clerk fix:** only `/api/auth/clerk-verify` returns
`error_code`. Every other endpoint returns `{"error": "generic message"}`, so
mobile can't distinguish "retry later" from "this user is dead."

Define the canonical set in `api_errors.py`:

```python
# Per endpoint, document which codes can fire.
COMMON = {
  'unauthorized', 'forbidden', 'not_found', 'rate_limited',
  'upstream_unavailable', 'validation_failed', 'server_error',
  'connector_expired',  # user must reconnect
  'connector_revoked',  # user revoked on provider side
  'paywall_required',
  'tier_gate',
}
```

Refactor all routes to return `{"ok": bool, "error_code": str|None, "error": str|None, ...payload}`.

Mobile side: single `handleApiError(error_code)` that routes to correct UX
(toast, full-screen, reconnect prompt).

### 2.6 Flask background-job runner (~8h)

Currently: everything is synchronous in the request handler, which is why
`/api/ai/generate_plan` hangs for 30+ seconds.

Options:
- **APScheduler in-process** (~4h, simplest, loses jobs on restart)
- **Redis + RQ** (~8h, survives restart, Railway supports Redis)

**Recommend RQ.** Otherwise every long-running AI call blocks a gunicorn worker.

Routes that migrate:
- Plan generation (currently 30s inline)
- Profile generation (currently 20s inline)
- Email summarization (currently 15s inline)
- Any future Plaid / Garmin sync job

**Track B total: ~39h**

---

<a id="section-3--track-c"></a>
## Section 3 — Track C: Per-Integration Wiring (~316h)

Each of these can only start once Track B §2.1–2.5 are done AND the relevant
external approval is through. Order below is by **approval-wait × business
value**: start the longest-wait integrations' paperwork first (Section 11), but
code whichever comes back first.

### 3.1 HealthKit (iOS) + Health Connect (Android) — ~28h

**Current state:** `useHealthConnection.ts` exists; onboarding "Connect" works;
steps/weight/sleep reading wired. **Gap:** no heart-rate, HRV, resting HR,
active-energy, workout-detected-by-device.

| Task | Hours |
|------|-------|
| Extend read-scope request to HR, HRV, resting HR, active energy, workouts | 4 |
| Daily sync (every app foreground → pull last 24h, dedupe by sample UUID) | 6 |
| Backfill on first connect (last 90 days) | 4 |
| Write workout data back to HealthKit when user logs in-app workout | 6 |
| Background delivery (iOS `HKObserverQuery`, Android foreground service) | 6 |
| HealthKit entitlement + App Store HealthKit justification string | 2 |

**Blocks on:** Apple Developer Program ($99/yr) for HealthKit prod entitlement.

### 3.2 Gmail — ~18h

**Current state:** Flask side is fully wired (`gmail_sync.py`, 11 functions); 7
routes exist; token refresh works. **Gap:** mobile "Connect Gmail" button
doesn't exist (onboarding has it as `coming_soon`).

| Task | Hours |
|------|-------|
| Mobile WebView OAuth flow → callback URL → store connector via §2.1 | 6 |
| Background fetch of recent emails on Time tab load | 4 |
| Summary surfacing UI (already computed server-side) | 3 |
| Gmail Pub/Sub webhook for inbox-update notifications (not polling) | 5 |

**Blocks on:** Google Cloud Console OAuth consent-screen verification if scopes
include `gmail.readonly` (restricted scope). **~4–8 weeks** if verification is
triggered. Keeping the app in "testing" mode caps at 100 test users — fine for
beta.

### 3.3 Google Calendar — ~16h

**Current state:** backend stubs only.

| Task | Hours |
|------|-------|
| Backend: OAuth flow, token store via §2.1, `gcal_sync.py` (list calendars, fetch events ±7 days) | 8 |
| Mobile: Connect button, Time-tab events list | 4 |
| Webhook channel for push updates (Google `watch()` API, renews every 7 days) | 4 |

**Blocks on:** same OAuth verification as Gmail (shared consent screen). File at
same time.

### 3.4 Outlook Mail + Calendar — ~30h

**Current state:** no code.

| Task | Hours |
|------|-------|
| Microsoft Entra app registration, OAuth (MSAL.js on mobile, MSAL Python on backend) | 6 |
| Mail fetch + summary (mirror Gmail pattern) | 10 |
| Calendar fetch (mirror GCal pattern) | 8 |
| Subscription-based webhooks (`/subscriptions` API, lifecycle renewal every 3 days) | 6 |

**Blocks on:** Microsoft Entra tenant setup, OAuth scope approval (1–2 weeks).

### 3.5 Plaid (Finance tab) — ~60h

See Section 4 for full spec. The per-integration hour estimate:

| Task | Hours |
|------|-------|
| Plaid Link mobile SDK (`react-native-plaid-link-sdk`) in Finance onboarding | 8 |
| Backend: `/api/plaid/link-token`, `/api/plaid/exchange-public-token` | 6 |
| Transactions sync (initial 30 days + webhook `TRANSACTIONS: DEFAULT_UPDATE`) | 12 |
| Accounts balance sync (daily) | 4 |
| Spending categorization (Plaid's + our overrides) | 8 |
| Budget vs actual calc + tab UI | 10 |
| Bills (recurring transactions detection) | 6 |
| Plaid webhook handler in Section 2.3 | 4 |
| Plaid "reconnect" flow (ITEM_LOGIN_REQUIRED) | 2 |

**Blocks on:** Plaid production access (2–4 weeks), needs business entity +
use-case writeup.

### 3.6 Strava — ~18h

| Task | Hours |
|------|-------|
| OAuth, connector row, token refresh | 4 |
| Activity backfill (last 90 days) | 4 |
| Subscription webhook for new activities | 4 |
| Activity display in Fitness tab | 4 |
| Reconnect flow | 2 |

**Blocks on:** Strava API usage approval (form submission, 1–2 weeks).

### 3.7 Garmin Connect — ~40h

**The highest-risk integration.** Garmin's Health API requires partner
agreement; their Connect API is also an option but undocumented and scraped.

| Task | Hours |
|------|-------|
| Partner agreement + OAuth 1.0a (yes, 1.0a, not 2.0) | 6 |
| Daily sync: steps, distance, HR, HRV, sleep, activities, body battery | 16 |
| Webhook (push-only, no polling) | 6 |
| Deduping with HealthKit (user may have both) | 6 |
| Reconnect flow | 2 |
| Garmin-native widgets in Fitness tab | 4 |

**Blocks on:** Garmin Developer Program approval (**4–12 weeks — file TODAY**).

### 3.8 Apple Family Controls (screen-time) — ~26h

| Task | Hours |
|------|-------|
| Family Controls entitlement + NSE extension | 8 |
| `ManagedSettings` / `DeviceActivity` framework integration (Swift, ejected module) | 12 |
| Daily screen-time pattern aggregation | 4 |
| Data flows to Momentum "attention" pillar | 2 |

**Blocks on:** Apple Family Controls distribution approval (~2 weeks). Also
**iOS-only**; Android has no equivalent.

### 3.9 CoreLocation / Android FusedLocation (Momentum location pillar) — ~20h

| Task | Hours |
|------|-------|
| Location permission request, always-allow justification string | 4 |
| Background location sampling (1/hr, low-power) | 6 |
| Home/work/gym cluster detection | 6 |
| Display in Momentum tab | 4 |

**Blocks on:** App Store "background location" justification — **high scrutiny**.
Apple rejects apps that use background location without clear user benefit
reason stated.

### 3.10 EventKit (device calendar read — iOS) — ~12h

Fallback for users who don't connect GCal/Outlook.

| Task | Hours |
|------|-------|
| Permission request | 2 |
| `ekEventStore.events(matching:)` bridging | 6 |
| Merge with remote calendars (dedupe by event id) | 4 |

**Blocks on:** nothing (bundled entitlement).

### 3.11 Push notifications (APNs + FCM) — ~18h

See Section 7 for scope. Per-integration:

| Task | Hours |
|------|-------|
| Expo push token registration, store on `users` row | 4 |
| APNs p8 key upload, FCM sender-id wire-up | 2 |
| Backend `send_push(user_id, payload)` helper | 4 |
| Scheduled-send job (e.g. evening check-in at user's local 8pm) | 8 |

**Blocks on:** Apple Developer Program for APNs cert; FCM requires Google Play
Console.

### 3.12 RevenueCat (paywall / entitlements) — ~20h

See Section 8 for tier spec. Per-integration:

| Task | Hours |
|------|-------|
| RevenueCat SDK install, offering + entitlement config in dashboard | 4 |
| Paywall screen UI (PRD §8 design) | 6 |
| `useEntitlement('plus')` hook everywhere we gate | 4 |
| Server-side webhook for subscription state changes (updates `users.tier`) | 4 |
| Restore-purchase flow | 2 |

**Blocks on:** RevenueCat account + App Store Connect subscription product
setup (App Store review ~24–48h).

### 3.13 Sentry / crash reporting — ~10h

| Task | Hours |
|------|-------|
| sentry-react-native + sentry-python | 2 |
| Source map upload to Sentry | 2 |
| PII scrubber config (no tokens, no email bodies, no meal text) | 4 |
| Release tagging tied to build number | 2 |

**No external blocker.** Listed in Track A §1.7 for timing.

**Track C total: ~316h** (excluding §3.13 which is in Track A).

---

<a id="section-4--finance-tab"></a>
## Section 4 — Finance Tab (~70h, subset of §3.5 + tab-specific UX)

**Status:** does not exist. PRD §4.6 describes the full spec.

### What v1 ships

| Subsystem | Hours | Ships in v1? |
|-----------|-------|--------------|
| Plaid Link + account connection (§3.5) | 14 | ✅ |
| Transaction list (past 30d, searchable, category filter) | 8 | ✅ |
| Budget (monthly cap per category, set in Settings) | 10 | ✅ |
| Spending vs budget card (Finance home) | 6 | ✅ |
| Bills upcoming (detected recurring transactions) | 6 | ✅ |
| Cash-flow chart (income − spending weekly) | 4 | ✅ |
| Net-worth (accounts balance rollup) | 4 | ✅ |
| Crypto / brokerage (Coinbase, Robinhood via Plaid Investments) | 10 | ⚠️ **cut to v1.1** |
| Bill-negotiation AI (calls creditor APIs) | — | ❌ **v2+, out of scope** |
| Tax-lot tracking | — | ❌ **v2+** |
| Receipt OCR for deductions | — | ❌ **v2+** |
| Shared household spending view | — | ❌ **v2+** |

### Data model additions

```sql
CREATE TABLE finance_accounts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  plaid_account_id TEXT NOT NULL,
  plaid_item_id TEXT NOT NULL,
  name TEXT, mask TEXT, type TEXT, subtype TEXT,
  current_balance REAL, available_balance REAL, iso_currency TEXT,
  updated_at INTEGER, UNIQUE(plaid_account_id)
);

CREATE TABLE finance_transactions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER, plaid_transaction_id TEXT UNIQUE,
  account_id INTEGER, amount REAL, iso_currency TEXT,
  date TEXT,  -- YYYY-MM-DD
  merchant_name TEXT, category_primary TEXT, category_detailed TEXT,
  pending INTEGER, category_override TEXT, note TEXT
);

CREATE TABLE finance_budgets (
  id INTEGER PRIMARY KEY, user_id INTEGER,
  category TEXT NOT NULL, monthly_cap REAL,
  UNIQUE(user_id, category)
);
```

### Dependencies

- **Blocks on Plaid production approval** (2–4 weeks, Section 11).
- Track B §2.1, §2.3, §2.4 must be done before starting.

**Finance tab v1 hours: ~62h** (excluding v1.1 items).

---

<a id="section-5--time-tab"></a>
## Section 5 — Time Tab (~55h)

**Status:** does not exist. PRD §4.7.

### What v1 ships

| Subsystem | Hours | Ships in v1? |
|-----------|-------|--------------|
| Calendar events (today + next 7 days; Google Cal + Outlook + EventKit fallback) | 8 | ✅ |
| Email summary card (Gmail + Outlook; "top 3 emails needing reply") | 10 | ✅ |
| Meeting hours / focus hours split today | 6 | ✅ |
| "Next meeting in X" card | 3 | ✅ |
| Attention pillar (screen-time from Family Controls — iOS only) | 6 | ✅ iOS / ❌ Android v1.1 |
| Time-blocking (drag to block focus time on device calendar) | — | ❌ v1.1 |
| Pomodoro integration | — | ❌ v1.1 |
| Notion / Todoist todos ingestion | — | ❌ v2+ |

### Dependencies

- Gmail OAuth (§3.2), GCal OAuth (§3.3), Outlook OAuth (§3.4) — file all now
- Family Controls (§3.8) — iOS-only, ~2wk approval
- EventKit (§3.10) — no blocker

**Time tab v1 hours: ~33h** on the tab itself (plus §3.2–§3.4, §3.8, §3.10
which are counted separately in Track C).

---

<a id="section-6--ai-chatbot"></a>
## Section 6 — AI Chatbot — Full Scope (~52h)

**Status:** infrastructure exists for one-off AI calls
(`claude_nutrition.py`, `claude_profile.py`), but **no multi-turn agent,
no tool-calling, no context assembly.**

### v1 scope

| Feature | Hours |
|---------|-------|
| Conversation persistence (§1.6 DB tables) | 4 |
| Streaming responses (Anthropic streaming API) | 5 |
| **Context assembly:** on each message, pull user's: profile_map, today's meals/workouts, weekly momentum, connected integrations summary. Inject as system prompt | 8 |
| **Tool use / function calling:** log_meal, log_workout, update_goal, set_reminder, query_transactions, generate_plan | 16 |
| Rate-limiting per tier (free: 10 msgs/day, plus: unlimited) | 4 |
| Conversation export (text file, email attachment) | 3 |
| "Memory" (long-term facts Claude should remember — e.g. "user is vegetarian") → stored on `users.profile_map` updated via tool | 6 |
| Safety: strip any tool response containing a Flask JWT before passing back to Claude | 4 |
| Tab UI polish (message bubbles, typing indicator, scroll behavior) | 2 |

### Model routing

- **Chat default:** `claude-haiku-4-5-20251001` (cheap, fast).
- **Deep-question fallback:** if message > 500 chars OR user tapped "think harder", route to `claude-opus-4-6`. Costs ~10× more; gate behind tier.
- **Tool-calling loop:** max 5 tool hops per turn, then force final answer.

### Dependencies

- Track B §2.4 (retry) — Claude gets flaky, must backoff 429s.
- Track B §2.6 (background jobs) — streaming over a long-held request is fine on Flask dev; use RQ if multi-worker becomes a scaling issue.
- Section 8 (paywall) — rate limits tie to entitlements.

**Chatbot v1 hours: ~52h.**

---

<a id="section-7--notifications"></a>
## Section 7 — Notifications System (~30h)

**Status:** notification-time-preference UI shipped in onboarding (§3.3); no
send mechanism, no templates.

### Notification types (PRD §4.10)

| Notification | Trigger | Tier |
|--------------|---------|------|
| Morning brief (weather, day's schedule, top priority) | 7am local | Free |
| Meal log reminder | 12pm / 6pm if no log yet | Free |
| Workout reminder | scheduled-workout start ± 15 min | Free |
| Evening check-in prompt | 8pm local | Free |
| Budget overspend | Plaid transaction crosses 80% budget | Plus |
| Unusual activity (heart rate spike, unusual sleep) | HealthKit event | Plus |
| AI insight of the day | after evening check-in scored | Plus |

### Implementation

| Task | Hours |
|------|-------|
| Expo push token registration (§3.11) | 4 |
| Backend `notifications` table (scheduled + sent log) | 3 |
| Scheduler (APScheduler or RQ-scheduler): fan out daily at user's local time | 6 |
| Template rendering (per-type string template with user placeholders) | 4 |
| Quiet hours (user sets 10pm–7am, no push during) | 3 |
| Digest mode (if 3+ notifications queued, batch into one) | 4 |
| In-app notification center (badge count, recent list) | 4 |
| Deep links: tap push → open correct tab | 2 |

### Dependencies

- §3.11 (push infra).
- §1.4 notification prefs UI (already in Track A).
- §4 (for budget notifs), §3.1 (for health notifs).

**Notifications v1 hours: ~30h.**

---

<a id="section-8--paywall"></a>
## Section 8 — Paywall + Tier Gating (~34h)

**Status:** zero. No tier column, no paywall UI, no entitlement checks.

### Tier design (PRD §8)

| Tier | Price | What unlocks |
|------|-------|--------------|
| **Free** | $0 | Nutrition + Fitness + Momentum core, manual logging, 10 AI chat msgs/day, 1 connected integration |
| **Plus** | $9.99/mo or $79/yr | Unlimited AI chat, all integrations, all tabs (Finance + Time), push notifications, export |
| **Founders** | $149 lifetime, first 1000 users | Plus forever |

### Schema

```sql
ALTER TABLE users ADD COLUMN tier TEXT DEFAULT 'free';
ALTER TABLE users ADD COLUMN revenuecat_user_id TEXT;
ALTER TABLE users ADD COLUMN tier_expires_at INTEGER;

CREATE TABLE entitlement_events (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,  -- 'initial_purchase', 'renewal', 'cancellation', 'expiration', 'refund'
  product_id TEXT, price REAL, iso_currency TEXT,
  received_at INTEGER NOT NULL,
  raw_payload TEXT  -- full webhook body for audit
);
```

### Work items

| Task | Hours |
|------|-------|
| RevenueCat dashboard config + SDK install (§3.12) | 4 |
| App Store Connect subscription product + screenshots + review copy | 4 |
| Paywall screen (PRD §8 design, A/B ready with two variants) | 8 |
| `useEntitlement()` hook + gating primitive (`<PaywallGate feature="chat">`) | 4 |
| Server-side webhook → updates `users.tier`, logs `entitlement_events` | 4 |
| Restore-purchase in Settings | 2 |
| Downgrade handling (tier expires → gated features hide gracefully) | 4 |
| Free-tier caps enforcement (AI chat count/day, integration count) | 4 |

### Subtleties

- **Connected-integration count:** which 1 integration counts? Let user choose; HealthKit does NOT count (it's device-native, not connector).
- **Grandfathering:** Founders tier requires special RC entitlement; store flag on user to avoid downgrade on renewal issues.
- **Receipt validation:** never trust client. All entitlement state comes from RevenueCat webhook.

### Dependencies

- §3.12 (RevenueCat).
- Apple Developer Program active for subscription products.
- Google Play Console active for Android subscriptions.

**Paywall v1 hours: ~34h.**

---

<a id="section-9--final-qa"></a>
## Section 9 — Final QA (~30h)

### Functional QA (~12h)

- End-to-end: onboarding → log day → week → check Momentum score updates
- Auth: sign up, sign out, sign in, delete account, reinstall and reconnect
- Paywall: free-tier cap hit → upgrade → restore on reinstall
- Each integration: connect → first sync → reconnect after revoke → disconnect
- Offline handling: airplane mode → log meal → reconnect → sync

### Cross-device (~6h)

- iOS 17, iOS 18 (current). iPhone SE (small), Pro Max (large), iPad (tolerated, not optimized)
- Android 13, 14, 15. Pixel + Samsung (different Health Connect versions)
- Dark mode + light mode per screen
- Large-text accessibility setting (dynamic type)
- VoiceOver / TalkBack smoke test

### Store-submission QA (~8h)

- App Store screenshots (6.5" + 5.5" iPhone, 12.9" iPad) — 10 per locale
- Play Store screenshots (phone + 7" + 10" tablet) — 8 per locale
- Privacy policy + terms of service public URL
- App Store privacy "data collected" questionnaire (HealthKit justification, etc.)
- App Store review notes with test account credentials + payment sandbox
- Age rating / content rating

### Load / perf (~4h)

- 500 meals, 200 workouts, 10k transactions seed user → all screens < 1s
- Claude timeout under slow network (throttled to 3G)
- Background sync doesn't drain battery >5%/hr

**QA total: ~30h.**

---

<a id="section-10--phasing"></a>
## Section 10 — Phasing & Execution Order

### Phase P0 — Founder Paperwork (Week 0, ~4h of human time, 4–12wk calendar time)

See Section 11. **Everything in Track C is gated on these**, so file everything
before cutting the first Track A ticket.

### Phase P1 — Unblocked + Scaffolding (Weeks 1–4, ~147h)

Run Tracks A and B in parallel.

- **Dev 1 (mobile):** Track A §1.1–§1.4 (~72h)
- **Dev 2 (backend):** Track B §2.1–§2.6 (~39h)
- **Dev 1 then pulls:** §1.5, §1.6, §1.7 (~36h) when Dev 2 frees up

**Outcome at end of P1:** every existing feature is polished, every connector
has scaffolding ready, structured errors land everywhere.

### Phase P2 — Integrations as approvals land (Weeks 2–16, staggered, ~316h)

Apply this triage rule: **start coding an integration the day its approval
clears**, not before.

Expected arrival order (approximate):

| Week | Integration | Hours |
|------|-------------|-------|
| W2 | Apple Developer Program → §3.1 HealthKit prod, §3.11 APNs | 46 |
| W2 | Google Play Console → Android distribution | — (no code) |
| W2 | RevenueCat + Apple subscription products → §3.12, §8 | 54 |
| W3–4 | Outlook (Entra) → §3.4 | 30 |
| W4–5 | Google OAuth verification (Gmail + GCal) → §3.2, §3.3 | 34 |
| W4–5 | Family Controls → §3.8 | 26 |
| W5–6 | Plaid prod → §3.5 + Section 4 | 122 |
| W6–7 | Strava → §3.6 | 18 |
| W8–16 | Garmin → §3.7 | 40 |

### Phase P3 — Tab builds (overlap with P2, ~87h)

- **Section 4 Finance** (62h): starts when Plaid lands
- **Section 5 Time tab shell** (33h): starts when Gmail/GCal/Outlook land in any order; wire providers as they clear
- **Section 6 Chatbot** (52h): unblocked, can start in P1 actually — move to P1 if Dev 1 has slack
- **Section 7 Notifications** (30h): starts after §3.11
- **Section 8 Paywall** (34h): starts after §3.12

### Phase P4 — QA + soft-launch (2 weeks, ~30h)

Section 9.

### Phase P5 — Launch (Week 20)

- Submit iOS build to App Store (review 24–48h)
- Submit Android build to Play internal testing → closed beta → production (~1 week)
- Stagger rollout 10% / 50% / 100% over 5 days

### Total wall-clock

- Solo founder, 20 hrs/wk coding: ~23 weeks
- Solo founder, 40 hrs/wk coding: ~12 weeks
- Founder + 1 contractor mobile, 40 hrs/wk combined: ~8 weeks (assuming Garmin lands)

**Garmin is the long pole.** If Garmin approval slips past week 12, ship v1
**without** Garmin and add in v1.1.

---

<a id="section-11--founder-action-items"></a>
## Section 11 — Founder Action Items (URGENT)

**Do these today.** Every day you wait pushes v1 back one calendar day. These
approvals run on their clock, not yours.

### This week — file all of these

- [ ] **Plaid** — https://dashboard.plaid.com/team/keys — request production access. Need: business entity (LLC/Inc), use-case writeup ("personal finance tracking, read-only, no money movement"), expected MAU, consumer-facing privacy policy URL. **2–4 week wait.**
- [ ] **Garmin Connect Developer Program** — https://developer.garmin.com — apply for Health API partnership. Need: product description, data-use disclosure, consumer privacy policy. **4–12 week wait. FILE FIRST.**
- [ ] **Microsoft Entra ID (Outlook OAuth)** — https://entra.microsoft.com — create app registration, request Mail.Read + Calendars.Read scopes, fill out publisher verification. **1–2 week wait.**
- [ ] **Apple Family Controls distribution** — https://developer.apple.com/contact/request/family-controls-distribution — required for screen-time data on shipping builds. **~2 week wait.** iOS-only.
- [ ] **Apple Developer Program** — https://developer.apple.com/programs/enroll — $99/yr — needed for HealthKit production, APNs, App Store distribution. **~24h.** If you haven't already.
- [ ] **Google Play Console** — https://play.google.com/console — $25 one-time — needed for Android distribution. **~24h.**
- [ ] **Google Cloud Console — OAuth consent screen** — https://console.cloud.google.com/apis/credentials/consent — configure + file for verification if using restricted scopes (gmail.readonly is restricted). **4–8 week wait** if verification triggered. Otherwise keep in "testing" mode for ≤100 users during beta. Covers both Gmail and GCal.
- [ ] **Strava API app** — https://www.strava.com/settings/api — fill form, ~1–2 week response. Low risk.
- [ ] **RevenueCat** — https://app.revenuecat.com/signup — free tier fine until $10k/mo MRR. Create offering + entitlements + link to Apple/Play. **~1h of work.**
- [ ] **App Store Connect subscription products** — after Apple Developer Program active, create Plus-monthly + Plus-yearly + Founders-lifetime SKUs. **App Store review 24–48h per product, first time.**

### Business prerequisites (before you file the above)

- [ ] **Business entity** — LLC or Inc. Plaid and Garmin both require this. Use Stripe Atlas or clerky.com if you don't have one. **~1 week.**
- [ ] **Privacy Policy URL** — live before any of the OAuth filings. Can use Iubenda or Termly ~$10/mo. Required by Plaid, Garmin, Apple, Google.
- [ ] **Terms of Service URL** — same tool as above.

### Once P1 is underway

- [ ] **App Store screenshots** — budget design time or hire a Fiverr designer ($200–400). Needed for submission. 10 images per locale, 3 locales minimum (en-US + 2 major).
- [ ] **Support email** — `support@apexlife.app` or similar. Required in App Store Connect.
- [ ] **Marketing site** — even a single page at the domain. Apple rejects App Store listings with no website.
- [ ] **Sentry / analytics accounts** — both free tiers fine for v1. Create before §1.7.

---

<a id="section-12--open-questions"></a>
## Section 12 — Open Questions

Decisions needed from founder before engineering can proceed cleanly.

### 12.1 Free-tier integration count — which 1?

PRD §8 says "1 connected integration" on free tier. Unclear:
- Does HealthKit count? (**Recommend: no** — it's device-native, not a connector)
- Does Gmail count if user only uses it for the summary, not chat? (**Recommend: yes** — it's an OAuth connection)
- Can user swap which integration is "the free one" freely, or is there a cooldown? (**Recommend: swap at any time, no cooldown**)

### 12.2 Data residency

PRD doesn't specify. Plaid and Garmin may require US-only data storage.
- Where does Railway host Flask? (Railway US-West default is fine for v1 US-only launch)
- Does Flask data get replicated / backed up anywhere else?

### 12.3 Cancel / refund policy

Apple requires this on paywall screen. What's the policy?
- Trial length? (Recommend 7 days free trial)
- Refund within 30 days? (Apple handles all refunds, we don't touch)
- Does cancelling mid-month downgrade immediately or at period end? (Recommend period end, standard)

### 12.4 Chatbot "memory" limits

Claude context window is huge but cost scales with it. Per turn, we inject:
profile + today + week summary. Question:
- Should conversation history in-context be capped at last N turns? (Recommend last 20)
- Should long-term "memory facts" have a max count? (Recommend 50)
- If hit cap, LRU-evict or prompt user to trim?

### 12.5 Garmin fallback

Garmin approval could take 12 weeks and arrive during beta, or never. Decide
now: **if Garmin isn't approved by Phase P4 start, ship v1 without it and
market it as a v1.1 feature.** Without this pre-commitment we'll delay launch
waiting on it.

### 12.6 Android HealthKit parity

Health Connect covers most of HealthKit but not HRV (as of 2026-04). Decision:
- Show HRV as "iOS only" in Android with an info tooltip? (Recommend yes)
- Or block the HRV-dependent parts of Momentum score on Android? (Recommend no — fall back to other pillars)

### 12.7 Family Controls on Android

No equivalent API exists. Decision:
- Ship Attention pillar iOS-only in v1? (Recommend yes, marked with "iOS" badge)
- Use Android's Digital Wellbeing export (user must manually export a JSON)? (Too clunky, skip v1)
- Request `PACKAGE_USAGE_STATS` permission on Android (restricted, may block Play approval)? (High risk, skip v1)

### 12.8 Notification cadence floor

If user enables every notification type, they get 5–10/day. Too many.
- Enforce max N per day, batching rest into digest? (Recommend max 5/day, digest for over)
- Let user set their own cap? (Settings row: "max 3/5/10/unlimited per day")

### 12.9 Marketing name

App name throughout code is a mix of "APEX Life Dashboard" and "Life Dashboard."
App Store listing needs one chosen. Decide before submission, not during.

---

<a id="section-13--risks"></a>
## Section 13 — Risks & Unknowns

### 13.1 Garmin approval is the critical path

**Probability of 8+ week wait: ~60%.** Mitigation: commit upfront to shipping v1
without Garmin if it's not approved by P4. Do NOT let it block launch.

### 13.2 Google OAuth verification for Gmail restricted scope

If Google triggers security review, can take 4–8 weeks. Mitigation: during
beta, keep OAuth app in "testing" mode (capped at 100 test users) and verify in
parallel with beta. Only block launch if we need >100 users before verification
returns.

### 13.3 Apple HealthKit rejection risk

Apple rejects apps that "don't show user benefit" for HealthKit reads. Our
onboarding connects HealthKit for many scopes in one prompt. Mitigation: split
into per-feature prompts ("connect heart rate for Momentum" etc.), clear
per-scope justification strings. **~4h added to §3.1.**

### 13.4 Background location rejection risk

Apple has high scrutiny on background location. Our Momentum "home/work/gym"
detection may fail review. Mitigation: present as an opt-in with big clear
benefit language, OR downgrade to foreground-only sampling (acceptable if user
opens app 3+ times per day, which dashboard users do).

### 13.5 Plaid costs at scale

Plaid charges per-item per-month (~$0.25–$1.00). At 10k users x 2 items avg =
$20k–$80k/mo. Not a v1 risk (we'll have <1k users) but monitor from day 1.
Surface account-count in admin view (Track A §1.7 dashboards).

### 13.6 Claude API cost bloat

Chatbot + deep-insight features can easily hit $5/user/mo on Opus. Mitigation:
- Default route to Haiku, upsell Opus as a Plus perk
- Rate-limit free tier hard (10 msgs/day)
- Track per-user token spend; alert if a single user exceeds $3/mo in AI cost

### 13.7 SQLite at scale

SQLite is fine through ~10k users. Beyond that, migrate to Postgres. Plan the
migration path in v1.1. For v1, acceptable.

### 13.8 Single-developer bus factor

Everything routes through one founder today. If coding velocity drops (illness,
fundraising, etc.), the P5 launch slips linearly. Mitigation: hire one
contractor mobile dev for Phase P3 (tab builds) = parallelizes 87h of work.

### 13.9 HealthKit sample deduplication correctness

If user has Apple Watch + Fitbit + Garmin all writing to HealthKit, we'll
double-count. Mitigation: dedupe by `sourceRevision.source.bundleIdentifier`
AND `startDate`; trust the highest-priority source per user preference. **~4h
added to §3.1.**

### 13.10 Surfaced during Part 1 Clerk fix — these need attention

- **`users` table schema is minimal.** No `email` column; email lives in
  `profile_map` JSON. This breaks `GDPR SAR` (§1.4 export) and makes every
  user-lookup-by-email query slow. **Add `users.email` column + backfill from
  profile_map.** ~2h, put in Track A §1.7.
- **No `users_connectors` table** (acknowledged — Track B §2.1).
- **Inconsistent `error_code` across API** (acknowledged — Track B §2.5).
- **Email in profile_map JSON, not users row** — same as first bullet. Store in
  `users.email` indexed UNIQUE once backfill completes.

---

## Appendix — What is NOT in v1 (explicit cut list)

Shipping a smaller v1 is more important than shipping everything. These are
**deliberately cut**; do not let scope creep pull them back in.

- Bill-negotiation AI (calls creditor APIs) — v2
- Tax-lot tracking, receipt OCR — v2
- Shared / household views — v2
- Strava route-map rendering — v1.1 (show list only)
- Pomodoro + time-blocking — v1.1
- Notion / Todoist — v2
- Web version of the app — v2 (mobile-only at v1)
- Watch app (Apple Watch / Wear OS) — v2
- Android Attention pillar (Family Controls equivalent) — v1.1 or v2
- Crypto / brokerage via Plaid Investments — v1.1

Ship these in v1.1 / v2 as differentiators to drive re-engagement, not as v1
dependencies.

---

**End of BUILD_PLAN_v2.**
