# APEX Life Dashboard — Migration Plan

Generated: 2026-04-17 | 22-week timeline | Solo developer + Claude Code

---

> **IMPORTANT: This plan was written assuming Flask-parity migration. The actual ship target is PRD v1.0 (see [APEX_PRD_Final.md](APEX_PRD_Final.md)). For the governing rule set, see [BUILD_APPROACH.md](BUILD_APPROACH.md). This plan remains useful for Phases 0–2 scaffolding work (authentication, design system, business logic port, onboarding wizard). Phases 3–6 as written are SUPERSEDED by the PRD feature requirements — do not follow the old Phase 3–6 as feature specifications.**

---

## Target Architecture

Target architecture is **PRD v1.0 §5 (Technical Architecture)**. This plan's earlier description of a Flask-to-Node migration applies to the **backend transition** only, not to the product scope. Specifically, §5 specifies the full mobile client, backend, data layer, auth, sync pipelines, AI integration layer, real-time/notification pipeline, and external vendor integrations for v1.0 — most of which are out-of-scope for this document.

The high-level boundary shift documented below (React Native client, Node.js/TypeScript backend, Postgres, Clerk auth, RevenueCat billing, AWS KMS for secrets) still describes the migration *direction*. It does not describe the v1.0 feature surface. For that, follow the PRD.

```
┌──────────────────────────────────────────────────────────┐
│                    React Native (Expo SDK 52+)           │
│  Clerk Auth ─── RevenueCat Billing ─── Expo Router       │
└────────────────────────┬─────────────────────────────────┘
                         │ HTTPS / JSON
┌────────────────────────▼─────────────────────────────────┐
│               Node.js + Express + TypeScript              │
│  Clerk middleware ── Upstash Redis cache ── AWS KMS       │
└────────────────────────┬─────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────┐
│                   Neon PostgreSQL                         │
│  17 active tables ── proper indexes ── encrypted at rest  │
└──────────────────────────────────────────────────────────┘
```

Note: the "17 active tables" reflects Flask's current schema, not the PRD's data model. The PRD §5.5 / §11.6 / Appendix E specify a broader schema that includes Finance (transactions, budgets, bills, savings), Time (calendar events, email metadata, screen-time samples, location visits), Goals (22-goal library with per-goal progress), Notifications (signal log, delivery log, user rules), and Chatbot (audit log). The migration is additive beyond Flask's schema; treat Flask's 17 tables as a subset of the eventual Postgres schema.

### Migration Strategy: Frontend-First

```
Weeks  1-4:   Stabilize Flask + scaffold RN app + auth
Weeks  5-9:   Build core RN screens against Flask backend (JSON proxy)
Weeks 10-13:  Advanced screens + integrations against Flask
Weeks 14-17:  Node.js/Express/TypeScript backend replaces Flask
Weeks 18-20:  Neon PostgreSQL + data migration + RevenueCat
Weeks 21-22:  Polish, E2E testing, alpha release
```

---

## Phase 0: Stabilize & Prepare (Week 1)

### Goal
Fix critical bugs in the Flask app, add missing JSON endpoints so React Native can talk to Flask during development, scaffold the new project.

### Dependency
Nothing — this is the starting point.

### Week 1

- [ ] **Fix P0 #1: Missing database tables** — Re-add `sleep_logs` and `app_settings` CREATE TABLE statements to `init_db()` in `db.py` (lines 670-756 reference them). Alternative: remove `upsert_sleep()`, `get_sleep()`, `get_sleep_history()`, `get_setting()`, `set_setting()` if sleep/settings features are dead.
- [ ] **Fix P0 #2: Memory leak** — Change `_ob_jobs[user_id]` reads to `_ob_jobs.pop(user_id, None)` in `app.py` `api_onboarding_poll()` so entries are cleaned after polling.
- [ ] **Fix P0 #3: Race condition** — Add `threading.Lock()` around `_ob_jobs` reads/writes in `app.py`.
- [ ] **Fix P1 #4: XSS in Gmail callback** — URL-encode the error parameter in `app.py` line 1207.
- [ ] **Fix P1 #6: No Claude API timeout** — Add `timeout=30.0` to all `client.messages.create()` calls in `claude_nutrition.py` and `claude_profile.py`.
- [ ] **Fix P1 #7: SECRET_KEY** — Change to `os.environ["SECRET_KEY"]` (crash if not set).
- [ ] **Convert 7 HTML-returning endpoints to JSON:**
  - [ ] `GET /` → new `GET /api/dashboard` returning `{ user, profile, goals, onboarding_complete }`
  - [ ] `GET /onboarding` → new `GET /api/onboarding/data` returning `{ saved, editing, username }`
  - [ ] `POST /login` → new `POST /api/auth/login` returning `{ ok, user_id, username, token }` (JWT)
  - [ ] `POST /login` (register) → new `POST /api/auth/register` returning `{ ok, user_id, username, token }`
  - [ ] `GET /logout` → new `POST /api/auth/logout` returning `{ ok: true }`
  - [ ] `GET /api/gmail/connect` → return `{ auth_url }` instead of redirect
  - [ ] `GET /api/gmail/callback` → return `{ ok, email }` instead of redirect
- [ ] **Add JWT auth middleware** to Flask (PyJWT) — accept both session cookies (web) and Bearer tokens (mobile) so existing web app keeps working.
- [ ] **Add CORS headers** to Flask for React Native dev (`flask-cors`, allow `http://localhost:*`).
- [ ] **Scaffold monorepo structure:**
  ```
  apex/
  ├── mobile/           # Expo React Native app (new)
  ├── server/           # Node.js + Express + TypeScript (new, empty for now)
  ├── flask/            # Current Flask app (moved here)
  ├── shared/           # TypeScript types, constants, business logic (new)
  └── docs/             # Migration docs (existing .md files)
  ```
- [ ] **Initialize Expo project** — `npx create-expo-app mobile --template blank-typescript` with SDK 52+.
- [ ] **Initialize shared TypeScript package** — `shared/` with `tsconfig.json`.

### Rollback
Revert git commits. Flask app unchanged except for additive JSON endpoints and bug fixes.

### Files to Create
| File | Purpose |
|------|---------|
| `mobile/` | Expo React Native app (scaffolded) |
| `server/` | Empty Node.js project directory |
| `shared/types/api.ts` | Request/response TypeScript interfaces for all 52 endpoints |
| `shared/types/models.ts` | TypeScript interfaces matching all 17 DB tables |
| `shared/constants/nutrition.ts` | Macro energy constants, micronutrient defaults |
| `shared/constants/scoring.ts` | Momentum score weights, category thresholds |

---

## Phase 1: React Native Foundation (Weeks 2-4)

### Goal
Clerk auth working, navigation scaffolded, API client talking to Flask backend, first screen (Login) fully functional.

### Dependency
Phase 0 complete (JSON endpoints exist, CORS enabled, JWT auth works).

### Week 2: Auth + Navigation

- [ ] **Install and configure Clerk** — `@clerk/clerk-expo`, set up `ClerkProvider` in `mobile/app/_layout.tsx`.
- [ ] **Create Clerk-Flask bridge** — Flask endpoint `POST /api/auth/clerk-verify` that validates Clerk JWT and returns/creates a local user. This lets Clerk handle auth UX while Flask remains the data backend.
- [ ] **Set up Expo Router** — file-based routing in `mobile/app/`:
  ```
  app/
  ├── _layout.tsx          # Root layout with ClerkProvider
  ├── (auth)/
  │   ├── login.tsx        # Clerk sign-in
  │   └── register.tsx     # Clerk sign-up
  ├── (onboarding)/
  │   └── index.tsx        # 7-step wizard
  └── (tabs)/
      ├── _layout.tsx      # Tab navigator
      ├── index.tsx        # Home
      ├── nutrition.tsx    # Nutrition
      ├── fitness.tsx      # Fitness
      ├── progress.tsx     # Progress
      ├── status.tsx       # Status
      └── profile.tsx      # Profile
  ```
- [ ] **Create API client module** — `mobile/lib/api.ts` with base URL config, Clerk token injection, typed fetch wrappers for all endpoints.
- [ ] **Build Login/Register screens** — Clerk `<SignIn />` and `<SignUp />` components with APEX styling.

### Week 3: Shared Business Logic + Design System

- [ ] **Port business logic to TypeScript** (in `shared/logic/`):
  - [ ] `shared/logic/rmr.ts` — RMR calculation (Mifflin-St Jeor + Katch-McArdle)
  - [ ] `shared/logic/neat.ts` — NEAT calculation (occupation base + step estimation)
  - [ ] `shared/logic/tef.ts` — Thermic Effect of Food
  - [ ] `shared/logic/tdee.ts` — TDEE composition (RMR + NEAT + EAT + TEF)
  - [ ] `shared/logic/targets.ts` — Calorie & macro target computation
  - [ ] `shared/logic/momentum.ts` — Daily momentum score (0-100)
  - [ ] `shared/logic/streak.ts` — Streak calculation
  - [ ] `shared/logic/projection.ts` — Weight loss projection
  - [ ] `shared/logic/importance.ts` — Email importance classification
- [ ] **Write unit tests** for all 9 ported modules using the test cases from BUSINESS_LOGIC.md section 13.
- [ ] **Create design system** — `mobile/components/ui/`:
  - [ ] `Card.tsx` — base card with dark theme
  - [ ] `SegmentedControl.tsx` — for goal/diet/sex selectors
  - [ ] `SliderRow.tsx` — labeled slider (macros, RMR, NEAT)
  - [ ] `ProgressBar.tsx` — horizontal macro bar
  - [ ] `CalorieRing.tsx` — SVG donut chart (port from index.html SVG logic)
  - [ ] `StatGrid.tsx` — 2x2 stat display
  - [ ] `PageDots.tsx` — swipeable page indicator
  - [ ] Theme constants (colors, typography matching current dark theme)

### Week 4: Onboarding Flow

- [ ] **Build Onboarding wizard** — 7-step flow matching Flask `onboarding.html`:
  - [ ] Step 1: Body stats (weight, height, age, body fat %, sex)
  - [ ] Step 2: Occupation selector (sedentary/standing/physical)
  - [ ] Step 3: Goal selector (lose_weight/build_muscle/recomp/maintain)
  - [ ] Step 4: Diet preferences
  - [ ] Step 5: Workout preferences + equipment
  - [ ] Step 6: Schedule (checkboxes for workout days)
  - [ ] Step 7: AI plan generation with polling (`POST /api/onboarding/complete` → `GET /api/onboarding/poll`)
- [ ] **Connect to Flask APIs** — save/complete/poll endpoints.
- [ ] **Verify auth guard** — unonboarded users redirect to onboarding, onboarded users go to tabs.

### Rollback
Delete `mobile/` directory, revert Flask Clerk-bridge endpoint. Flask web app continues unchanged.

### Files to Create
| File | Purpose |
|------|---------|
| `mobile/app/_layout.tsx` | Root layout with Clerk + theme |
| `mobile/app/(auth)/login.tsx` | Clerk sign-in screen |
| `mobile/app/(auth)/register.tsx` | Clerk sign-up screen |
| `mobile/app/(onboarding)/index.tsx` | 7-step onboarding wizard |
| `mobile/app/(tabs)/_layout.tsx` | Tab navigator |
| `mobile/app/(tabs)/index.tsx` | Home tab (placeholder) |
| `mobile/app/(tabs)/nutrition.tsx` | Nutrition tab (placeholder) |
| `mobile/app/(tabs)/fitness.tsx` | Fitness tab (placeholder) |
| `mobile/app/(tabs)/progress.tsx` | Progress tab (placeholder) |
| `mobile/app/(tabs)/status.tsx` | Status tab (placeholder) |
| `mobile/app/(tabs)/profile.tsx` | Profile tab (placeholder) |
| `mobile/lib/api.ts` | Typed API client |
| `mobile/lib/storage.ts` | AsyncStorage wrappers (replaces localStorage) |
| `mobile/components/ui/*.tsx` | Design system components (listed above) |
| `shared/logic/*.ts` | 9 business logic modules |
| `shared/logic/__tests__/*.test.ts` | Unit tests for all business logic |

---

## Phase 2: Core Screens (Weeks 5-9)

### Goal
Home, Nutrition, and Fitness tabs fully functional against Flask backend.

### Dependency
Phase 1 complete (auth works, navigation scaffolded, business logic ported, design system exists).

### Week 5: Home Tab

- [ ] **Streak bar** — horizontal FlatList, 30-day window, flame emoji, clickable cells.
  - Data: `GET /api/history` → extract logged days.
- [ ] **Calorie ring** — SVG donut using `react-native-svg`, port ring logic from `shared/logic/`.
  - Data: `GET /api/today-nutrition` → totals + `GET /api/profile` → targets.
- [ ] **Stats grid** — 2x2 (Weight, Steps, Proj. Burn, Cals Consumed).
  - Data: `GET /api/today-nutrition`, `GET /api/garmin`, profile data.
- [ ] **Macros/Micros card** — swipeable (PagerView), page dots, macro progress bars.
  - Data: `GET /api/today-nutrition` + profile targets.
- [ ] **Tasks list** — add/toggle/delete.
  - Data: `GET /api/mind/today`, `POST /api/mind/task`, `PATCH /api/mind/task/{id}`, `DELETE /api/mind/task/{id}`.
- [ ] **Pull-to-refresh** on entire home tab.

### Week 6: Nutrition Tab — Logging

- [ ] **Log a Meal card** — TextInput + "Get Macros" button.
  - API: `POST /api/estimate` → display items + macros.
- [ ] **Macro edit grid** — 4 inline number inputs (Cal, Protein, Carbs, Fat).
- [ ] **Item breakdown** — per-item calorie list with remove buttons.
- [ ] **Log button** — `POST /api/log-meal`.
- [ ] **Photo scan** — `expo-camera` + `expo-image-picker` → base64 → `POST /api/scan-meal`.
- [ ] **Barcode scanner** — `expo-barcode-scanner` → Open Food Facts API (client-side, same as current).
- [ ] **Saved meals** — `GET /api/saved-meals`, save/delete.
- [ ] **AI edit** — `POST /api/ai-edit-meal` for corrections.

### Week 7: Nutrition Tab — History + Fitness Tab — Logging

- [ ] **Meal table** — FlatList with description, cal, pro, carb, fat columns.
  - Edit: `POST /api/edit-meal/{id}` via bottom sheet.
  - Delete: `POST /api/delete-meal/{id}` with confirmation.
- [ ] **Daily summary card** — swipeable: page 1 (deficit + P/C/F bars), page 2 (remaining + sugar/fiber/sodium).
- [ ] **Calories consumed chart** — `react-native-chart-kit` or `victory-native`, 7/30/90 day toggle.
  - Data: `GET /api/history`.
- [ ] **Log Activity card** — TextInput + "Get Burn Estimate" (`POST /api/burn-estimate`) + "Log Activity" (`POST /api/log-workout`).
- [ ] **Workout entries list** — card-based, icon circles, calorie pills, edit/delete.

### Week 8: Fitness Tab — Strength + Steps/Weight

- [ ] **Strength card** — workout plan display from profile, "Start Workout" button.
- [ ] **Workout checklist overlay** — full-screen, exercise blocks, set rows (checkbox, weight input, reps input).
- [ ] **Live timer + rest timer** — `expo-keep-awake` to prevent screen sleep during workout.
- [ ] **Daily Steps card** — number input + Save Steps.
  - API: currently client-side only (stored in localStorage). For mobile: need new `POST /api/log-steps` endpoint on Flask (or repurpose Garmin data).
- [ ] **Today's Weight card** — number input + `POST /api/log-weight`.
- [ ] **Total Daily Burn chart** — bar chart with Today / RMR / Active stats.

### Week 9: Integration Testing + Bug Fixes

- [ ] **End-to-end flow testing** — Register → Onboard → Log meal → Log workout → View home.
- [ ] **Offline handling** — AsyncStorage cache for recent data, queue mutations when offline, sync on reconnect.
- [ ] **Error states** — loading spinners, error messages, retry buttons for all API calls.
- [ ] **Performance audit** — FlatList optimization, image caching, reduce re-renders.
- [ ] **Fix all bugs** found during Weeks 5-8 testing.

### Rollback
Revert mobile app to Phase 1 state (placeholder screens). Flask backend unaffected.

### Screen Mapping: Flask → React Native

| Flask Screen | React Native Screen | Key Differences |
|-------------|---------------------|-----------------|
| `login.html` | `(auth)/login.tsx` | Clerk UI replaces custom form |
| `onboarding.html` | `(onboarding)/index.tsx` | Step-based navigation, same 7 steps |
| `index.html` `#tab-home` | `(tabs)/index.tsx` | Same components, native scroll |
| `index.html` `#tab-meals` | `(tabs)/nutrition.tsx` | Camera integration for photo scan |
| `index.html` `#tab-workout` | `(tabs)/fitness.tsx` | Keep-awake for workout timer |
| `index.html` `#tab-progress` | `(tabs)/progress.tsx` | Native charts |
| `index.html` `#tab-mind` | `(tabs)/status.tsx` | Same layout |
| `index.html` `#tab-profile` | `(tabs)/profile.tsx` | Native sliders |

### Files to Create
| File | Purpose |
|------|---------|
| `mobile/components/home/StreakBar.tsx` | 30-day horizontal streak |
| `mobile/components/home/CalorieRing.tsx` | SVG donut chart |
| `mobile/components/home/StatsGrid.tsx` | 2x2 stat cards |
| `mobile/components/home/MacroCard.tsx` | Swipeable macro/micro display |
| `mobile/components/home/TaskList.tsx` | Task add/toggle/delete |
| `mobile/components/nutrition/MealLogger.tsx` | Meal input + estimate |
| `mobile/components/nutrition/MacroEditGrid.tsx` | 4 inline number inputs |
| `mobile/components/nutrition/ItemBreakdown.tsx` | Per-item calorie list |
| `mobile/components/nutrition/PhotoScanner.tsx` | Camera → base64 → API |
| `mobile/components/nutrition/BarcodeScanner.tsx` | Barcode → Open Food Facts |
| `mobile/components/nutrition/MealTable.tsx` | Meal list with edit/delete |
| `mobile/components/nutrition/DailySummary.tsx` | Swipeable summary card |
| `mobile/components/nutrition/CalorieChart.tsx` | 7/30/90 day bar chart |
| `mobile/components/fitness/ActivityLogger.tsx` | Workout input + burn estimate |
| `mobile/components/fitness/WorkoutList.tsx` | Workout card list |
| `mobile/components/fitness/StrengthCard.tsx` | Workout plan display |
| `mobile/components/fitness/WorkoutChecklist.tsx` | Full-screen workout overlay |
| `mobile/components/fitness/StepsCard.tsx` | Steps input |
| `mobile/components/fitness/WeightCard.tsx` | Weight input |
| `mobile/components/fitness/BurnChart.tsx` | Daily burn bar chart |
| `mobile/lib/offline.ts` | Offline queue + sync logic |

---

## Phase 3: Advanced Screens + Integrations (Weeks 10-13)

> **SUPERSEDED — see [BUILD_APPROACH.md](BUILD_APPROACH.md) for feature scope. This phase description captures Flask-parity work only; actual v1.0 scope per the PRD is broader/different.** The PRD's §4.2 (Home), §4.3 (Fitness), §4.4 (Nutrition), §4.5 (Finance), §4.6 (Time), §4.7 (Chatbot), §4.9 (Notifications), §4.10 (Goals), and §4.11 (Data Export) collectively replace the "Progress, Status, Profile tabs + Gmail/Garmin integrations" scope below.

### Goal
Progress, Status, and Profile tabs complete. Gmail and Garmin integrations working through Flask.

### Dependency
Phase 2 complete (core screens functional, API client stable).

### Week 10: Progress Tab

- [ ] **Daily Score chart** — line chart (victory-native), today/7D avg/trend stats.
  - Data: `GET /api/momentum/history?days=90`.
- [ ] **Body Weight Trend chart** — line chart with projection dashed line, target line.
  - Data: `GET /api/history` → extract weight entries from daily_activity.
- [ ] **Activity Calendar** — custom grid (7 columns), color-coded cells (strength/cardio/both/rest), legend.
  - Data: `GET /api/history` → workouts by date.
- [ ] **History list** — card-per-day, deficit badge, weight, activity icons.
  - Data: `GET /api/history`.
- [ ] **Deficit/Surplus chart** — line chart with zero line, target deficit dashed line.
- [ ] **Strength Progress** — exercise selector dropdown, weight/reps over time chart.

### Week 11: Progress Tab (Day Detail) + Status Tab

- [ ] **Day Detail overlay** — bottom sheet or modal:
  - Summary stats grid (weight, steps, calories, deficit, macros, micros).
  - Meal list with edit/delete.
  - Workout list with edit/delete.
  - Add meal/workout from history view.
  - Data: `GET /api/day/{date}`.
- [ ] **Daily Score card** — large score number, category breakdown (calories, macros, workout, tasks).
  - Data: `POST /api/momentum/today`.
- [ ] **Insight card** — Day/Week/Month pill toggle, AI text, Recalculate button.
  - Data: `POST /api/momentum/insight`, `POST /api/momentum/summary`.
- [ ] **Task list** — same component as Home tab (shared).

### Week 12: Gmail + Garmin Integrations

- [ ] **Gmail integration:**
  - [ ] Connect button → `GET /api/gmail/connect` → open auth URL in `expo-web-browser` → handle callback deep link.
  - [ ] Gmail card: connected/disconnected state, Important/Stream toggle, email rows.
  - [ ] Label/dismiss buttons → `POST /api/gmail/label`.
  - [ ] Refresh button → `POST /api/gmail/sync`.
  - [ ] "How this works" expandable section.
- [ ] **Garmin integration:**
  - [ ] Status display → `GET /api/garmin/status`.
  - [ ] Manual sync button → `POST /api/garmin/sync`.
  - [ ] Steps auto-fill from Garmin data.
- [ ] **Deep link handling** — `expo-linking` for OAuth callbacks.

### Week 13: Profile Tab + Polish

- [ ] **About You section** (collapsible) — weight, target, height, age, bf%, sex, occupation, goal + RMR/NEAT sliders.
  - API: `POST /api/goal/update`.
- [ ] **Macro Targets section** — protein/carbs/fat/sugar/fiber/sodium sliders.
- [ ] **Workout Plan section** — plan display, generate/revise/parse.
  - API: `POST /api/generate-plan`, `POST /api/generate-comprehensive-plan`, `POST /api/revise-plan`, `POST /api/parse-workout-plan`.
- [ ] **App Settings** — theme, notifications (push via `expo-notifications`), timezone.
- [ ] **Account section** — delete account (`POST /api/delete-account`), sign out (Clerk).
- [ ] **Full app regression test** — all tabs, all flows, all integrations.
- [ ] **Performance profiling** — React DevTools, Flipper, identify slow screens.

### Rollback
Revert mobile app to Phase 2 state. Flask backend unaffected.

### Files to Create
| File | Purpose |
|------|---------|
| `mobile/components/progress/ScoreChart.tsx` | Daily momentum line chart |
| `mobile/components/progress/WeightChart.tsx` | Body weight trend with projection |
| `mobile/components/progress/ActivityCalendar.tsx` | Color-coded activity grid |
| `mobile/components/progress/HistoryList.tsx` | Day-by-day history cards |
| `mobile/components/progress/DayDetail.tsx` | Full day detail bottom sheet |
| `mobile/components/progress/DeficitChart.tsx` | Deficit/surplus line chart |
| `mobile/components/progress/StrengthChart.tsx` | Strength progress chart |
| `mobile/components/status/ScoreCard.tsx` | Large momentum score display |
| `mobile/components/status/InsightCard.tsx` | AI insight with scale toggle |
| `mobile/components/status/GmailCard.tsx` | Gmail integration UI |
| `mobile/components/status/GarminCard.tsx` | Garmin status display |
| `mobile/components/profile/AboutYou.tsx` | Body stats + sliders |
| `mobile/components/profile/MacroTargets.tsx` | Macro/micro slider section |
| `mobile/components/profile/WorkoutPlan.tsx` | Plan display + generation |
| `mobile/components/profile/AppSettings.tsx` | Theme, notifications, timezone |
| `mobile/components/profile/AccountSection.tsx` | Delete account, sign out |

---

## Phase 4: Node.js + Express Backend (Weeks 14-17)

> **SUPERSEDED — see [BUILD_APPROACH.md](BUILD_APPROACH.md) for feature scope. This phase description captures Flask-parity work only; actual v1.0 scope per the PRD is broader/different.** The backend rewrite itself is still in scope (Rule 4 in BUILD_APPROACH), but "port all 52 Flask endpoints" is not the goal — the goal is to implement the PRD §5.4 backend serving the PRD §4 feature set, which includes endpoints Flask has never had (Plaid transactions, calendar ingestion, screen-time ingestion, location visits, goal library, notifications pipeline, chatbot streaming, etc.).

### Goal
Replace Flask with Node.js + Express + TypeScript. All 52 endpoints ported. Mobile app switches to new backend.

### Dependency
Phase 3 complete (mobile app fully functional against Flask). Shared business logic already in TypeScript (Phase 1).

### Business Logic Port Order

Port these modules from Flask/Python to the `shared/` TypeScript package first (already done in Phase 1 Week 3), then wire them into Express routes:

| Priority | Module | Python Source | TypeScript Target | Reason |
|----------|--------|--------------|-------------------|--------|
| 1 | RMR | `app.py:79-82` + `claude_profile.py` | `shared/logic/rmr.ts` | Foundation for all calorie math |
| 2 | NEAT | `app.py` inline | `shared/logic/neat.ts` | Required for TDEE |
| 3 | TEF | `app.py` inline | `shared/logic/tef.ts` | Required for TDEE |
| 4 | TDEE | Computed inline | `shared/logic/tdee.ts` | Required for targets |
| 5 | Calorie/Macro Targets | `app.py` inline | `shared/logic/targets.ts` | Required for scoring |
| 6 | Momentum Score | `app.py:1043-1058` | `shared/logic/momentum.ts` | Core feature |
| 7 | Streak | `index.html` JS | `shared/logic/streak.ts` | Home tab |
| 8 | Weight Projection | `index.html` JS | `shared/logic/projection.ts` | Progress tab |
| 9 | Email Importance | `gmail_sync.py` | `shared/logic/importance.ts` | Gmail feature |

### Week 14: Express Scaffold + Auth + Nutrition Endpoints

- [ ] **Initialize Express project** in `server/`:
  ```
  server/
  ├── src/
  │   ├── index.ts              # Express app entry
  │   ├── middleware/
  │   │   ├── auth.ts           # Clerk JWT verification
  │   │   ├── rateLimit.ts      # Express rate limiter
  │   │   └── errorHandler.ts   # Global error handler
  │   ├── routes/
  │   │   ├── auth.ts           # /api/auth/*
  │   │   ├── nutrition.ts      # /api/today-nutrition, /api/log-meal, etc.
  │   │   ├── fitness.ts        # /api/today-workouts, /api/log-workout, etc.
  │   │   ├── mind.ts           # /api/mind/*, /api/momentum/*
  │   │   ├── profile.ts        # /api/profile, /api/onboarding/*
  │   │   ├── gmail.ts          # /api/gmail/*
  │   │   ├── garmin.ts         # /api/garmin/*
  │   │   └── goals.ts          # /api/goal/*
  │   ├── services/
  │   │   ├── claude.ts         # Anthropic SDK wrapper (replaces claude_nutrition.py + claude_profile.py)
  │   │   ├── gmail.ts          # Gmail API wrapper (replaces gmail_sync.py)
  │   │   └── garmin.ts         # Garmin Connect wrapper (replaces garmin_sync.py)
  │   ├── db/
  │   │   ├── client.ts         # Neon PostgreSQL connection (pg + @neondatabase/serverless)
  │   │   ├── queries/          # One file per table group
  │   │   └── migrations/       # SQL migration files
  │   └── cache/
  │       └── redis.ts          # Upstash Redis client
  ├── package.json
  └── tsconfig.json
  ```
- [ ] **Clerk middleware** — `@clerk/express` for JWT verification, replace Flask session auth.
- [ ] **Port auth endpoints** (4 routes):
  - `POST /api/auth/login` → Clerk handles (no custom endpoint needed)
  - `POST /api/auth/register` → Clerk handles
  - `POST /api/auth/logout` → Clerk handles client-side
  - `POST /api/delete-account` → cascade delete + Clerk user deletion
  - `POST /api/check-username` → may not be needed with Clerk
  - `POST /api/reset-password` → Clerk handles
- [ ] **Port nutrition endpoints** (12 routes):
  - `GET /api/today-nutrition`
  - `POST /api/log-meal`
  - `POST /api/edit-meal/:id`
  - `POST /api/delete-meal/:id`
  - `POST /api/estimate` (wraps Anthropic SDK)
  - `POST /api/scan-meal` (wraps Anthropic SDK, vision)
  - `POST /api/meals/scan`
  - `POST /api/meals/suggest`
  - `POST /api/shorten`
  - `POST /api/ai-edit-meal`
  - `GET /api/saved-meals`, `POST /api/saved-meals`, `DELETE /api/saved-meals/:id`
- [ ] **Claude service** — `@anthropic-ai/sdk` with:
  - 30-second timeout on all calls
  - Retry with exponential backoff on 429/500
  - Rate limit tracking
  - Proper error types (not generic catch-all)

### Week 15: Fitness + Mind + Goals Endpoints

- [ ] **Port fitness endpoints** (9 routes):
  - `GET /api/today-workouts`
  - `POST /api/log-workout`
  - `POST /api/edit-workout/:id`
  - `POST /api/delete-workout/:id`
  - `POST /api/burn-estimate`
  - `POST /api/ai-edit-workout`
  - `GET /api/saved-workouts`, `POST /api/saved-workouts`, `DELETE /api/saved-workouts/:id`
- [ ] **Port workout plan endpoints** (4 routes):
  - `POST /api/parse-workout-plan`
  - `POST /api/generate-plan`
  - `POST /api/generate-comprehensive-plan`
  - `POST /api/revise-plan`
- [ ] **Port mind/task endpoints** (5 routes):
  - `GET /api/mind/today`
  - `POST /api/mind/checkin`
  - `POST /api/mind/task`
  - `PATCH /api/mind/task/:id`
  - `DELETE /api/mind/task/:id`
- [ ] **Port momentum/goals endpoints** (5 routes):
  - `GET|POST /api/momentum/today`
  - `GET /api/momentum/history`
  - `POST /api/momentum/insight`
  - `POST /api/momentum/summary`
  - `POST /api/goal/update`

### Week 16: History + Gmail + Garmin + Profile Endpoints

- [ ] **Port history endpoints** (3 routes):
  - `GET /api/history`
  - `GET /api/day/:date`
  - `POST /api/log-weight`
- [ ] **Port Gmail endpoints** (7 routes):
  - `GET /api/gmail/status`
  - `GET /api/gmail/connect` → return `{ auth_url }`
  - `GET /api/gmail/callback` → return JSON
  - `POST /api/gmail/disconnect`
  - `POST /api/gmail/sync`
  - `POST /api/gmail/label`
  - Remove `GET /api/gmail/debug` (dev-only)
- [ ] **Port Garmin endpoints** (3 routes):
  - `GET /api/garmin`
  - `GET /api/garmin/status`
  - `POST /api/garmin/sync`
- [ ] **Port profile/onboarding endpoints** (7 routes):
  - `GET /api/profile`
  - `GET /api/onboarding/data`
  - `POST /api/onboarding/save`
  - `GET /api/onboarding/status`
  - `POST /api/onboarding/complete`
  - `GET /api/onboarding/poll`
  - `GET /api/dashboard`
- [ ] **Upstash Redis caching:**
  - Cache `GET /api/profile` (5 min TTL, invalidate on profile update)
  - Cache `GET /api/today-nutrition` (30 sec TTL)
  - Cache `GET /api/momentum/history` (5 min TTL)
  - Cache momentum summaries (same as current `momentum_summaries` table, but in Redis)
- [ ] **AWS KMS integration:**
  - Encrypt Gmail tokens at rest (replaces current plaintext storage)
  - Encrypt Garmin tokens
  - Encrypt any PII fields

### Week 17: Parallel Run + Switchover

- [ ] **Parallel run** — both Flask and Express backends running, mobile app configurable to point at either.
- [ ] **Endpoint-by-endpoint comparison** — script that hits both backends with same requests and diffs responses.
- [ ] **Fix all discrepancies** found in parallel testing.
- [ ] **Switch mobile app** to Express backend.
- [ ] **Keep Flask running** as fallback for 1 week.
- [ ] **Load testing** — verify Express handles concurrent requests (unlike Flask's 4-worker limit).

### Rollback
Switch mobile app `API_BASE_URL` back to Flask. Flask backend still running and untouched.

### API Endpoints That Disappear (Clerk Handles Auth)
| Flask Endpoint | Replacement |
|---------------|-------------|
| `POST /login` | Clerk `<SignIn />` component |
| `GET /logout` | Clerk `signOut()` |
| `POST /api/check-username` | Clerk handles |
| `POST /api/reset-password` | Clerk handles |

### Files to Create
| File | Purpose |
|------|---------|
| `server/src/index.ts` | Express app entry point |
| `server/src/middleware/auth.ts` | Clerk JWT verification |
| `server/src/middleware/rateLimit.ts` | Rate limiting |
| `server/src/middleware/errorHandler.ts` | Global error handler |
| `server/src/routes/auth.ts` | Auth routes (delete-account only) |
| `server/src/routes/nutrition.ts` | 12 nutrition endpoints |
| `server/src/routes/fitness.ts` | 9 fitness endpoints |
| `server/src/routes/mind.ts` | 5 task endpoints |
| `server/src/routes/profile.ts` | 7 profile/onboarding endpoints |
| `server/src/routes/goals.ts` | 5 momentum/goal endpoints |
| `server/src/routes/gmail.ts` | 7 Gmail endpoints |
| `server/src/routes/garmin.ts` | 3 Garmin endpoints |
| `server/src/routes/history.ts` | 3 history endpoints |
| `server/src/services/claude.ts` | Anthropic SDK wrapper with retry + timeout |
| `server/src/services/gmail.ts` | Gmail API wrapper |
| `server/src/services/garmin.ts` | Garmin Connect wrapper |
| `server/src/db/client.ts` | Neon PostgreSQL connection |
| `server/src/db/queries/meals.ts` | Meal CRUD queries |
| `server/src/db/queries/workouts.ts` | Workout CRUD queries |
| `server/src/db/queries/users.ts` | User CRUD queries |
| `server/src/db/queries/mind.ts` | Task/checkin queries |
| `server/src/db/queries/gmail.ts` | Gmail cache/token queries |
| `server/src/db/queries/garmin.ts` | Garmin data queries |
| `server/src/db/queries/momentum.ts` | Momentum/goals queries |
| `server/src/db/queries/history.ts` | History aggregation queries |
| `server/src/cache/redis.ts` | Upstash Redis client + helpers |
| `server/src/services/kms.ts` | AWS KMS encrypt/decrypt wrappers |

---

## Phase 5: Neon PostgreSQL + Data Migration + Billing (Weeks 18-20)

> **SUPERSEDED — see [BUILD_APPROACH.md](BUILD_APPROACH.md) for feature scope. This phase description captures Flask-parity work only; actual v1.0 scope per the PRD is broader/different.** The PRD's schema (§5.5, §11.6, Appendix E) adds tables Flask has never had. The "17 Flask tables migrate to Neon" framing below is a subset of the actual schema work. RevenueCat integration scope is correct; trial mechanics follow PRD §13.4 (14-day Pro trial with force-choice at end).

### Goal
SQLite → Neon PostgreSQL migration complete. RevenueCat billing integrated. All data migrated.

### Dependency
Phase 4 complete (Express backend running, but still reading from SQLite via a compatibility layer OR already configured for Postgres from Week 14).

**Note:** If you set up Neon from Week 14 (recommended), this phase is about production data migration and billing, not schema creation.

### Week 18: Database Migration

- [ ] **Create Neon PostgreSQL database** on neon.tech.
- [ ] **Write migration scripts** (`server/src/db/migrations/`):
  ```sql
  -- 001_create_users.sql
  -- 002_create_meal_logs.sql
  -- 003_create_workout_logs.sql
  -- 004_create_daily_activity.sql
  -- 005_create_garmin_daily.sql
  -- 006_create_user_onboarding.sql
  -- 007_create_mind_tables.sql
  -- 008_create_gmail_tables.sql
  -- 009_create_user_goals.sql
  -- 010_create_daily_momentum.sql
  -- 011_create_saved_templates.sql
  -- 012_create_momentum_summaries.sql
  ```
- [ ] **Schema changes from SQLite → PostgreSQL:**
  | SQLite | PostgreSQL | Notes |
  |--------|-----------|-------|
  | `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` | Auto-increment syntax |
  | `TEXT` for JSON | `JSONB` | For `raw_inputs`, `profile_map`, `config_json`, `sources_json`, `items_json`, `raw_deltas` |
  | `TEXT` for timestamps | `TIMESTAMPTZ` | Proper timezone support |
  | `TEXT` for dates | `DATE` | Proper date type |
  | `REAL` | `NUMERIC(10,2)` | Precision for nutrition data |
  | No `ENUM` | `CREATE TYPE` | For `goal_key`, `checkin_type`, `task_source`, `importance_label` |
  | Missing indexes | Add all | `saved_meals(user_id)`, `saved_workouts(user_id)`, `daily_activity(user_id, log_date)` |
- [ ] **Drop dead/orphan tables** — do NOT migrate:
  - `sleep_logs` (dead)
  - `app_settings` (dead)
  - `ai_outputs` (orphan)
  - `daily_log` (orphan)
  - `debrief_questions` (orphan)
  - `exercise_sets` (orphan)
  - `wealth_logs` (orphan)
- [ ] **Drop unused columns** — do NOT migrate:
  - `users`: sleep_target_hrs, step_goal, screen_time_limit_mins, savings_rate_pct, workout_days_per_week, connection_goal_per_week, primary_goal, brief_cutoff_time, debrief_start_time, dev_mode
  - `daily_activity`: miles_run, gym_session, other_burn
  - `meal_logs`: is_dev_generated
  - `workout_logs`: is_dev_generated
  - `mind_checkins`: evening_prompt
- [ ] **Write SQLite → PostgreSQL migration script:**
  ```typescript
  // server/scripts/migrate-data.ts
  // 1. Read all rows from SQLite
  // 2. Transform types (TEXT → JSONB, etc.)
  // 3. Map user IDs to Clerk user IDs
  // 4. Insert into Neon PostgreSQL
  // 5. Verify row counts match
  ```
- [ ] **Run migration on staging** — verify all data transferred correctly.
- [ ] **Add Clerk user ID column** — `clerk_user_id TEXT UNIQUE` to users table, replacing integer user IDs for auth.

### Week 19: RevenueCat + Encryption

- [ ] **RevenueCat setup:**
  - [ ] Install `react-native-purchases` in mobile app.
  - [ ] Configure products in RevenueCat dashboard.
  - [ ] Define entitlements (free tier vs. premium).
  - [ ] Implement paywall screen in `mobile/app/(tabs)/paywall.tsx`.
  - [ ] Gate premium features (AI meal estimation, photo scanning, plan generation) behind entitlement check.
  - [ ] Server-side entitlement verification via RevenueCat webhooks → Express endpoint.
- [ ] **Feature gating:**
  | Feature | Free | Premium |
  |---------|------|---------|
  | Manual meal/workout logging | Yes | Yes |
  | AI macro estimation | 3/day | Unlimited |
  | Photo meal scanning | No | Yes |
  | AI workout plans | No | Yes |
  | AI insights | 1/day | Unlimited |
  | Gmail integration | No | Yes |
  | Charts & progress | Yes | Yes |
- [ ] **AWS KMS encryption:**
  - [ ] Encrypt Gmail OAuth tokens in `gmail_tokens` table.
  - [ ] Encrypt Garmin credentials.
  - [ ] Encrypt `user_onboarding.profile_map` (contains health data).
  - [ ] Key rotation policy (90 days).

### Week 20: Production Data Migration + Deploy

- [ ] **Production migration:**
  - [ ] Announce maintenance window.
  - [ ] Disable Flask writes (read-only mode).
  - [ ] Run `migrate-data.ts` against production SQLite → Neon.
  - [ ] Verify migration (spot-check 20% of records).
  - [ ] Switch Express backend to Neon connection string.
  - [ ] Verify all endpoints return correct data.
  - [ ] Enable writes.
- [ ] **Deploy Express backend** to hosting (Railway/Fly.io/Render).
- [ ] **Update mobile app** `API_BASE_URL` to production Express.
- [ ] **Monitoring:**
  - [ ] Error tracking (Sentry for Express + React Native).
  - [ ] Uptime monitoring.
  - [ ] Database connection pool monitoring (Neon dashboard).
  - [ ] Redis hit/miss rates (Upstash dashboard).

### Rollback

**Database migration rollback:**
1. Keep SQLite backup (copy `life_dashboard.db` before migration).
2. If Neon has issues, switch Express `DATABASE_URL` to SQLite via compatibility layer.
3. If Express has issues, switch mobile app back to Flask + SQLite.

**RevenueCat rollback:**
1. Remove entitlement checks — all features become free.
2. RevenueCat subscriptions continue to process, but app ignores them.

### Data Migration Steps at Each Cutover

| Phase | Data Action |
|-------|-------------|
| Phase 0→1 | None. Mobile app creates new data in same SQLite via Flask. |
| Phase 1→2 | None. Same data path. |
| Phase 2→3 | None. Same data path. |
| Phase 3→4 | Express reads same SQLite initially, or Neon if set up early. |
| Phase 4→5 | **Big migration.** SQLite → Neon PostgreSQL. User ID mapping (integer → Clerk ID). |
| Phase 5→6 | None. All data in Neon. |

---

## Phase 6: Polish + Alpha Release (Weeks 21-22)

> **SUPERSEDED — see [BUILD_APPROACH.md](BUILD_APPROACH.md) for feature scope. This phase description captures Flask-parity work only; actual v1.0 scope per the PRD is broader/different.** "All features working" means all PRD v1.0 features per §4.1–§4.11, not Flask-parity. Alpha-release mechanics (TestFlight, Play Console internal track, Sentry, Neon/Upstash monitoring) remain relevant; decommissioning Flask per the PRD's launch sequence (§1.7) is correct.

### Goal
Production-ready alpha. All features working. TestFlight/internal testing.

### Dependency
Phase 5 complete (Neon PostgreSQL live, RevenueCat integrated, Express deployed).

### Week 21: Testing + Polish

- [ ] **End-to-end testing** — every flow from signup to daily use.
- [ ] **Push notifications** — `expo-notifications` for meal reminders (replace `setTimeout` approach).
- [ ] **App icon + splash screen** — APEX branding.
- [ ] **App Store metadata** — screenshots, description, keywords.
- [ ] **Privacy policy + terms of service** — required for App Store.
- [ ] **Accessibility audit** — VoiceOver/TalkBack testing, add missing labels (current app has almost none).
- [ ] **Performance final pass** — startup time, navigation transitions, chart rendering.

### Week 22: Alpha Release

- [ ] **TestFlight build** (iOS) — submit to Apple for review.
- [ ] **Internal testing build** (Android) — `eas build --profile preview`.
- [ ] **Invite alpha testers.**
- [ ] **Monitor Sentry** for crashes.
- [ ] **Monitor Neon** for query performance.
- [ ] **Fix critical bugs** found by alpha testers.
- [ ] **Decommission Flask** — shut down Railway deployment (keep code in `flask/` directory for reference).

### Files That Can Be Deleted After Migration

| File | Reason | Delete When |
|------|--------|-------------|
| `app.py` | Replaced by `server/src/routes/*.ts` | After Week 17 (Express verified) |
| `db.py` | Replaced by `server/src/db/queries/*.ts` | After Week 18 (Neon verified) |
| `ai_client.py` | Replaced by `server/src/services/claude.ts` | After Week 14 |
| `claude_nutrition.py` | Replaced by `server/src/services/claude.ts` | After Week 14 |
| `claude_profile.py` | Replaced by `server/src/services/claude.ts` | After Week 14 |
| `gmail_sync.py` | Replaced by `server/src/services/gmail.ts` | After Week 16 |
| `garmin_sync.py` | Replaced by `server/src/services/garmin.ts` | After Week 16 |
| `templates/login.html` | Replaced by Clerk auth | After Week 2 |
| `templates/onboarding.html` | Replaced by `mobile/app/(onboarding)/` | After Week 4 |
| `templates/index.html` | Replaced by `mobile/app/(tabs)/*.tsx` | After Week 13 |
| `static/sw.js` | PWA not needed for native app | After Week 22 |
| `static/manifest.json` | PWA not needed for native app | After Week 22 |
| `static/i18n.js` | Replaced by `expo-localization` | After Week 13 |
| `requirements.txt` | Python dependencies no longer needed | After Week 22 |
| `life_dashboard.db` | Replaced by Neon PostgreSQL (keep backup) | After Week 22 (archive, don't delete) |

---

## Dependency Graph

```
Phase 0: Stabilize Flask
    │
    ├── Fix P0/P1 bugs (no dependencies)
    ├── Add JSON endpoints (no dependencies)
    ├── Add JWT + CORS to Flask (depends on: nothing)
    └── Scaffold monorepo (depends on: nothing)
         │
Phase 1: RN Foundation
    │
    ├── Clerk auth (depends on: Flask JWT bridge from Phase 0)
    ├── Port business logic to TS (depends on: nothing)
    ├── Design system (depends on: nothing)
    └── Onboarding flow (depends on: Clerk auth, design system)
         │
Phase 2: Core Screens
    │
    ├── Home tab (depends on: design system, business logic, API client)
    ├── Nutrition tab (depends on: design system, API client)
    └── Fitness tab (depends on: design system, API client)
         │
Phase 3: Advanced Screens
    │
    ├── Progress tab (depends on: history API, chart library)
    ├── Status tab (depends on: momentum API, Gmail APIs)
    ├── Profile tab (depends on: goal update API, plan APIs)
    └── Gmail/Garmin (depends on: deep linking, OAuth bridge)
         │
Phase 4: Express Backend ←── shared/logic/* (from Phase 1)
    │
    ├── Express scaffold (depends on: nothing)
    ├── Auth routes (depends on: Clerk, scaffold)
    ├── Nutrition routes (depends on: Claude service, scaffold)
    ├── All other routes (depends on: scaffold)
    └── Parallel run (depends on: all routes ported)
         │
Phase 5: Neon + RevenueCat
    │
    ├── Schema migration (depends on: Express backend)
    ├── Data migration (depends on: schema, Clerk user mapping)
    ├── RevenueCat (depends on: Express backend)
    └── AWS KMS (depends on: Neon database)
         │
Phase 6: Alpha Release
    │
    ├── Testing (depends on: everything)
    ├── App Store prep (depends on: testing)
    └── Decommission Flask (depends on: alpha stable)
```

---

## Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | **Claude API changes break nutrition estimation** | Medium | Critical | Pin Anthropic SDK version. Test prompts against new model versions before upgrading. Keep Flask's `_parse_json()` logic in TypeScript service. |
| 2 | **Clerk auth doesn't map cleanly to existing users** | Medium | High | Create `clerk_user_id` column early. Write migration script that maps existing integer user IDs to Clerk IDs. Test with 2 existing users before production. |
| 3 | **SQLite → PostgreSQL data type mismatches** | High | Medium | Write comprehensive migration tests. Spot-check JSON fields (JSONB parsing). Test date/timestamp conversions. Keep SQLite backup permanently. |
| 4 | **React Native performance with 10k+ history entries** | Medium | Medium | Use FlatList with `windowSize` and `maxToRenderPerBatch`. Paginate history API. Cache chart data in AsyncStorage. |
| 5 | **Camera/barcode permissions on iOS/Android** | Low | Medium | Use `expo-camera` permissions API. Test on physical devices early (Week 6). Graceful fallback to text input. |
| 6 | **Gmail OAuth redirect doesn't work in Expo** | Medium | Low | Use `expo-web-browser` for OAuth flow + deep link callback. Test early (Week 12). Gmail is optional feature. |
| 7 | **Garmin library (garminconnect) has no Node.js equivalent** | High | Medium | Options: (a) call Garmin REST API directly from Node, (b) keep a Python microservice just for Garmin, (c) use `garmin-connect` npm package if it exists. Research in Week 14. |
| 8 | **Solo developer burnout at Week 10+** | High | High | Scope aggressively. Cut Gmail/Garmin to post-alpha if behind. The core value prop is nutrition + fitness tracking, not email. |
| 9 | **App Store rejection** | Medium | Medium | Review Apple guidelines early. Health apps need privacy nutrition labels. No medical claims in description. |
| 10 | **Neon PostgreSQL cold start latency** | Low | Medium | Use Neon's connection pooling. Upstash Redis cache for hot paths. Keep connections warm with health check endpoint. |
| 11 | **RevenueCat integration complexity** | Medium | Low | Start with simple 1-tier premium. Don't over-engineer free vs. premium split. Can always adjust post-launch. |
| 12 | **Timeline slip past 22 weeks** | High | Medium | Gmail + Garmin integrations are the most cuttable scope. Weeks 12-13 can be deferred to post-alpha. This recovers 2 weeks. |

### If Behind Schedule — What to Cut

| Priority | Cut | Recovers | Impact |
|----------|-----|----------|--------|
| 1 | Gmail integration | 1 week | Low — optional feature, <5% of core value |
| 2 | Garmin integration | 1 week | Low — optional feature, manual entry works |
| 3 | AI insights (momentum/summary) | 0.5 weeks | Low — nice-to-have, not core |
| 4 | Barcode scanner | 0.5 weeks | Low — text input always works |
| 5 | Workout plan generation | 0.5 weeks | Medium — users can enter plans manually |
| 6 | RevenueCat (ship free first) | 1 week | Medium — no revenue, but proves product |

---

## Summary Checklist

### Phase 0: Stabilize (Week 1)
- [ ] Fix 3 P0 bugs
- [ ] Fix 3 P1 bugs (skip silent exceptions — resolves in rewrite)
- [ ] Add 7 JSON endpoints to Flask
- [ ] Add JWT + CORS to Flask
- [ ] Scaffold monorepo

### Phase 1: Foundation (Weeks 2-4)
- [ ] Clerk auth working
- [ ] Expo Router navigation
- [ ] 9 business logic modules in TypeScript + tests
- [ ] Design system components
- [ ] Onboarding flow complete

### Phase 2: Core Screens (Weeks 5-9)
- [ ] Home tab complete
- [ ] Nutrition tab complete (logging + history + photo + barcode)
- [ ] Fitness tab complete (logging + strength + steps + weight)
- [ ] Offline support
- [ ] Integration testing pass

### Phase 3: Advanced Screens (Weeks 10-13)
- [ ] Progress tab complete (charts + calendar + history + day detail)
- [ ] Status tab complete (score + insights + Gmail)
- [ ] Profile tab complete (all settings + plan generation)
- [ ] Gmail integration
- [ ] Garmin integration
- [ ] Full regression test

### Phase 4: Express Backend (Weeks 14-17)
- [ ] All 52 endpoints ported to TypeScript
- [ ] Claude service with retry + timeout
- [ ] Upstash Redis caching
- [ ] AWS KMS encryption
- [ ] Parallel run verified
- [ ] Mobile app switched to Express

### Phase 5: Database + Billing (Weeks 18-20)
- [ ] Neon PostgreSQL schema created
- [ ] SQLite → PostgreSQL data migration
- [ ] RevenueCat billing integrated
- [ ] Production deployment
- [ ] Monitoring (Sentry + Neon + Upstash)

### Phase 6: Alpha (Weeks 21-22)
- [ ] Push notifications
- [ ] Accessibility audit
- [ ] TestFlight + Android preview builds
- [ ] Alpha testers invited
- [ ] Flask decommissioned
