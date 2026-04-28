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

## The 3-file project doc system

```
docs/
  BUILD_PLAN.md   ← Claude territory. Status / Active / Backlog /
                    Deferred / Vision. Founder reads but does not edit.
  INBOX.md        ← founder territory. Drop-zone for bug reports,
                    UX issues, feature ideas, questions while testing.
                    Claude empties at start of every chat response.
  PHASE_LOG.md    ← Claude territory. Append-only log of every Claude
                    response. Never capped. Read end-to-end to recover
                    full project history.
```

Founder edits `INBOX.md` only. Claude maintains `BUILD_PLAN.md` and
`PHASE_LOG.md`. Founder doesn't need to touch either.

The full PRD (long-form product spec) lives in
`docs/migration/APEX_PRD_Final.md`. The Vision section of
`BUILD_PLAN.md` is the load-bearing distillation.

---

## Per-response workflow

Every chat response, in order:

### 1. Triage `docs/INBOX.md` — filing only, not fixing (mandatory, every response)

**Critical rule:** triage is **filing**, not **executing**. Read every
line, move it to the correct spot in `BUILD_PLAN.md`, and continue
with the active phase. **Don't preempt the active phase to fix inbox
bugs** — they get fixed when their Backlog tier comes up. If the
founder wants a bug to jump the queue, they'll say so in chat or
re-rank Backlog → Now manually.

For each section:
- **🐛 Bugs / UX** → add to `BUILD_PLAN.md` → Backlog → Now (default
  — testing-surfaced bugs usually deserve next-up priority) or
  Backlog → Later if minor / cosmetic. Don't open the file to fix
  it this turn.
- **✨ Feature ideas** → Backlog → Later (or Icebox if out of scope).
- **❓ Questions** → keep aside to answer in the end-of-response
  summary. Don't file as a Backlog item unless it implies a new
  phase.
- **💭 Other thoughts** → read as direction. May surface a workflow
  rule, scope change, or question. File appropriately.
- **✅ Manual checks** → see Step 2 below. Different handling.
- **Ambiguous / truncated** → file in Backlog → Later with
  "(awaiting clarification — '<exact text>')" tag, AND surface in
  the end-of-response summary so the founder can clarify next turn.
  Don't guess.

**After triage, clear the relevant sections in `INBOX.md`** (back to
`_(empty)_` placeholders). Don't delete the section headings — keep
the structure intact so the founder always sees the same shape.

### 2. Process `✅ Manual checks` section — verify, file, draft new

The Manual checks section is the founder's verification log. It works
like a feedback loop:

**On every response:**
1. **Read the existing checks** for marks the founder added:
   - `[x]` — verified working. **Delete the entry** from the file.
   - `[✗]` — broken. **File as a bug** in `🐛 Bugs / UX` (or directly
     into Backlog → Now if testing-fresh). Then delete the manual-
     check entry. Surface in the end-of-response summary.
   - `[~]` — partial. Read the inline reply, file the rest as a
     bug, delete the manual-check entry.
   - `[ ]` — still pending. Leave alone. If it's been pending for
     more than ~3 sessions, surface it in the response as a
     reminder.
   - **Removed entirely** — founder dismissed it. Move on.

2. **At the end of every phase, draft new manual checks** for any
   change you can't verify yourself (UI / native / env / external
   service / on-device behavior). Add to the Manual checks section
   under a new sub-heading: `### From <phase name> — <YYYY-MM-DD>`.
   Each check is a `- [ ] **Description**` line followed by a
   `→ response:` blank.

3. **Format the section** so it stays scannable:
   - Group by phase (most recent at top).
   - Keep each check to one short line + minimal context.
   - Use bold for the action ("**TIME-02 form shows daily_cap_minutes
     input**") so the founder skims fast.

4. **Don't surface the same check twice.** If you draft a check in
   phase N and the founder doesn't respond by phase N+3, you can
   re-mention it in chat ("still waiting on manual check from
   §X — care to confirm?") but don't duplicate it in the file.

### 3. Read `BUILD_PLAN.md` for current state

- **Status snapshot** + **Active phase** + **Backlog → Now**.
- The **active phase** in BUILD_PLAN.md is what you work on, not
  whatever was in the inbox. Inbox is feedback flow; the active
  phase is the directive. Founder will redirect explicitly in chat
  if they want a different focus.

### 4. Read source files for the active phase

- For backend changes: `app.py` (routes), `db.py` (schema), the
  relevant `*_sync.py` module, `connectors.py` (catalog),
  `chatbot.py` (LifeContext consumers).
- For mobile UI: `mobile/app/(tabs)/*.tsx`, `mobile/components/apex/`,
  `mobile/lib/hooks/`.
- For new connectors: `connectors.py` +
  `mobile/app/settings/connections.tsx` handler + (if device-native)
  `mobile/modules/<name>/` template.
- For shared types: `shared/src/types/`.
- Use `Agent` with `Explore` agent type for surveys spanning >3
  files.
- **Read the source before assuming a Backlog item is accurate.**
  Source is truth; the plan is a guide.

### 5. Do the work — on the active phase, not on inbox items

- One phase active at a time. The active phase is what's in
  `BUILD_PLAN.md` → Active phase. If Active is empty, propose one
  from Backlog → Now and start it.
- If scope creeps, log the new item to Backlog and continue current
  scope — don't silently expand.
- Issue `MANUAL CHECK:` prompts for anything you can't verify
  yourself (UI / native / env / external system / ambiguous spec).
  Wait for ack before declaring done.

### 5a. End-of-response summary (mandatory)

The chat reply at the end of every response is the founder's
single read-out. Structure it in three blocks:

1. **Inbox actions** — one line per item filed, with where it
   landed in Backlog. *("[Bug] X → Backlog → Now"; "[Question] Y →
   answered below"; "[?] truncated 'we need' → Backlog → Later
   (awaiting clarification)").*  If inbox was empty, write "Inbox:
   empty."
2. **Active phase progress** — what shipped this turn for the
   current phase, MANUAL CHECKs issued, what's next.
3. **Answers to questions** — direct answers to anything in inbox
   under [Question]. One short paragraph each.

This format is non-negotiable. The founder's testing loop depends
on knowing exactly what was filed vs. what was built vs. what was
answered, every response.

### 6. Push every response — `git add` + `git commit` + `git push`

Every chat response that touches files ends with a commit + push to
`origin/master`. Founder-mandated 2026-04-28: PHASE_LOG entries
without a corresponding pushed commit are useless if the laptop dies
or Claude's context resets. Even small one-file edits push.

- If the response only updated docs (BUILD_PLAN / INBOX / PHASE_LOG),
  push them. They're load-bearing.
- If the response made no file changes, no commit needed — the
  PHASE_LOG entry can ship in the next batched push.
- Don't squash multiple unrelated changes into one commit. Each
  logical phase = one commit.

### 7. Append a `PHASE_LOG.md` entry — every response, no exceptions

Even one-word responses ("ok", "continue") get a brief log entry.
Format (in PHASE_LOG.md itself, repeated here for reference):

```markdown
### [HH:MM] One-line summary
- **Prompt:** "founder's request, paraphrased if long"
- **Did:** what Claude actually did, in 1–5 bullets
- **Files:** comma-separated paths if any code/doc edits happened
- **Decisions/notes:** non-obvious calls, things deferred, gotchas
- **Manual checks:** if any were issued — list and mark pending
- **Outcome:** shipped / partial / blocked / no-op
```

Per-response granularity, not per-file. Bundle multiple edits in
one entry. The point: future-Claude (or future-founder, or an LLM
reading the project history cold) can reconstruct what happened
without grepping commits.

**Never edit prior entries.** If context changes, add a new entry.

### 8. End-of-phase only — update BUILD_PLAN.md too

When a phase concludes (not every response — just when work wraps):

1. Update **Active phase** in BUILD_PLAN.md to "(none — between
   phases)".
2. Re-rank **Backlog → Now** if priorities shifted.
3. Update **Status snapshot** at the top.
4. Bubble Deferred items into Backlog with a tier + reason.
5. Tell the founder in chat: what shipped, manual checks pending,
   queued next.

The PHASE_LOG.md entry for the final response of the phase serves
as the formal phase summary — it doesn't need to be duplicated in
BUILD_PLAN.md.

---

## PRD overrides — must be approved + applied

The PRD (`docs/migration/APEX_PRD_Final.md`) is the long-term spec.
When implementation reveals that the PRD is wrong or stale, the
override workflow is:

1. **Identify the override during phase planning.** Note the section
   number, the original position, and the specific deviation you're
   proposing.
2. **Issue a MANUAL CHECK** in the chat: *"Proposed PRD override of
   §X.Y. Original: '<short quote>'. Proposed change: '<short
   description>'. Reason: '<why>'. Approve?"*
3. **Wait for explicit founder approval.** Don't ship code that
   diverges from the PRD without it. If the founder says no, the
   PRD is authoritative — find a different path or escalate the
   conflict.
4. **After approval**, apply the change to the PRD itself with a
   `**Revised YYYY-MM-DD** (see [BUILD_PLAN.md → Vision → PRD
   overrides](...))` footnote that preserves the original reasoning
   inline. Don't delete the original — explain why it changed and
   what the new position is.
5. **Add the override to BUILD_PLAN.md → Vision → PRD overrides**
   for the audit trail.
6. **Log it in PHASE_LOG.md** as a Decision in the phase's entry.

The current approved overrides (as of 2026-04-28) are:
- **§1.7 Backend stack** — Flask + SQLite for v1, Node.js + AWS for v2
- **§4.6.5 Day Timeline AI usage** — two-tier (deterministic hard +
  AI-labeled soft) instead of pure-deterministic
- **§4.7.10 Chatbot context cap** — ~18K with three-tier loading
  instead of ~8K with pre-summarization
- **§1.7 Android-first** — iOS at v1.1, not v1, due to entitlement
  approval gates

Future overrides follow the workflow above.

---

## Manual checks — explicit, never silent

Some changes Claude can't verify alone. **Always call out manual
checks explicitly** with a grep-able prefix:

```
MANUAL CHECK: open the app, navigate to Fitness → tap a Strava
workout, verify the map loads. Reply 'ok' or describe what's wrong.
```

Issue when:
- **UI / native / device-permission changes** — anything Claude
  can't run.
- **Env / config edits** — new env var, Cloud Console API enable,
  third-party service setup.
- **External-system actions** — GitHub permissions, OAuth scopes,
  app-store config, founder-owned account changes.
- **Unclear requirements** — ask before guessing when a 10-second
  question saves a wrong shipment.

**Wait for acknowledgement** before declaring the phase done. Track
unresolved checks in the PHASE_LOG.md entry under `Manual checks:`
with `(pending)`. Surface stale ones at the start of the next
response: *"Still waiting on manual check from yesterday's §X: did
Y work?"*

---

## Founder is testing in parallel — design for it

While Claude codes, the founder is using the app. Their feedback flow
is `INBOX.md`. Implications:

- When you ship testable changes, end your reply with a one-line
  `MANUAL CHECK:`. Even minor UI tweaks.
- If the founder mentions something broken mid-chat that's unrelated
  to the active phase, **add it to `INBOX.md` yourself** so it
  doesn't get lost. (Or directly into Backlog if it's clear-cut.)
- The founder is allowed to drop notes in `INBOX.md` at any moment,
  including between sessions. You'll see them on the next response.

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
