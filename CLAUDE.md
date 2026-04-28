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

## Phase execution discipline

A "phase" = a coherent chunk of work that ships together — typically one or
two §14 subsections from `docs/migration/BUILD_PLAN_v2.md`.

### At the start of every phase — orient first

Before writing any code:

1. **Read `docs/migration/BUILD_PLAN_v2.md`**, focused on:
   - The phase's own subsection (e.g. §14.7 for workout builder)
   - The most recent **§14.12 Phase Log** entry — catches problems +
     deferred items from the prior phase that need addressing now
   - The **§14.10 Phasing** block — what comes next, what's blocked

2. **Read relevant PRD sections** — `docs/migration/APEX_PRD_Final.md`.
   PRD overrides (where the build plan supersedes the PRD) are documented
   in **§14.1**. Always check there before assuming PRD is authoritative.

3. **Survey the architecture you're about to touch.** At minimum:
   - **Backend changes**: `app.py` (routes), `db.py` (schema), the
     relevant `*_sync.py` module, `connectors.py` (catalog), `chatbot.py`
     (LifeContext consumers)
   - **Mobile UI**: `mobile/app/(tabs)/*.tsx`, `mobile/components/apex/`,
     `mobile/lib/hooks/`
   - **New connector**: `connectors.py` + `mobile/app/settings/connections.tsx`
     handler + (if device-native) `mobile/modules/<name>/` template
   - **Shared types**: `shared/src/types/`

   Use `Agent` with `Explore` agent type for surveys spanning >3 files.

4. **Address Phase Log carry-overs.** If the previous Phase Log entry has
   deferred items or flagged problems relevant to this phase, decide
   whether to fix them now or explicitly carry them forward in the new
   Phase Log entry. Don't silently skip.

### As you execute the phase

You can edit `BUILD_PLAN_v2.md` in-flight to:
- Mark items complete with ✅
- Mark items deferred with ⏳ + reason
- Add newly-discovered subtasks
- Update §14.10 phasing if the order shifts

Don't restructure the plan invisibly. Material scope changes get flagged
in the Phase Log entry written at the end.

### At the end of every phase — write the Phase Log entry

Append an entry to **§14.12 Phase Log** at the bottom of
`BUILD_PLAN_v2.md`:

```markdown
### Phase log: <phase name> — <YYYY-MM-DD>

**Shipped:**
- <bullet> Concrete features + file paths

**Deferred:**
- <bullet> What got cut. Reason. When it should land.

**Problems flagged:**
- <bullet> Things that broke, workarounds applied, tech debt incurred

**Decisions:**
- <bullet> Non-obvious calls made — architectural choices, library swaps,
  PRD overrides, scope cuts

**Next pickup:**
- Concrete first step for the next session. The first thing future-Claude
  should do.
```

This is the handoff document. Future-you (or future-Claude) reads it cold.
Write so the reader can pick up without grepping the diff.

### Cap the log at the most recent 15 entries

If the log grows past 15 entries, archive the oldest to a new file
`docs/migration/PHASE_LOG_ARCHIVE.md` and keep §14.12 trimmed.

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
