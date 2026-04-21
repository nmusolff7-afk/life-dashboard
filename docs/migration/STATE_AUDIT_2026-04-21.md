# APEX Life Dashboard — State Audit

Generated: 2026-04-21 | Auditor: Claude Opus 4.7 | Scope: current repo state vs. migration documentation

---

## 1. Git State

- **Current branch:** `master`
- **Uncommitted / unstaged changes:**
  - `M .claude/settings.local.json` (modified, unstaged)
- **Last 5 commits on `master`:**
  | Hash | Message |
  |------|---------|
  | `229acb5` | docs: comprehensive audit and update of all 11 migration documents |
  | `d3f4f9a` | Add calorie rollover, auto-adjust toggle, and persistent theme |
  | `8a76639` | Unique colors for each macro and micro throughout the app |
  | `ff0b4cb` | Fix spinners always visible + pantry sub-card styling |
  | `28b0b61` | Fix getProfileData() infinite recursion + weight not persisting |
- **Other local branches:**
  - `experiment`
  - `pre-migration-hardening`
- **Remote tracking (`origin`):**
  - `origin/master`, `origin/experiment`, `origin/pre-migration-hardening`
- **Divergence from `origin/master`:** None in commits. Working tree has one modified file (`.claude/settings.local.json`) not yet committed.

---

## 2. Directory Structure (2 levels deep)

```
life-dashboard/
├── .claude/
├── .env
├── .git/
├── .gitignore
├── Apex_App_Logo.png
├── Procfile
├── README.md
├── __pycache__/
├── ai_client.py
├── app.py                       (52,215 bytes)
├── claude_nutrition.py
├── claude_profile.py
├── db.py                        (59,753 bytes)
├── docs/
│   └── migration/
├── gmail_sync.py
├── goal_config.py
├── life_dashboard.db
├── nixpacks.toml
├── requirements.txt
├── static/
│   ├── apex-logo.png
│   ├── i18n.js
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── manifest.json
│   └── sw.js
└── templates/
    ├── index.html               (532,123 bytes)
    ├── login.html
    └── onboarding.html
```

**Structure status:** Flat — matches the pre-migration layout described in [REPO_INVENTORY.md](REPO_INVENTORY.md) section 1. No `apex/`, `mobile/`, `server/`, `shared/`, or `flask/` directories exist. The monorepo restructure called for in Phase 0 of [MIGRATION_PLAN.md](MIGRATION_PLAN.md) (lines 65-75) has not been executed.

---

## 3. HARDENING_LOG.md Reality Check (21 commits)

All 21 commits listed in [HARDENING_LOG.md](HARDENING_LOG.md) exist in git history.

| # | Hash | Verified | Subject |
|---|------|----------|---------|
| 1 | `eebfeae` | OK | chore: relocate migration docs to /docs/migration/ |
| 2 | `32a0d9e` | OK | phase0.5: add ACTIVE_FEATURES.md, DORMANT_FEATURES.md, HARDENING_LOG.md |
| 3 | `1f26316` | OK | P0-2: fixed _ob_jobs memory leak via pop + hourly TTL sweep |
| 4 | `aa077b0` | OK | P0-3: added threading.Lock to _ob_jobs |
| 5 | `f89660d` | OK | P1-4: URL-encoded Gmail OAuth error parameter |
| 6 | `038fa74` | OK | P1-6: added timeouts to all 17 Anthropic API calls |
| 7 | `7dae477` | OK | P1-7: enforced SECRET_KEY in production |
| 8 | `dba7421` | OK | P1-5: replaced 7 silent exception swallows with _log.warning |
| 9 | `55e57a0` | OK | phase3: add AI_CALL_INVENTORY.md |
| 10 | `7c494dd` | OK | phase3: switch 5 Opus calls to Haiku |
| 11 | `f96cd3c` | OK | phase4: preserve check-in scoring logic in BUSINESS_LOGIC.md |
| 12 | `17f0fcf` | OK | phase4: removed dormant app_settings functions |
| 13 | `f565457` | OK | phase4: removed all dormant features (Garmin, sleep, check-ins, app_settings) |
| 14 | `34e405e` | OK | P2-13: made delete_account() atomic |
| 15 | `66d165f` | OK | P2-12: added esc() HTML escaping |
| 16 | `a538ef3` | OK | P2-10: exposed RMR fallback state |
| 17 | `a51b4d9` | OK | P2-8: deduplicated Gmail thread checks |
| 18 | `bdb7947` | OK | P2-9: sync localStorage from server on page load |
| 19 | `45f8522` | OK | P3-18: added missing indexes for saved_meals/workouts |
| 20 | `a63b3a9` | OK | P3-17: replaced 4 raw exception leaks with safe messages |
| 21 | `c7b60e0` | OK | P3-22: hide barcode scanner when BarcodeDetector unsupported |

**Missing:** 0 of 21.

---

## 4. ACTIVE_FEATURES.md Reality Check (23 features)

All listed routes were verified against `@app.route` declarations in [app.py](app.py). All listed `db.py` functions were verified against function definitions in [db.py](db.py).

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | Meal Logging + AI Macro Estimation | ✅ | All 7 routes + 5 db.py functions present |
| 2 | Meal Photo Scanning | ✅ | `POST /api/scan-meal` at [app.py:634](app.py#L634) |
| 3 | Pantry Scanner | ✅ | `POST /api/meals/scan` [app.py:650](app.py#L650), `POST /api/meals/suggest` [app.py:665](app.py#L665) |
| 4 | Saved Meals | ✅ | All 3 routes + 3 db.py functions present |
| 5 | Barcode Scanner | ✅ | Client-side only; no server drift possible |
| 6 | Manual Workout Logging + AI Burn | ✅ | All 6 routes + 5 db.py functions present |
| 7 | Saved Workouts | ✅ | All 3 routes + 3 db.py functions present |
| 8 | Strength Workout Tracking | ✅ | Client-side only; no drift |
| 9 | Workout Plan Generation | ✅ | All 4 routes present ([app.py:905-953](app.py#L905)) |
| 10 | Weight Tracking | ✅ | `POST /api/log-weight` [app.py:262](app.py#L262); `save_daily_weight`, `get_daily_weight` in db.py |
| 11 | Steps Tracking | ✅ | Client-side only; no drift |
| 12 | Daily Momentum Score | ✅ | All 4 routes + 5 db.py functions present |
| 13 | Goal Setting | ✅ | `POST /api/goal/update`, `GET /api/profile`; `upsert_user_goal`, `get_user_goal` present |
| 14 | Task Tracking | ✅ | All 4 routes + 4 db.py functions present |
| 15 | Gmail Email Routing | ✅ | All 7 Gmail routes present ([app.py:973-1155](app.py#L973)) |
| 16 | Onboarding Quiz | ✅ | All 5 routes + 5 db.py functions present |
| 17 | History & Day Detail | ✅ | `GET /api/history`, `GET /api/day/<date>`; all 3 db.py functions present |
| 18 | Theme Switcher | ✅ | Client-side only |
| 19 | Multi-Language Support | ✅ | Client-side only |
| 20 | Authentication & Account Management | ✅ | All 5 routes + `create_user`, `verify_user`, `delete_account` present |
| 21 | Settings | ✅ | Persisted via goal/profile endpoints |
| 22 | Workout Detail View | ✅ | Reuses `/api/day/<date>` |
| 23 | Meal Detail View | ✅ | Reuses `/api/day/<date>` |

**Drift summary:** 0 of 23 features show drift. The `ACTIVE_FEATURES.md` document is consistent with the current [app.py](app.py) and [db.py](db.py).

---

## 5. MIGRATION_PLAN.md Phase 0 Status (lines 47-75)

| Item | Status | Evidence |
|------|--------|----------|
| P0 #1 — Missing DB tables | ✅ | Resolved by deletion of dormant features in commit `f565457` |
| P0 #2 — `_ob_jobs` memory leak | ✅ | `.pop(..., None)` + TTL sweep landed in `1f26316` |
| P0 #3 — `_ob_jobs` race condition | ✅ | `threading.Lock` landed in `aa077b0` |
| P1 #4 — XSS in Gmail callback | ✅ | `urlencode` on error param; verified at [app.py:1046-1047](app.py#L1046) |
| P1 #6 — Claude API timeouts | ✅ | Landed in `038fa74` (all 17 calls) |
| P1 #7 — SECRET_KEY required | ✅ | Landed in `7dae477` |
| Convert 7 HTML-returning endpoints to JSON | ❌ | See breakdown below |
| — `GET /` → `GET /api/dashboard` | ❌ | [app.py:288](app.py#L288) still returns HTML via `render_template`; no `/api/dashboard` route exists |
| — `GET /onboarding` → `GET /api/onboarding/data` | ❌ | [app.py:298](app.py#L298) still returns HTML; no `/api/onboarding/data` route exists |
| — `POST /login` → `POST /api/auth/login` | ❌ | [app.py:165](app.py#L165) unchanged; no `/api/auth/login` route exists |
| — `POST /login` (register) → `POST /api/auth/register` | ❌ | No `/api/auth/register` route exists |
| — `GET /logout` → `POST /api/auth/logout` | ❌ | [app.py:244](app.py#L244) is still `GET /logout`; no `/api/auth/logout` route exists |
| — `GET /api/gmail/connect` → return `{ auth_url }` | ❌ | [app.py:1037](app.py#L1037) still returns `redirect(auth_url)` |
| — `GET /api/gmail/callback` → return `{ ok, email }` | ❌ | [app.py:1069-1072](app.py#L1069) still returns `redirect(...)` |
| JWT auth middleware (PyJWT, Bearer + session) | ❌ | No `jwt` / `PyJWT` references in [app.py](app.py) or [requirements.txt](requirements.txt) |
| `flask-cors` | ❌ | Not in [requirements.txt](requirements.txt); no `CORS` import in [app.py](app.py) |
| Monorepo scaffold (`apex/mobile|server|flask|shared|docs`) | ❌ | No `apex/`, `mobile/`, `server/`, `shared/`, or `flask/` directories exist at repo root |
| Initialize Expo project (`mobile/`) | ❌ | No `mobile/` directory, no `package.json`, no `app.json` at repo root |
| Initialize shared TypeScript package (`shared/`) | ❌ | No `shared/` directory, no `tsconfig.json` at repo root |

**Phase 0 summary:** 6 of 13 bug-fix items ✅. All 7 HTML→JSON endpoint conversions ❌. JWT middleware ❌. flask-cors ❌. Monorepo scaffold ❌. Expo ❌. shared/ ❌.

---

## 6. Node.js State

Raw output of `node --version`:
```
v24.15.0
```

Raw output of `npm --version`:
```
11.12.1
```

Both installed.

---

## 7. P0/P1 Debt Resolution Cross-Check

All seven items are resolved in current `HEAD` per [HARDENING_LOG.md](HARDENING_LOG.md) and [TECH_DEBT.md](TECH_DEBT.md) Resolution Log.

| # | Item | TECH_DEBT claim | HARDENING_LOG commit | Status in HEAD |
|---|------|-----------------|----------------------|----------------|
| P0-1 | Missing tables (`sleep_logs`, `app_settings`) | DELETED (dormant) | `f565457` | ✅ Resolved — `upsert_sleep`/`get_sleep`/`get_setting`/`set_setting` are not defined in current [db.py](db.py) (grep returned no matches) |
| P0-2 | `_ob_jobs` memory leak | FIXED — pop + TTL sweep | `1f26316` | ✅ Commit exists and is in `master` history |
| P0-3 | `_ob_jobs` race condition | FIXED — `threading.Lock` | `aa077b0` | ✅ Commit exists and is in `master` history |
| P1-4 | Gmail XSS (OAuth error reflection) | FIXED — `urlencode` | `f89660d` | ✅ Verified at [app.py:1046-1047](app.py#L1046) |
| P1-5 | Silent exception swallowing | FIXED — 7 active paths log warnings | `dba7421` | ✅ Commit in history |
| P1-6 | No Claude API timeout | FIXED — 17/17 calls have timeout | `038fa74` | ✅ Commit in history |
| P1-7 | `SECRET_KEY` regenerates on restart | FIXED — required in production | `7dae477` | ✅ Commit in history |

No unresolved P0/P1 items.

---

## 8. .env Variables

Variable names present in [.env](.env) (values redacted):

```
ANTHROPIC_API_KEY=<redacted>
GARMIN_EMAIL=<redacted>
GARMIN_PASSWORD=<redacted>
GOOGLE_CLIENT_ID=<redacted>
GOOGLE_CLIENT_SECRET=<redacted>
```

Comparison against [REPO_INVENTORY.md](REPO_INVENTORY.md) section 10:

| Variable | In .env | In REPO_INVENTORY §10 | Required per inventory |
|----------|---------|----------------------|------------------------|
| `ANTHROPIC_API_KEY` | ✅ | ✅ | YES |
| `SECRET_KEY` | ❌ not present | ✅ listed | No (but becomes required in production after `7dae477`) |
| `DB_PATH` | ❌ not present | ✅ listed | No (default `life_dashboard.db`) |
| `PORT` | ❌ not present | ✅ listed | No (default 5000) |
| `RECOVERY_KEY` | ❌ not present | ✅ listed | No |
| `APP_URL` | ❌ not present | ✅ listed | No |
| `GOOGLE_CLIENT_ID` | ✅ | ✅ | No |
| `GOOGLE_CLIENT_SECRET` | ✅ | ✅ | No |
| `GARMIN_EMAIL` | ✅ present | ❌ not listed | — |
| `GARMIN_PASSWORD` | ✅ present | ❌ not listed | — |

Deltas:
- **Not in .env but in inventory:** `SECRET_KEY`, `DB_PATH`, `PORT`, `RECOVERY_KEY`, `APP_URL` (all marked optional in inventory).
- **In .env but not in inventory:** `GARMIN_EMAIL`, `GARMIN_PASSWORD`. Garmin integration was deleted from the codebase in commit `f565457` (see [HARDENING_LOG.md](HARDENING_LOG.md) row 13) and is not referenced in current [app.py](app.py), [db.py](db.py), or [requirements.txt](requirements.txt).
