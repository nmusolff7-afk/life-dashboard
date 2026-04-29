# Life Dashboard — Build Plan

> **Claude territory.** Founder pulls from this doc but does not edit
> it. Founder feedback flows in via [`INBOX.md`](INBOX.md); project
> history accumulates in [`PHASE_LOG.md`](PHASE_LOG.md); long-term
> product spec lives in [`migration/APEX_PRD_Final.md`](migration/APEX_PRD_Final.md).

**Last updated:** 2026-04-28 by Claude (HC connect + sleep diagnostic shipped; runnable-anywhere deploy is now Active phase, runbook in `docs/DEPLOY.md`)

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
  (2026-04-28 same-day hotfix: §14.2.4 polish phase introduced
  a hook-order regression — `useRef` declared after early
  returns crashed every Day Timeline view with "Rendered more
  hooks than during the previous render". Fixed by lifting
  the hook above the early returns; re-test pending in INBOX.)
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

**Runnable-anywhere deploy + HC rebuild (combined) — runbook 2026-04-28; founder executing.**

Per founder 2026-04-28: "ok yes i want to move to this runnable
anywhere version it also looks like i need a rebuild from the
manual checks due in inbox. combine into one?". Yes — release APK
is the same build that picks up the Kotlin sleep-window fix AND
removes the Metro dependency for cellular use. One rebuild, both
jobs.

Runbook: [`docs/DEPLOY.md`](DEPLOY.md). No code changes this
phase — Procfile + nixpacks.toml already Railway-ready, signing
config already uses debug.keystore for release builds (good
enough for side-load), HC + sleep fixes from prior phase already
in tree.

**Sleep + HRV still missing** per founder ("still havent seen a
bit of sleep or hrv data anywhere"). Could be:
1. The Kotlin sleep-window fix unlocks it (rebuild required to
   verify) — OR
2. Upstream wearable not pushing data to HC (check the HC app
   directly first — covered in INBOX manual check).

PRIOR PHASE (HC connect + Sleep diagnostic, JS-only fixes):
shipped, verified `[x]` by founder for "HC card tappable" and
"out-of-band perm grant auto-detected". Three remaining checks
(Connected alert, Kotlin sleep window, READ_EXERCISE
non-blocking) all rebuild-gated and roll into this phase.

DayStrip hook-order regression fix from earlier this turn was
verified working post Metro reload — founder confirmed
"reloaded no longer crashing" after a fast-refresh cache
clear. Day Timeline phases now actually shipped.

**Founder action queue (in `docs/DEPLOY.md`):**
1. Railway project + env vars + volume mount.
2. `mobile/.env` flip from `10.0.0.22:5000` → Railway HTTPS.
3. Release APK: `cd mobile/android && ./gradlew :app:assembleRelease`.
4. `adb install -r app-release.apk`.
5. Cellular smoke test (off LAN).

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

- _(2026-04-28: **HC connect button + sleep data** shipped this_
  _turn — see Active phase. JS-only changes are live on Metro_
  _reload; Kotlin sleep-window fix needs rebuild. Re-test_
  _checks live in INBOX → Manual checks.)_

- _(2026-04-28: **Runnable-anywhere deploy** is now Active phase —_
  _runbook in `docs/DEPLOY.md`. Bundled with the HC native rebuild_
  _since the release APK build picks up both jobs.)_

- _(2026-04-29: **Workout-plan/generate timeout** — fixed this turn._
  _`apiFetch` now auto-bumps timeout to 90s for AI endpoints_
  _(`/generate`, `/scan`, `/estimate`, `/synthesize`, `/regenerate`,_
  _`/label-soft`, `/comprehensive`). Was 15s default; aborted_
  _Claude plan generation twice during founder's onboarding._
  _Will land in next rebuild.)_

- **Onboarding flow audit — multiple founder pain points** (~4h) — INBOX 2026-04-29
  - **Founder symptoms** (single onboarding pass through release APK):
    1. "primary goal is redundant during onboarding in workout
       builder since you already selected it earlier"
    2. "dont show how we built your plan until after"
    3. "connect your life in onboarding still showing shells and
       coming soon for most despite them being built"
    4. "no option to say yes to notifications"
    5. "i dont think it gave me an option to sign in when i got to
       sign in screen then closed app then reoped it went straight
       to onboarding not sure who i am logged in as rn"
  - **Scope (5 sub-fixes):**
    1. **Dedup primary goal:** if user picked one in onboarding's
       earlier step, skip the workout-builder primary-goal step
       OR pre-fill it from the earlier value.
       Files: `mobile/app/(onboarding)/*`,
       `mobile/app/fitness/plan/builder.tsx`.
    2. **"How we built your plan" timing:** Currently shown
       during/after generation; should be hidden until
       generation completes successfully.
       Files: `mobile/app/fitness/plan/builder.tsx` (final step
       layout).
    3. **Onboarding connections screen stale labels:** lists
       connectors as "coming soon" / shows shells when most are
       wired (Gmail, GCal, Outlook, Strava, HC, Location, Screen
       Time). Pull from `connectors.py` catalog like the Settings
       version does. Files: `mobile/app/(onboarding)/connections.tsx`
       — match the logic in `mobile/app/settings/connections.tsx`.
    4. **Notification opt-in:** Add an onboarding step that
       requests `expo-notifications` permission. PRD specs full
       notification system (separately filed below); this is the
       MVP "ask the user yes/no" affordance.
       Files: new `mobile/app/(onboarding)/notifications.tsx`.
    5. **Auth-state-on-cold-restart bug:** Founder hit sign-in
       screen → closed app → reopened → was in onboarding
       (skipping sign-in). Either Clerk session persisted (correct
       behavior — they're logged in already) but onboarding
       routing was wrong, or the auth-loading splash flickered
       through sign-in. Need to add a "Signed in as <email>" line
       on the onboarding hero so it's clear who they are. Plus
       audit the onboarding-vs-sign-in routing in
       `mobile/app/_layout.tsx` + `mobile/app/(tabs)/_layout.tsx`
       + `mobile/app/(onboarding)/_layout.tsx` to ensure the auth
       flow is deterministic.

- **Workout builder polish — generation UX + generic preferences** (~3h) — INBOX 2026-04-29
  - **Founder symptoms (feature ideas):**
    - "make how we built your plan in workout builder actually
      reflect design choices that were made SPECIFICALLY for
      your plan"
    - "make preferred focus input more generic for anything you
      else want to be included in you plan like push pull legs or
      make legs days light or 3 excercises per day or literally
      anything"
    - "theres a back arrow at the bottom and top which is
      confusing"
    - "make a full screen building screen like the pwa after the
      last screen in workout builder"
  - **Scope:**
    - **Personalize the "How we built your plan" copy** — instead
      of generic boilerplate, render the actual design choices
      the user made (3 days/wk, hypertrophy focus, no overhead
      due to shoulder injury, etc). Pull from the wizard's
      `WorkoutPlanInputs` payload.
    - **Free-form preferences input** — replace the constrained
      "Preferred focus" picker with a freeform textarea that
      gets fed verbatim to the AI plan generator. Backend
      already accepts string preferences; just widen the UI.
    - **Dedup back arrows** — remove either the bottom-of-step
      back arrow or the header back arrow (keep header back to
      match other wizards).
    - **Full-screen "Building your plan…" loader** — match PWA's
      progress UI: full-screen overlay during generation,
      animated dots, "this can take 30-60 seconds…" copy. Lands
      with the timeout fix above.
  - **Files:** `mobile/app/fitness/plan/builder.tsx`,
    `mobile/app/(onboarding)/workout-builder.tsx` (if separate),
    backend `claude_workout_plan.py` to confirm preferences-string
    is consumed.

- **Notification system MVP** (~10h) — INBOX 2026-04-29
  - **Founder symptom:** "notifications are a mssive thing that
    needs built per the prd that we dont have yet".
  - **Scope (PRD §4.x notifications):**
    - Onboarding opt-in screen (filed above as part of onboarding
      audit).
    - Backend cron-style scheduler that fires daily reminders
      based on user preferences (e.g. "morning weigh-in reminder
      8:00 AM", "log dinner 19:00", "Sunday weekly review").
    - `expo-notifications` plumbing: register device push token,
      handle tap-to-route to the right tab, deep-link tasks /
      meals / workouts.
    - Per-user notification preferences in Settings: which
      reminders to fire, time-of-day, snooze.
    - Server-driven push: needs Expo Push API integration on
      `app.py`. Free tier sufficient for solo-user phase.
  - **Files:** new `notification_engine.py`, extend `db.py` with
    `notification_preferences` + `device_push_tokens` tables,
    `mobile/app/(onboarding)/notifications.tsx`,
    `mobile/app/settings/notifications.tsx` (already exists, may
    just be a stub),
    `mobile/lib/usePushTokens.ts` (new).
  - **Done when:** User opts into reminders during onboarding,
    receives a daily reminder push, taps it, lands on the right
    tab to act on it.
  - **PRD ref:** §4.x notifications + §3.1 onboarding identity.

- **EAS Update channel — OTA JS updates without rebuilds** (~1h) — INBOX 2026-04-29
  - **Founder symptom:** "will we have to do a 30min rebuild
    everytime we change something now?" — current loop is
    edit-rebuild-install for every JS change, ~5min cached but
    still slow. EAS Update lets us push JS-only changes to
    Expo's CDN; the release APK fetches them on next open.
  - **Scope:**
    - `npx eas update:configure` to enable updates in
      `app.json` + add the runtime version policy.
    - Add `EXPO_PUBLIC_UPDATES_URL` and `EXPO_PUBLIC_RUNTIME_VERSION`
      env vars (or use the auto-derived ones).
    - In `eas.json`, add a "production" channel.
    - Wire `expo-updates` into the app boot path so it
      checks for updates on launch (already imported by
      default in Expo SDK 54).
    - Founder runs `eas update --branch production` to push
      JS changes; phone fetches on next launch. ~30s push,
      instant client-side.
  - **Files:** `mobile/app.json` (updates section),
    `mobile/eas.json` (channel config), `mobile/app/_layout.tsx`
    or wherever update-on-launch is wired.
  - **Done when:** Founder edits a `.tsx` file → runs
    `eas update --branch production` → phone reopens app →
    new JS bundle loads without rebuild.
  - **Blocked on:** Successful runnable-anywhere deploy
    (must work end-to-end before adding OTA layer);
    founder's EAS account is already configured per
    `eas.json` projectId.

- **Wire new logo everywhere + APK launcher icon** (~1h) — INBOX 2026-04-28
  - **Founder symptom:** "switch to new logo, everywhere that
    uses the logo. include as logo for .apk also. files are
    in the main life dashboard folder logo_transparent.png
    and logo_background.png".
  - **Status:** Files NOT yet present at repo root. Founder
    needs to drop `logo_transparent.png` + `logo_background.png`
    in the project root (or specify where they live). Once
    placed, the wiring is mechanical:
    - Copy to `mobile/assets/images/icon.png` (full-bleed),
      `mobile/assets/images/android-icon-foreground.png`,
      `mobile/assets/images/android-icon-background.png`,
      `mobile/assets/images/splash-icon.png`,
      `mobile/assets/images/favicon.png`.
    - Adaptive icon background color in `app.json` may need
      a tweak to match the logo's design.
    - Sweep app for any inline logo references (login screen,
      onboarding hero, chatbot avatar) — likely none beyond
      the splash + launcher.
    - Native rebuild required (icons are bundled into the APK
      mipmap resources).
  - **Files:** `mobile/app.json` (icon paths already correct,
    just replacing the assets), `mobile/assets/images/*.png`
    (the actual files).
  - **Done when:** Phone launcher shows the new logo with
    "Life Dashboard" label; splash screen matches; release
    APK installs with the new icon. Built into Tier 3
    re-test on the next rebuild.
  - **Blocked on (founder):** placing the two source PNGs in
    the project root or telling me where to find them.

- **Calorie chart shows flat ~1800 line — actual logged meals don't match** (annoying, ~2h) — INBOX 2026-04-28
  - **Founder symptom:** "this works but wasnt the problem the
    actual data shows a flat line at like 1800cals which isnt
    what i was eating" — the target dashed-line fix shipped,
    but the underlying "actual" data series is wrong.
  - **Scope:** The Nutrition Progress calorie chart's daily
    bars/line should reflect each day's `meal_logs` sum. A
    flat ~1800 line suggests we're either (a) plotting the
    *target* on both axes (target color line is correct, but
    the "actual" series is also reading target instead of
    `SUM(calories)`), or (b) aggregating from the wrong table
    (e.g. an old daily-rollup column that's frozen at user's
    target). Trace from the chart prop back to the API
    endpoint serving the data.
  - **Files:** `mobile/app/(tabs)/nutrition.tsx` /
    `mobile/components/apex/CaloriesConsumedChart.tsx` (or
    related), `app.py` (the route serving N-day calorie data —
    likely `/api/nutrition/progress` or similar).
  - **Done when:** A day with logged meals shows the actual
    total kcal, not the target. Spot-check three days against
    `SELECT SUM(calories) FROM meal_logs WHERE date=...`.

- **Gmail "important" star never appears + sync doesn't refresh inbox** (annoying, ~3h) — INBOX 2026-04-28
  - **Founder symptom:** "0 are marked important its not
    updating when i hit sync and the newest email is 23hrs old
    even though i have a bunch of new ones".
  - **Scope:** Two distinct bugs likely entangled:
    1. **Sync doesn't refresh** — tapping Sync on the Gmail
       card or pulling to refresh isn't pulling new messages.
       Either the route isn't being called, the Gmail token
       expired and we're failing silently, or the route is
       only fetching deltas with a stale historyId. Check
       `gmail_sync.py`.
    2. **Importance flag not populated** — Gmail's API exposes
       `messages.list` with `labelIds` including
       `IMPORTANT`. Verify we're requesting that scope and
       persisting the flag in `gmail_summaries.is_important`.
       The yellow-star UI was wired in Tab visual consistency
       phase but reads from a column that may be 0 for every
       row.
  - **Files:** `gmail_sync.py`, `db.py` (gmail_summaries
    schema check), `mobile/components/apex/TimeSubsystemCards.tsx`
    (GmailSummaryCard), `app.py` (`/api/gmail/sync` route).
  - **Done when:** Tap Sync on Gmail card → newest emails
    from the last hour appear within 30s; emails Gmail
    classifies as Important render with the yellow star.

- **Onboarding pages overflow on-screen buttons** (annoying, ~2h) — INBOX 2026-04-28
  - **Founder symptom:** "i ant every onboarding page to fit
    above my on screen buttons and not have to scroll down to
    see stuff".
  - **Scope:** Onboarding wizard screens currently use a flex
    layout that doesn't reserve space for the device's
    bottom-nav / gesture bar; primary action buttons get
    pushed below the safe-area + content tries to fill the
    rest, forcing a scroll. Audit each step for safe-area
    insets + a fixed-bottom action bar pattern (like the
    workout wizard at `mobile/app/fitness/plan/builder.tsx`).
  - **Files:** `mobile/app/onboarding/*.tsx` step screens (all
    of them — common layout fix), possibly extract a shared
    `OnboardingFrame` component if not already present.
  - **Done when:** Every onboarding step renders title +
    body + primary button without requiring a scroll on a
    typical Android device.

- **Time tab: move task input card to the top, like Nutrition + Fitness do** (~1h) — INBOX 2026-04-28
  - **Founder symptom:** "need to move task card to be top input
    card in time just like log a meal and log a workout are in
    the other 2 tabs".
  - **Scope:** Nutrition tab leads with `LogMealCard`; Fitness
    tab leads with `LogActivityCard`. Time tab should mirror
    that — a "Log a task" input card at the top of the Today
    sub-tab, above the summary row. Folds nicely with the
    "Task FAB → fast overlay sheet" item below (same component
    can power both).
  - **Files:** `mobile/app/(tabs)/time.tsx`, possibly extract
    `mobile/components/apex/LogTaskCard.tsx` + share with the
    FAB overlay work.
  - **Done when:** Time tab Today's first card is a task-input
    affordance matching the visual weight of LogMealCard /
    LogActivityCard.

- **Tab top-bar style consistency: Time + Finance to match Fitness + Nutrition** (~1h) — INBOX 2026-04-28
  - **Founder symptom:** "need to make the tap headers in
    finacnce and time look the same as the headers in fitness
    and nutrition".
  - **Scope:** First pass shipped 2026-04-28 (Tab visual
    consistency phase) — moved the SubTabs into TabHeader's
    right slot. Founder reports the headers still don't match.
    Likely the typography / padding / right-slot composition
    differs subtly. Audit all four TabHeaders side-by-side and
    converge to a single component shape.
  - **Files:** `mobile/components/apex/TabHeader.tsx`,
    `mobile/components/apex/SubTabs.tsx`, the four tab
    screens (`(tabs)/{fitness,nutrition,finance,time}.tsx`).
  - **Done when:** All four tab top-bars look identical
    structurally — same height, same title typography, same
    right-slot composition.

- **Time tab signal chips are too compressed — 2x2 grid** (~30m) — INBOX 2026-04-28
  - **Founder symptom:** "yes but too smal so too compressed.
    make a 2x2".
  - **Scope:** `TimeTodaySignals` currently lays four chips
    (Screen / Places / Focus / Meetings) in a single row.
    Switch to 2x2 grid so each chip has more horizontal real
    estate and the values read at a glance.
  - **Files:** `mobile/components/apex/TimeTodaySignals.tsx`.
  - **Done when:** Four chips render in two rows of two,
    each visibly wider with full label + value readable.

- **Voice-to-text in chatbot duplicates partial phrases on save** (annoying, ~1h) — INBOX 2026-04-28
  - **Founder symptom:** "voice to text problem where as im
    typing with my keyboards native voice input its typing
    but then saving partial pharses like 'whatwaswhat was i
    what was i doing what was i doing today'".
  - **Scope:** Android keyboards' voice input fires onChange
    repeatedly with growing partial transcripts; if the
    chatbot input is committing snapshots (e.g. logging on
    every change, or appending instead of replacing), the
    final saved text accumulates intermediate states. Fix is
    to ensure the input controlled-component pattern is a
    pure replace (`setValue(e)`) and that the send-action
    only fires on explicit Send press, not on debounced
    auto-commit.
  - **Files:** `mobile/app/chatbot/index.tsx`,
    `mobile/components/apex/ChatOverlay.tsx` (if input lives
    there), any text-input wrapper in use.
  - **Done when:** Voice-typing "what was I doing today"
    sends exactly that string, not a concatenation of growing
    partials.

- **Goals accessibility — add Goals row to Settings** (~30m) — INBOX 2026-04-28
  - **Founder symptom:** "no clear goals accesibility other
    than from the homepage card maybe add it to settings".
  - **Scope:** `mobile/app/settings/index.tsx` should have a
    "Goals" row (probably under a "Tracking" section near
    Workout Plan + Connections). Tap → routes to
    `/goals` (the Goals tab/list screen).
  - **Files:** `mobile/app/settings/index.tsx`.
  - **Done when:** Settings shows a Goals row that routes to
    the goals list.

- **Task FAB → fast overlay sheet, not full-screen route** (~2h) — INBOX 2026-04-28
  - **Founder symptom:** "i want a fast overlay always for
    logging a task not the full screen view no matter how
    we're adding a task".
  - **Scope:** Currently the FAB Task chip routes to the full
    `/time/new-task` screen. Replace with a centered modal
    sheet (~half-screen) like the existing
    `NumberPromptModal` pattern: title input, optional time
    + duration, Save / Cancel. Save calls the same backend
    route the full screen used. Same flow from Today tab Time
    card "+ Add".
  - **Files:** new `mobile/components/apex/TaskQuickLogSheet.tsx`,
    `mobile/components/apex/FAB.tsx` (replace route push with
    sheet open), `mobile/components/apex/TimeCardContent.tsx`
    (same), keep `mobile/app/time/new-task.tsx` as a route
    fallback or delete if unused.
  - **Done when:** Both entry points open the lightweight
    sheet; full-screen new-task route either gone or only
    used as a power-user fallback.

- **Strava activity detail elevation still in meters when imperial** (minor, ~30m) — INBOX 2026-04-28
  - **Founder symptom:** "yes but some like strava elev data
    are still in m" — units toggle propagated everywhere
    except Strava activity detail's elevation field.
  - **Scope:** `mobile/app/fitness/strava-activity/[id].tsx`
    renders elevation gain in meters. Wire through `useUnits()`
    + a `formatDistance(m, unitsPref)` helper for "ft" output
    (1m ≈ 3.28084 ft). Same audit on splits + total elevation
    if duplicated elsewhere on that screen.
  - **Files:** `mobile/app/fitness/strava-activity/[id].tsx`,
    possibly `mobile/lib/units.ts` if a `formatElevation`
    helper doesn't exist yet.
  - **Done when:** Toggling Settings → Preferences → Units to
    Imperial flips Strava activity elevation to feet.

- **Location permission flow: doesn't revoke on disconnect, denial alert hidden, sampling sparse** (annoying, ~3h) — INBOX 2026-04-28
  - **Founder symptom:** "location works kind of but this
    specifically i cant see and it gets confused on connect
    and disconnect bc it doesnt revoke the permission in
    settings and it only opens the allow once and dosent seem
    like it samples enough to get useful data."
  - **Scope:** Three distinct sub-issues:
    1. **Disconnect doesn't revoke OS permission** — Android
       doesn't expose programmatic revoke; we should at least
       open the OS app-info screen for the user to revoke
       manually, and clearly mark the connector as
       "Disconnected (still has OS permission)".
    2. **Denial alert never visible** — the alert chain on
       deny shows a system dialog that flashes; founder
       reports they "can't see" it. Possibly a stale OS
       permission cache that treats deny as "already denied
       once" and skips the system sheet — need a manual
       `ACTION_APPLICATION_DETAILS_SETTINGS` intent fallback
       per Android docs.
    3. **Sampling cadence too low to be useful** — currently
       foreground-only sampling on tab open. Either bump
       sample frequency or adopt a foreground-service
       background sampler (the §14.5.5.a Later item already
       scopes this — promote to Now if founder considers
       this critical).
  - **Files:** `mobile/lib/hooks/useLocationConnector.ts`,
    `mobile/app/settings/connections.tsx`,
    `mobile/components/apex/AttentionCards.tsx` (LocationCard).
  - **Done when:** Connect → permission sheet appears even
    after a prior deny; Disconnect routes to Android Settings
    so user can revoke; LocationCard updates within 60s of
    moving to a new place.

- **3 new goal types — UI polish: customize forms + active-goal cards feel sloppy** (annoying, ~3h) — INBOX 2026-04-28
  - **Founder symptom:** "unsure looks like they load but UI
    is sloppy and no data yet" — across TIME-07
    (inbox-zero-streak), FIT-07 (sleep regularity),
    FIT-08 (daily movement / active-kcal).
  - **Scope:** Walk each of the three new types end to end:
    1. Library row (icon, copy, default target).
    2. Customize form (input copy + units + helper text).
    3. Active goal row (pace label, metric formatting,
       progress visualization).
    Apply the same polish bar as the older 16 handlers —
    rate-style goals (FIT-07 sleep regularity) need a
    different progress UI than streak-style goals.
    "No data yet" is expected behavior for the first few
    days of HC sleep data, but the empty state copy should
    say so explicitly: "Need 5+ nights of sleep data to
    compute std-dev — check back ~2026-05-03."
  - **Files:** `mobile/app/goals/customize.tsx`,
    `mobile/app/goals/index.tsx`,
    `mobile/components/apex/GoalRow.tsx`,
    `goals_engine.py` (pace label copy for the 3 new
    handlers).
  - **Done when:** Founder confirms the 3 new goals look
    visually equivalent to the existing 16; empty-data
    states are explicit, not silent.

- **Finance tab still uses emojis** (~30m) — INBOX 2026-04-28
  - **Founder symptom:** "finance tab still uses emojis".
  - **Scope:** Same sweep as the existing emoji item below,
    but the Finance tab is the next-most-emoji-heavy surface.
    Replace category emojis (likely 🍔 / 🚗 / 🏠 / etc on
    transaction rows) with category-mapped Ionicons. May
    need a `categoryIcon(name)` helper.
  - **Files:** `mobile/app/(tabs)/finance.tsx`, possibly a
    new helper in `mobile/lib/categoryIcons.ts`.
  - **Done when:** Finance tab has zero emoji characters in
    the rendered output.

- **Screen Time goal: pace label says "Reconnect source" while connector is connected** (annoying, ~1h) — INBOX 2026-04-28
  - **Founder symptom:** "screen time target says reconnect
    source when its connected and showing data elsewhere"
    — TIME-02 daily-cap goal pace label is showing the
    reconnect prompt despite Screen Time data flowing on
    Time tab.
  - **Scope:** `goals_engine.py` `_progress_screen_time_target`
    handler must be checking connector status from the wrong
    place (e.g. `users_connectors` row missing for `screen_time`
    even though `screen_time_daily` rows exist), or the
    "data source connected" probe doesn't recognize the local
    Expo Module path that doesn't OAuth.
  - **Files:** `goals_engine.py` (TIME-02 handler),
    `app.py` (goal serializer if pace label is computed
    there).
  - **Done when:** With Screen Time data flowing on Time tab,
    the TIME-02 goal pace label shows the actual usage vs
    target (e.g. "165 / 180 min"), not "Reconnect source".

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
  - **Note:** Strava elevation hit was severed into its own
    "Now" entry above (founder-flagged 2026-04-28); the rest
    here remains lower priority.
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

- **§14.3 Patterns view — polish phase** (~6h follow-up)
  - **Status (2026-04-28):** MVP shipped.
    `patterns_engine.compute_patterns` rolls up sleep / movement /
    screen / places / calendar / nutrition / workouts across 14
    days. Two routes: `/api/patterns` (deterministic, always-load)
    and `/api/patterns/synthesize` (Claude Haiku surfaces 3
    plain-English insights, user-invoked via "Generate"/"Refresh").
    Mobile `time.tsx PatternsView` now uses
    `<PatternsViewCard />` from
    `components/apex/PatternsView.tsx`.
  - **Polish remaining:**
    - **Cross-domain correlations** — sleep vs active calories,
      screen time vs steps. Pearson coefs over the 14-day window.
      Needs careful empty-data handling.
    - **Patterns cron + storage** — for v1 we recompute on read
      (cheap). Move to nightly job + `patterns_log` table once
      compute time becomes a complaint.
    - **Tap-a-pattern → drilldown** — show the underlying 14-day
      bar chart for that pattern.
    - **Insight feedback** — thumbs-up/down on each AI insight
      so we can A/B prompt variations.

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

- **Login screen rebuild — match PWA aesthetic + Google OAuth + Apple placeholder** (~5h) — INBOX 2026-04-28
  - **Founder symptom:** "want to build out better looking
    login screen very similar to pwa look add google oauth
    login and placeholder apple login".
  - **Scope:** Replace the Clerk-default email-password screen
    with a hero-style page mirroring the Flask PWA's login
    look. Add a "Sign in with Google" button (we already have
    GOOGLE_CLIENT_ID via Clerk + the app's OAuth config), plus
    a placeholder "Sign in with Apple" button (gated until iOS
    ships and the Apple Developer account is approved — show
    as disabled with "Coming soon" copy on Android).
  - **Files:** `mobile/app/login/*.tsx` (Clerk surface),
    possibly extend `app.json` with the Apple sign-in plugin
    when it's time to wire it.
  - **Done when:** Logged-out app boots into the new screen;
    Google OAuth completes the sign-in; Apple button visible
    but disabled with platform-aware copy.
  - **PRD ref:** §3.1 onboarding identity.

- **"Last synced X ago" everywhere + retire most "Sync now" buttons** (~6h) — INBOX 2026-04-28
  - **Founder symptom:** "need to show time since last sync
    for everything that regularly syncs next to sync now button
    and eventually everything should sync oten enough that there
    are no sync now buttons" + "idk why we have a sync now on
    the connection popup itself everything in the app should be
    syncing regularly enough and on page changes and on tab
    changes and on logging a workout or food or task or anything
    that changes anything".
  - **Scope:** Two-step:
    1. Surface the existing `users_connectors.last_sync_at`
       timestamp on every connector-backed card (HC, Gmail
       calendar, Outlook, Strava, Location, Screen Time) as a
       tiny "synced 4m ago" caption next to / below the title.
    2. Auto-sync cadence aggressive enough that "Sync now" is
       rarely needed — the §14.4 auto-sync-on-focus pass
       already handles Time tab; widen to Fitness/Nutrition
       cards too. Keep "Sync now" as a secondary affordance
       behind a long-press or "..." menu rather than a primary
       button.
  - **Files:** `mobile/lib/hooks/useTimeData.ts` (extend),
    `useHealthData.ts`, all `*Card.tsx` components with sync
    buttons, possibly a new `<LastSynced timestamp={...} />`
    util.
  - **Done when:** Every card with synced data shows freshness;
    most cards' explicit Sync buttons are demoted or removed;
    user perception is "the app just stays current".

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
