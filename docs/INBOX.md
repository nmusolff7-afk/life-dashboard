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

### From 3 new goal types — 2026-04-28

- [ ] **TIME-07 Inbox-zero streak** — Goals → Library → "Inbox-zero streak". Set target streak length (e.g. 14). Save → goal active. After you've cleared a day's email backlog, the streak should tick up
  → response:

- [ ] **FIT-07 Sleep regularity** — Goals → Library → "Sleep regularity". Default target rate is 30 (min std-dev over 14 nights). Save → after ~5 nights of sleep data the goal shows your current SD
  → response:

- [ ] **FIT-08 Daily movement** — Goals → Library → "Daily movement". Form should show "Daily active-calories target" input. Set 300 (or your number) → save → goal lists as active. Streak ticks up daily when HC reports active_kcal ≥ target
  → response:

### From §14.4 Chatbot three-tier context — 2026-04-28

- [ ] **Chatbot can read your tasks** — open chat, ask "what tasks do I have left today?" or "what's overdue?". Should list real tasks from your mind_tasks, not generic "I don't have access to that."
  → response:

- [ ] **Chatbot reads your workout plan** — ask "what's on my workout plan for today?" or "is today a strength or rest day?". Should reference your active plan's weekly schedule and today's scheduled session
  → response:

- [ ] **Chatbot can compare across days** — ask "how did last week's calories compare to this week?" or "did I work out more this week than last?". Should give numbers from the new HistoricalContext (14-day rollup)
  → response:

- [ ] **Chatbot reads Day Timeline** — ask "what was I doing this afternoon?" or "what's on my plate later today?". Should reference both your calendar events (hard blocks) and AI-inferred activities (soft blocks)
  → response:

### From §14.2.4 Day Timeline UI polish — 2026-04-28

- [ ] **"Now" indicator line** — open Time tab → Timeline. The current/next block has a thin red vertical line on its left edge. The strip auto-scrolls so that block is visible on first mount
  → response:

- [ ] **Tap a block → detail sheet** — tap any block (hard or soft). A small modal centers with: kind-aware icon, label, time range, duration, source/location/attendees/AI-confidence depending on block type. Tap-anywhere-outside dismisses
  → response:

### From §14.2.2 Day Timeline soft AI labels — 2026-04-28

- [ ] **Soft blocks appear on DayStrip** — open Time tab → Timeline. After ~1-3s, the gaps between calendar events should fill with AI-labeled blocks (focus / meal / transit / leisure / etc) rendered with a dashed border + "AI · low/med/high" confidence pill
  → response:

- [ ] **Soft-block labels feel reasonable** — at-a-glance, do the labels match what you actually did during those gaps? "Focus" during work hours, "meal" at noon, etc. (Quality is best-effort; flag obvious misses)
  → response:

- [ ] **Hard blocks still distinguishable** — calendar events keep solid borders + colored bars; only the AI-inferred ones get the dashed treatment. The two types should not visually blend
  → response:

### From Data correctness pass — 2026-04-28

- [ ] **Calorie chart in Nutrition Progress** — target dashed line now uses your stable `user_goals.calorie_target` (not the live one that drifts with workouts/rollover). Today's partial-day row excluded from the chart + avg. Subline shows "X logged days · target Y kcal"
  → response:

- [ ] **Units toggle propagates** — Settings → Preferences → Units → flip metric ↔ imperial. Confirm: SubsystemsCard Body weight + target, WeightTrendCard hero + delta, strength subsystem "weekly volume" + per-row "top X lbs/kg", Today tab Fitness card weight, WorkoutDetailModal volume + per-exercise summaries — all show the right unit
  → response:

### From Tab visual consistency — 2026-04-28

- [ ] **Time + Finance tab top bar** — both now use the same compact `<SubTabs>` chip in the TabHeader's right slot (matching Fitness + Nutrition), instead of a separate full-width segmented row below
  → response:

- [ ] **Goal row icons** — Goals tab + Today tab Active Goals strip — each row's left-side icon is now an Ionicon in a colored circle (barbell / restaurant / wallet / time-outline), not the emoji 💪🥗💰⏰
  → response:

- [ ] **Card titles cleaned up** — HealthConnectCard, ScreenTimeCard, LocationCard show an Ionicon next to the title text instead of an emoji prefix (heart, phone-portrait, location)
  → response:

- [ ] **Strava-sourced workout rows** — show "· Strava" text suffix instead of the 🏃 emoji on WorkoutHistoryList + cardio + strength + day-detail rows
  → response:

### From Time tab content density — 2026-04-28

- [ ] **Time tab → Today subtab signal chips** — between the 3-cell summary row and Today's Focus card, four chips appear: Screen / Places / Focus / Meetings. Values populate from your real data within ~1s
  → response:

- [ ] **"Right now / Up next" strip** — when you have an in-progress calendar event, a strip below the chips shows it. When there's an upcoming event, "Up next" shows below. Tapping the strip routes to Time → Timeline subtab
  → response:

- [ ] **Location connect alert (denial path)** — Settings → Connections → Location → Connect → Don't allow. Alert should now explain why Location is needed + give Android Settings path to grant manually (was a generic "permission not granted")
  → response:

### From Polish round 1 — 2026-04-28

- [ ] **Today tab calorie-goal card** routes to Settings → Profile → Macros (only visible if you have NO unified goals + a calorie goal set)
  → response:

- [ ] **FAB → Task chip** appears after Weight in the shortcut rail; tapping closes the chat overlay and routes to Time → New task
  → response:

- [ ] **Gmail email rows** show a yellow star next to the subject for important emails (uses Gmail's native classifier — no setup needed)
  → response:

- [ ] **Screen Time card empty state** says "Syncing…" (not "Connect Screen Time") when you've granted Usage Access but data hasn't synced yet. Real data appears within ~60s of opening the tab
  → response:

### From Auto-sync trust pass v3 — 2026-04-28

- [ ] **HC display real fix** — Reload Metro. Open Fitness → Sleep. Should show either (a) hero "Xh Ym last night" + 7-night trend bars, or (b) "Health Connect connected — no sleep data yet" diagnostic. Should NOT show "Connect Apple Health" anymore
  → response:

- [ ] **Auto-sync cadence** — switch tabs and come back. Time-tab data refreshes within 90s of last sync (was 5min)
  → response:

- [ ] **Re-onboarding option** — Settings → Account → "Re-run onboarding" routes to step-1 of the wizard. Walking through preserves existing meals/workouts/weight log; profile fields reflect new entries
  → response:

### From Time surface unification — 2026-04-28

- [ ] **Today tab → Time card** shows "Top tasks" section (up to 3 incomplete, priority+overdue first) with "+ Add" button, plus a "next block" preview row if you have calendar events today
  → response:

- [ ] **Time tab → Timeline sub-tab** renders the DayStrip (calendar events as horizontal pill cards) instead of the empty-state placeholder
  → response:

- [ ] **Task with time creates a Day Timeline block** — Tap "+ Add" on Time card → enter description + "14:30" + "60 min" → save. Open Time → Timeline. Task should appear as a block from 2:30p–3:30p
  → response:

### From Trust pass v2 — 2026-04-28

- [ ] **Plan switching** — Settings → Workout Plan → "Build a different way" shows 3 chips (AI quiz / AI import / Manual). All three reachable; AI quiz routes to the wizard
  → response:

### From §14.8 Customize.tsx config fields — 2026-04-28

- [ ] **TIME-02 (Screen time target) goal creation** — Goals → Library → pick TIME-02. Form shows "Daily screen-time cap (minutes)" input. Set 180 → save → goal lists as **active** (not paused) once today's `screen_time_daily` row exists
  → response:

- [ ] **TIME-06 (Location visit target) goal creation** — Goals → Library → pick TIME-06. Cluster picker lists your real location clusters (or shows "no clusters yet" hint if empty). Pick one + set weekly target → save → goal active
  → response:

---

## 🐛 Bugs / UX
_(empty)_

---

## ✨ Feature ideas
_(empty)_

---

## ❓ Questions
_(empty)_

---

## 💭 Other thoughts
_(empty)_
