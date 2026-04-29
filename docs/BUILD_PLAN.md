# Life Dashboard — Build Plan

> **Claude territory.** Founder pulls from this doc but does not edit
> it. Founder feedback flows in via [`INBOX.md`](INBOX.md); project
> history accumulates in [`PHASE_LOG.md`](PHASE_LOG.md); long-term
> product spec lives in [`migration/APEX_PRD_Final.md`](migration/APEX_PRD_Final.md).

**Last updated:** 2026-04-28 by Claude (post codebase audit — confirmed plan ≈ reality)

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
1. Read `INBOX.md`. If non-empty, **file every line into the right
   Backlog tier** (Now / Next / Later / Icebox). **Don't fix items
   this turn** — triage is filing, not executing. Bugs get fixed
   when their Backlog tier comes up, not just because they appeared
   in inbox. Questions are kept aside for the end-of-response
   summary. Truncated/ambiguous items go to Backlog → Later with a
   "(awaiting clarification)" tag, AND get surfaced in the summary.
   **Empty `INBOX.md` after triage** — that's the founder's signal
   their notes were seen.
2. Read this file's `Status` + `Active phase` + `Backlog → Now` to
   know where the project is.
3. Read the source files relevant to the *active phase* — not the
   inbox content. Inbox is feedback flow; the active phase is what
   I work on unless the founder explicitly redirects in chat.

**End-of-response summary** is the founder's single read-out.
Three blocks, every response:
- **Inbox actions** — one line per item filed (where it landed)
- **Active phase progress** — what shipped, MANUAL CHECKs issued,
  what's next
- **Answers to questions** — short direct answers

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

**Where we are:** v1.5 mid-build. Audited 2026-04-28: plan ≈ reality.

**Backend** (~145 routes in `app.py`, ~41 DB tables, 5 sync modules):
- C1 connectors all shipped: Gmail / GCal / Outlook / Strava /
  Health Connect / Location / Screen Time.
- Goals engine: 16 of 21 library handlers wired
  (`_PROGRESS_HANDLERS`); 5 paused waiting on data sources (NUT-05
  alcohol, FIN-01/02/03 Plaid, TIME-03 social, TIME-04 phone-down).
- Strava detail (§14.5.1) shipped: lazy fetch, splits, zones,
  streams, polyline → Static Maps.
- Workout builder rewrite (§14.7) + draft-mode editing (§14.7b)
  shipped.
- Goals data-binding (§14.8) shipped: TIME-02 / TIME-05 / TIME-06
  handlers + `config_json` plumbing end-to-end.
- Chatbot context: **partially built.** Always-on tier wired
  (Profile / Goals primary / Nutrition / Fitness containers).
  Day-stream + historical tiers stubbed (queued in §14.4 Next).
  Finance + LifeContext containers also stubs.

**Mobile** (Expo SDK 54, Android-first; ~5 main tabs + ~50 routes):
- 5 tabs all complete (Home / Fitness / Nutrition / Finance / Time).
- Settings flow complete (12 screens incl. profile-edit sub-flow).
- 6 fitness subsystem drilldown screens.
- Strava activity detail screen wired in.
- Goals library + customize flow live; TIME-02/05/06 config fields
  now surfaced (TIME-02 daily_cap_minutes input, TIME-06 cluster
  picker + weekly_visits_target). New goals of those types
  instantiate active instead of paused.
- Custom Expo Modules: `health-connect`, `usage-stats` — both
  working.
- **DayStrip** (§14.2 hard blocks) shipped 2026-04-28 — now
  rendering on Today tab inside the Time card AND on Time tab →
  Timeline subtab. Hard blocks include calendar events + time-
  windowed tasks (`task_time` migration shipped 2026-04-28).
  Sleep blocks still deferred until §14.5.2.
- 1 missing component set: **Patterns view** (for §14.3) — queued.
- **Sleep + Recovery subsystem screens** now read real
  `health_daily.sleep_minutes` / `hrv_ms` / `resting_hr` data
  with 7-day trend bars + 14-day HRV EMA (shipped 2026-04-28).
  Platform-aware "Connect Health Connect" copy on Android.
  Movement subsystem displays HC `active_kcal` + steps when
  permitted.

**Tooling:**
- Local Android build pipeline (~5 min) vs EAS ~70 min.
- Test coverage: minimal — `test_scoring.py` (50 lines, pytest)
  covers the deterministic scoring math; nothing else automated.
  Manual integration testing via founder + INBOX.md feedback loop.

**Known fragile:**
- Location connect-flow alert chain (minor UX polish in Backlog → Now).
- Outlook multi-tenant (waiting on Microsoft Publisher Verification
  — ~1 wk wait + paperwork; Backlog → Later).
- Pre-existing TS error `app/(tabs)/finance.tsx:114` (carrying
  forward; Backlog → Later, ~30m fix).
- Webhook receiver in `app.py` is a generic stub from B1 scaffolding
  — not production-wired (Backlog → Later).

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

**The key feature of this doc.** Every deferred item, every founder
feedback, every PRD-derived future scope item lives here in one of
four tiers. Reading top-to-bottom is the single best way to see what
the project will become.

**Tiers:**
- **Now** — next 1-3 phases. Pick the next active phase from here.
- **Next** — queued for the following 2-3 weeks.
- **Later** — v1.5+ scope; will happen, just not urgently.
- **Icebox** — explicitly out-of-scope for the foreseeable future
  (deferred-with-no-revisit, post-launch features, off-platform).

**Item format:**
```
- **Title** (~Xh) — origin / source
  Scope: what changes.
  Files: paths affected.
  Done when: acceptance criterion.
  PRD ref / dependencies / blocked-on (if any).
```

### Now — pick the next phase from here

- **Emoji → Ionicons sweep — micro-surfaces** (~2h) — partial shipped 2026-04-28
  - **Status (2026-04-28):** Hottest emoji surfaces fixed in
    Tab visual consistency phase: GoalRow category icons
    (💪🥗💰⏰ → barbell / restaurant / wallet / time-outline),
    HealthConnectCard ❤️ → heart-outline, ScreenTimeCard 📱
    → phone-portrait-outline, LocationCard 📍 → location-outline,
    Strava-row 🏃 → " · Strava" text suffix.
  - **Remaining (this Later item):** EmptyState defaults
    (icons prop is already an emoji string — needs API change),
    DayStrip kind colors / labels for source types (currently
    text-only, no emojis but could benefit from icons),
    TodayBalanceCard 🎯, occasional emoji elsewhere in copy.
  - **Trigger:** Founder feedback says Time tab (or any other
    surface) still feels emoji-heavy.

- **Unified inbox view (Gmail + Outlook combined, click to read)** (~6h) — INBOX 2026-04-28
  - **Founder symptom:** "Need to see all emails, need
    Outlook and Gmail inboxes combined, need to be able to
    click on emails to read them."
  - **Scope:** New `mobile/app/time/inbox.tsx` route — merged
    chronological list of `gmail_summaries` + `outlook_emails`
    rows. Tap a row → modal with full body + reply / mark-
    read affordances (real read needs Gmail send scope and/or
    Outlook send scope, which expands OAuth scopes — flag
    that as a sub-decision when starting).
  - **Files:** new `mobile/app/time/inbox.tsx`, new email
    detail modal component, possibly extend `gmail_sync.py`
    + `outlook_sync.py` to pull message bodies (currently
    only snippets).
  - **Done when:** Tap email count on Time tab → unified
    inbox; tap a message → readable detail.

- **Combined calendar card (Google + Outlook in one)** (~2h) — INBOX 2026-04-28
  - **Founder symptom:** "Need to combine Google and
    Microsoft calendars into one card."
  - **Scope:** Time tab currently shows separate
    `CalendarTodayCard` (Google) and `OutlookCard` (Outlook).
    Merge into one card showing today's events from both
    providers, ranked chronologically, with a small provider
    badge per event.
  - **Files:** new `mobile/components/apex/UnifiedCalendarCard.tsx`,
    `mobile/app/(tabs)/time.tsx` (replace the two cards with
    one).
  - **Done when:** Time tab shows a single calendar card
    with both providers' events interleaved.

- **Units enforcement — remaining surfaces** (~1h) — partial shipped 2026-04-28
  - **Status:** First pass of high-visibility fixes shipped:
    SubsystemsCard (Body weight + target), WeightTrendCard,
    strength.tsx (weekly volume + top weight rows), Today tab
    MiniStat weight, WorkoutDetailModal (volume + top + per-
    exercise summaries).
  - **Remaining (this Later item):** BodyStatsForm validation
    copy ("Weight 30–800 lbs"), StrengthTrackerModal
    placeholder ("lbs"), goals/customize.tsx placeholders
    ("e.g. 180"), QuickLogHost weight conversion, smattering
    of `lbs over range` style strings. Not user-visible
    enough to bundle now.
  - **Trigger:** Founder confirms one of these surfaces still
    shows wrong unit on Settings → Preferences → Units flip.

- **Map full-screen expand + satellite/street toggle** (~3h) — INBOX 2026-04-28
  - **Founder symptom:** "Any map should be clickable to
    expand to a full screen zoomable version with a selector
    between satellite imagery and current street view."
  - **Scope:** Tap-handler on every map image (LocationCard,
    Strava activity detail) → modal with full-screen Static
    Maps URL + maptype toggle. Could either (a) build with
    Static Maps API + maptype=satellite|roadmap, or (b)
    upgrade to `react-native-maps` for a real interactive
    map (zoomable, pan, tile layers). (b) is the better UX
    but is a bigger lift (~6h) and adds a native dep.
  - **Files:** new `mobile/components/apex/MapExpandModal.tsx`,
    consumers in `LocationCard.tsx` and
    `mobile/app/fitness/strava-activity/[id].tsx`.
  - **Done when:** Tapping any map opens a full-screen view
    with toggle. Decision (a vs b) deferred until the work
    starts; (a) is the cheap path.

- 
  - **Scope:** Alert chain on first-connect is fragile —
    permission denial doesn't always surface a clear next-step.
    Tighten copy, ensure deny-then-approve flow ends in a sampled
    location, not a stuck spinner.
  - **Files:** `mobile/app/settings/connections.tsx`,
    `mobile/lib/hooks/useLocationConnector.ts`.
  - **Done when:** Disable → re-enable → see a fresh sample on
    LocationCard within 30s.

### Next — queued for weeks 2-3

- **§14.2.2 Day Timeline soft-block AI labeling — polish phase** (~3h, follow-up)
  - **Status (2026-04-28):** MVP shipped — `day_timeline_ai.py`
    module + `/api/day-timeline/<date>/label-soft` route +
    DayStrip renders soft blocks with dashed border + AI
    confidence pill. Auto-fires on DayStrip mount, throttled to
    once per 30min per date per app instance.
  - **Polish remaining:** tap-soft-block → dismiss / re-label
    affordance; cron-driven nightly labeling for yesterday's
    blocks; richer prompt context (sleep windows once §14.5.2
    ships); A/B-style label quality review after real data
    accumulates.
  - **Original (now-shipped) scope:** builds on Now §14.2 — for
    each gap between hard blocks pull HC + screen-time +
    location context, Haiku labels, store as kind='soft'.
  - **Scope:** For every gap in `day_blocks` (an unaccounted hour-
    range), pull HC activity + screen-time top-app + location
    cluster, send to Claude Haiku, store the returned label +
    confidence as a `kind='soft'` block.
  - **Files:** `day_timeline.py` (new soft-label function),
    `chatbot.py` (could share LifeContext serializer),
    `app.py` (cron route `/api/cron/label-soft-blocks`).
  - **Done when:** Yesterday's day strip shows soft blocks like
    "Focus work · 0.85" / "Transit · 0.6" filling gaps between
    hard events.
  - **PRD ref:** §4.6.5 override (AI permitted for labeling only,
    not score computation).

- _(removed 2026-04-28: §14.2.4 Day Timeline mobile UI polish_
  _shipped — "now" red vertical line + auto-scroll into view +_
  _tap-a-block detail sheet with kind-aware icons + AI-confidence_
  _percentage on soft-block details.)_

- **§14.3 Patterns view — hybrid** (~14h) — replaces Momentum tab stub
  - **Scope:** Deterministic patterns (~6h) from 14-day rollups:
    avg sleep, avg active mins, avg screen time, top locations,
    cross-domain correlations. AI synthesis (~6h): Haiku reads
    patterns + recent LifeContext, surfaces 3 plain-English
    insights. Storage + UI: ~2h.
  - **Files:** `patterns_engine.py` (new), `app.py` (route),
    `mobile/app/(tabs)/momentum.tsx` (rebuild).
  - **Done when:** Momentum tab renders 14-day pattern cards +
    3 AI insight bullets; insights are user-invoked (refresh
    button), never auto-generated.
  - **PRD ref:** §4.6 (Patterns surface).

- **§14.4 Chatbot context — polish phase** (~3h follow-up)
  - **Status (2026-04-28):** MVP shipped. Three new containers
    landed in `chatbot.py`:
    - **TasksContext** — today's open + overdue + completed
      mind_tasks. Total open count for global rollup.
    - **DayTimelineContext** — today's hard + soft blocks
      (the §14.2.2 AI labeling work surfaced into chatbot).
    - **HistoricalContext** — trailing 14-day rollup of meals,
      workouts, weight + this-week-vs-last deltas.
    - FitnessContext extended with active workout plan summary
      + today's scheduled session.
    - max_tokens 600 → 1200, timeout 20s → 25s.
  - **Polish remaining:**
    - Privacy "what does Claude see?" panel UI in
      `mobile/app/chatbot/index.tsx`.
    - Lazy-loading historical tier (only loaded when intent
      classifier detects historical questions). Right now
      always-loaded; v1 fine, but burns tokens on
      "what should I eat?" type queries.
    - Per-user-per-day token cap enforcement (the API call
      logs token usage but doesn't gate). PRD §4.7.10 spec.
  - **Trigger:** founder feedback on chatbot answer quality
    after using the expanded context for a few days.

- _(2026-04-28: 3 new goal types **shipped** — TIME-07_
  _inbox-zero-streak, FIT-07 sleep-regularity, FIT-08 daily_
  _movement / active-kcal. Library entries + handlers +_
  _customize.tsx config UI for FIT-08. See PHASE_LOG.)_

- **Plaid integration — Finance tab connector** (~30h, was Icebox; promoted 2026-04-28 per founder)
  - **Founder note (2026-04-28):** "Plaid should not be marked
    as deferred to post release this is critical for finance
    page i will work on getting it set up soon."
  - **Scope:** OAuth (Plaid Link mobile flow), accounts pull,
    transactions pull (with cursor-based pagination), balance
    refresh, transactions webhook for real-time updates.
    Backend: new `plaid_sync.py` + ~5 routes
    (`/oauth/init`, `/exchange`, `/sync`, `/transactions`,
    `/disconnect`). DB: `finance_accounts` + `finance_transactions`
    schema is already Plaid-ready (every row carries `source`
    column; manual rows untouched on Plaid sync). Mobile: new
    `useplaidOAuth.ts` hook (mirror Strava), `connections.tsx`
    handler, transaction list rebind to Plaid-sourced rows.
  - **Files:** new `plaid_sync.py`, `app.py` (routes),
    `connectors.py` (catalog entry), `mobile/lib/hooks/usePlaidOAuth.ts`,
    `mobile/app/settings/connections.tsx`,
    `mobile/app/(tabs)/finance.tsx`.
  - **Done when:** Founder connects Plaid; bank accounts +
    last 30 days of transactions appear in Finance tab;
    refresh works; webhook pushes new transactions live.
  - **Blocked on:** Founder completing Plaid Developer Portal
    setup (Plaid keys + webhook URL).

- **§14.5.2 HC granular pulls — UI surfacing follow-up** (~3h)
  - **Status (2026-04-28):** Backend MVP shipped. Native module
    + JS bindings + DB schema + sync route all support
    ExerciseSessionRecord (Garmin / Pixel Watch / Fitbit
    activities) + sleep-stage breakdown (awake/light/deep/REM).
    `useHealthData.sync()` ships them whenever HC has data.
    **Requires native rebuild to test** — Kotlin changes.
  - **Polish remaining:**
    - **Sleep stages donut on `subsystem/sleep.tsx`** — show the
      4-way breakdown when present.
    - **HC workout segments → `workout_logs` merge** — when a
      Garmin run flows through HC, currently it lands in
      `health_workout_segments` table, NOT `workout_logs`. The
      WorkoutHistoryList won't show it. Need a merge layer or a
      sync that creates `workout_logs` rows from HC segments.
    - **Chatbot LifeContext** — surface workout segments + sleep
      stages in the LifeContext container (currently in
      health_today subtree only as totals).
    - **Strava ↔ HC dedup** — if Garmin pushes to both Strava AND
      HC, we'd see the same activity twice. Need a cross-source
      dedup heuristic (start_iso ± 60s window).

### Later — v1.5+, scoped but not urgent

- **§14.5.5.a Background GPS sampling** (~3h)
  - **Scope:** Foreground-only today; add background sampling via
    a foreground service + persistent notification (Android) or
    `location.permissions.background` (iOS, when iOS lands).
  - **Files:** `mobile/modules/location-bg/` (new Expo Module),
    `mobile/lib/hooks/useLocationConnector.ts`.
  - **Done when:** Location samples accumulate while app
    backgrounded; notification copy clearly explains "Location
    samples are only used to improve your Time category score".
  - **Blocked on:** Play Store approval review for persistent
    location notification.

- **§14.6.1 Google Tasks connector** (~3h) — recommended next connector
  - **Scope:** OAuth scope already granted with GCal; pull
    user's Google Tasks lists + tasks; merge into `mind_tasks`
    (with `source='google_tasks'`).
  - **Files:** `gtasks_sync.py` (new), `connectors.py` (catalog
    entry), `mobile/app/settings/connections.tsx` (handler).
  - **Done when:** Google Tasks shows in Connections; tasks
    appear in Time tab Today's Focus alongside manual tasks.

- **§14.6.2 Photo metadata connector** (~6h) — geotags + EXIF
  - **Scope:** Read photo EXIF (lat/lon, timestamp) from a
    user-selected gallery range; uses photo location as ground-
    truth corroboration for `location_clusters`.
  - **Files:** new `mobile/modules/photo-meta/` Expo Module,
    `photo_sync.py`.
  - **Done when:** "Add my photo locations" button in Connections
    samples the user's last 30 days of photos; reverse-geocoded
    place names appear in LocationCard.

- **§14.6.3 GitHub events connector** (~4h)
  - **Scope:** Read user's GitHub event stream (commits, PRs,
    reviews). Useful as a Time-category signal for "deep work
    output" pattern.
  - **Files:** `github_sync.py`, `connectors.py`.
  - **Done when:** GitHub shows in Connections; commit/PR counts
    appear in Patterns view (after §14.3).

- **§14.6.4 AI tool exports** (~10h, ambitious / differentiating)
  - **Scope:** Connector that ingests the user's ChatGPT /
    Claude / Gemini conversation history (export-file upload) and
    extracts time-of-use signals into `screen_time_daily`-like
    rollups + topic clusters into Patterns.
  - **Files:** new `ai_export_sync.py`, mobile upload flow.
  - **Done when:** User uploads a ChatGPT export; daily AI usage
    minutes appear in Time tab; topic clusters surface in Patterns.

- **§14.6.5 Phone wake events** (~3h)
  - **Scope:** Count phone unlocks per hour as a high-resolution
    attention-fragmentation signal complementing screen-time
    aggregates.
  - **Files:** extend `mobile/modules/usage-stats/`,
    `screen_time_hourly` (new table — overlaps with TIME-04 work).
  - **Done when:** Patterns view shows hourly unlock heatmap.

- **§14.5.3 Calendar enrichment** (~4h) — connector depth
  - **Scope:** Beyond title/start/end: pull attendees count,
    self-organizer flag, location, recurring-event metadata.
    Some already in `gcal_events` schema; just need to populate.
  - **Files:** `gcal_sync.py`, `outlook_sync.py`, `chatbot.py`.
  - **Done when:** Chatbot can answer "do I have any 1:1s today?"
    using attendee data.

- **§14.5.4 Email enrichment** (~5h) — connector depth
  - **Scope:** Snippet preview, importance classification (Gmail
    only — built-in API field), thread-grouping, has-replied
    tracking. Most schema present; populate + surface in Time tab.
  - **Files:** `gmail_sync.py`, `outlook_sync.py`,
    `mobile/components/apex/TimeSubsystemCards.tsx`.
  - **Done when:** Time tab top-3 unread shows importance badges;
    chatbot can answer "did I reply to <person>?".

- **TIME-03 Social media cap** (~1-3h) — §14.8 deferred
  - **Scope:** Streak goal qualifying when social-app minutes ≤
    target. Two implementation paths:
    - Quick (~1h): hardcode a social-package whitelist
      (com.instagram.android, com.zhiliaoapp.musically, etc.) and
      sum minutes from `screen_time_daily.top_apps_json`.
    - Better (~3h): extend `usage-stats` Expo Module to surface
      Android's `ApplicationInfo.category` metadata; classify
      apps automatically.
  - **Files:** `goals_engine.py`, `mobile/modules/usage-stats/`
    (if better path), `db.py` (if hourly schema needed).
  - **Done when:** Library shows TIME-03 as creatable;
    instantiated goal accumulates streak based on real social-app
    minutes.

- **TIME-04 Phone-down after cutoff** (~3h) — §14.8 deferred
  - **Scope:** Streak qualifying when no phone use after a
    user-configured cutoff time, X days in a row. Needs hourly
    screen-time data (we only have daily totals).
  - **Files:** extend `usage-stats` Expo Module to return hourly
    buckets, new `screen_time_hourly` table in `db.py`,
    `goals_engine.py` handler.
  - **Done when:** Setting cutoff to 22:00 + sleeping early →
    streak ticks up daily.
  - **Overlaps with:** §14.6.5 Phone wake events (same hourly
    table).

- **Connection wiring guidance / contextual onboarding** (~6h) — INBOX 2026-04-28
  - **Scope:** Help users wire connections that depend on
    upstream config they don't realize exists. Concrete examples
    surfaced by founder testing:
    - Connect Health Connect → most users don't realize Garmin /
      Fitbit / Pixel Watch data only flows in if they enable it
      in **the source app** (Garmin Connect → Settings → Health
      Connect → toggle data types). Surface a checklist or
      "connect upstream sources" guide post-HC-grant.
    - Detect "live but empty" connections (HC permissions
      granted but `health_daily` rows are null/zero across all
      metrics) and prompt the user with a diagnostic affordance
      instead of just showing "0 steps".
    - First-time-Strava: explain it's read-only + AI-excluded.
    - First-time-Outlook on a work tenant: explain Publisher
      Verification status if it blocks.
  - **Files:** new `mobile/components/apex/ConnectionGuidance.tsx`
    (modal/sheet pattern), updates to
    `mobile/app/settings/connections.tsx` to invoke it post-grant,
    `mobile/app/(tabs)/fitness.tsx` for the empty-HC detection,
    possibly `connectors.py` for a `health_check` field on each
    catalog entry.
  - **Done when:** After granting HC perms but with no upstream
    data, the app shows a "Where does Health Connect get data?"
    sheet with platform-specific links (Garmin Connect, Fitbit
    settings, Pixel Watch settings, etc.).

- **§14.9 Outlook multi-tenant via Publisher Verification** (~2h docs + 1 wk wait)
  - **Scope:** Microsoft Partner Center "Verify my publisher"
    process unlocks work-tenant Outlook accounts whose admins
    don't allow unverified third-party apps.
  - **Done when:** Work-email Outlook accounts can connect
    without per-tenant admin approval friction.
  - **Blocked on:** Apex Leadership LLC formation docs uploaded;
    Microsoft 1-5 business day review.

- **Fitness subsystem consolidation + equal-weight rebalance** (~3h) — INBOX 2026-04-28
  - **Founder symptom:** "I think we have too many subcards in
    Fitness and a lot of them could be combined but without
    losing functionality once you click into them. Recovery
    being just HRV is dumb. They should all feel equal weight."
  - **Scope:** 6 subsystem cards (body, cardio, movement,
    recovery, sleep, strength) feel uneven — recovery is one
    metric while cardio has full week chart + history.
    Either combine (Recovery + Sleep into one "Recovery &
    Sleep"), or beef up the lighter ones to match
    visual+content weight. Founder preference TBD; this is
    a design phase.
  - **Files:** `mobile/components/apex/FitnessSubsystemCard.tsx`
    (rendering), `mobile/components/apex/SubsystemsCard.tsx`
    (composition), all 6 `mobile/app/fitness/subsystem/*.tsx`
    detail screens.
  - **Done when:** Fitness tab subsystem stack feels
    visually balanced; tapping each gives a comparable
    detail screen.

- **Day Summary view content gap** (~3h) — INBOX 2026-04-28
  - **Founder symptom:** "The day summary view is empty right
    now compared to the amount of data we have."
  - **Scope:** `mobile/app/day/[date].tsx` should be a rich
    cross-domain rollup — today's meals + workouts + tasks +
    calendar events + sleep / steps / HRV / HR + screen-time
    + visited places + Day Timeline blocks. Should feel like
    "what happened today" snapshot, not a lite version of
    Today tab. Pulls from existing endpoints.
  - **Files:** `mobile/app/day/[date].tsx`, possibly new
    `/api/day/<date>` aggregation route in `app.py`.
  - **Done when:** Day view answers "what did I do on
    YYYY-MM-DD?" by showing every category we have data for
    that day.

- **Bodyweight chart parity with Flask PWA** (~3h) — INBOX 2026-04-28
  - **Founder symptom:** "Bodyweight graph should show change
    over time and mimick my pwa more."
  - **Scope:** The Flask PWA had a more polished weight chart
    (multi-range selector 7/30/90D, only-plot-dates-with-data
    pattern, deficit overlay). RN port at
    `mobile/components/apex/WeightTrendCard.tsx` is simpler. Port
    the missing affordances.
  - **Files:** `mobile/components/apex/WeightTrendCard.tsx`,
    possibly a new range-selector component, the Flask
    `index.html` weight section as reference (commit `c4973e8`
    onwards in git history).
  - **Done when:** Founder confirms parity with old PWA.

- **Wizard step reduction** (~2h) — workout builder polish
  - **Scope:** Current 8-step quiz is fine for first plan, less
    so for repeat edits. Combine focus + injuries into one
    screen, default experience from profile, etc.
  - **Files:** `mobile/app/fitness/plan/builder.tsx`.
  - **Done when:** Quiz is 5 steps, not 8.

- **AI-generated cardio sub-flow in workout wizard** (~3h) — PRD §4.1.6
  - **Scope:** PRD §4.1.6 specs cardio goal/intensity/activities
    sub-screens. Current builder has a `cardio` payload with
    sensible defaults but no UI step.
  - **Files:** `mobile/app/fitness/plan/builder.tsx`,
    `claude_workout_plan.py`.
  - **Done when:** Quiz includes a cardio sub-flow; AI plan
    generation respects the selections.
  - **PRD ref:** §4.1.6.

- **Plan adherence stats / weekly calendar strip** (~3h) — PRD §4.3.10
  - **Scope:** Fitness tab Today shows scheduled workout for
    today. PRD §4.3.10 also wants weekly-completion strip +
    monthly-adherence-% surface in plan view.
  - **Files:** `mobile/app/fitness/plan/index.tsx`,
    `mobile/components/apex/PlanAdherenceStrip.tsx` (new).
  - **Done when:** Plan view shows a 7-day strip with
    completion checks + monthly adherence %.
  - **PRD ref:** §4.3.10.

- **Tap-a-zone-bucket drilldown on Strava detail** (~2h) — §14.5.1 deferred
  - **Scope:** Tap an HR zone bar → modal listing the splits /
    segments that fell in that zone.
  - **Files:** `mobile/app/fitness/strava-activity/[id].tsx`.
  - **Done when:** Tapping Z3 bar shows a list of "Mile 4-7,
    avg 162bpm" type segments.

- **Pace-over-distance smoothed line chart** (~3h) — §14.5.1 deferred
  - **Scope:** Beyond per-mile splits, pull `velocity_smooth`
    stream and render as a line chart on Strava detail.
  - **Files:** `strava_sync.py` (extend stream pull),
    `mobile/app/fitness/strava-activity/[id].tsx` (new
    PaceLineChart component).
  - **Done when:** Strava detail shows a smoothed pace line +
    splits table side by side.

- **Granular diff hint in plan-edit save banner** (~1h) — §14.7b deferred
  - **Scope:** Currently shows static "Review the days above".
    Compute diff between `draftPlan` and `plan.plan` (count
    modified exercises) and show "3 exercises changed".
  - **Files:** `mobile/app/fitness/plan/index.tsx`.
  - **Done when:** Save banner subtitle is dynamic and accurate.

- **Inline-add-an-exercise affordance in plan view** (~2h) — §14.7b deferred
  - **Scope:** Modal supports edit, trash supports delete; need
    a "+" button per day card to add a new exercise without
    going to Manual Builder.
  - **Files:** `mobile/app/fitness/plan/index.tsx`,
    `mobile/components/apex/ExerciseEditModal.tsx`.
  - **Done when:** Tap "+" on a day card → exercise edit modal
    opens with empty fields → save appends to draft plan.

- **`finance.tsx:114` TS error fix** (~30m) — pre-existing tech debt
  - **Scope:** `FinanceTransaction.merchant_name` is typed
    `string | null | undefined` but the consumer expects
    `string | null`. Either narrow the type at the boundary or
    fix the consumer.
  - **Files:** `mobile/app/(tabs)/finance.tsx`,
    `shared/src/types/finance.ts`.
  - **Done when:** `npx tsc --noEmit` is clean.

- **Wizard "REQUIRE picking a data source for tracked goals"** (~2h) — §14.8 deferred
  - **Scope:** PRD-aligned: every "tracked" goal must have a
    bound data source. Wizard surface for choosing source +
    "Self-report only" explicit checkbox.
  - **Files:** `mobile/app/goals/customize.tsx`.
  - **Done when:** Can't create a goal without picking a
    source or explicitly self-reporting.
  - **Caveat:** May not ship — current customize.tsx already
    shows `data_source` from the library entry; founder may
    decide explicit picker is friction-for-no-reason.

- **Webhook receiver production-wiring** (~3h) — surfaced by 2026-04-28 audit
  - **Scope:** B1 phase scaffolded a generic webhook stub in
    `app.py` + `webhook_events` table. Not production-wired:
    no provider-specific signature verification, no per-provider
    routing, no replay protection. v1 connectors all use polling
    (Gmail) or OAuth-server-pull (GCal/Outlook), so this isn't
    blocking — but it's the foundation for any push-based
    integration (e.g. Slack, Plaid Transactions webhook).
  - **Files:** `app.py` (replace stub route), new
    `webhook_router.py`, `db.py` (extend `webhook_events`
    schema).
  - **Done when:** A test webhook from a real provider (or
    `ngrok`-replayed) routes through, signature-verifies, and
    persists.

- **`scoring.py` / Flask-PWA-era code review** (~1h) — surfaced by 2026-04-28 audit
  - **Scope:** `scoring.py` is from the Flask PWA era (pre-RN
    migration). The audit flagged it as "still imported but not
    actively driving the RN-phase score computation." Either
    delete (if dead) or document why it lives on (if scoring
    fall-through goes through it).
  - **Files:** `scoring.py`, callers (`grep` first to confirm
    consumers).
  - **Done when:** Either removed cleanly (no broken imports)
    or kept with a docstring explaining its current role.

- **Test coverage expansion** (~6h) — surfaced by 2026-04-28 audit
  - **Scope:** Today only `test_scoring.py` exists. Add:
    `test_goals_engine.py` (3 new TIME handlers minimum),
    `test_strava_sync.py` (extract_streams shape variance),
    `test_db.py` (goal create + update + serialize round-trip).
    Backend-only; jest/RN tests are out of scope for v1.
  - **Files:** `tests/` (new directory).
  - **Done when:** `pytest` runs, ≥3 new test modules, CI-able.
  - **Trigger:** before public launch or when a regression
    bites.

### Icebox — explicitly deferred-with-no-revisit / out of scope

- **iOS / HealthKit / Apple Family Controls** — Android-first;
  defer until iPhone test device + Apple Developer Program +
  HealthKit entitlement approval. Multi-month gate. PRD assumes
  parity at v1; we accepted Android-only for v1 as a scope cut.

- **Garmin Connect official API** — approval gate is months
  long. HC + Strava cover the use case. Re-evaluate post-launch
  if Garmin-specific data fields (body battery, training load)
  become a frequent feature request.

- _(2026-04-28: **Plaid** moved out of Icebox per founder._
  _Founder is handling Plaid Developer Portal setup; integration_
  _work is now in Backlog → Next as a v1 critical-path item._
  _PRD §1.6 has it on Core tier.)_

- **RevenueCat / paywall / tier gating** — solo-user phase. No
  auth → no tiers → no paywall. Ship after the user count
  justifies it. PRD §1.6 has the tier structure locked; build
  it when needed.

- **Sentry / crash reporting** — solo-user phase; logs + manual
  reproduction sufficient. Add when user count > 10.

- **`data_source_status` enum on goals** — explicitly chose-not-
  to-do. The `paused` boolean + `pace.label = "Reconnect source"`
  cover the UI need. Re-evaluate if goal list view grows badges
  that need 3+ states.

- **Pre-summarized chatbot context** (PRD §3.3 default) — scrapped
  for the three-tier raw-JSON approach. Documented as a PRD
  override.

- **Pure-deterministic Day Timeline** (PRD §4.6.5 default) —
  scrapped for the two-tier deterministic+AI approach.
  Documented as a PRD override.

- **Node.js + AWS-native backend** (PRD §1.7 default) — scrapped
  for Flask + SQLite v1; v2 migration is a separate project.
  Documented as a PRD override.

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
