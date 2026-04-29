# 📥 Inbox

> **This file is yours.** Drop notes here while testing the app —
> bug reports, UX issues, feature ideas, questions, or check-marks on
> manual checks Claude has asked you to verify.
>
> Claude **files** every entry into the right `BUILD_PLAN.md` backlog
> tier (or marks the corresponding feature complete) at the start of
> each chat response and clears your sections.

---

## How to use this file

| You add to | Claude does |
|---|---|
| **Bugs / UX** | Files in Backlog → Now (testing-fresh bugs default to high priority) |
| **Feature ideas** | Files in Backlog → Later or Icebox depending on scope |
| **Questions** | Answers in the end-of-response summary (rarely stored) |
| **Other Thoughts** | Reads as direction; may file as workflow rule, scope change, or question |
| **Manual checks** | Claude drafts these. You mark them, see below. |

**Filing only:** Claude won't preempt the active phase to fix inbox
bugs unless you say so explicitly in chat or re-rank Backlog → Now.

**Format hint:** `- [Type] description` works but isn't required —
write naturally, Claude figures it out.

**Severity tags** (optional, bugs only): `(blocker)` / `(annoying)` / `(minor)`.

---

## ✅ Manual checks

> Claude drafts these as part of each phase to ask you to verify
> something it can't test itself (mostly UI / native / on-device
> behavior). You complete them and respond inline.
>
> **Mark conventions** (founder-revised 2026-04-28 — `c` for
> confirmed, `x` for broken; previous capital-`X` was too easy
> to confuse with lowercase `x`):
> - `[c]` — confirmed working
> - `[x]` — broken; describe what you saw and Claude files a bug
> - `[~]` — partially works; describe what's off
> - delete the line entirely if you don't care about it anymore

### Testing plan — runnable-anywhere release build (2026-04-28)

> **Run these in order.** Each tier gates the next: cellular works
> → HC verifies → regression sweep. Stop at the first failure and
> paste the error so I can diagnose without you needing to test
> downstream.
>
> If a tier passes wholesale, mark just the last item `[c]` and
> delete the rest of the tier — no need to mark each one.

#### Tier 1 — Cellular runnable ✅ PASSED 2026-04-29

> Logs confirmed `[api] baseUrl = https://web-production-23011.up.railway.app`
> + `useClerkBridge: Clerk -> Flask bridged (user_id=1, is_new=true)`
> + every API call returning 200 from Railway. App is
> cellular-runnable. Win condition met.

- [c] **Tier 1 cellular runnable confirmed via logcat** — all
  5 sub-checks (open / login / tabs load / kill-flask / cellular)
  collapsed since the bridge succeeded and onboarding-save flowed
  through Railway end-to-end.
  → response: confirmed via `useClerkBridge: Clerk -> Flask
  bridged (user_id=1, is_new=true)` log entry

#### Tier 2 — HC native rebuild verifications

- [ ] **HC card on Today/Fitness is tappable in Not-Connected
  state** — tap the card itself; system permission sheet appears
  → response:

- [ ] **Granting HC perms outside the app is auto-detected** —
  open HC app, grant a perm, switch back. Within ~1s the card
  reflects connected state
  → response:

- [ ] **HC Connect emits a "Connected" alert on success** —
  Settings → Connections → HC Connect → Continue when perms
  already granted. Should see a green "Connected" alert
  → response:

- [ ] **Sleep + HRV data appears anywhere** — Today tab Fitness
  card + Sleep / Recovery subsystem screens show last night's
  values. If still empty, **first open the HC app directly**
  → Sleep / HRV — does HC have data? If no, upstream wearable
  isn't pushing (not our bug). If yes, paste any logs
  → response:

- [ ] **READ_EXERCISE in the perm sheet** — when you tap Connect,
  the system sheet now lists Exercise alongside the 5 core
  perms (Steps / Sleep / HR / HRV / Active calories)
  → response:

#### Tier 3 — Quick polish (this build adds these)

- [ ] **App display name is "Life Dashboard"** in the launcher,
  not "mobile" anymore
  → response:

- [ ] **Time tab → Today subtab signal chips are 2x2** — Screen
  / Places on row 1, Focus / Meetings on row 2. Each chip is
  visibly larger than before
  → response:

- [ ] **Settings → Tracking → Goals row** — exists, taps through
  to your goals list. (Workout plan moved into the same
  Tracking section.)
  → response:

#### Tier 4 — Regression sweep (re-test what was working)

- [ ] **Day Timeline doesn't crash** — Time → Timeline subtab
  loads, blocks render, tap-block sheet works
  → response:

- [ ] **Patterns view renders** — Time → Patterns subtab shows
  the 14-day rollup cards
  → response:

- [ ] **Chatbot responds** — open chatbot, ask "what tasks do I
  have today?" — answer references real tasks
  → response:

- [ ] **Logging meals + workouts + tasks works** — log one of
  each, see them in their respective tabs
  → response:

- [ ] **Strava activities load** — Fitness → Cardio → tap a
  Strava activity. Map + stats + splits render
  → response:

#### Tier 5 — Known-broken bug spot-checks (re-test from the bug pile)

- [ ] **Calorie chart actual data** — Nutrition → Progress.
  Compare bars to your meal logs. Still flat at ~1800?
  → response:

- [ ] **Gmail star + sync** — Time tab Gmail card → tap Sync. New
  emails appear within ~30s? Important emails get yellow stars?
  → response:

- [ ] **Onboarding overflow** — Settings → Account → Re-run
  onboarding. Each page fits above on-screen buttons without
  scrolling?
  → response:

- [ ] **Voice-to-text in chatbot** — open chatbot, use your
  keyboard's voice input to dictate. Sent message matches what
  you said (not concatenated partials)?
  → response:

---

## 🐛 Bugs / UX
_(empty — workout-plan timeout fixed this turn (90s for AI
endpoints, was 15s); other onboarding/builder bugs filed in
BUILD_PLAN → Now under "Onboarding flow audit" + "Workout
builder polish")_
---

## ✨ Feature ideas
_(empty — workout-builder polish + notification system MVP
filed in BUILD_PLAN → Now)_
---

## ❓ Questions
_(empty — answered in chat: JS-only edits ~5min cached rebuild,
native ~10-20min, full clean 25min. EAS Update for OTA JS pushes
filed in BUILD_PLAN → Now once cellular smoke test passes.)_
---

## 💭 Other thoughts
_(empty — `[c]` / `[x]` mark convention adopted, see above)_
