# Project Instructions for Claude

This file is loaded automatically at the start of every Claude Code session
in this repo. Standing instructions for working on the Life Dashboard
project.

---

## Project context

- **Life Dashboard** — Expo SDK 54 React Native app + Flask backend
- Personal life-tracking product (health, fitness, nutrition, finance, time)
  with AI-assisted insights via Claude Haiku
- **Android-first** development; iOS waits on Apple Developer Program
  approval and HealthKit / Apple Family Controls entitlements
- Solo founder + Claude. No other developers.

---

## The build plan

**Single source of truth: [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md).**

Status-first: read top-to-bottom and the first ~150 lines tell you
where the project is. Sections in order:

1. **How this doc works** — the workflow guide for both founder + Claude
2. **Status snapshot** — current state, one paragraph
3. **Active phase** — what's in flight RIGHT NOW (one phase at a time)
4. **Inbox** — founder drops bug reports / feedback / questions while
   testing the app. Untriaged. Claude clears at start of next session.
5. **Backlog** — Now / Next / Later / Icebox
6. **Deferred / known gaps** — explicit cuts with revisit-when
7. **Done — Phase Log** — append-only, capped at 15 entries
8. **Vision** — long-term roadmap (mostly stable)

The full `CLAUDE.md` workflow rules below mirror "How this doc works"
in the build plan; that section is meant to teach the founder. This
section is a tighter version for Claude.

---

## Phase execution discipline

A "phase" = a coherent chunk of work that ships together. **One phase
active at a time.** Items come from `docs/BUILD_PLAN.md` → Backlog →
Now.

### At the start of every phase — orient first

Before writing any code:

1. **Read `docs/BUILD_PLAN.md`** top-to-bottom (it's deliberately
   compact). Focus on:
   - **Status snapshot** + **Active phase** — current state
   - **Inbox** — triage every entry: convert to Backlog (Now / Next /
     Later), file as a current-phase blocker, ask the founder for
     clarification, or dismiss with a one-line reason. **Don't leave
     items in the Inbox after triage** — that's the founder's signal
     that you've seen and acted on them.
   - **Backlog → Now** — the candidate phase list
   - **Done — Phase Log** most recent entry — catches problems +
     deferred items from the prior phase

2. **Confirm the active phase with the founder before writing code.**
   If Active is empty, propose one from Backlog → Now and wait for
   "go" or a redirect.

3. **Read relevant PRD sections** — `docs/migration/APEX_PRD_Final.md`.
   PRD overrides (where the build plan supersedes the PRD) are
   documented in BUILD_PLAN's **Vision → PRD overrides**. Check there
   before assuming PRD is authoritative.

4. **Survey the architecture you're about to touch.** At minimum:
   - **Backend changes**: `app.py` (routes), `db.py` (schema), the
     relevant `*_sync.py` module, `connectors.py` (catalog),
     `chatbot.py` (LifeContext consumers)
   - **Mobile UI**: `mobile/app/(tabs)/*.tsx`,
     `mobile/components/apex/`, `mobile/lib/hooks/`
   - **New connector**: `connectors.py` +
     `mobile/app/settings/connections.tsx` handler + (if device-native)
     `mobile/modules/<name>/` template
   - **Shared types**: `shared/src/types/`

   Use `Agent` with `Explore` agent type for surveys spanning >3
   files. **Read the source before assuming a Backlog item is
   accurate** — the source of truth is the code, not the plan doc.

5. **Address Phase Log carry-overs.** If the previous Phase Log entry
   has deferred items or flagged problems relevant to this phase,
   decide whether to fix them now or explicitly carry them forward in
   the new Phase Log entry. Don't silently skip.

### Manual checks — explicit, never silent

Some changes Claude can't verify alone — they require the founder to
test on-device or take an action outside the repo. **Always call out
manual checks explicitly** with a grep-able prefix:

```
MANUAL CHECK: open the app, navigate to Fitness → tap a Strava
workout, verify the map loads. Reply 'ok' or describe what's wrong.
```

When to issue a manual check:
- **UI changes** — anything Claude can't run (mobile screens, native
  modules, anything behind device permissions). Ship the change, then
  pause for the founder to confirm.
- **Env / config edits** — when a new env var is required, when a
  Cloud Console API needs enabling, when a third-party service needs
  setup. List exactly what to do; founder confirms done.
- **External-system actions** — anything that touches GitHub
  permissions, OAuth scopes, app-store config, or any account the
  founder owns directly.
- **Unclear requirements** — when the spec is genuinely ambiguous,
  ask before guessing. Don't ship "best guess + revisit later" when
  a question takes 10 seconds.

**Wait for acknowledgement** before declaring the phase done. Track
unresolved checks in the Phase Log entry's `Manual checks pending:`
line so the founder has an explicit hand-off list.

### Founder is testing in parallel

While Claude codes, the founder is using the app — that's the highest
leverage on their side. Output policy:

- When you ship something testable, end the message with a one-line
  manual check. Even a minor UI tweak: "MANUAL CHECK: pull-to-refresh
  on Fitness tab — the new strava-linked rows should be visible."
- If the founder mentions something broken mid-phase that's unrelated,
  say "I'll add that to Inbox" and add it to BUILD_PLAN.md → Inbox
  yourself. Don't lose it.
- If the founder hasn't confirmed a recent manual check, surface
  uncompleted checks at the start of the next message: "Still waiting
  on manual check from §14.5.1: did the map load after env-var fix?"

### As you execute the phase

You can edit BUILD_PLAN.md in-flight to:
- Update **Active phase** with notes / decisions / blockers
- Move items between Backlog tiers (Now ↔ Next ↔ Later) if priorities
  shift
- Add newly-discovered follow-ups to **Backlog → Later** with a one-
  line context

Don't restructure the plan invisibly. Material scope changes get
flagged in the Phase Log entry at end.

### At the end of every phase

1. **Append a Phase Log entry** to BUILD_PLAN.md's **Done — Phase
   Log** section (template is in the doc itself). The
   `Manual checks pending:` line is mandatory — write "none" if there
   are none.
2. **Clear Active phase** to "(none — between phases)".
3. **Re-rank Backlog → Now** if priorities shifted.
4. **Update Status snapshot** at the top.
5. **Bubble follow-ups** — every Deferred item should land somewhere
   in Backlog with a tier + a reason. Don't let them rot in Phase Log
   entries.
6. **Tell the founder** in the chat reply: what shipped, what to
   verify (the Manual checks pending list), what's queued next.

### Cap the Phase Log at the 15 most recent entries

When it grows past 15, archive the oldest to
`docs/PHASE_LOG_ARCHIVE.md` and trim BUILD_PLAN.md.

---

## Code conventions

### Backend (Python / Flask)
- Single Flask app in `app.py` (50K+ lines — yes, but it's the convention)
- Each integration gets its own `*_sync.py` module
  (`gmail_sync.py`, `gcal_sync.py`, `outlook_sync.py`, `strava_sync.py`,
  `location_engine.py`)
- DB helpers live in `db.py` (no ORM; raw sqlite3)
- Connector catalog (`connectors.py`) is the source of truth for what
  connectors exist; `users_connectors` table tracks per-user state
- AI call layer: `claude_nutrition.py`, `claude_profile.py`, `chatbot.py`
- Surface upstream API errors with structured response bodies — the
  pattern is: `if not resp.ok: raise RuntimeError(f"... {resp.status_code}: {resp.json()}")`

### Mobile (React Native / Expo SDK 54)
- File-based routing in `mobile/app/`
- Tab screens in `mobile/app/(tabs)/`
- Components in `mobile/components/apex/` (single barrel: `index.ts`)
- Hooks in `mobile/lib/hooks/`
- Local Expo Modules in `mobile/modules/<name>/` — template established
  by `mobile/modules/usage-stats/` and `mobile/modules/health-connect/`
- Don't add third-party React Native libraries that have stale Gradle
  metadata (compile() vs implementation()) — write a custom Expo Module
  instead. Pattern is well-documented in `mobile/modules/health-connect/`.

### Shared types
- `shared/src/types/` — TypeScript types used by both mobile and (if
  applicable) backend pyi stubs. Keep type definitions here, not duplicated.

### Native config (`mobile/app.json`)
- Permissions go in `android.permissions[]`
- Config plugins go in `plugins[]`
- Custom intent filters in `android.intentFilters[]`
- Local Expo Modules autolink — no plugin entry needed
- Build properties (minSdk override, etc.) via `expo-build-properties`

---

## Build / test workflow

### Local Android builds (faster than EAS for solo dev)

```powershell
cd C:\Users\nmuso\Documents\life-dashboard\mobile
npx expo prebuild --platform android --clean
cd android
.\gradlew.bat :app:assembleDebug
adb install -r .\app\build\outputs\apk\debug\app-debug.apk
```

First build: ~25 min. Subsequent: ~3-5 min (Gradle cache).

### TypeScript check

```powershell
cd mobile
npx tsc --noEmit
```

The `app/(tabs)/finance.tsx` error about `merchant_name` is pre-existing
and unrelated to most work — ignore unless explicitly debugging finance.

### Backend boot test

```powershell
python -c "import app; print('OK')"
```

Confirms imports clean and routes register.

---

## Git conventions

- Work in feature branches off `master`. PR for review when checkpoint-worthy.
- Commits: imperative subject line, scope-prefixed where useful
  (`feat:`, `feat(fitness):`, `fix:`, `docs:`)
- Multi-feature commits for big sessions are OK — body should bullet
  every meaningful change
- Always include `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
  on AI-assisted commits

---

## What NOT to commit

- `.env` (already gitignored — backend secrets)
- `mobile/.env` is committed (it has only `EXPO_PUBLIC_*` client-public values)
- `.claude/` (local Claude config)
- `mobile/.idea/`, `mobile/android/`, `mobile/ios/` (generated)
- `mobile/modules/*/android/build/` (Gradle output)
- `node_modules/`, `__pycache__/`, build artifacts

---

## Founder communication style

- Direct, technical. No fluff intros.
- When something's broken, lead with the diagnosis, not the apology.
- Always state what's deferred and why — silent scope cuts are not OK.
- Show work — file paths, line numbers, exact error messages.
- Recommend a path; don't just list options. The founder will redirect if
  needed.
