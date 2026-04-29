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

### From Runnable-anywhere deploy + HC rebuild — 2026-04-28 (combined phase)

> **Combined phase:** rebuild = release APK = same step that picks up
> the Kotlin sleep-window fix AND makes the app cellular-runnable.
> One release rebuild handles both. Full runbook in
> [`docs/DEPLOY.md`](DEPLOY.md).

**Founder-side gates first** — these block the rest:

- [ ] **Backend smoke test** — Backend is now up (the "random
  website" was the legacy Flask PWA homepage at `/` — expected,
  not a bug). Hit
  `https://web-production-23011.up.railway.app/api/health` in
  a browser. After the next Railway redeploy (this turn added
  the `/api/health` route), it should return:
  `{"ok": true, "service": "life-dashboard", "db": "up"}`.
  → response:

  Status:
  - Railway URL: `web-production-23011.up.railway.app` ✓
  - Volume mounted at `/data` ✓
  - SECRET_KEY presumably set (boot crash resolved; founder
    saw the Flask PWA HTML render on `/`, which means Flask
    booted past the SECRET_KEY check)
  - JWT_SECRET intentionally skipped (falls back — fine)
  - CORS_ORIGINS — set to `*` if you want to silence the
    default warning, not blocking

**App-side, after the backend is up:**

- [ ] **`mobile/.env` `EXPO_PUBLIC_API_BASE_URL` flipped** to the
  Railway HTTPS URL. Keep the LAN URL noted somewhere — useful
  for dev sessions
  → response:

- [ ] **Release APK built + installed** — DEPLOY.md Step 7.
  ~10-15min first time. `adb install -r app-release.apk`
  → response:

- [ ] **Cellular smoke test** — disconnect phone from wifi, open
  the app, login, browse Today + Fitness + Nutrition + Time tabs.
  Every tab loads + shows data
  → response:

**HC + sleep verifications (covered by the same rebuild):**

- [ ] **HC Connect emits a "Connected" alert on success** —
  Settings → Connections → HC Connect → Continue when perms are
  already granted. Should see a green "Connected" alert
  → response:

- [ ] **Daily-aggregate sleep window matches stages window** —
  Sleep subsystem `last night` value matches what HC's own Sleep
  view shows (±5min for rounding)
  → response:

- [ ] **READ_EXERCISE no longer breaks `permitted`** — if you
  previously granted only the 5 core perms (no Exercise), the
  app still treats HC as connected. New connects request all 6
  perms in one sheet
  → response:

**Diagnostic (still missing data):**

- [ ] **Sleep + HRV data appears anywhere in the app** — founder
  reported `still havent seen a bit of sleep or hrv data anywhere`
  on the prior pass. After rebuild, re-test:
  1. Open Health Connect app directly → Sleep. Is there ANY
     sleep data there? If no — upstream wearable isn't pushing,
     check the Garmin/Pixel Watch/Fitbit companion app's
     Health Connect settings.
  2. If HC has sleep but the app still shows nothing —
     this is a real pipeline bug, copy any error logs into the
     response below
  → response:

---

## 🐛 Bugs / UX
_(empty)_

---

## ✨ Feature ideas
_(empty — sync-now-everywhere idea folded into existing
"Last synced X ago + retire Sync Now buttons" item in BUILD_PLAN
→ Later)_

---

## ❓ Questions
_(empty)_

---

## 💭 Other thoughts
_(empty)_
