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

## Section 14 — Vision v1.5: AI-Assisted Timeline + Deep Connectors

**Added 2026-04-28** after the C1 OAuth integrations (Gmail, Calendar,
Outlook, Strava, Health Connect, Location, Screen Time) shipped end-to-end.
This section captures the *post-C1* horizon: what to build with the data
we now have, plus the architectural pivots the founder approved that
override earlier PRD decisions.

The thrust: **stop pretending the Day Timeline can be entirely
deterministic, stop pre-summarizing for the chatbot, and go deep on
each connector instead of skimming.** The category-defining angle is
the *combination* — every wellness app has 3 connectors; the
differentiator is fusing 10 signals into a queryable life log.

---

### 14.1 PRD overrides (approved 2026-04-28)

The following PRD §4.6 / §4.7 statements are **superseded** by this
section. Update the PRD in the same revision that ships these features.

| PRD location | Old statement | New direction |
|---|---|---|
| §4.6.5 (timeline) | "Entirely deterministic aggregation. No AI insights." | Two-tier blocks: deterministic *hard* blocks + AI-labeled *soft* blocks for gaps |
| §4.6.13 (patterns) | "All patterns are computed deterministically by templated strings, NOT AI." | Hybrid: templated strings for known metrics; Haiku synthesis for cross-domain insights |
| §4.7.10 (chatbot context) | "9 typed containers, ~3.9K target / ~5.9K cap tokens" | Three tiers (always-on / day-stream / historical), max ~18K tokens. Containers stay as the schema, but we send full event-log JSON not lossy summaries |
| §4.6.5 (no Strava map) | "v1.1 — show list only" | v1.5 — render route polyline as map view. Same for elevation/HR/pace charts. |

---

### 14.2 Day Timeline — the architectural pivot (~22h)

**The problem:** Without AI, the timeline is full of unlabeled gaps.
A 9–11am Tuesday with no calendar event, no movement, no transaction
shows blank. Users perceive that as "broken" not "your app doesn't know."

**Two-tier solution:**

#### 14.2.1 Hard blocks — deterministic (~6h)
- Build `day_timeline_events` table: `(user_id, date, start_iso,
  end_iso, kind, source, title, metadata_json, confidence)`
- **Sources collected:** calendar events (Gmail+Outlook), workouts
  (workout_logs + Strava + Health Connect sessions), transactions
  (finance_transactions), email send/receive timestamps (gmail_cache +
  outlook_emails received_at), task completions (mind_tasks
  completed_at), location samples (location_samples), screen-time
  high-engagement intervals (>10 min single-app from screen_time_daily
  + future event-level UsageStats data), sleep sessions (health_daily +
  Strava sleep)
- **Block-priority rules:** Sleep > Workout > Meeting > Meal >
  Screen-time > Location > Email/Task. When two hard blocks overlap,
  higher-priority wins; lower becomes nested annotation.
- **Confidence**: 1.0 for hard blocks (we have a real event with real
  timestamps).

#### 14.2.2 Soft blocks — AI-labeled gap inference (~10h)
- For every gap ≥ 30 min between hard blocks during the user's awake
  window: spawn a Haiku call with a structured prompt:
  ```
  Window: 09:23–11:15 (1h52m)
  Surrounding context:
    - Last hard block ended 09:23: "Email reply to client (3 msgs)"
    - Next hard block starts 11:15: "Meeting: Standup"
    - Screen-time during gap: VS Code 47min, Slack 12min, Chrome 8min
    - Location: home (lat/lon cluster matches "home" centroid)
    - HR samples avg 62 bpm (resting band)
  Label this block as one of:
    deep_work | shallow_work | break | commute | errand |
    social | meal | exercise | rest | unknown
  Return: { label, confidence_0_to_1, reason }
  ```
- Cache results — keyed on `(user_id, date, start_iso, end_iso, sources_hash)`
  so re-runs return cached labels until source data changes.
- Confidence floor: < 0.5 → display as "unlabeled" not the AI's guess.
- User long-press → reclassify menu (writes manual override; AI
  respects override on next recompute).

#### 14.2.3 Computation infrastructure (~4h)
- Extend the existing `_score_snapshot_worker` cron in
  [app.py:4215](app.py:4215) to spawn a sibling `_timeline_worker`
  thread.
- Nightly at 03:00 user-local: rebuild full previous-day timeline.
- Every 15 min during user's awake window: incremental update for today.
- Migrate to RQ + Redis when production traffic grows (separate v1.6
  task per §2.6).

#### 14.2.4 Mobile UI (~2h)
- Extend [time.tsx Timeline sub-tab](mobile/app/(tabs)/time.tsx) from
  EmptyState to a vertical block list. Each block: time range, kind
  icon, title, metadata pill row, tap → bottom sheet with raw events.
- Compact "now strip" on Today sub-tab: most recent + next block.

---

### 14.3 Patterns view — hybrid deterministic + AI synthesis (~14h)

PRD §4.6.13 said "templated strings, NOT AI." Override: combine.

#### 14.3.1 Deterministic patterns (~6h)
Implement the templates the PRD specified — purely statistical:
- Wake-time variance (std dev of sleep end times)
- Top-3 apps by week (from screen_time_daily.top_apps_json)
- Workout adherence (% of days with workout_logs entry)
- Spending category trends (current month vs. 3-month avg)
- Sleep-vs-rest-day correlation (avg sleep_minutes on workout vs. non-workout days)
- Meeting density (avg meetings/day weekday vs. weekend)
- Location consistency (% of nights at home cluster)
- Email response time trend (avg unreplied-duration over 30d)

Each renders as a one-line card with sparkline.

#### 14.3.2 AI synthesis (~6h)
Once per week (Sunday night cron), pass the deterministic patterns +
the user's profile to Haiku with prompt:
```
You are looking at a week of patterns for the user. Find ONE
non-obvious cross-domain insight. Examples:
- "You sleep 38 min more on workout days"
- "Your email response time slows by 2h on Mondays"
- "Days you spend > 3h in code editors, you log fewer meals"
Return: { insight_text, sources_used, confidence }
Don't fabricate — only state what the data supports. If nothing
notable, return null.
```
Display as "Insight of the week" card at top of Patterns view.

#### 14.3.3 Storage + UI (~2h)
- `life_patterns` table per PRD spec
- Patterns view (mobile/app/(tabs)/time.tsx PatternsView component)
  renders deterministic cards + AI insight card. Refresh weekly via cron.

---

### 14.4 Chatbot context overhaul — three-tier loading (~10h)

#### 14.4.1 Architecture
Replace the current 9-container assembly in
[chatbot.py:_life_context](chatbot.py:391) with three explicit tiers:

| Tier | When loaded | Contents | Token budget |
|---|---|---|---|
| Always-on | Every query | Profile, goals, today's scores | ~2K |
| Day-stream | Every query | Full structured event log of TODAY (every email subject/sender/time, every event title/start/end, every transaction merchant/amount, every workout, every location sample, screen-time bucket per hour, every task), plus YESTERDAY's labeled timeline JSON | ~5–8K |
| Historical | When chatbot detects "trend / week / month / pattern / how have I been" intent | Last 7 / 30 / 90 days of timelines + patterns | ~10K |

Total max: ~18K. Haiku handles 200K. The PRD's 8K cap was over-cautious.

#### 14.4.2 Implementation (~6h)
- Extend `_life_context()` to return raw event lists, not summaries
- Add `_day_stream_context(user_id, day)` that produces the
  per-second event log with metadata
- Add `_historical_context(user_id, intent)` triggered only by intent
  classification (cheap Haiku call: "is this a historical query?")
- Update consent filter to walk the new richer tree

#### 14.4.3 Cost guardrails (~2h)
- Per-user per-day Haiku token cap (default: 100K input tokens/day)
- Tier-2/3 loading throttled if user is over their cap
- Track in `chatbot_audit` table

#### 14.4.4 Privacy (~2h)
- The day-stream tier carries raw email subjects + senders. Privacy
  filter must aggressively redact based on user's consent toggles.
- Add per-source redaction depth: "block contents" / "block subjects" /
  "block both"

---

### 14.5 Connector depth — go from skim to deep (~30h)

Current state: we extract 6/30 Strava fields, daily aggregates only
from Health Connect, basic event metadata from calendars. Each
connector is 10× richer than what we surface.

#### 14.5.1 Strava deep dive (~10h)
- **Polyline → map view**: render route on react-native-maps with
  start/finish markers. Tap a workout in history → fullscreen map.
  Single biggest perceived-quality jump in the app.
- **Splits / laps**: per-mile or per-km pace breakdown
- **HR zones**: chart % of activity in zones 1–5
- **Elevation profile**: line chart with cumulative gain
- **Power data** (cycling): if available
- **Weather context**: pull from openweather API given start coords
- New `strava_activity_detail` table for the rich fields

#### 14.5.2 Health Connect granular pulls (~8h)
- **Sleep stages** (REM / deep / light / awake) — currently storing
  only total sleep_minutes
- **Per-hour heart rate** for HRV trend graphs
- **Step count by hour** — drives Day Timeline movement blocks
- **Body weight history** — replaces manual weight logging when
  connected
- **Blood oxygen, body temperature** — opt-in granularity for users
  with newer Wear OS / Pixel devices
- New `health_samples` table (already declared in PRD §4.6.15) for
  granular series

#### 14.5.2b Health Connect — write a custom Expo Module (~8h, BLOCKING)

**Background:** We tried integrating `react-native-health-connect` (the
matinzd library, the only viable RN Health Connect lib at this time).
After 4 hours of debugging across two EAS rebuilds, multiple version
pins (`^3.0.0` → `^3.4.0`), and a settings-redirect workaround, we hit
a wall: **the app doesn't appear in Health Connect's app list at all**,
which means HC's PermissionController has never seen us.

**Three failure modes stacked:**
1. `requestPermission()` crashes with
   `kotlin.UninitializedPropertyAccessException: lateinit property
   requestPermission has not been initialized` — the library's
   `HealthConnectPermissionDelegate.launchPermissionsDialog` tries to
   use an `ActivityResultLauncher` that's never bound under Expo's new
   architecture.
2. `openHealthConnectDataManagement()` workaround failed — wrong arg
   shape (expects string, got an array of perms; even with right shape,
   only opens HC's general data management, not our app's perm page).
3. `openHealthConnectSettings()` workaround opens HC fine, but we
   don't appear in HC's app list because step (1) never successfully
   triggered the registration intent.

**Conclusion:** The matinzd library's permission flow is fundamentally
incompatible with Expo SDK 54 + new architecture in our setup. No JS
or config-plugin tweaking gets it working.

**The fix:** Replace it with our own custom Expo Module, following the
exact pattern of [`mobile/modules/usage-stats/`](mobile/modules/usage-stats/)
which we shipped successfully in the same session.

**Module scope (~8h):**
1. **Scaffold** `mobile/modules/health-connect/` (~1h):
   - `expo-module.config.json` declaring our `HealthConnectModule`
   - `package.json` (local file dep)
   - `android/build.gradle` using `expo-module-gradle-plugin`
   - `index.ts` TypeScript binding via `requireNativeModule`
2. **Kotlin module** `HealthConnectModule.kt` (~4h):
   - `getSdkStatus(): Int` — wraps `HealthConnectClient.getSdkStatus()`
   - `requestPermissions(perms: List<String>): Promise<List<String>>` —
     uses `PermissionController.createRequestPermissionResultContract()`
     wired to our own ActivityResultLauncher (registered properly in
     `Module.OnActivityCreates` lifecycle hook)
   - `getGrantedPermissions(): Promise<List<String>>` — direct read
   - `readRecords(recordType, range): Promise<RawRecords>` — generic
     reader, returns JSON map
   - `openHealthConnectSettings()` — fires the system intent
3. **AndroidManifest entries** (~1h):
   - `<activity-alias>` for `android.intent.action.VIEW_PERMISSION_USAGE`
     pointing at our MainActivity
   - All HC `<uses-permission>` declarations (already in app.json but
     verify they merge correctly)
4. **TypeScript wrapper + hook update** (~1h):
   - Strip `react-native-health-connect` from package.json
   - Rewrite [useHealthData.ts](mobile/lib/hooks/useHealthData.ts) to
     point at our local module
5. **Test on device** (~1h): verify app appears in HC's list, perms
   grant, data reads work for all 5 record types we care about.

**Why we own this layer:** Health Connect is foundational data —
sleep, HR, HRV, steps, active calories. It feeds Day Timeline, Patterns,
half the Fitness subsystem cards, and chatbot LifeContext. We cannot
afford a third-party library that breaks on every Expo SDK upgrade or
new-arch change. Owning the wrapper costs 8h once; saves 4h every time
the library breaks again.

**Status as of 2026-04-28 (later that morning):** ✅ DONE. Custom Expo
Module shipped at [`mobile/modules/health-connect/`](mobile/modules/health-connect/).
Same template as `usage-stats`. Highlights:

- **`activityResultRegistry.register(key, contract)` instead of
  `registerForActivityResult(...)`** — this is the architectural pivot
  that fixes the lateinit issue. The registry-based form can be
  invoked outside `onCreate`, which is exactly what we need to launch
  permission requests from a JS-driven Promise callback.
- AndroidManifest declares `<activity-alias>` with the
  `VIEW_PERMISSION_USAGE` intent filter pointing at MainActivity, so
  HC's "more info" links route back to our app correctly.
- `<queries>` block ensures Android 11+ can resolve the HC provider
  package.
- Single `readDailyAggregates(date)` Kotlin entry point that pulls
  Steps + SleepSession + HeartRate + HRV + ActiveCalories in one
  coroutine, returns a JS-friendly map. No per-record JNI roundtrips.

Removed `react-native-health-connect` from package.json. Wired
`health-connect` as a `file:` dep alongside `usage-stats`.

User runs `npm install && npx eas-cli build --profile development
--platform android` to ship.

#### 14.5.3 Calendar enrichment (~4h)
- **Travel-time inference**: if event has location, compute drive time
  from previous event's location via Google Maps Distance Matrix API.
  Surface as "leave by HH:MM" annotation.
- **Conflict detection**: flag overlapping events
- **Recurring vs. one-off**: surface in event metadata
- **Free-time block detection**: gaps ≥ 1h between events tagged as
  "available" — feeds Day Timeline soft-block inference

#### 14.5.4 Email enrichment (~5h)
- **Auto-categorization** (Haiku-labeled, cached per sender):
  newsletters / work / personal / finance / spam-ish
- **Calendar event extraction from email content**: parse flight
  bookings, restaurant confirmations, package delivery times. Auto-add
  to a "detected events" stream.
- **Attachment metadata** (filename, size, type): adds context to
  email summaries

#### 14.5.5 Background GPS + actually-useful Location surface (~10h core, ~2h review prep)

**Current state (post-this-session):** Location connects (with a
two-tap UX hiccup) and stores foreground samples — but the data does
**nothing** in the UI. The Location card on Time tab shows
"N samples logged today · Last: 41.2345, -73.4567." Coordinates
mean nothing to a human. Every other feature that should consume
location (Day Timeline, Patterns, chatbot) ignores it because there's
nothing usable to consume.

This section is now a v1.5 P0 — Location is the most-flattering data
source we have (constant, granular, easy to interpret) and the
worst-surfaced.

##### 14.5.5.a Background sampling (~3h)
- Switch [useLocationConnector.ts](mobile/lib/hooks/useLocationConnector.ts)
  from foreground-only to expo-location's background mode via
  expo-task-manager
- **Sample policy**: 1 sample per 15 min when foregrounded, 1 per 30
  min when backgrounded, suppress if speed < 1 m/s for last 3 samples
  (user is stationary, no new info)
- **Permission prompt**: clear "always allow" justification string for
  app.json
- Same `location_samples` table — just more rows, with `source` field
  distinguishing foreground / background.

##### 14.5.5.b Cluster detection (home / work / known places) (~3h)
- Backend job: every night for the past day, run DBSCAN-style
  clustering on `location_samples` for the user. Each cluster gets a
  `(centroid_lat, centroid_lon, sample_count, first_seen, last_seen,
  total_dwell_minutes)`.
- Top cluster by total_dwell_minutes → label "home" automatically
  (highest dwell time over a 30-day window).
- Second-highest cluster during weekday 9am–5pm → label "work" when
  the user has work schedule signals.
- Other clusters → "place 1, place 2, …" until user names them.
- Store in new `location_clusters` table.

##### 14.5.5.c Reverse geocoding (~2h)
- For each cluster centroid, call Google Maps Geocoding API once
  (cached forever). Returns nearest establishment / address — gives
  us "Starbucks on 3rd Ave" instead of `41.234, -73.456`.
- Free tier on Google Maps: 200 reverse-geocode calls/month plenty
  for v1; 1 call per new cluster, ~5–10/user/month.
- Store the geocoded place name on the cluster row.

##### 14.5.5.d Location card redesign (~2h)
Replace the current "X samples · Last lat/lon" with:
- Tiny **map preview** (react-native-maps) showing today's path, with
  dots at clusters and a line connecting them in time order. Tap →
  fullscreen map.
- "Places visited today" list: 3 rows max, each with the
  geocoded name + dwell time + arrival time.
- "Currently at" pill if user has a sample in the last 15 min that
  matches a known cluster.

##### 14.5.5.e Wire location into rest of app (~1h)
- **Day Timeline (§14.2)**: location samples already feed soft-block
  inference; cluster names now feed the labels too ("Coffee shop
  block: 8:15–8:45 at Starbucks 3rd Ave").
- **Chatbot context (§14.4)**: day-stream tier includes the day's
  cluster timeline, not raw samples.
- **Patterns (§14.3)**: deterministic templates for
  "% nights at home cluster" and "average commute time."

##### 14.5.5.f Apple/Google review prep (~2h)
Write the App Store / Play Store reviewer notes BEFORE submission:
> "Background location is used to reconstruct the user's daily
> timeline at a 30-min resolution. Data is stored on the user's
> device and our backend; never sent to third parties. Users can
> revoke at any time from system Settings or in-app. The app
> degrades gracefully without location — most features still work."

This is the #1 cause of v1 launch rejection. Get the wording right
before the build is submitted, not after.

##### 14.5.5.g Connect-flow UX fix (~1h)
**Bug from this session:** Location required two attempts to connect,
and the "Sample now" button is exposed during the connect flow,
which is confusing. The current alert-driven flow is also fragile.
- Replace alert chain with a proper modal: permission intro →
  request → first-sample → done. Single flow, no "Sample now"
  branch during connect.
- The post-connect "Sample now" is fine as a manual trigger on the
  connected tile, but it shouldn't appear in the disconnected state.

---

### 14.6 New connectors to add (~26h total, prioritized)

Beyond what's in §3.1–§3.13 of this build plan. Priority order based
on cost-to-build vs. unique-signal-added:

#### 14.6.1 Google Tasks (~3h, recommended next)
Same Google OAuth project we already have. Add `tasks.readonly` scope
to the consent screen. Surface in Time tab Tasks subsystem alongside
mind_tasks. New user gets ALL their existing todos imported.

#### 14.6.2 Photo metadata (geotags + EXIF) (~6h)
expo-media-library + expo-image-manipulator. Pull *only* timestamp +
GPS coords + filename — never image content. Massive privacy-friendly
"where you were" backfill: places the user took photos of are places
they cared about.
- Backfill last 90 days on connect
- New `photo_locations` table

#### 14.6.3 GitHub events (~4h)
GitHub OAuth → user's commits, PRs opened/merged, issues. For tech
users this is a high-fidelity productivity signal — commit clusters
== focus blocks, late-night commits == bad sleep predictor.

#### 14.6.4 AI tool exports (~10h, ambitious / differentiating)
Allow user to import ChatGPT / Claude.ai / Cursor conversation
exports (each platform offers JSON export). Build a parser per
platform, store as `ai_conversations` table. Surface "AI activity log"
on Time tab — not just count, but topic clustering ("3h on coding
questions, 1h on travel planning").
- This is uncopied. Every wellness app ignores AI usage. We treat it
  as a first-class productivity / focus signal.

#### 14.6.5 Phone wake events (~3h)
Extend our custom `usage-stats` Expo Module
([modules/usage-stats](mobile/modules/usage-stats)) to also expose
`UsageEvents` API. Phone wake-up timestamps → more accurate sleep
onset / wake detection than Health Connect's sleep sessions for many
users.

#### 14.6.6 Deferred to v2
- Spotify (~5h) — fun but lower utility
- Pocket / Instapaper (~6h each) — niche
- Notion / Obsidian (~10h+) — Notion API limited, Obsidian local-only
- Apple Pay receipts — partial (Wallet API doesn't expose enough)

---

### 14.7 Workout builder rewrite — port the Flask UX (~8h)

Founder feedback: current React Native workout builder feels worse
than the Flask PWA version. Root cause analysis:

**Flask version has** (per templates/index.html + claude_nutrition.py):
- Plan caching with stored `quiz_payload` for cheap re-generation
- `understanding` text that explains WHY the plan is what it is —
  cached separately, not regenerated on every load
- "Revise plan" flow: user types natural-language change ("more cardio,
  less leg day") → AI re-runs with stored quiz + plan + change request
- CRUD on saved plans (multiple plans, user picks active)

**React Native version is missing:**
- No revise flow on the front-end (backend route exists at
  /api/workout-plan/revise)
- Plan + understanding regenerated together = slower perceived
- No "show me how you built this" expandable section linking sources

**Plan:**

Audit on 2026-04-28 found most §14.7 work was already done — the
`react-native` workout-plan code is more mature than the Phase Log
and PRD-survey suggested. The original 4 plan items were:

1. ✅ Port Flask UX patterns — done. `mobile/app/settings/workout-plan.tsx`
   has AI Import + Manual Builder + AI Build (chip wizard).
2. ✅ Revise flow with text input → POST `/api/workout-plan/revise` —
   live in [`mobile/app/fitness/plan/index.tsx`](mobile/app/fitness/plan/index.tsx) lines 114–131.
3. ✅ `understanding` displayed — Settings card line 60–64 + plan view
   line 181–188.
4. ✅ "How we built your plan" expandable — plan view line 190–225
   resolves source `shortName`s back to full citations.

**Remaining gaps surfaced by the audit (NEW work for this phase):**

5. **Pre-populate builder from `quiz_payload`** — PRD §4.3.10 specifies
   "Edit Plan opens the Workout Builder with pre-populated answers",
   currently `mobile/app/fitness/plan/builder.tsx` always seeds with
   defaults. Pass `quiz_payload` as a URL search param on entry; the
   builder's `useState` initialisers read from it.
6. **Inline edit for plan exercises** — current plan view supports
   delete-exercise via trash icon but not edit. Tap an exercise →
   modal with name/sets/reps/rest/notes → `patchWorkoutPlan` save.
7. **Settings → Workout Plan landing consolidation** — when a plan
   exists, the page shows the active-plan summary AND the three big
   "Build mode" cards. Cluttered. When `plan != null`, lead with
   primary actions (Edit Plan / Revise / View week) + a quieter
   "Build different way" expandable for the three rebuild modes.

---

### 14.8 Goals → data-binding tightening (~6h)

Existing system in [goals_engine.py](goals_engine.py) already binds 11
of 17 goal types to real data. Six are paused waiting on connectors
that just shipped:

| Goal | Was paused on | Now unblocks |
|---|---|---|
| TIME-02 Screen-time cap | Apple Family Controls / UsageStats | UsageStats live → wire it |
| TIME-03 Wake-time consistency | Health Connect sleep | HC live → wire it |
| TIME-04 Location-routine | Location samples | Location live → wire it |
| TIME-05 Calendar-density target | Calendar | GCal + Outlook live → wire it |
| TIME-06 Email-zero-by-N-AM | Gmail/Outlook | Both live → wire it |
| FIN-01/02/03 | Plaid | Still paused — Plaid hasn't shipped |

**Plan:**
1. Add `_PROGRESS_HANDLERS` entries for the 5 newly-unblocked goal types
2. Add a `data_source_status` field to goal rows: `bound` (active data
   source) | `paused` (source missing) | `manual_only` (no source
   binding possible). UI shows different badges / disables progress
   bar for non-bound goals.
3. Goal creation wizard: REQUIRE picking a data source for "tracked"
   goals. "Self-report only" is a separate explicit checkbox.
4. Add 3 new goal types we can now track:
   - **Inbox-zero-streak** — Gmail/Outlook unread count = 0 by N PM
     for X consecutive days
   - **Sleep-regularity** — wake-time std dev < N min over 14 days
     (Health Connect)
   - **Movement-minutes** — daily active minutes from HC

---

### 14.9 Outlook multi-tenant (deferred, ~2h docs + 1 week wait)

Personal Microsoft accounts work today. Work accounts in tenants the
user doesn't admin require **Microsoft Publisher Verification**.

Steps when ready:
1. Microsoft Partner Center → "Verify my publisher" → upload
   business documents (Apex Leadership LLC formation docs)
2. Wait 1–5 business days
3. App registration → Branding → mark as "Publisher verified"
4. Now any tenant whose admin allows "verified third-party publishers"
   can consent without per-tenant friction

Not v1-blocking. Track in this section, ship in v1.5.

---

### 14.10 Phasing for Section 14

Updated 2026-04-28 after the C1 ship surfaced two blocking issues:
HC permission crash (§14.5.2b) and Location data being effectively
useless without clusters/maps (§14.5.5.b–d). Both promoted to week 1.

Rough order, ~125h total (~3.5 weeks at 40h/wk solo):

**Week 1 — Stabilize what shipped + Day Timeline + Strava maps:**
- ✅ §14.5.2b HC custom Expo Module (shipped 2026-04-28, working —
  HC permission sheet appears in-app, app shows in HC app list)
- ⏳ §14.5.5.g Location connect-flow UX fix (1h) — not yet; lower
  priority now that Location has a meaningful surface (map + visits)
- ✅ §14.5.5.b Cluster detection (shipped 2026-04-28 —
  [location_engine.detect_visits](location_engine.py))
- ✅ §14.5.5.c Reverse geocoding (shipped — Google Geocoding API
  bounded at 5 calls/day per user)
- ✅ §14.5.5.d Location card redesign with map + visits + recurring
  places (shipped — [AttentionCards.tsx](mobile/components/apex/AttentionCards.tsx))
- ✅ §14.5.5.e Wire location into chatbot LifeContext (shipped —
  [chatbot.py](chatbot.py) `_life_context` location subtree)
- ✅ §14.9 Outlook admin consent for founder's tenant (done 2026-04-28)
- ⏳ §14.7 Workout builder rewrite (8h) — next up
- ⏳ §14.5.1 Strava maps + charts (10h) — next up
- ⏳ §14.2 Day Timeline core — hard blocks + cron (12h) — week 2

**Week 2 — Day Timeline AI + Patterns + chatbot:**
- §14.2.2 Day Timeline soft-block AI labeling (10h)
- §14.2.4 Day Timeline mobile UI (2h)
- §14.3 Patterns hybrid deterministic + AI (14h)
- §14.4 Chatbot three-tier context (10h)

**Week 3 — Connector depth + new connectors + goals:**
- §14.5.2 Health Connect granular pulls (8h)
- §14.5.5.a Background GPS sampling (3h)
- §14.5.5.f Apple/Google review prep (2h)
- §14.5.3 Calendar enrichment (4h)
- §14.5.4 Email enrichment (5h)
- §14.6.1 Google Tasks (3h)
- §14.6.2 Photo metadata (6h)
- §14.8 Goals data-binding (6h)

**Beyond v1.5 (still queued):**
- §14.6.3 GitHub (4h)
- §14.6.4 AI tool exports (10h, the differentiating feature — promote
  to flagship if user demand signals interest)
- §14.6.5 Phone wake events (3h)

---

### 14.11 Why this is category-defining

Single-source wellness apps lose their users in 30 days. Multi-source
apps that pre-summarize feel useful for a week and dead by month two
because they can't answer "but what was different last Tuesday?"

The architecture in §14.4 (raw event log → AI query engine) is what
turns a dashboard into a **personal data graph**. The architecture in
§14.2 (hard + soft blocks with AI labels) is what turns a calendar
clone into a **timeline that knows what you were doing**. The
architecture in §14.6.4 (AI tool exports as a first-class signal) is
what turns a wellness app into a **work-life truth source**.

None of these are individually hard. The combination is the moat.

---

### 14.12 Phase Log

This is the canonical handoff document between Claude sessions. **Read
the most recent entry at the start of every new phase** to catch
deferred items + flagged problems from prior work. **Append a new entry
at the conclusion of every phase** with the structure shown below.

Workflow rules are documented in [`CLAUDE.md`](../../CLAUDE.md) at the
project root (loaded automatically by Claude Code at session start).

Cap this section at the **15 most recent entries**. Older entries
archive to `docs/migration/PHASE_LOG_ARCHIVE.md`.

#### Entry template

```markdown
### Phase log: <phase name> — <YYYY-MM-DD>

**Shipped:**
- ...

**Deferred:**
- ... (reason; expected pickup point)

**Problems flagged:**
- ...

**Decisions:**
- ...

**Next pickup:**
- ...
```

---

### Phase log: C1 connectors + Time/Finance redesigns + v1.5 vision — 2026-04-27 / 2026-04-28

This was a multi-day marathon session. Listing as one consolidated entry.

**Shipped:**
- **OAuth integrations**, all wired end-to-end (mobile connect → backend
  exchange → token storage in `users_connectors` → chatbot LifeContext
  consumption):
  - Gmail mobile (PKCE, generic [`AuthSession.useAuthRequest`](mobile/lib/hooks/useGmailOAuth.ts) — NOT `/providers/google` which auto-exchanges and broke our backend flow)
  - Google Calendar ([`gcal_sync.py`](gcal_sync.py), [`useGcalOAuth.ts`](mobile/lib/hooks/useGcalOAuth.ts))
  - Microsoft Outlook ([`outlook_sync.py`](outlook_sync.py), public-client
    PKCE — `MS_CLIENT_SECRET` is unused, see module docstring)
  - Strava ([`strava_sync.py`](strava_sync.py), 90-day activity backfill
    into `workout_logs` deduped via new `strava_activity_id` column)
- **Device-native (Android)**:
  - Health Connect via custom Expo Module ([`mobile/modules/health-connect/`](mobile/modules/health-connect/)) — the matinzd library was incompatible with Expo new-arch
  - Location ([`useLocationConnector.ts`](mobile/lib/hooks/useLocationConnector.ts)) — foreground sampling
  - Screen Time via custom Expo Module ([`mobile/modules/usage-stats/`](mobile/modules/usage-stats/)) — abandoned npm lib used Gradle 4 syntax
- **Location intelligence** ([`location_engine.py`](location_engine.py)):
  - DBSCAN-style cluster detection
  - Reverse geocoding via Google Geocoding API (bounded 5/day/user)
  - Static Maps URL builder for path preview (no native maps lib needed)
  - End-to-end `process_day()` pipeline
- **Time tab redesign** ([`time.tsx`](mobile/app/(tabs)/time.tsx)):
  - 3-cell summary row (Tasks left / Unread / Next event)
  - Rich Gmail/Outlook email previews (top-3 unread inline, not just counts)
  - Auto-sync hook ([`useAutoSyncOnFocus`](mobile/lib/hooks/useTimeData.ts)) throttled to 5min/provider
  - Today's Focus enhanced with kind-aware items (task/email/event union)
  - LocationCard with map preview + visits + recurring places
  - HealthConnectCard on Fitness tab (5 metrics: steps/sleep/HR/HRV/active-cal)
- **Finance tab redesign** ([`finance.tsx`](mobile/app/(tabs)/finance.tsx)):
  - 3-cell summary (Week / Bills 7d / MTD) under hero
  - Quick-actions card (Transaction / Bill / Budget)
- **Backend infra**:
  - 4 new sync modules + `location_engine.py`
  - 7 new tables: `gcal_events`, `outlook_emails`, `outlook_events`,
    `screen_time_daily`, `health_daily`, `location_samples`,
    `location_clusters`
  - Chatbot LifeContext now real (Gmail/Calendar/Outlook/Screen Time/
    Location/Health) — replaced null-stub
- **Local Android build pipeline** working (Windows + Android Studio's
  JBR + NDK 27.x + `npx expo prebuild` + Gradle). ~5min builds vs.
  EAS free tier's 70min queue.
- **Plan**: §14 Vision v1.5 added (PRD overrides for AI-assisted
  timeline / hybrid patterns / 3-tier chatbot context, ~125h scope).

**Deferred:**
- **§14.5.5.g Location connect-flow UX fix** (~1h) — alert chain still a
  bit fragile but acceptable now that the card shows real signal.
  Pickup: anytime.
- **§14.5.5.a Background GPS sampling** (~3h) — foreground-only for v1.
  Pickup: week 3 of v1.5 phasing.
- **Outlook Publisher Verification** (§14.9, ~1 week wait) — work-tenant
  users (other employers) still gated behind admin approval. Personal
  Outlook accounts work fine. Acceptable for v1 launch.
- **Apple HealthKit / iOS** — Android-first; defer until iPhone test
  device + Apple Developer Program.
- **Workout builder rewrite** (§14.7, ~8h) — known UX gap vs Flask PWA.
  Pickup: next phase.
- **Strava maps + charts** (§14.5.1, ~10h) — polylines / HR / pace /
  elevation. Pickup: next phase.
- **Day Timeline core** (§14.2, ~12h hard blocks + ~10h soft blocks).
  Pickup: phase after workout builder + Strava.

**Problems flagged:**
- `react-native-health-connect` (matinzd) is structurally incompatible
  with Expo new-arch — registers `ActivityResultLauncher` via
  `registerForActivityResult(...)` which only works in Activity.onCreate.
  Worked around by writing our own Expo Module using
  `activity.activityResultRegistry.register(key, contract)` (registry
  form is invokable from JS-driven Promise callbacks). **If we ever
  need an HC API we don't expose, extend the local module — don't add
  the third-party lib back.**
- `react-native-usage-stats-manager` is similar — abandoned, uses
  `compile()` Gradle 4 syntax. Same fix: own the wrapper.
- `app/(tabs)/finance.tsx` line 114 has a pre-existing TS error about
  `FinanceTransaction.merchant_name` being `string | null | undefined`
  vs expected `string | null`. Untouched by all session work. Easy fix
  next time we touch finance.tsx.
- `.env` got accidentally edited mid-session and lost
  `GOOGLE_CLIENT_ID_ANDROID` + `STRAVA_CLIENT_ID` — caused two debug
  cycles before we found it. The `_client_id_for_platform` fallback
  in `gmail_sync.py` silently falls back to Web client which produces
  misleading errors (`unauthorized_client` for Google, `client_id
  invalid` for Strava). Recorded as project memory
  (`oauth_env_var_gotcha.md`).

**Decisions:**
- **Scrapped PRD §4.6.5's "no AI in timeline computation" stance** —
  documented in §14.1 as a PRD override. Two-tier blocks (deterministic
  hard + AI-labeled soft) is the right answer because purely
  deterministic timelines have too many gaps.
- **Big-JSON-to-chatbot pattern** confirmed — pre-summarizing is lossy.
  3-tier context (always-on / day-stream / historical) approved with
  ~18K-token cap (PRD's 8K was over-cautious). See §14.4.
- **Custom Expo Modules over third-party libs** for fragile native
  integrations. Two modules shipped this session
  (`usage-stats`, `health-connect`); the pattern is replicable in ~6h
  per integration. Adding to permanent project knowledge.
- **Local Gradle builds over EAS Build local mode** — EAS local doesn't
  support Windows. Bypass it with `npx expo prebuild` + manual gradle.
- **Goals data-binding tightening** (§14.8) prioritized for v1.5 week 1
  alongside workout builder + Strava maps — light up the 5 newly-
  unblocked goal types now that connectors are live.

**Next pickup:**
1. **Workout builder rewrite** (§14.7, ~8h). Read PRD §4.X workout-plan
   section, read Flask templates/index.html for the workout-plan
   sub-flow, port to `mobile/app/settings/workout-plan.tsx`. Key UX
   wins to port: `understanding` cached separately from plan, revise
   flow with stored `quiz_payload`, "How we built your plan"
   expandable.
2. **Strava maps + charts** (§14.5.1, ~10h) immediately after — same
   `GOOGLE_MAPS_API_KEY` we set up for Location. Add `polyline` field to
   Strava activity fetch, store on `strava_activity_detail` table, render
   via static-map URL on workout detail screens.

---

### Phase log: §14.7 Workout builder polish — 2026-04-28

**Shipped:**
- **Quiz pre-population** — [`mobile/app/fitness/plan/builder.tsx`](mobile/app/fitness/plan/builder.tsx)
  now reads a `?initial=<urlencoded JSON>` URL param, reverse-maps the
  saved `quiz_payload` back into per-step state. Defensive parser
  (`parseInitialQuiz`) returns null for malformed input → wizard
  shows defaults. Implements PRD §4.3.10 "Edit Plan opens the
  Workout Builder with pre-populated answers".
- **Inline exercise edit** — [`mobile/app/fitness/plan/index.tsx`](mobile/app/fitness/plan/index.tsx)
  exercise rows are now tappable. Tap → modal with name/sets/reps/rest/
  notes inputs → save calls `patchWorkoutPlan` with the updated plan.
  Trash icon still works for delete. PRD §4.3.10 implicit requirement
  ("Edit Plan" beyond just delete).
- **"Edit plan" + "Switch plan" disambiguation** — plan view now has
  two distinct affordances: primary "Edit plan" (pre-fills builder) and
  a quieter underlined "Build a totally new plan from scratch" tertiary
  link (deactivates first). The old single "Switch plan" button buried
  the pre-fill flow.
- **Settings → Workout Plan consolidation** — when active plan exists,
  the page now leads with "View week" (primary, accent-coloured) +
  "Edit plan" actions on the active-plan card, and tucks the three
  build-mode cards behind a quieter "Build a different way" row.
  Reduces clutter on the typical return-visit path.

**Deferred:**
- **Wizard step reduction** (was floated mid-phase) — current 8-step
  flow is acceptable for first plan, less so for repeat edits. Could
  combine focus + injuries into one screen, default experience from
  profile, etc. Pickup: track as small UX polish task in next session.
- **AI-generated cardio sub-flow** (PRD §4.1.6 sub-screens for cardio
  goal/intensity/activities) — current builder has a `cardio` payload
  with sensible defaults but no UI step. Pickup: treat as v1.5 polish
  if user feedback signals it.
- **Plan adherence stats / This-week-calendar-strip** (PRD §4.3.10) —
  Fitness tab Today shows scheduled workout for today, but a
  weekly-completion strip / monthly-adherence-% surface isn't in
  plan/index.tsx yet. Pickup: candidate for §14 polish phase.

**Problems flagged:**
- The original Phase Log audit (and the orientation Explore agent)
  reported §14.7 as mostly UN-shipped. Reality: the wizard, revise
  flow, understanding, and sources expandable were all already in
  place. **Lesson: when the phase plan looks small, run a quick code
  read on the target files BEFORE assuming the plan items are
  todo.** The Phase Log entry for this phase ended up about polish,
  not greenfield.
- `quiz_payload` is stored on the active `workout_plans` row but not
  on every saved plan via `/api/workout-plan/save` (which omits the
  field). Older plans + AI-Import / Manual-Builder plans won't
  pre-populate the wizard. Builder gracefully falls back to defaults.
  Acceptable for v1.5 — the natural workflow is "AI Build → edit",
  not "Manual build → edit".
- Pre-existing `app/(tabs)/finance.tsx` line 114 TS error
  (`FinanceTransaction.merchant_name`) still untouched. Carrying
  forward to next phase.

**Decisions:**
- **Pass `quiz_payload` via URL search param** rather than route-level
  state or context. JSON-encoded payload is <1KB so URL fits comfortably
  under the 8K cap. expo-router's `useLocalSearchParams` made this a
  clean two-line read.
- **Don't deactivate the active plan** when the user hits "Edit plan".
  The backend's `/api/workout-plan/generate` archives the old +
  installs the new atomically — manual deactivation was wasted work
  and risked an empty-state flash if the user backs out of the wizard.
  Switch-plan still deactivates first because that's the explicit
  destructive flow.
- **Modal-based inline edit** rather than expand-the-row inline. Modal
  preserves scroll position and gives more room for the 5 fields
  without making the day card jump in height.
- **Marked the original §14.7 plan items ✅** on the spot rather than
  silently ignoring them. The plan now reflects what's true on disk.

**Next pickup:**
1. **§14.5.1 Strava maps + charts (~10h)**. Same `GOOGLE_MAPS_API_KEY`
   we set up for Location. Pull `polyline` field on activity fetch in
   `strava_sync.py`, store on a new `strava_activity_detail` table,
   render path map + HR / pace / elevation charts on a workout detail
   screen. Decide whether to use `react-native-maps` (would need a
   rebuild) or stick with Static Maps API (consistent with Location).
   **Recommendation: Static Maps for v1.5** — visual parity with
   Location card, no native dep, no rebuild.
2. **§14.8 Goals data-binding tightening (~6h)** in parallel. Wire
   `_PROGRESS_HANDLERS` for the 5 newly-unblocked goal types
   (TIME-02 screen-time, TIME-03 sleep regularity, TIME-04 location
   routine, TIME-05 calendar density, TIME-06 inbox-by-N-AM). Pure
   backend; no rebuild.
3. **§14.2 Day Timeline core (~12h hard blocks)** as the bigger week-2
   item.

---

### Phase log: §14.7b Workout-plan draft-mode editing — 2026-04-28

Iteration on §14.7 driven by founder feedback: "clicking the edit
plan button forces you to rebuild with the full ai builder — i want
manual changes or ai changes proposed, then either should require a
save to commit, then redirect to fitness page."

**Shipped:**
- **Backend dry-run revise** ([`app.py /api/workout-plan/revise`](app.py))
  — added `dry_run` and `current_plan` flags. When `dry_run=true`,
  AI computes the proposal and returns `{plan, dry_run: true}` WITHOUT
  saving. `current_plan` lets the client pass its working-copy plan
  as the AI's basis (supports edits-on-top-of-edits).
- **Mobile API helper** ([`mobile/lib/api/plan.ts`](mobile/lib/api/plan.ts))
  — `reviseWorkoutPlan(req, opts?)` now overload-typed: default mode
  returns `WorkoutPlanResponse` (saved row, backwards-compat); dry-run
  mode returns `ReviseDryRunResponse` (`{plan, dry_run: true}`).
- **Draft mode in plan view** ([`mobile/app/fitness/plan/index.tsx`](mobile/app/fitness/plan/index.tsx))
  — single `draftPlan` state captures all pending changes: inline
  exercise edits via the modal, exercise deletes via trash icon, AND
  AI revisions (now dry-run). Page renders from `workingPlan = draftPlan ?? plan.plan`
  so all reads reflect unsaved state.
- **Save/Cancel sticky banner** — shown only when `isDirty`. Pinned
  to bottom of screen with "Unsaved changes" title + Cancel /
  Save buttons. Save calls `patchWorkoutPlan(draftPlan)` then
  `router.replace('/(tabs)/fitness')` per founder direction.
  Cancel asks for confirmation before discarding (no accidental
  data loss).
- **Removed misleading "Edit plan" → wizard button** from plan view
  AND from Settings → Workout Plan card. Settings now has a single
  "View / edit" button → `/fitness/plan`. The wizard is reachable
  only via the explicit "Build a totally new plan from scratch"
  tertiary link or the empty-state "Build a plan" CTA.

**Deferred:**
- **Granular diff hint in the save banner** ("3 exercises changed")
  is currently a static "Review the days above" string. A real diff
  computation (compare draftPlan against plan.plan, count modified
  exercises) is a nice-to-have for v1.6.
- **Inline-add-an-exercise** — the modal supports edit + the trash
  icon supports delete, but adding a new exercise requires the
  Manual Builder flow in Settings. Could surface a "+" affordance
  per day card; deferred until founder feedback signals it.

**Problems flagged:**
- Pre-existing `app/(tabs)/finance.tsx` line 114 TS error still
  carrying forward — unrelated to this work, will fix when finance
  tab next gets touched.
- Save flow doesn't optimistic-update the home screen / scheduled-
  workout card. After Save the user lands on Fitness tab; if Today's
  Scheduled Workout is rendered from a stale `useWorkoutPlan()` cache
  it could briefly show the old plan before refetch. Not observed in
  testing but worth flagging — the Fitness tab's `useFocusEffect`
  refetches on focus so the window is small.

**Decisions:**
- **Dry-run on the existing endpoint** (flag) rather than a new
  `/revise-preview` route. Simpler API surface; backwards-compat
  preserved via overloaded TS types in the client.
- **AI revise basis = current working plan** (draft if dirty, else
  saved). Lets the user iterate: manual edits → AI revise → review
  → save, all in one session, with the AI seeing the user's actual
  intent rather than a stale DB version.
- **Single Save bar pinned bottom** rather than per-card or floating
  modal. Always-visible-when-dirty matches the user's mental model:
  "I'm in edit mode, what I do gets saved on Save."
- **Discard = confirm dialog** because the user is one tap away from
  losing AI revise output that took 5–10s to generate. Save = no
  confirm because Save is the no-regret action.
- **Removed the wizard pre-fill flow** from plan/index.tsx but
  preserved it in the codebase. The builder still accepts
  `?initial=<encoded>`, so a future entry point (e.g. "Edit quiz
  answers" in Settings) can use it without code revival.

**Next pickup (unchanged):**
1. **§14.5.1 Strava maps + charts** — see prior log.
2. **§14.8 Goals data-binding tightening** — see prior log.
3. **§14.2 Day Timeline core** — week 2.

---

**End of BUILD_PLAN_v2.**
