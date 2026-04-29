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
> **How to respond:** change `[ ]` to `[x]` and add a one-line
> reply after the arrow if anything's off. Claude clears
> verified items at the start of the next response and files
> any `[✗]` marks as bugs.
>
> Mark conventions:
> - `[x]` — verified working
> - `[✗]` — broken; describe what you saw and Claude files a bug
> - `[~]` — partially works; describe what's off
> - delete the line entirely if you don't care about it anymore

### From HC connect + Sleep diagnostic — 2026-04-28

> **JS-only fixes** (1, 2, 3, 5, 6 below) land on Metro reload alone.
> Try them first. If the JS fixes resolve the symptom, you can skip
> the rebuild for now.
>
> **Kotlin fix** (4 — sleep window in `readDailyAggregatesImpl`)
> needs a native rebuild:
>
> ```powershell
> cd C:\Users\nmuso\Documents\life-dashboard\mobile
> npx expo prebuild --platform android --clean
> cd android
> .\gradlew.bat :app:assembleDebug
> adb install -r .\app\build\outputs\apk\debug\app-debug.apk
> ```

- [ ] **(JS) HC card on Today/Fitness is now tappable in Not-Connected
  state** — open Today/Fitness with HC not connected. Tap the
  Health Connect card itself (not just "Sync now"). System
  permission sheet appears; grant → card flips to data view
  with steps/sleep stats
  → response:

- [ ] **(JS) Settings → Connections → HC Connect emits a "Connected"
  alert on success** — tap Connect → Continue when perms are
  already granted. Should see a green "Connected" alert (was
  silent before)
  → response:

- [ ] **(JS) Granting HC perms outside the app is auto-detected** —
  open the HC app from the launcher, grant Life Dashboard's
  Sleep / Steps / etc, then switch back to Life Dashboard.
  Within ~1s, the HC card should reflect connected state
  (was stuck at "Not connected" until you re-tapped Connect)
  → response:

- [ ] **(JS) Sleep data appears even when last night's sleep crosses
  midnight** — after reload + auto-sync, Today tab Fitness card
  and Sleep subsystem should show last night's sleep duration.
  Was being dropped by the old window-bug
  → response:

- [ ] **(REBUILD) Daily-aggregate sleep window matches stages window** —
  after rebuild + install, Sleep subsystem `last night` value
  matches what HC's own Sleep view shows (give or take ±5min
  for rounding)
  → response:

- [ ] **(REBUILD) READ_EXERCISE no longer breaks `permitted`** — if
  you previously granted only the 5 core perms (no Exercise),
  the app should still treat HC as "connected" and auto-sync
  runs. New connects request all 6 perms in one sheet so Garmin
  activities flow when granted
  → response:

---

## 🐛 Bugs / UX
_(empty — all triaged into BUILD_PLAN → Now)_

---

## ✨ Feature ideas
_(empty — all triaged into BUILD_PLAN → Later)_

---

## ❓ Questions
_(empty)_

---

## 💭 Other thoughts
_(empty)_
