# Phase Log

**Append-only project log. Never capped, never trimmed.** Read
end-to-end to reconstruct the full project history. The goal: detailed
enough that anyone — future-founder, future-Claude, or an LLM reading
this cold — can understand how the project was built, what was tried,
what failed, and why each decision was made.

## Logging cadence

- **Every Claude response** gets at least a short entry. Even if the
  response is "ok" or "continue", log what was done.
- **Granularity:** Per-response, not per-file-edit. A single response
  may bundle many edits — the entry summarizes the *intent* and lists
  files touched, not every diff.
- **Non-trivial responses** get fuller entries: what the user asked,
  what was done, what was decided, what manual checks were issued,
  what the outcome was.
- **Never edit prior entries.** Add a new one if context changes.

## Entry format

```markdown
### [HH:MM] One-line summary of what happened
- **Prompt:** "founder's request, paraphrased if long"
- **Did:** what Claude actually did, in 1–5 bullets
- **Files:** comma-separated paths if any code/doc edits happened
- **Decisions/notes:** non-obvious calls, things deferred, gotchas
- **Manual checks:** if any were issued, list them; if pending,
  mark "(pending)"
- **Outcome:** shipped / partial / blocked / no-op / ...
```

Days group by `## YYYY-MM-DD`. Newest day at the **bottom**
(append-only, top-to-bottom chronological). Read top-down to see
the project arc.

---

# Pre-Claude-Code era — Flask PWA (2026-03-17 to 2026-04-23)

This phase predates Claude Code (Anthropic's CLI agent). The founder
built the v1 dashboard as a Flask web app + PWA, pair-programming with
Claude in the chat-completion API directly. ~250 commits over five
weeks. Listed here as themed phases rather than per-response since the
per-response log discipline began only on 2026-04-28.

## 2026-03-17 — Project genesis

### Initial commit — meal logging
- **Founder:** Started a Flask app with a single SQLite DB, AJAX form
  for meal entry, calorie + macro fields, log-by-day view.
- **Decisions:** Picked Flask over FastAPI/Django for low ceremony.
  Picked SQLite over Postgres for "no infra at all". Manual entry
  only at first; AI parsing came later.
- **Outcome:** First commit `a217a92` — a personal life dashboard
  that logged meals.

### Added Charts + History tabs
- Date tracking, tab layout. Foundation for the eventual 5-tab
  structure (Home / Fitness / Nutrition / Mind / Profile).

## 2026-03-18 — PWA + Railway deploy

### Multi-user login + auth
- Sessions, login form, password hashing. Each user got their own
  scoped data via `user_id` foreign keys.

### PWA manifest + service worker
- Install-to-homescreen on iOS/Android. The app lived as a PWA for
  the next 5 weeks before the React Native rewrite.

### Railway deployment
- Dockerized Flask app, persistent volume for SQLite DB, environment
  variable for `DB_PATH`.

### Meal photo scanning with Claude Vision
- First AI integration. Camera + gallery flow, Claude Sonnet vision
  parses photo → JSON of meal items → user confirms → logs.
- **Gotcha:** Android required separate Camera and Gallery buttons;
  combined camera-roll picker was unreliable.

## 2026-03-19 — Onboarding + Garmin

### 9-page onboarding wizard
- Profile, height/weight, activity level, dietary preferences, goal
  (lose weight / maintain / build muscle / recomp), opt-in features.
- **Gotcha:** Onboarding profile generation hit Claude Opus's full
  context — needed 180s gunicorn timeout to avoid worker kill.

### Garmin Connect integration (Option A — `garminconnect` library)
- Unofficial library; auth via email/password initially, then
  switched to GARMIN_TOKENS env var (stored token JSON) when 429
  rate limits hit.
- **Decision:** Persisted OAuth tokens to DB to avoid re-login storm
  on every Railway restart. Eventually deferred until official API
  approval.

### Pull-to-refresh, midnight rollover, timezone fix
- Mobile gestures, real-time tab refresh on day boundary, server
  uses client local date to prevent timezone-mismatch bugs.

## 2026-03-20 to 2026-03-22 — Mind tab, voice input, Momentum scoring

### Mind tab v1 — Claude Opus profile
- Insights from logged data, AI-generated daily reflections.
- **Decision:** Replaced Claude Mind tab call with **instant
  pure-Python scoring** (commit `38a7003`) — Opus was too slow + too
  expensive for a tab the user opened daily. Set the precedent
  (later codified in PRD §3.3) that AI is for content the user
  explicitly invokes, not background features.

### Voice input on every text field
- Web Speech API mic button, red glow when listening,
  volume-reactive animation.

### Momentum scoring system
- Deterministic 0-100 score across Fitness / Nutrition / Mind.
- AI insight (one paragraph) explained the score.
- **Bug fix loop:** `protein_pct` removed (NameError on history
  builder), calorie goal source fixed, timezone bug in scoring.

### Other early-3/22 polish
- Bodyweight logging in morning brief, voice input reliability,
  workout banner, brief sliders, profile re-entry, energy/stress
  tracking, momentum score on calendar, drag-to-reorder home
  layout.

## 2026-03-22 to 2026-04-23 — Long Flask polish stretch

Roughly a month of bug fixes, UX iteration, scoring refinement,
and feature additions on the Flask PWA. Highlights:
- Drag-to-reorder home layout
- Brief cards, equal-weight insight prompts
- Calorie goal in insights, sleep card redesign
- Workout overlay header redesign, plan preview, change workout
- Morning brief weight logging
- Activity calendar week-rows redesign
- Photo meal scanning AJAX flow
- Multiple UX feedback rounds

The Flask PWA hit "good enough for personal use with 3 daily users"
state. The decision was made (timestamp around 2026-04-23) to migrate
to React Native because:
1. PWA install-to-homescreen UX was second-class on iOS
2. Native HealthKit / Health Connect access required a real app
3. Push notifications needed for v1 monetization arc
4. App Store / Play Store presence was launch-required

# React Native migration era (2026-04-23 to 2026-04-26, pre-Claude-Code)

## 2026-04-23 — Chatbot foundation

### Phase 4: Chatbot base shell
- **Backend:** `/api/chatbot/query` endpoint, container/audit-log
  pattern.
- **Mobile:** Overlay chat sheet, session hook, classifier (rule-based
  intent detection that routed queries to the right backend handler),
  audit screen.
- **Decision:** Chatbot UX = floating action button (FAB) +
  expanding overlay rather than a dedicated tab. Reasoning: chat is
  invoked from any context, so it shouldn't pull the user away from
  whatever they were doing.

## 2026-04-24 — Migration phases A0 through C1 (one big day)

This was a marathon — the Flask PWA stayed live in parallel while a
React Native + Expo SDK 54 app was scaffolded from scratch.

### Phase A0: Clerk bridge hardened
- `users.email` column added; Clerk → Flask auth bridge backfills
  on sign-in. Fixed a race in `create_user_from_clerk` that blocked
  signup.

### Phase A1: Unified goals system (PRD §4.10)
- The 22-goal library: 6 fitness / 5 nutrition / 5 finance / 6 time.
- `goal_library` table seeded; `goals` table for per-user instances;
  `goal_progress_log` for daily snapshots.
- Engine: `goals_engine.py` with `compute_goal_progress` +
  `compute_pace`, dispatch table per `library_id`.

### Phase A2: Onboarding completion
- Truthful permissions copy, unified goal hand-off (onboarding
  optionally creates a primary fitness goal).

### Phase A3: Settings completion
- Truthful preferences pages, PRD-aligned notification toggles.

### Phase A4: Finance category v1 (manual-first)
- `finance_accounts`, `finance_transactions`, `finance_budgets`,
  `finance_bills`. Designed to absorb Plaid data later without
  schema churn (every row carries `source TEXT DEFAULT 'manual'`).

### Phase A5: Time category v1 (tasks-first)
- `mind_tasks` table, priority+due-date fields, daily brief.
  Calendar/email integration shipped later (C1).

### Phase A6: Reliability sweep
- Calorie-driver actually recomputes when the user edits their goal
  weight. Caught a stale-cache bug in `_sync_calorie_driver_from_primary_fitness`.

### Phase B1: Connector foundation
- `users_connectors` table + CRUD layer.
- OAuth state store. Webhook receiver scaffolding.
- Retry/backoff utility. Structured error-code contract.
- Background-job runner pattern.

### Phase C1: Connectors that don't need founder input
- Wired Strava (already approved) end-to-end. Other connectors
  scaffolded but disabled pending OAuth registration.
- **Hotfixes (same day):** wrap root layout in
  GestureHandlerRootView; render-loop storm on Finance/Time/Goals
  tabs (`useEffect` dep array bug).

### BUILD_PLAN_v2.md authored
- Three-track plan to v1 readiness: Track A (unblocked dev work),
  Track B (connector scaffolding), Track C (per-integration wiring).
  ~108h + 39h + 316h estimated.
- This doc grew organically over the next 4 days into a 2200-line
  clusterfuck — eventually replaced (2026-04-28) by status-first
  `BUILD_PLAN.md`.

## 2026-04-25 to 2026-04-26 — Gmail mobile OAuth

### Round 1: expo-web-browser + deep link
- First attempt: `/providers/google` from `expo-auth-session`.
- **Failure:** That provider auto-exchanges the auth code in the
  client. Backend never sees the code → server-side flow broke.

### Round 2: native PKCE without client secret
- Switched to generic `AuthSession.useAuthRequest` + PKCE.
- Backend exchanges the code with the Android client_id (no secret;
  public clients).
- **Memory entry created:** never use `/providers/google` for our
  flow. Recorded as `expo_oauth_provider_choice.md`.

# Claude-Code era — major phases (2026-04-26 to 2026-04-28)

The founder onboarded Claude Code (Anthropic's CLI agent) sometime
around 2026-04-26. The next phases were Claude-Code-led with founder
direction.

## 2026-04-26 — §14.5.1 Strava maps + charts

### Phase: §14.5.1 — Strava activity detail screen

**Shipped:**
- `strava_activity_detail` table + helpers (`upsert_strava_detail`,
  `get_strava_detail`)
- `strava_sync.py` detail/streams/zones fetchers + `downsample_stream`
- Lazy `/api/strava/activity/<id>` route; map URL pre-built
  server-side via `path=enc:<polyline>`
- `mobile/lib/api/strava.ts` helper + types
- `mobile/app/fitness/strava-activity/[id].tsx` detail screen with
  Static Maps hero, 4-cell stats grid, ElevationSparkline,
  ZonesBars, SplitsTable. All viz inline View-based (no chart lib)
- WorkoutHistoryList wires Strava-sourced rows to detail screen

**Decisions:**
- Static Maps over `react-native-maps` — visual parity with Location
  card; no native dep / rebuild
- Inline View-based viz — no chart lib dep
- Lazy server-side fetch over backfill — saves API budget
- Cache forever after first hit (no TTL); founder can force re-fetch
  via `?refresh=1` if needed

**Problems flagged:**
- `useUnits()` lacks distance formatters — inlined in detail screen
- `_extract_streams` had to handle both dict-keyed and list-shaped
  Strava responses
- `GOOGLE_MAPS_API_KEY` missing from `.env` caused all maps to show
  "No GPS route" placeholder. UI conflated "no key" with "no GPS data".
  Memory entry updated to cover Maps env var.

## 2026-04-27 to 2026-04-28 — C1 connectors marathon (multi-day session)

### Phase: C1 connectors + Time/Finance redesigns + v1.5 vision

**Shipped:**
- **OAuth integrations** end-to-end:
  - Gmail (PKCE, generic `AuthSession.useAuthRequest`)
  - Google Calendar (`gcal_sync.py` + `useGcalOAuth.ts`)
  - Microsoft Outlook (`outlook_sync.py`, public-client PKCE —
    `MS_CLIENT_SECRET` is unused, see module docstring)
  - Strava 90-day backfill into `workout_logs` deduped via
    `strava_activity_id`
- **Device-native (Android)**:
  - Health Connect via custom Expo Module
    `mobile/modules/health-connect/` (matinzd library was
    incompatible with Expo new-arch; uses `activityResultRegistry.register`
    instead of `registerForActivityResult`)
  - Foreground Location sampling (`useLocationConnector.ts`)
  - Screen Time via custom Expo Module `mobile/modules/usage-stats/`
    (abandoned npm lib used Gradle 4 syntax)
- **Location intelligence** (`location_engine.py`):
  - DBSCAN-style cluster detection
  - Reverse geocoding via Google Geocoding API (5/day/user budget)
  - Static Maps URL builder for path preview
  - End-to-end `process_day()` pipeline
- **Time tab redesign** (`time.tsx`): 3-cell summary row, rich
  Gmail/Outlook email previews, auto-sync hook, kind-aware Today's
  Focus, LocationCard with map preview, HealthConnectCard on
  Fitness tab
- **Finance tab redesign** (`finance.tsx`): 3-cell summary,
  quick-actions card
- **Backend infra**: 4 sync modules + `location_engine.py`, 7 new
  tables (`gcal_events`, `outlook_emails`, `outlook_events`,
  `screen_time_daily`, `health_daily`, `location_samples`,
  `location_clusters`), chatbot LifeContext now real
- **Local Android build pipeline** (Windows + Android Studio's JBR
  + NDK 27.x + `npx expo prebuild` + Gradle); ~5min builds vs.
  EAS free-tier 70min queue
- **§14 Vision v1.5 plan added** to BUILD_PLAN_v2.md

**Problems flagged:**
- `react-native-health-connect` (matinzd) structurally incompatible
  with Expo new-arch — registers ActivityResultLauncher via
  `registerForActivityResult(...)` which only works in Activity.onCreate.
  Worked around by writing custom Expo Module using
  `activity.activityResultRegistry.register(key, contract)`.
  **Lesson:** if a third-party RN lib has stale Gradle metadata
  (`compile()` vs `implementation()`) or registers Android system
  services that need lifecycle hooks, write a custom Expo Module —
  6h per integration vs days of debugging the lib.
- `react-native-usage-stats-manager` similar — abandoned, Gradle 4
  syntax. Same custom-Expo-Module fix.
- Health Connect needs `minSdkVersion 26`. Added `expo-build-properties`
  plugin in `app.json`.
- EAS Build local doesn't support Windows. Switched to manual Gradle.
- APK signature mismatch on local-built APK install (EAS keystore vs
  debug keystore). Fixed by `adb uninstall com.lifedashboard` first.
- `parse-workout-plan` 500 on long plans — `max_tokens=2048`
  truncated JSON. Bumped to 4096, timeout to 60s.
- Location card had useless lat/lon display. Founder: "this data
  does nothing." Built `location_engine.py` cluster detection +
  reverse geocoding + Static Maps preview.
- `.env` got accidentally edited mid-session and lost
  `GOOGLE_CLIENT_ID_ANDROID` + `STRAVA_CLIENT_ID`. Caused two debug
  cycles. Recorded as memory `oauth_env_var_gotcha.md`.

**Decisions:**
- **Scrapped PRD §4.6.5's "no AI in timeline computation" stance**
  — two-tier blocks (deterministic hard + AI-labeled soft) is the
  right answer. Pure determinism leaves too many gaps.
- **Big-JSON-to-chatbot pattern** confirmed — pre-summarizing is
  lossy. 3-tier context (always-on / day-stream / historical)
  with ~18K-token cap (PRD's 8K was over-cautious).
- **Custom Expo Modules over third-party libs** for fragile native
  integrations.
- **Local Gradle builds over EAS Build local mode** — EAS local
  doesn't support Windows.
- **Goals data-binding tightening** (§14.8) prioritized for v1.5
  week 1 alongside workout builder + Strava maps.

## 2026-04-28 — Multiple Claude-Code phases (single day)

The founder spent most of 2026-04-28 in Claude Code. Phases listed
chronologically; per-response logging began at end-of-day after the
log restructure.

### Phase: §14.7 Workout builder polish

**Shipped:**
- Quiz pre-population in `mobile/app/fitness/plan/builder.tsx` via
  `?initial=<encoded>` URL param. Defensive parser
  (`parseInitialQuiz`) returns null for malformed input.
- Inline exercise edit modal in plan view — tap → modal with
  name/sets/reps/rest/notes inputs → `patchWorkoutPlan` save.
- Edit plan / Switch plan disambiguation in plan view + Settings
  consolidation.

**Problems flagged:**
- Original Phase Log audit reported §14.7 as mostly UN-shipped.
  Reality: wizard, revise flow, understanding, sources expandable
  were already in place. **Lesson:** when a phase plan looks small,
  read the source before assuming items are todo.
- `quiz_payload` is on the active `workout_plans` row but not on
  every saved plan via `/api/workout-plan/save`. Older plans +
  AI-Import / Manual-Builder plans won't pre-populate the wizard;
  builder gracefully falls back to defaults.

### Phase: §14.7b Draft-mode editing (founder feedback iteration)

**Founder feedback that drove the iteration:** "clicking the edit
plan button forces you to rebuild with the full ai builder — i want
manual changes or ai changes proposed, then either should require a
save to commit, then redirect to fitness page."

**Shipped:**
- Backend dry-run revise — `/api/workout-plan/revise` accepts
  `dry_run` + `current_plan` flags. Returns `{plan, dry_run: true}`
  without saving.
- Mobile API helper overload-typed: default mode returns
  `WorkoutPlanResponse` (saved row); dry-run returns
  `ReviseDryRunResponse`.
- Draft-mode in `mobile/app/fitness/plan/index.tsx` — single
  `draftPlan` state captures inline edits + AI dry-run revisions.
  Page reads from `workingPlan = draftPlan ?? plan.plan`.
- Save/Cancel sticky banner — pinned to bottom of screen, only
  shown when `isDirty`. Save calls `patchWorkoutPlan` →
  `router.replace('/(tabs)/fitness')`. Cancel asks for confirmation.
- Removed misleading "Edit plan" → wizard buttons from plan view
  AND Settings card.

**Founder follow-up:** "cardio is still not editable when you click
a day dropdown, fix that then move on." Made cardio rows tappable +
"+ Add cardio" CTA + cardio editor modal.

**Decisions:**
- Dry-run as a flag, not a new endpoint (simpler API surface).
- AI revise basis = current working plan (lets user iterate
  manual → AI → save).
- Single Save bar pinned bottom — matches "I'm in edit mode" mental
  model.
- Discard requires confirm; Save doesn't (Save is no-regret).

### Phase: §14.5.1 Strava maps + charts (re-orientation + completion)

Already detailed in 2026-04-26 entry above; finished on 2026-04-28
with WorkoutHistoryList wiring + commit.

**Manual check after env-var fix:** Founder confirmed maps load
after adding `GOOGLE_MAPS_API_KEY` to `.env`. Resolved.

### Phase: §14.8 Goals data-binding (partial)

**Shipped:**
- `config_json` plumbing end-to-end:
  `db.create_goal_from_library(... config=)`,
  `update_goal_fields` accepts `config` field, `app._serialize_goal`
  parses `config_json` into `config` for the client.
- 3 progress handlers in `goals_engine.py`:
  - **TIME-02 Screen-time cap streak** — daily streak qualifying on
    `screen_time_daily.total_minutes <= config.daily_cap_minutes`
  - **TIME-05 Focus time per week** — period_count summing minutes
    from gcal+outlook events whose title matches `lower LIKE '%focus%'`
  - **TIME-06 Location visits per week** — weekly streak counting
    days within 75m of `config.cluster_id`
- Helpers: `_goal_config`, `_haversine_m`,
  `_visits_to_cluster_in_week`, `_focus_minutes_in_window`.
  Dispatch table now 16 handlers (was 13).

**Deferred (with reasons):**
- TIME-03 Social cap — needs per-app categorization on
  `screen_time_daily.top_apps_json`. Backlog → Later.
- TIME-04 Phone-down after cutoff — needs hourly screen-time
  buckets; current data is daily-only. Backlog → Later.
- 3 new goal types (inbox-zero-streak, sleep-regularity,
  movement-minutes) — own ~4h follow-up phase. Backlog → Next.
- Customize.tsx UI for config fields — backend accepts; UI doesn't
  yet expose. Backlog → Now.

**Decisions:**
- `config_json` over a parallel `goal_config` table — sparse
  goal-type-specific settings; JSON column matches existing pattern.
- Skip the `data_source_status` enum — `paused` flag does the same
  job in v1.5.
- TIME-05 keyword match on "focus" — simplest convention.
- Visit radius 75m vs cluster radius 50m — slightly bigger so
  edge-of-cluster visits still count.

**Problems flagged:**
- The build-plan §14.8 description (TIME-02..06 labels + data
  sources) was out of date relative to the actual seeded library.
  Source-of-truth is `db.py:_GOAL_LIBRARY_V1`. Read source first.

# 2026-04-28 — Per-response log begins (today's session)

## 2026-04-28

### 14:50 — Restructured BUILD_PLAN_v2.md into status-first BUILD_PLAN.md
- **Prompt:** "ok continue, update your system prompt to ensure that
  you always prompt me to do a manual check where neccessary and
  reorgaize the structure of the build plan md right now to make
  more sense because its a clusterfuck right now... develop a way
  to track our status through a new build plan md..."
- **Did:** Replaced 2200-line `docs/migration/BUILD_PLAN_v2.md` with
  a status-first single doc `docs/BUILD_PLAN.md`. Sections in
  reading order: Status / Active phase / Inbox / Backlog / Deferred
  / Done — Phase Log / Vision. Old plan archived in place at
  `BUILD_PLAN_v2_archive.md` (preserved for reference).
- **Updated CLAUDE.md** with: Inbox triage at session start
  mandatory; explicit MANUAL CHECK prompts for on-device / env /
  external-system changes; bubble Deferred items into Backlog tier
  + reason; founder-tests-in-parallel workflow guidance.
- **Updated memory** entry `phase_workflow_discipline.md` to point
  at new doc + add Manual-check protocol.
- **Files:** `docs/BUILD_PLAN.md` (new), `docs/migration/BUILD_PLAN_v2_archive.md`
  (renamed + redirect note), `CLAUDE.md`, `MEMORY.md`,
  `phase_workflow_discipline.md`
- **Outcome:** Shipped — commit `8bf8797`. Pushed to origin.
- **Manual checks:** None pending.

### 15:30 — Split docs into INBOX.md + PHASE_LOG.md (this entry's session)
- **Prompt:** "move inbox and phase log to be thier own standalone
  md files i will edit inbox while testing... i want everything
  claude does from now until forever logged in that .md, not every
  code change but just enough that we have a human or llm readable
  log of everything done in this project. prepopulate it with what
  we've done up to this point from day 0 no code written to today...
  vision should be basically distilled prd."
- **Did:**
  1. Created `docs/INBOX.md` — empty drop-zone with format guide.
     Founder edits this; Claude clears at start of each chat
     response.
  2. Created `docs/PHASE_LOG.md` (this file) — pre-populated with
     project history from 2026-03-17 (initial commit) through
     2026-04-28 (today). Per-response logging begins below.
  3. Updated `docs/BUILD_PLAN.md` — removed Inbox + Phase Log
     sections (now standalone files); rewrote Vision section as
     distilled PRD.
  4. Updated `CLAUDE.md` workflow rules: 3-file structure (BUILD
     PLAN / INBOX / PHASE LOG), Inbox pulled at *every response*
     not just session start, BUILD_PLAN is Claude territory only,
     per-response Phase Log entry mandatory.
  5. Updated memory.
- **Files:** `docs/INBOX.md` (new), `docs/PHASE_LOG.md` (new, this
  file), `docs/BUILD_PLAN.md`, `CLAUDE.md`, memory entries.
- **Decisions:**
  - Pre-populated history is themed-phases, not per-commit (658
    commits would be unmaintainable). Granularity: 1 entry per
    major phase or arc, ~5-15 lines each.
  - Vision section in BUILD_PLAN.md = distilled PRD §1 (the
    Executive Summary content). The full §14 v1.5 vision content
    moves to a separate Vision section there too.
  - Per-response format: HH:MM heading + Prompt / Did / Files /
    Decisions / Manual checks / Outcome bullets. Compact for
    "continue" responses, fuller for non-trivial work.
- **Outcome:** Shipping with this commit.
- **Manual checks:** None pending. The founder will start using
  INBOX.md going forward; I'll triage it at the start of every
  response.

### 16:10 — Backlog audit + detailed expansion + PRD override application
- **Prompt:** "ensure that all defered items (from previous phase
  log structure) get put somewhere in the backlog this backlog is
  the key feature of the build plan so should be detailed. when a
  prd override happens it should update the prd itself but only
  after founder confirmation, current overides are approved.
  archive is good."
- **Did:**
  1. **Audited every Deferred item** across all PHASE_LOG entries
     (pre-Claude-Code through §14.8). Found 9 items missing from
     `BUILD_PLAN.md` → Backlog: wizard step reduction, AI cardio
     sub-flow (PRD §4.1.6), plan adherence stats (PRD §4.3.10),
     tap-zone-bucket drilldown, finance.tsx:114 TS error,
     granular diff hint, inline-add-exercise, pace-over-distance
     chart, wizard data-source enforcement.
  2. **Expanded Backlog format**: every item now has Scope / Files
     / Done-when (acceptance criterion) / PRD-ref-or-blocker. The
     previous one-line bullets are gone. Backlog is now ~385 lines
     (~20 items in Now+Next, ~13 in Later, ~9 in Icebox).
  3. **Removed standalone "Deferred / known gaps" section** —
     everything that lived there is now in Backlog → Later (with
     a "(deferred — reason)" tag) or Icebox (for explicit
     chose-not-to-do items like `data_source_status` enum and
     pre-summarized chatbot context).
  4. **Applied 3 approved PRD overrides** to
     `docs/migration/APEX_PRD_Final.md` directly, with
     `**Revised 2026-04-28**` footnotes preserving the original
     reasoning inline:
       - §1.7 Platform & Launch — Flask + SQLite for v1 (Node.js + AWS
         for v2); Android-first (iOS at v1.1).
       - §4.6.5 Day Timeline → AI Usage — two-tier deterministic +
         AI-labeled soft blocks, replacing the original
         "None for computation" stance.
       - §4.7.10 Chatbot context — 18K with three-tier loading,
         replacing the 8K pre-summarized cap.
  5. **Codified PRD-override workflow in CLAUDE.md**: future
     overrides require explicit founder approval via MANUAL CHECK,
     then applied to PRD with footnote, then logged in BUILD_PLAN
     Vision + PHASE_LOG. The 4 currently-approved overrides are
     listed.
- **Files:** `docs/BUILD_PLAN.md` (Backlog rewrite, ~385 lines),
  `docs/migration/APEX_PRD_Final.md` (3 sections — §1.7, §4.6.5,
  §4.7.10), `CLAUDE.md` (new "PRD overrides" section).
- **Decisions:**
  - Merge "Deferred / known gaps" into Backlog tiers rather than
    keeping a separate section. Single index for everything-that-
    will-or-won't-happen.
  - Keep PRD's original text alongside revisions (don't delete) —
    revisions inherit historical context; deletes lose the why.
  - Mark Android-only as a §1.7 PRD revision too (was implicit;
    now explicit since iOS may slip past v1).
- **Outcome:** Shipping with the next commit.
- **Manual checks (pending):** Open `docs/BUILD_PLAN.md` and skim
  the expanded Backlog — confirm the structure / level of detail
  is what you want. Reply 'ok' or what to change.

### 17:00 — Codebase audit + reconciliation against BUILD_PLAN
- **Prompt:** "great now before we start i want a complete audit
  of the codebase and to ensure that where we're at what we have
  built what we have yet to do is reflected in the build plan and
  phase log."
- **Did:**
  1. **Triaged INBOX.md** — empty (no items to triage).
  2. **Spawned Explore subagent** for a full codebase audit:
     enumerated `app.py` routes (145 across 4497 lines), `db.py`
     tables (~41), every sync module, every goals_engine handler,
     chatbot context state, mobile tabs/routes/components/hooks/
     modules, custom Expo Modules, OAuth state per connector,
     TODO/FIXME grep, test coverage. Then reconciled against
     `BUILD_PLAN.md` Status / Backlog and `PHASE_LOG.md` history.
  3. **Headline finding:** **No critical mismatches.** Build plan
     accurately reflects reality. Every PHASE_LOG-claimed feature
     verified to exist in code; every Backlog → Now item confirmed
     as not-yet-built.
  4. **Updated Status snapshot** with audit-discovered detail:
     145 routes / 41 tables / 5 sync modules; chatbot tier
     state ("always-on partial; day-stream + historical stubbed");
     test coverage ("`test_scoring.py` only — 50 lines; manual
     integration testing via INBOX feedback loop").
  5. **Added 4 new Backlog → Later items** surfaced by the audit:
     - Webhook receiver production-wiring (~3h) — B1 stub never
       got real signature verification + provider routing.
     - `scoring.py` Flask-PWA-era code review (~1h) — agent
       flagged as "still imported but not actively driving RN
       score computation". Delete or document.
     - Test coverage expansion (~6h) — new pytest modules for
       goals_engine + strava_sync + db round-trips.
     - (Webhook + scoring.py also added to Status → Known
       fragile.)
- **Files:** `docs/BUILD_PLAN.md` (Status snapshot rewrite with
  audit detail; 4 new Later items).
- **Decisions:**
  - Don't try to enumerate all 145 routes in BUILD_PLAN — the
    audit confirmed they exist; that's enough for now. The
    enumeration lives in PHASE_LOG (this entry) for future
    reference.
  - Test-coverage expansion stays Later, not Now. Solo founder
    pre-launch; manual testing via INBOX is adequate. Trigger
    is "before public launch" or "when a regression bites".
  - `scoring.py` cleanup is Later not Now — non-blocking and
    needs more investigation than a single phase.
- **Outcome:** Audit complete. Plan + reality reconciled. Ready
  to pick the next phase.
- **Manual checks (pending):** Open `docs/BUILD_PLAN.md` Status
  snapshot — confirm the audit-derived detail is the picture you
  expected. Then pick from Backlog → Now (current candidates: §14.2
  Day Timeline, Customize.tsx config-fields, Location connect-flow
  UX). Reply with the phase to start.

### 17:30 — INBOX triage: history filter dedup, cardio Strava nav, HC questions
- **Prompt:** "ok" (founder approved next phase pick) — but inbox
  had 2 bugs + 4 questions + 1 workflow rule that preempted.
- **Did:**
  1. **Codified "push every chat response"** as a workflow rule in
     `CLAUDE.md` (founder direction in INBOX → Other Thoughts).
     Inserted as step 5 in the per-response workflow so PHASE_LOG
     entries always have a corresponding pushed commit.
  2. **Bug fix — duplicated history filter chips:**
     `mobile/app/(tabs)/fitness.tsx` and
     `mobile/components/apex/WorkoutHistoryList.tsx` both rendered
     filter chip rows. Outer (fitness.tsx) uses AI-classified
     `session_type` (canonical); inner used keyword-based
     `classifyWorkout(description)` (legacy). Removed the inner
     row + `Filter` state from WorkoutHistoryList — it's now a
     pure presentation component that renders + groups whatever
     workouts it's given. Outer filter is unchanged.
  3. **Bug fix — cardio + strength subsystem screens didn't
     navigate Strava rows:** §14.5.1 only wired
     WorkoutHistoryList → Strava detail screen. The 6 fitness
     subsystem screens (cardio.tsx, strength.tsx) had their own
     row renderers that always called `setDetailWorkout(w)`,
     opening the manual-edit modal even for Strava-sourced rows.
     Patched both to check `w.strava_activity_id` and route to
     `/fitness/strava-activity/[id]`. Added a 🏃 emoji on Strava
     rows so the affordance is visible.
  4. **Triaged 4 founder questions** from INBOX (answers in chat
     reply): no-sleep/HRV is data-source not code; Garmin
     activities → HC needs §14.5.2 + a Garmin Connect toggle;
     PRD overrides applied 2026-04-28; steps ARE pulled from HC.
     Updated `BUILD_PLAN.md` § Backlog Next entry for
     **§14.5.2 Health Connect granular pulls** — added
     ExerciseSessionRecord (the Garmin path) to scope, plus a
     "Founder note" diagnosing the no-sleep-data symptom.
  5. **Emptied INBOX.md** back to template state.
- **Files:** `CLAUDE.md` (push-every-response rule),
  `mobile/components/apex/WorkoutHistoryList.tsx`,
  `mobile/app/fitness/subsystem/cardio.tsx`,
  `mobile/app/fitness/subsystem/strength.tsx`,
  `docs/BUILD_PLAN.md` (§14.5.2 expanded),
  `docs/INBOX.md` (cleared).
- **Decisions:**
  - Outer filter (AI-classified) wins over inner filter
    (keyword) — outer has access to the canonical `session_type`
    field that comes from the log-time AI classifier.
  - Apply the same Strava-route pattern to strength.tsx even
    though most Strava activities are cardio — Strava DOES emit
    weight-training as an activity type, and the fix is identical.
  - "no sleep/HRV" stays diagnostic-not-fix. Module pulls all 5
    metrics; if data isn't appearing, the chain is HC → source
    (phone or wearable). Logged the diagnosis in BUILD_PLAN so
    future questions land at the right spot.
- **Outcome:** Shipping. TS clean (only pre-existing
  finance.tsx:114 carrying forward).
- **Manual checks (pending):**
  - Open Fitness tab → History sub-tab. Confirm only ONE row of
    filter chips shows (AI-classified, by `session_type`).
  - Open Fitness tab → Cardio subsystem detail screen. Tap a
    Strava-sourced row (look for 🏃 emoji) → should open the
    Strava detail screen (map + stats), not the manual-edit
    modal.
  - Same check on Strength subsystem detail (if any
    Strava-sourced strength activities exist).
  - Question follow-up: pull up Health Connect → Data → Sleep
    and Data → HRV. If both are empty, the issue is upstream of
    the app — your phone or wearable isn't writing those record
    types. If they have data but app shows null, ping back.

### 18:15 — Workflow refinement (filing-only triage) + customize.tsx config UX shipped
- **Prompt:** "i want claude to look at inbox, move items to
  correct spot so they are being tracked then clear it first
  then execute the next task in the active phase, not address
  the inbox item immediately. then when that is done provide an
  answer to any questions and what you did with my inbox items
  as well as with the active phase task as well in your end of
  movement summary. update build plan inbox .claude and phase
  log to reflect this modified workflow"
- **Did:**
  1. **Codified filing-only triage** in `CLAUDE.md` (Step 1
     rewritten: triage = filing, not executing; bugs go to
     Backlog with priority but don't preempt the active phase),
     `docs/BUILD_PLAN.md` (workflow section), and `docs/INBOX.md`
     (instruction text). Founder can still manually re-rank or
     say "fix this first" in chat to override.
  2. **Codified end-of-response 3-block summary** in CLAUDE.md
     (new step 4a — Inbox actions / Active phase progress /
     Answers to questions). Format is non-negotiable per founder
     direction — they need to know exactly what was filed vs
     built vs answered, every response.
  3. **Triaged INBOX:** founder added a Feature note while I was
     working ("we need to prompt the user on how to get each
     connection wired properly… for example go to health connect
     or garmin to make sure those can talk to each other").
     Filed as **"Connection wiring guidance / contextual
     onboarding"** (~6h) in Backlog → Later, with concrete
     scope including the HC-empty-after-grant detection +
     diagnostic affordance pattern. Cleared INBOX.md.
  4. **Set Active phase = Customize.tsx config-field UX** and
     executed it.
  5. **Backend:** added `/api/location/clusters` route in
     `app.py` — lightweight cluster list (no reverse-geocoding
     side effects, unlike `/api/location/today`). Returns
     `id / place_name / place_label / total_dwell_minutes /
     centroid_lat / centroid_lon` ranked by dwell.
  6. **Types:** extended `shared/src/types/goals.ts` with a
     `GoalConfig` interface (loose-typed; sparse keys per
     library_id) and added `config?: GoalConfig` to
     `GoalCreateInput`.
  7. **Mobile UI:** customize.tsx now renders per-library_id
     config sections:
     - **TIME-02:** `daily_cap_minutes` number input + hint.
     - **TIME-06:** cluster picker (one-tap-to-select, lists
       user's location_clusters with place name + dwell hours)
       + `weekly_visits_target` number input.
     - **TIME-05:** no extra config — `target_count` (hours/week)
       already covers it.
     `canCreate` now includes per-library config gates.
     `onSubmit` builds the `config` payload only when keys are
     set (clean payload).
- **Files:** `CLAUDE.md` (triage rule + 3-block summary rule),
  `docs/BUILD_PLAN.md` (workflow section, Active phase cleared,
  Status snapshot updated, new Backlog → Later item),
  `docs/INBOX.md` (rewritten + cleared), `app.py` (new route),
  `shared/src/types/goals.ts` (GoalConfig + config field),
  `mobile/app/goals/customize.tsx` (per-library config UI).
- **Decisions:**
  - Inline cluster picker over a separate component — only
    consumer right now is customize.tsx. Promote later if
    re-used elsewhere.
  - `GoalConfig` is loose-typed (`[key: string]: unknown`) so
    adding new per-goal config keys doesn't require type
    surgery.
  - Filing-only triage rule applies even to bugs — they go to
    Backlog → Now (default for testing-surfaced bugs) and get
    fixed when their tier comes up. Founder can override by
    saying so or re-ranking Backlog directly.
- **Outcome:** Shipping. TS clean (only pre-existing
  finance.tsx:114 carrying forward). Backend boot OK.
- **Manual checks (pending):**
  - Open the app → Goals → Library → pick TIME-02 (Screen time
    target). Confirm the form shows a "Daily screen-time cap
    (minutes)" input. Set 180, save, then Goals list should
    show the goal as active (not paused) once today's
    `screen_time_daily` row exists.
  - Same for TIME-06 (Location visit target). Confirm cluster
    picker lists your real location clusters. If empty, the
    "no clusters yet" hint should show. Pick a cluster, set
    weekly target, save.

### 19:00 — INBOX triage (7 items) + §14.2 Day Timeline core (hard blocks) shipped
- **Prompt:** "day timeline" — founder picked the next phase from
  the Now backlog.
- **Did:**
  1. **Triaged 7 INBOX items** (filing-only per new workflow).
     Bugs / UX (4) → Backlog → Now: HC display gap diagnosis
     (~3h), auto-sync cadence tightening (~2h), calorie chart
     wrong (~2h), subsystem "Apple Health" copy on Android
     (~30m). Feature (1) → Backlog → Later: bodyweight chart
     parity with Flask PWA (~3h). Question (1, screen-time) →
     answered in summary, not stored. Substantive feedback (1,
     "chatbot doesn't know much") → promoted §14.4 Chatbot
     three-tier context priority + added a "data audit"
     pre-cursor sub-task. Cleared INBOX.
  2. **Set Active phase = §14.2 Day Timeline core hard blocks**.
     Defined scope cuts up front: tasks-with-time deferred
     (no `task_time` field), sleep blocks deferred (HC daily
     aggregate has no session start/end), soft AI labeling is
     §14.2.2 (separate phase).
  3. **Backend shipped:**
     - `db.py`: new `day_blocks` table — `(user_id, block_date,
       block_start, block_end, kind, label, confidence,
       source_type, source_id, source_json)`. UNIQUE on
       (user_id, block_date, source_type, source_id) for
       idempotent recompute. Helpers
       `list_day_blocks / delete_hard_blocks_for_date /
       insert_day_block`.
     - New module `day_timeline.py`: `compute_hard_blocks`
       (pulls from gcal_events + outlook_events, excludes
       all-day events, uses prefix-match on start_iso for date
       window). `recompute_day_timeline` wipes hard + reinserts
       (preserves soft blocks for §14.2.2).
     - `app.py`: new `/api/day-timeline/<date_iso>` route.
       Recomputes on read in v1 (cron job is post-launch
       optimization). Strips `source_json` → parsed `source`
       object for client.
  4. **Mobile shipped:**
     - `mobile/lib/api/timeline.ts`: `DayBlock` + `DayTimelineResponse`
       types, `fetchDayTimeline`, `formatBlockTime` helper.
     - `mobile/components/apex/DayStrip.tsx`: horizontal
       scrollable strip on the Today tab. Each block = pill
       card with vertical color bar (kind/source-driven) +
       time range + label + subtitle (location or source).
       Empty state copy points to Connections. Header always
       rendered ("0 blocks" still shows).
     - Wired into `mobile/app/(tabs)/index.tsx` Today tab —
       sits between OverallScoreHero and CategoryScoreRow stack.
- **Files:** `db.py`, `day_timeline.py` (new), `app.py`,
  `mobile/lib/api/timeline.ts` (new),
  `mobile/components/apex/DayStrip.tsx` (new),
  `mobile/components/apex/index.ts`,
  `mobile/app/(tabs)/index.tsx`,
  `docs/BUILD_PLAN.md` (workflow updates + Backlog
  reorganization + new task_time follow-up item),
  `docs/INBOX.md` (cleared).
- **Decisions:**
  - **Recompute on read for v1.** 50-event days take <100ms;
    don't pre-optimize with cron jobs. Move to nightly compute
    only when scale demands it.
  - **`UNIQUE(user_id, block_date, source_type, source_id)`**
    over a composite PK. Auto-incrementing `id` is cleaner for
    soft blocks (which use UUIDs in source_id) and lets the
    insert helper use ON CONFLICT UPDATE.
  - **All-day events excluded** from the strip — they're not
    bounded time ranges, so they'd render weirdly. Could add
    an "all-day" pill row above the strip later if needed.
  - **DayStrip is horizontal-scroll.** Vertical timeline
    rendering needs more design; horizontal is simple and
    works on small screens.
  - **Tasks-with-time deferred** to a `task_time` migration
    phase (added to Backlog → Now). Sleep deferred to §14.5.2
    (already in Backlog → Next).
- **Outcome:** Shipping. Backend boots clean. TS clean (only
  pre-existing finance.tsx:114 carrying forward).
- **Manual checks (pending):**
  - Open the app → Today tab. Confirm "Today's timeline"
    section appears between Overall Score and the four
    category score rows.
  - If you have GCal or Outlook events today: they should
    render as horizontal pill cards with time ranges + titles.
    The vertical bar color is accent-blue for gcal, fitness-
    color for outlook.
  - If no events today, you'll see the "Connect Google Calendar
    or Outlook" empty-state copy.
  - All-day events are intentionally excluded.

### 19:45 — INBOX triage (8 items + Plaid de-icebox) + Founder trust pass: HC display + platform copy + safe-area
- **Prompt:** "continue" — pick up the next phase from Now.
- **Did:**
  1. **Triaged 8 INBOX items** (filing-only). Bugs/UX (5) →
     Backlog → Now: tab visual consistency Finance+Time vs
     Fitness+Nutrition (~3h), homepage Time card overhaul
     (~2h), safe-area enforcement (~1h, addressed this turn).
     Features (1) → Backlog → Later: Fitness subsystem
     consolidation (~3h), Day Summary view content gap (~3h).
     Question (2, scores not working / location sampling
     cadence) → answered in summary, not stored. Substantive
     scope change: **founder de-iceboxed Plaid** ("plaid should
     not be marked as deferred to post release this is critical
     for finance page i will work on getting it set up soon").
     Moved Plaid to Backlog → Next as a v1 critical-path
     ~30h item; founder owns the Developer Portal setup.
     Cleared INBOX.
  2. **Diagnosed root cause of HC display gap.**
     `mobile/lib/useHealthConnection.ts` is a stub from before
     C1 — just an AsyncStorage boolean, not connected to the
     real HC pipeline. `sleep.tsx` and `recovery.tsx` consumed
     this stub, never read `health_daily`, and showed
     "data pending — coming build" forever even when HC had
     real data. This is the founder's "HC has my data but
     Life Dashboard doesn't display it" symptom in full.
  3. **Shipped: HC data wiring on subsystem screens.** Added
     two helpers to `useHealthData.ts`: `useHealthToday()`
     (one-shot fetch of `/api/health/today` with today + history)
     and `healthHubLabel()` (platform-aware "Health Connect"
     vs "Apple Health" string). Rewrote
     `mobile/app/fitness/subsystem/sleep.tsx` with three states:
     not-permitted → connect CTA; permitted-but-no-data →
     diagnostic ("most Android phones don't track sleep
     natively; check your wearable's HC bridge"); permitted-
     with-data → hero number + 7-night trend bars. Same
     pattern in `recovery.tsx` (HRV + RHR hero + 14-day EMA
     + bar chart).
  4. **Movement subsystem:** wired HC `active_kcal` (replaces
     the "Connect Apple Health" stub in the active-minutes
     card with a real "Active calories from Health Connect"
     readout when permitted). HC `steps` overrides the
     manually-logged step count when present.
  5. **Cardio subsystem:** removed stale "Phase 6 / Apple
     Health" copy on the HR-zones placeholder; pointed users
     to the Strava activity detail screen for per-session
     zones (already shipped in §14.5.1).
  6. **Safe-area fixes (founder-flagged):**
     - `mobile/app/(onboarding)/_layout.tsx` now wraps the
       Stack in a View with `paddingTop: insets.top` +
       `paddingBottom: insets.bottom`. Onboarding screens
       no longer bleed into status bar / gesture nav.
     - `mobile/app/fitness/plan/builder.tsx`: nav bar at
       bottom now uses `paddingBottom: 12 + insets.bottom`;
       ScrollView contentContainerStyle adds insets.bottom
       to the bottom padding so content doesn't sit under
       the bar. Founder's "feels compressed" symptom fixed.
     - `mobile/app/day/[date].tsx`: custom header now uses
       `paddingTop: 12 + insets.top` (root Stack hides the
       default header for this route, so the custom header
       previously sat under the status bar).
- **Files:** `mobile/lib/hooks/useHealthData.ts` (new
  `useHealthToday` + `healthHubLabel`),
  `mobile/app/fitness/subsystem/sleep.tsx` (rewrite),
  `mobile/app/fitness/subsystem/recovery.tsx` (rewrite),
  `mobile/app/fitness/subsystem/movement.tsx` (HC active_kcal
  + steps wiring), `mobile/app/fitness/subsystem/cardio.tsx`
  (copy fix), `mobile/app/(onboarding)/_layout.tsx` (insets),
  `mobile/app/fitness/plan/builder.tsx` (insets),
  `mobile/app/day/[date].tsx` (insets),
  `docs/BUILD_PLAN.md` (3 INBOX bugs added to Now, 2 features
  added to Later, Plaid de-iceboxed to Next, 3 just-shipped
  bugs removed from Now, Status snapshot updated),
  `docs/INBOX.md` (cleared).
- **Decisions:**
  - Don't deprecate `useHealthConnection` (stub) outright —
    leaving it for now since other code paths might still
    import it. Add a note to its JSDoc that
    sleep/recovery/movement now use `useHealthData` directly.
    Future cleanup phase: rip out the stub.
  - Three-state UI on sleep/recovery (disconnected /
    permitted-no-data / has-data) instead of two — the
    middle state explicitly tells the founder "we're hooked
    up but your wearable isn't writing data" with a Sync
    button. Solves the "why is it empty" mystery in-place.
  - Movement subsystem: HC `steps` overrides manual entry
    when permitted-and-present. The reverse (manual override
    of HC) is a v1.6 polish if needed.
  - Plaid scope estimate (~30h): comparable to Strava's lift
    + extra OAuth complexity (Plaid Link's mobile flow is
    SDK-driven, not pure OAuth). Founder owns the Developer
    Portal setup; integration follows.
- **Outcome:** Shipping. TS clean (only pre-existing
  finance.tsx:114). All JS-only — no rebuild needed.
- **Manual checks (pending):**
  - Open Fitness → Sleep. With HC permitted + sleep data
    present, you should see a hero "8h 12m" (or whatever)
    and a 7-night bar trend. Without sleep data: a "Health
    Connect connected — no sleep data yet" diagnostic with
    Sync button.
  - Open Fitness → Recovery. Should show HRV today + 14-day
    EMA + RHR + a bar trend, OR the "no HRV data yet"
    diagnostic.
  - Open Fitness → Movement. Active calories card should
    show real kcal from HC if permitted, not the "Connect
    Apple Health" stub.
  - Open Fitness → Cardio. The HR zones placeholder should
    no longer say "Connect Apple Health" — it now points
    you at Strava-sourced rows for per-session zones.
  - Open Workout Builder. The bottom nav bar should sit
    above your gesture pill / on-screen back button, not
    behind it.
  - Open any onboarding screen. Top should sit below the
    status bar.
  - Open Day Detail (tap a day on the activity calendar).
    Header should sit below the status bar.
