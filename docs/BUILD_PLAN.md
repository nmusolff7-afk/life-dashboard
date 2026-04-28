# Life Dashboard — Build Plan

> **Single source of truth** for project status. Read top-down for the
> current picture. The first three sections (Status / Active / Inbox)
> change every session; everything below is stable scope/history.

**Last updated:** 2026-04-28 by Claude (post §14.8 partial)

---

## How this doc works

This is a living document. Founder + Claude both maintain it.

### Founder workflow (you)

While Claude is coding, **you should be testing the app** — that's the
highest-leverage use of your time. When you find anything — a bug, a
weird interaction, a missing feature, a question — drop it into
**[Inbox](#inbox)** as a single line. Don't worry about formatting.

You can also trigger the next phase by editing **[Active phase](#active-phase)**
or rearranging **[Backlog](#backlog)**. If something needs Claude's
input mid-session, just say it in chat — Inbox is for things that
should survive across sessions.

### Claude workflow (me)

**Start of every session:**
1. Read top of this doc: Status → Active → Inbox → Backlog (Now).
2. **Triage Inbox** — for each line, decide: convert to Backlog (Now /
   Next / Later), file as a current-phase blocker, ask the founder for
   clarification, or dismiss with a one-line reason. Don't leave items
   in the Inbox after triage.
3. Confirm with the founder what the active phase is before writing
   any code. If Active is empty, propose a phase from Backlog → Now.

**During a phase:**
- One phase active at a time. If scope creeps, log it as a follow-up,
  don't silently expand.
- **Manual-check checkpoints** are explicit (see [Manual checks](#manual-checks)
  below). Pause and ask — never silently assume something works.

**End of every phase:**
1. Append an entry to **[Done — Phase Log](#done--phase-log)** (template
   at top of that section).
2. Clear **Active phase** to "(none)".
3. Re-rank **Backlog → Now** if priorities shifted.
4. Update **Status snapshot** at the top.
5. Bubble new follow-ups (deferred items, problems flagged) into
   Backlog with a reason.
6. Tell the founder: what shipped, what to verify manually, what's
   queued next.

### Manual checks

Some things Claude cannot verify alone. The founder must confirm:

- **UI changes** — anything Claude can't run (mobile screens, native
  modules, anything behind device permissions). After the change,
  Claude says: *"MANUAL CHECK: open the app, navigate to X, verify Y.
  Reply with 'ok' or what's wrong."*
- **Env / config edits** — when a new env var is required, when a
  Cloud Console API needs enabling, when a third-party service needs
  setup. Claude lists exactly what to do; founder confirms done.
- **External-system actions** — anything that touches GitHub
  permissions, OAuth scopes, app-store config, or any account the
  founder owns directly.
- **Unclear requirements** — when the spec is genuinely ambiguous,
  ask before guessing. Don't ship "best guess + revisit later" when
  a question takes 10 seconds.

Format: `MANUAL CHECK: <one-line action>` so it's grep-able. Wait for
acknowledgement before declaring the phase done.

---

## Status snapshot

**Where we are:** v1.5 mid-build. C1 connectors all shipped (Gmail /
GCal / Outlook / Strava / Health Connect / Location / Screen Time).
Workout builder + Strava activity detail screen + 3 of 5 newly-unblocked
goal handlers shipped. Mobile is on local Android builds (~5 min vs
EAS ~70 min).

**Active surface area:** Goals (TIME-02/05/06 wired backend; UI for
config_json fields not yet exposed), Day Timeline (next big phase),
Strava detail polish.

**Known stable:** Nutrition tab, Fitness tab core, OAuth flows for all
4 providers, custom Expo Modules (`health-connect`, `usage-stats`).

**Known fragile:** Location connect-flow alert chain (§14.5.5.g),
Outlook multi-tenant (waiting on Microsoft Publisher Verification).

---

## Active phase

**(none — between phases)**

When picking up: confirm with founder, then fill this section with:
- **Phase:** name + linked Backlog item
- **Scope:** one-paragraph what+why
- **Todos:** checklist tracked via TodoWrite
- **Notes:** any decisions made mid-flight

---

## Inbox

**Founder feedback queue.** Drop bug reports, UX issues, feature
ideas, and questions here as you test the app. One line per item.
Claude triages at start of next session and clears this list.

Format: `- [Type] description` — Type ∈ Bug / UX / Feature / Question.

**Severity tags** (optional, for bugs): `(blocker)` / `(annoying)` /
`(minor)`.

### Bugs / UX
_(empty — drop items here)_

### Feature ideas
_(empty — drop items here)_

### Questions
_(empty — drop items here)_

---

## Backlog

Prioritized queue. **Now** is the next 1-3 phases; **Next** is queued
for the following weeks; **Later** is v1.5+ scope; **Icebox** is out
of scope for the foreseeable future.

Each item: `- **Title** (~Xh)` + 1-2 lines of context + linked spec.

### Now — pick the next phase from here

- **§14.2 Day Timeline core — hard blocks** (~12h). Deterministic
  block computation from gcal/outlook events + tasks-with-time +
  HC sleep windows. Stored in a new `day_blocks` table; rendered as a
  day strip on Today tab. See [Vision §14.2](#142-day-timeline--the-architectural-pivot-22h).
- **Customize.tsx config-field UX** (~2h, mobile follow-up to §14.8).
  TIME-02/05/06 backend handlers ship, but the create-goal form has
  no input for `daily_cap_minutes` / `cluster_id` /
  `weekly_visits_target`. Until this lands, those goals instantiate
  paused. JS-only change.
- **§14.5.5.g Location connect-flow UX fix** (~1h). Alert chain still
  fragile post-C1; minor polish.

### Next — queued for weeks 2-3

- **§14.2.2 Day Timeline soft-block AI labeling** (~10h). Builds on
  hard blocks. Claude Haiku labels gaps using HC + screen-time +
  location context.
- **§14.2.4 Day Timeline mobile UI** (~2h). Day-strip component on
  Today tab.
- **§14.3 Patterns view — hybrid** (~14h). Deterministic patterns +
  AI synthesis. Replaces Momentum tab's stub.
- **§14.4 Chatbot three-tier context** (~10h). Always-on / day-stream
  / historical loading per PRD §4.X chat overhaul.
- **§14.8 follow-up: 3 new goal types** (~4h). Inbox-zero-streak,
  sleep-regularity, movement-minutes — needs library entries +
  handlers + customize.tsx surfaces.
- **§14.5.2 Health Connect granular pulls** (~8h). Per-day workout
  segments, more sleep stages, etc.

### Later — v1.5+, scoped but not urgent

- **§14.5.5.a Background GPS sampling** (~3h). Foreground-only today.
  Needs platform review + persistent-notification permission rationale.
- **§14.6.1 Google Tasks** (~3h, recommended next-connector).
- **§14.6.2 Photo metadata** (~6h, geotags + EXIF for location ground
  truth).
- **§14.6.3 GitHub events** (~4h).
- **§14.6.4 AI tool exports** (~10h, ambitious / differentiating).
- **§14.6.5 Phone wake events** (~3h).
- **§14.5.3 Calendar enrichment** (~4h).
- **§14.5.4 Email enrichment** (~5h).
- **TIME-03 Social media cap** — needs per-app categorization on
  `screen_time_daily.top_apps_json`. Either hardcoded social-package
  whitelist (~1h) or extend usage-stats Expo Module to surface
  Android category metadata (~3h).
- **TIME-04 Phone-down after cutoff** — needs hourly screen-time
  buckets. Requires extending `usage-stats` module + a new
  `screen_time_hourly` table (~3h).
- **§14.9 Outlook Publisher Verification** (~2h docs + 1 wk wait).

### Icebox — out of scope for foreseeable future

- **iOS / HealthKit / Family Controls** — Android-first; defer until
  iPhone test device + Apple Developer Program.
- **Garmin Connect** — approval gate is months long; HC + Strava
  cover the use case for now.
- **Plaid** — finance tab is manual-entry-only for v1; Plaid is post-
  launch monetization gate.
- **RevenueCat / paywall / tier gating** — solo-user phase; post-
  monetization.
- **Sentry / crash reporting** — solo-user phase; logs + manual
  reproduction are sufficient.

---

## Deferred / known gaps

Things explicitly cut from scope with reason + when to revisit.

- **`app/(tabs)/finance.tsx:114` TS error** (`FinanceTransaction.merchant_name`
  shape mismatch). Pre-existing; carrying forward across phases.
  Revisit: when finance tab next gets touched.
- **Inline-add-an-exercise in plan view** — modal supports edit, trash
  supports delete, but adding a new exercise requires the Manual
  Builder flow in Settings. Revisit: when founder asks.
- **Granular diff hint in plan-edit save banner** ("3 exercises
  changed") — currently a static string. Revisit: v1.6 polish.
- **Pace-over-distance line chart on Strava detail** — splits table
  covers per-mile pace; smoothed pace stream chart deferred. Revisit:
  if user feedback signals.
- **`data_source_status` enum on goals** — `paused` boolean +
  `pace.label` cover the UI need. Revisit: when goals list view gets
  badges.
- **Wizard "REQUIRE picking a data source for tracked goals"** —
  current customize.tsx already shows `data_source` from the library
  entry. Revisit: if onboarding studies show confusion.

---

## Done — Phase Log

**Append-only.** Reverse chronological. Capped at 15 entries. When
this section grows past 15, archive the oldest to
`docs/PHASE_LOG_ARCHIVE.md` and trim here.

### Entry template

```markdown
### Phase log: <phase name> — <YYYY-MM-DD>

**Shipped:**
- ...

**Deferred:**
- ... (reason; expected pickup)

**Problems flagged:**
- ...

**Decisions:**
- ...

**Next pickup:**
- ...

**Manual checks pending:**
- ... (or "none")
```

The `Manual checks pending` line is critical — it's the explicit
hand-off list of things the founder still needs to verify on-device
before the phase counts as truly closed.

---

### Phase log: §14.8 Goals data-binding (partial) — 2026-04-28

**Shipped:**
- `config_json` plumbing end-to-end: [`db.py`](../db.py)
  `create_goal_from_library(... config=)`, `update_goal_fields` accepts
  `config` field, [`app.py`](../app.py) `_serialize_goal` parses
  `config_json` into `config` for the client.
- 3 progress handlers in [`goals_engine.py`](../goals_engine.py):
  - **TIME-02 Screen-time cap streak** — daily streak qualifying on
    `screen_time_daily.total_minutes <= config.daily_cap_minutes`.
  - **TIME-05 Focus time per week** — period_count summing minutes
    from gcal+outlook events whose title matches `lower LIKE '%focus%'`.
    `target_count` is HOURS.
  - **TIME-06 Location visits per week** — weekly streak counting
    days within 75m of `config.cluster_id`. Streak in weeks =
    `target_streak_length`.
- Helpers: `_goal_config`, `_haversine_m`, `_visits_to_cluster_in_week`,
  `_focus_minutes_in_window`. Dispatch table now 16 handlers (was 13).

**Deferred:**
- **TIME-03 Social cap** — needs per-app categorization on
  screen_time_daily.top_apps_json. Pickup: Backlog → Later.
- **TIME-04 Phone-down after cutoff** — needs hourly screen-time
  buckets. Pickup: Backlog → Later.
- **3 new goal types** (inbox-zero-streak, sleep-regularity,
  movement-minutes) — own ~4h follow-up phase. Backlog → Next.
- **Customize.tsx UI for config fields** — backend accepts; UI
  doesn't yet expose. Backlog → Now.

**Problems flagged:**
- The build-plan §14.8 description (TIME-02..06 labels + data
  sources) was out of date relative to the actual seeded library.
  Source-of-truth is `db.py:_GOAL_LIBRARY_V1`, not the plan doc.
  Lesson: read the source before assuming plan items are accurate.
- No tests yet for the 3 new handlers; backend smoke-test confirms
  imports clean and dispatch table populated.

**Decisions:**
- `config_json` over a parallel `goal_config` table — sparse,
  goal-type-specific settings; JSON column matches existing
  `user_goals.config_json` pattern.
- Skip the `data_source_status` enum — `paused` flag does the same
  job in v1.5.
- TIME-05 keyword match on "focus" — simplest convention, refine
  later.
- Visit radius 75m vs cluster radius 50m — slightly bigger so
  edge-of-cluster visits still count.

**Next pickup:**
- §14.2 Day Timeline core (week 2 item, biggest leverage), or
- Customize.tsx config-field UX (small mobile follow-up that lights
  up the §14.8 handlers immediately).

**Manual checks pending:**
- None for §14.8 — handlers will sit paused until Customize UX ships
  + real config is set on a goal. No founder verification needed
  until then.

---

### Phase log: §14.5.1 Strava maps + charts — 2026-04-26

**Shipped:**
- `strava_activity_detail` table + helpers (`upsert_strava_detail`,
  `get_strava_detail`).
- [`strava_sync.py`](../strava_sync.py) detail/streams/zones fetchers
  + `downsample_stream`.
- Lazy `/api/strava/activity/<id>` route; map URL pre-built
  server-side via `path=enc:<polyline>`.
- [`mobile/lib/api/strava.ts`](../mobile/lib/api/strava.ts) helper +
  types.
- [`mobile/app/fitness/strava-activity/[id].tsx`](../mobile/app/fitness/strava-activity/[id].tsx)
  detail screen — Static Maps hero, 4-cell stats grid, ElevationSparkline,
  ZonesBars, SplitsTable. All viz inline View-based.
- WorkoutHistoryList wires Strava-sourced rows to detail screen.

**Deferred:**
- Pace-over-distance line chart — splits table covers per-mile pace.
- Tap-a-zone-bucket drilldown.

**Problems flagged:**
- `useUnits()` lacks distance formatters — inlined in detail screen
  rather than expanding the hook globally.
- `_extract_streams` had to handle both dict-keyed (`key_by_type=true`)
  and list-shaped Strava responses.
- **`GOOGLE_MAPS_API_KEY` missing from `.env`** caused all maps to
  show "No GPS route" (UI conflated "no key" with "no polyline").
  Memory entry updated.

**Decisions:**
- Static Maps over `react-native-maps` — visual parity with Location
  card; no native dep / rebuild.
- Inline View-based viz — no chart lib dep.
- Lazy server-side fetch over backfill — saves API budget.

**Manual checks pending:** none (founder verified).

---

### Phase log: §14.7b Workout-plan draft-mode editing — 2026-04-28

**Shipped:**
- Backend dry-run revise (`/api/workout-plan/revise` accepts
  `dry_run` + `current_plan`).
- [`mobile/lib/api/plan.ts`](../mobile/lib/api/plan.ts) overload-typed
  `reviseWorkoutPlan` (dry-run vs commit modes).
- Draft-mode in [`mobile/app/fitness/plan/index.tsx`](../mobile/app/fitness/plan/index.tsx)
  — `draftPlan` state, `workingPlan = draftPlan ?? plan.plan`,
  Save/Cancel sticky banner pinned to bottom.
- Removed misleading "Edit plan" → wizard buttons; Settings now has
  single "View / edit" button → `/fitness/plan`.
- Cardio rows tappable in day dropdown; cardio editor modal.

**Deferred:**
- Granular diff hint ("3 exercises changed") — static string for v1.5.
- Inline-add-an-exercise — needs explicit "+" affordance per day card.

**Decisions:**
- Dry-run as a flag, not a new endpoint.
- AI revise basis = current working plan (lets user iterate
  manual → AI → save).
- Single Save bar pinned bottom — matches "I'm in edit mode" mental model.
- Discard requires confirm; Save doesn't.

**Manual checks pending:** none (founder verified).

---

### Phase log: §14.7 Workout builder polish — 2026-04-28

**Shipped:**
- Quiz pre-population in [`mobile/app/fitness/plan/builder.tsx`](../mobile/app/fitness/plan/builder.tsx)
  via `?initial=<encoded>` URL param.
- Inline exercise edit modal in plan view.
- Edit plan / Switch plan disambiguation.
- Settings → Workout Plan consolidation.

**Problems flagged:**
- The original Phase Log audit reported §14.7 as mostly UN-shipped;
  reality was the wizard + revise flow + understanding + sources
  expandable were already in place. Lesson: read the source before
  assuming plan items are todo.

**Decisions:**
- Pass `quiz_payload` via URL param, not route-level state.
- Don't deactivate active plan when "Edit plan" is hit.
- Modal-based inline edit, not expand-the-row.

**Manual checks pending:** none.

---

### Phase log: C1 connectors + Time/Finance redesigns + v1.5 vision — 2026-04-27 / 2026-04-28

Multi-day marathon. Listed as one consolidated entry.

**Shipped:**
- OAuth integrations end-to-end (Gmail, GCal, Outlook, Strava).
- Custom Expo Modules: [`mobile/modules/health-connect/`](../mobile/modules/health-connect/),
  [`mobile/modules/usage-stats/`](../mobile/modules/usage-stats/).
- Location intelligence: [`location_engine.py`](../location_engine.py)
  with DBSCAN clusters + reverse geocoding + Static Maps.
- Time + Finance tab redesigns.
- Backend infra: 4 sync modules + 7 new tables + chatbot LifeContext
  populated.
- Local Android build pipeline (Windows + Android Studio's JBR + NDK).
- §14 Vision v1.5 plan added.

**Problems flagged:**
- `react-native-health-connect` (matinzd) incompatible with Expo
  new-arch — fixed by writing custom Expo Module.
- `react-native-usage-stats-manager` uses Gradle 4 syntax — same fix.
- Pre-existing finance.tsx TS error.
- `.env` env-var-loss gotcha (saved to memory).

**Decisions:**
- Scrapped PRD §4.6.5's "no AI in timeline computation" stance —
  two-tier (deterministic + AI-labeled) is right.
- Big-JSON-to-chatbot pattern over pre-summarizing.
- Custom Expo Modules over fragile third-party libs.
- Local Gradle builds over EAS Build local mode.

**Manual checks pending:** none (founder verified end-to-end).

---

## Vision

The v1.5 long-term roadmap. Mostly stable; updated when scope shifts.
The full text from the original `BUILD_PLAN_v2.md` §14 is preserved in
`docs/migration/BUILD_PLAN_v2_archive.md`. Key sections recapped here.

### PRD overrides (approved 2026-04-28)

The original PRD treated several decisions as fixed; v1.5 revisits.

- **PRD §4.6.5 "No AI in timeline computation"** → overridden. Day
  Timeline uses deterministic hard blocks + AI-labeled soft blocks
  (two-tier). Pure determinism leaves too many gaps.
- **PRD §3.3 Chatbot 8K-token cap** → overridden to ~18K. Three-tier
  context (always-on / day-stream / historical) with per-tier budgets.
  Pre-summarizing is lossy; bigger raw JSON is right.
- **PRD §4.10.5 "When current data is unavailable, mark goal paused"**
  → kept. The `paused` flag covers what the UI needs; no separate
  `data_source_status` enum.

### §14.2 Day Timeline — the architectural pivot (~22h)

Replaces the empty Today-tab strip with a two-tier timeline of the
day. **Hard blocks** (~6h) come from gcal/outlook events, tasks with
explicit times, and HC sleep windows — fully deterministic. **Soft
blocks** (~10h) are gap-fill: Claude Haiku labels each gap using HC
activity + screen-time + location context. Storage: new
`day_blocks(user_id, block_start, block_end, kind, label, confidence,
source_json)` table. Mobile UI: ~2h day-strip component on Today tab.
Compute infra: ~4h cron job + on-change triggers.

### §14.3 Patterns view — hybrid (~14h)

Replaces Momentum tab's stub. Deterministic patterns (~6h) from
14-day rollups: avg sleep, avg active mins, avg screen time, top
locations. AI synthesis (~6h): Haiku reads patterns + recent
LifeContext, surfaces 3 plain-English insights. Storage + UI: ~2h.

### §14.4 Chatbot three-tier context (~10h)

Always-on tier (~2K tokens): user profile + today's plan + active
goals. Day-stream tier (~6K): events / tasks / meal logs / workouts
for the current day. Historical tier (~10K, lazy-loaded on intent):
trailing 14 days summarized + last week's Day Timeline. Cost
guardrails (~2h): per-user-per-day token cap + degraded mode.
Privacy (~2h): explicit "what does Claude see?" affordance in
chatbot screen.

### §14.5 Connector depth (~30h, partial shipped)

- **§14.5.1 Strava deep dive (~10h)** — ✅ shipped 2026-04-26.
- **§14.5.2 Health Connect granular pulls (~8h)** — backlog: Next.
- **§14.5.3 Calendar enrichment (~4h)** — backlog: Later.
- **§14.5.4 Email enrichment (~5h)** — backlog: Later.
- **§14.5.5 Background GPS + useful location surface (~10h)** — core
  shipped C1; background sampling deferred (§14.5.5.a).

### §14.6 New connectors (~26h total, prioritized)

- §14.6.1 Google Tasks (~3h, recommended next).
- §14.6.2 Photo metadata (~6h, geotags + EXIF).
- §14.6.3 GitHub events (~4h).
- §14.6.4 AI tool exports (~10h, ambitious / differentiating).
- §14.6.5 Phone wake events (~3h).

### §14.7 Workout builder rewrite (~8h) — ✅ shipped + §14.7b draft-mode

### §14.8 Goals data-binding (~6h) — ✅ partial shipped (3 of 5 + plumbing)

### §14.9 Outlook multi-tenant (~2h docs + 1 wk wait) — backlog: Later

### §14.10 Phasing summary

~125h total scope (~3.5 weeks at 40h/wk solo). Track via
[Backlog](#backlog) above; this paragraph is the overview.

### §14.11 Why this is category-defining

Most personal-tracking apps lock data behind their walled gardens.
Life Dashboard's bet: pull from every connector the user already
has, run AI over the union, and make the synthesis the product. PRD
§14.11 has the long-form pitch.

---

## Archive

- **Original v1 build plan + v1.5 vision (long-form)**:
  [`docs/migration/BUILD_PLAN_v2_archive.md`](migration/BUILD_PLAN_v2_archive.md)
- **Older Phase Log entries** (when they age out of the 15-cap):
  `docs/PHASE_LOG_ARCHIVE.md` (created on first overflow)
- **PRD**: [`docs/migration/APEX_PRD_Final.md`](migration/APEX_PRD_Final.md)
