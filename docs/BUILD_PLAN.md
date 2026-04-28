# Life Dashboard — Build Plan

> **Claude territory.** Founder pulls from this doc but does not edit
> it. Founder feedback flows in via [`INBOX.md`](INBOX.md); project
> history accumulates in [`PHASE_LOG.md`](PHASE_LOG.md); long-term
> product spec lives in [`migration/APEX_PRD_Final.md`](migration/APEX_PRD_Final.md).

**Last updated:** 2026-04-28 by Claude (post 3-file split + Vision rewrite)

---

## The 3-file system

```
docs/
  BUILD_PLAN.md   ← this file. Claude maintains. What's queued, what's
                    deferred, the long-term vision distilled.
  INBOX.md        ← founder maintains. Drop bug reports / UX issues /
                    ideas / questions while testing. Claude empties it
                    at the start of every chat response.
  PHASE_LOG.md    ← Claude maintains. Append-only log of every Claude
                    response. Never capped. Read end-to-end to recover
                    full project history.
```

### Founder workflow

You're testing the app while I code — that's the leverage split. When
you find something, drop it into `INBOX.md` as one line. Don't worry
about formatting; I'll triage at the start of my next response.

You don't need to touch `BUILD_PLAN.md` or `PHASE_LOG.md`. Both are
maintained by me. If you want something prioritized differently, just
say it in chat.

### Claude workflow (me)

**Start of every chat response:**
1. Read `INBOX.md`. If non-empty, triage every line — convert to
   Backlog tier here (Now / Next / Later / Icebox), file as a
   current-phase blocker, ask the founder for clarification, or
   dismiss with a one-line reason. **Empty `INBOX.md` after triage**
   so the founder knows their notes were processed.
2. Read this file's `Status` + `Active phase` + `Backlog → Now` to
   know where the project is.
3. Read the source files relevant to the *active phase* — not the
   inbox content. Inbox is feedback flow; the active phase is what
   I work on unless the founder explicitly redirects.

**During a phase:**
- One phase active at a time.
- Issue explicit `MANUAL CHECK:` prompts when something can only be
  verified by the founder (UI / native / env / external service /
  ambiguous requirement). Wait for ack before declaring the phase
  done.
- Append a `PHASE_LOG.md` entry at the end of every response — even
  one-word responses ("ok", "continue") get a brief log line.

**End of every phase:**
1. Append a fuller Phase Log entry summarizing what shipped /
   deferred / decided. (PHASE_LOG.md has the format.)
2. Clear **Active phase** here to "(none — between phases)".
3. Re-rank **Backlog → Now** if priorities shifted.
4. Update **Status snapshot** at the top of this doc.
5. Bubble every Deferred item from the phase into Backlog with a
   tier + reason. Don't let them rot in PHASE_LOG.
6. Tell the founder: what shipped, manual checks pending, queued
   next.

### Manual checks — explicit, never silent

Format: `MANUAL CHECK: <one-line action>` (grep-able). Issue when:
- **UI / native / device-permission changes** — founder must run
  the app and verify.
- **Env / config edits** — new env var, Cloud Console API enable,
  third-party service setup.
- **External-system actions** — GitHub permissions, OAuth scopes,
  app-store config, anything in a founder-owned account.
- **Unclear requirements** — ask before guessing when a 10-second
  question saves a wrong shipment.

Track unresolved checks in the phase's Phase Log entry under
`Manual checks pending:`. Surface stale ones at the start of the
next response ("Still waiting on manual check from §X: did Y
work?").

---

## Status snapshot

**Where we are:** v1.5 mid-build. C1 connectors all shipped (Gmail /
GCal / Outlook / Strava / Health Connect / Location / Screen Time).
Workout builder + Strava activity detail + 3 of 5 newly-unblocked goal
handlers shipped. Mobile is on local Android builds (~5 min vs EAS
~70 min). Doc system was just restructured into the 3-file split
(BUILD_PLAN / INBOX / PHASE_LOG).

**Active surface area:** Goals (TIME-02/05/06 wired backend; UI for
config_json not yet exposed). Day Timeline core is the next big
phase. Strava detail polish nice-to-have.

**Known stable:** Nutrition tab, Fitness tab core, OAuth flows for
all 4 providers, custom Expo Modules (`health-connect`, `usage-stats`),
local Android build pipeline.

**Known fragile:**
- Location connect-flow alert chain (minor UX polish in Backlog).
- Outlook multi-tenant (waiting on Microsoft Publisher Verification —
  ~1 wk wait + paperwork).
- Pre-existing TS error `app/(tabs)/finance.tsx:114` (carrying
  forward; will fix when finance gets next touch).

---

## Active phase

**(none — between phases)**

When picking up, fill this with:
- **Phase:** name + linked Backlog item
- **Scope:** one-paragraph what+why
- **Todos:** tracked via TodoWrite
- **Notes:** any decisions / blockers mid-flight

---

## Backlog

Prioritized queue. **Now** is the next 1-3 phases; **Next** is queued
for the following weeks; **Later** is v1.5+ scope; **Icebox** is out
of scope for the foreseeable future.

Each item: `- **Title** (~Xh)` + 1-2 lines of context.

### Now — pick the next phase from here

- **§14.2 Day Timeline core — hard blocks** (~12h). Deterministic
  block computation from gcal/outlook events + tasks-with-time +
  HC sleep windows. Stored in a new `day_blocks` table; rendered as
  a day strip on Today tab. See [Vision → Day Timeline](#day-timeline-the-architectural-pivot).
- **Customize.tsx config-field UX** (~2h, mobile follow-up to §14.8).
  TIME-02/05/06 backend handlers ship, but the create-goal form has
  no input for `daily_cap_minutes` / `cluster_id` /
  `weekly_visits_target`. Until this lands, those goals instantiate
  paused. JS-only change.
- **Location connect-flow UX fix** (~1h). Alert chain still fragile
  post-C1; minor polish.

### Next — queued for weeks 2-3

- **Day Timeline soft-block AI labeling** (~10h). Builds on hard
  blocks. Claude Haiku labels gaps using HC + screen-time + location
  context.
- **Day Timeline mobile UI** (~2h). Day-strip component on Today tab.
- **Patterns view — hybrid** (~14h). Deterministic patterns + AI
  synthesis. Replaces Momentum tab's stub.
- **Chatbot three-tier context** (~10h). Always-on / day-stream /
  historical loading per PRD §3.3 chat overhaul.
- **3 new goal types** (~4h). Inbox-zero-streak, sleep-regularity,
  movement-minutes — needs library entries + handlers + customize.tsx
  surfaces.
- **Health Connect granular pulls** (~8h). Per-day workout segments,
  more sleep stages.

### Later — v1.5+, scoped but not urgent

- **Background GPS sampling** (~3h). Foreground-only today; needs
  platform review + persistent-notification permission rationale.
- **Google Tasks connector** (~3h, recommended next-connector).
- **Photo metadata connector** (~6h, geotags + EXIF for location
  ground truth).
- **GitHub events connector** (~4h).
- **AI tool exports** (~10h, ambitious / differentiating).
- **Phone wake events** (~3h).
- **Calendar enrichment** (~4h).
- **Email enrichment** (~5h).
- **TIME-03 Social media cap** — needs per-app categorization on
  `screen_time_daily.top_apps_json`. Either hardcoded social-package
  whitelist (~1h) or extend usage-stats Expo Module to surface
  Android category metadata (~3h).
- **TIME-04 Phone-down after cutoff** — needs hourly screen-time
  buckets. Requires extending `usage-stats` module + a new
  `screen_time_hourly` table (~3h).
- **Outlook Publisher Verification** (~2h docs + 1 wk wait).

### Icebox — out of scope for foreseeable future

- **iOS / HealthKit / Family Controls** — Android-first; defer until
  iPhone test device + Apple Developer Program.
- **Garmin Connect** — approval gate is months long; HC + Strava
  cover the use case for now.
- **Plaid** — finance tab is manual-entry-only for v1; Plaid is
  post-launch monetization gate.
- **RevenueCat / paywall / tier gating** — solo-user phase;
  post-monetization.
- **Sentry / crash reporting** — solo-user phase; logs + manual
  reproduction sufficient.

---

## Deferred / known gaps

Things explicitly cut from scope with reason + when to revisit.

- **`app/(tabs)/finance.tsx:114` TS error** (`FinanceTransaction.merchant_name`
  shape mismatch). Pre-existing; carrying forward across phases.
  Revisit: when finance tab next gets touched.
- **Inline-add-an-exercise in plan view** — modal supports edit, trash
  supports delete, but adding a new exercise requires the Manual
  Builder flow. Revisit: when founder asks.
- **Granular diff hint in plan-edit save banner** ("3 exercises
  changed") — currently a static string. Revisit: v1.6 polish.
- **Pace-over-distance line chart on Strava detail** — splits table
  covers per-mile pace. Revisit: if user feedback signals.
- **`data_source_status` enum on goals** — `paused` boolean +
  `pace.label` cover the UI need. Revisit: when goals list view
  gets badges.
- **Wizard "REQUIRE picking a data source for tracked goals"** —
  current customize.tsx already shows `data_source` from the
  library entry. Revisit: if onboarding studies show confusion.

---

## Vision

This section distills the PRD ([`migration/APEX_PRD_Final.md`](migration/APEX_PRD_Final.md))
into the load-bearing decisions that constrain *every* phase. Read
the PRD for the long-form spec; read this section for the spine.

### What Life Dashboard is

A single intelligent dashboard for **the Ambitious Generalist** —
someone juggling fitness, money, work, and personal commitments
across 6+ apps that don't talk to each other. Life Dashboard
collapses the fragmentation: one dashboard, four cards, automatic
data inflow from every major platform, an AI chatbot with full life
context that answers "what should I do right now."

The product's north star: **reduce cognitive load without reducing
agency.** The dashboard is a mirror, not a coach. The chatbot is a
consultant, not an authority.

### The four categories

Each category card is first-class — own score, own sub-metrics, own
drill-down, own contribution to Overall Score.

| Category | What it is | Primary data sources |
|---|---|---|
| **Fitness** | Body, recovery, sleep, HRV, weight, workouts | HealthKit / Health Connect, Strava, Garmin, manual |
| **Nutrition** | Calories, macros, hydration, pantry, meal consistency | Manual entry, AI photo scan, AI text/voice parse, barcode |
| **Finance** | Spending, budget, bills, savings rate | Plaid (post-launch), manual transactions/budgets |
| **Time** | Shape of the day — sleep regularity, attention fragmentation, location intentionality, schedule density, rhythm adherence | Passive only: HC sleep, Screen Time, Location, Calendar |

**Time is the differentiator.** Three of four (Fitness/Nutrition/
Finance) match how the target user already thinks. Time is what
no single-domain tracker can build without expanding into other
domains. The user can't game Time because they're not asked to log
anything — the phone watched the day and the score reflects that.

### Scoring engine — deterministic, not AI

Every category score uses **deterministic math**, not AI. Scores
must be:
- **Fast** (render in milliseconds; no API round-trips)
- **Free** (no variable cost per calculation)
- **Reproducible** (same inputs → same score, always)
- **Explainable** (drill-in shows exactly what drove the score)
- **Personalized** (uses 30-day baselines once established)

This is the spine of the product. Any phase that adds AI to score
computation must surface the choice and justify it (the §14.2 Day
Timeline pivot is one such justified break — see Vision → PRD
overrides).

### Where AI is allowed

AI is reserved for jobs where it's the **best available tool for
reducing user friction or delivering intrinsic value**:
- Cleaning messy data (meal parse from text/photo, barcode AI fallback)
- The life-aware chatbot (answers questions using full LifeContext)
- Drafting content the user then approves (email replies, meal
  suggestions, AI workout plan generation)
- Soft-block labeling in Day Timeline (gap inference)

AI is **never** allowed to:
- Be prescriptive ("you should…" — banned globally; descriptive AI
  narrating computed numbers, user-invoked, is permitted)
- Run as a background feature without explicit user opt-in
- Replace deterministic scoring

### Business model (v1.21 locked)

- **Core** — $4.99/mo or $49.99/yr. 10 chatbot queries/day, all
  connectors, all four scores, full goals library, 90-day hot
  history, CSV export.
- **Pro** — $9.99/mo or $99.99/yr. 50 chatbot queries/day, Premium
  Scan (Opus), Pantry Scanner, AI-Drafted Email Replies, higher
  plan generation quota, unlimited archived history, PDF export,
  30-day historical immutability.
- 14-day free Pro trial at signup; trial end forces a Core/Pro
  pick.

### Platform & launch

- **Android-first** (Expo SDK 54 + RN 0.81 + new architecture).
  iOS waits on Apple Developer Program + HealthKit / Apple Family
  Controls entitlements.
- **Connection floor:** v1 won't ship without Strava (already done)
  or Garmin (defer, approval gate is months).
- **Launch sequence:** pre-alpha (now, Flask PWA → React Native) →
  alpha (TestFlight / Play Internal, 10–20 users) → closed beta
  (50–100, weeks 16–18) → public launch (week 22).

### Backend stack

- Flask (single `app.py`, 50K+ lines — yes, it's the convention).
- Raw `sqlite3` via `db.py`, no ORM.
- Per-integration `*_sync.py` modules (`gmail_sync.py`, `gcal_sync.py`,
  `outlook_sync.py`, `strava_sync.py`, `location_engine.py`).
- AI call layer: `claude_nutrition.py`, `claude_profile.py`,
  `chatbot.py`.
- Connector catalog (`connectors.py`) is the source of truth for
  what connectors exist; `users_connectors` table tracks per-user
  state.

### Mobile stack

- Expo SDK 54, file-based routing in `mobile/app/`.
- Tab screens in `mobile/app/(tabs)/`.
- Components in `mobile/components/apex/` (single barrel `index.ts`).
- Hooks in `mobile/lib/hooks/`.
- Shared types in `shared/src/types/` — used by mobile and (where
  applicable) backend pyi stubs.
- Local Expo Modules in `mobile/modules/<name>/` for native
  integrations where third-party libs are too fragile (template
  established by `health-connect` and `usage-stats`).

### PRD overrides (where the build plan supersedes the PRD)

These are the load-bearing decisions where the product diverged from
the original PRD. Each is documented with the reasoning so future
deviations are deliberate, not accidental.

- **PRD §4.6.5 "No AI in timeline computation"** → overridden. Day
  Timeline uses deterministic hard blocks + AI-labeled soft blocks
  (two-tier). Pure determinism leaves too many gaps; users want a
  picture of the whole day, not just the parts a calendar event
  vouched for.
- **PRD §3.3 Chatbot 8K-token cap** → overridden to ~18K. Three-tier
  context (always-on / day-stream / historical) with per-tier
  budgets. Pre-summarizing is lossy; bigger raw JSON wins.
- **PRD §4.10.5 "When current data is unavailable, mark goal paused"**
  → kept. The `paused` flag covers what the UI needs; no separate
  `data_source_status` enum.
- **Backend stack: Flask + SQLite, not Node.js + PostgreSQL.** PRD
  §1.7 specs Node.js + AWS-native serverless. We stayed on Flask +
  SQLite for solo-founder speed; the migration is a v2 problem.

### Day Timeline — the architectural pivot

Replaces the empty Today-tab strip with a two-tier timeline of the
day:
- **Hard blocks (~6h)** — deterministic, from gcal/outlook events,
  tasks with explicit times, HC sleep windows.
- **Soft blocks (~10h)** — AI-labeled gap inference. Claude Haiku
  reads HC activity + screen-time + location for each unaccounted
  hour and labels it ("focus work", "transit", "exercise", etc.)
  with a confidence score.
- **Storage:** new `day_blocks(user_id, block_start, block_end,
  kind, label, confidence, source_json)` table.
- **Mobile UI:** ~2h day-strip on Today tab.
- **Compute infra:** ~4h cron job + on-change triggers.

This is the biggest scope change vs PRD; documented because pure
determinism couldn't cover the full day, and a partial timeline
felt worse than no timeline.

### Three-tier chatbot context (PRD §3.3 override)

- **Always-on tier** (~2K tokens): user profile + today's plan +
  active goals.
- **Day-stream tier** (~6K): events / tasks / meal logs / workouts
  for the current day.
- **Historical tier** (~10K, lazy-loaded on intent): trailing 14
  days summarized + last week's Day Timeline.

Cost guardrails: per-user-per-day token cap, degraded mode below
that. Privacy: explicit "what does Claude see?" affordance in
chatbot screen.

### Connector depth philosophy

The C1 phase shipped breadth (Gmail, GCal, Outlook, Strava, HC,
Location, Screen Time). The depth phases (§14.5) progressively
deepen each connector's data extraction. The principle: shallow
data feeds the dashboard; deep data feeds the chatbot's LifeContext.

Order of depth: Strava (shipped) → Health Connect granular →
Calendar enrichment → Email enrichment.

### Why this is category-defining

Most personal-tracking apps lock data behind their walled gardens.
Life Dashboard's bet: **pull from every connector the user already
has, run AI over the union, and make the synthesis the product.**

No finance app will add calorie tracking; no nutrition app will
add Plaid; no productivity app will read your HealthKit sleep.
The integration work required to match Life Dashboard's surface
area *is* the moat.

---

## Archive

- **Project history (day 0 → today, narrative form):**
  [`docs/PHASE_LOG.md`](PHASE_LOG.md)
- **Original v1 build plan + v1.5 vision long-form:**
  [`docs/migration/BUILD_PLAN_v2_archive.md`](migration/BUILD_PLAN_v2_archive.md)
- **Older Phase Log entries** (when they age out): currently nothing
  archived; PHASE_LOG.md is uncapped.
- **PRD (full long-form spec):**
  [`docs/migration/APEX_PRD_Final.md`](migration/APEX_PRD_Final.md)
