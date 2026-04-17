# APEX Life Dashboard — Migration Plan

Generated: 2026-04-17 | 22-week timeline | Solo developer + Claude Code

---

## Target Architecture

```
┌─────────────────────────────────┐
│    React Native (Expo SDK 52+)  │
│    TypeScript frontend          │
│    Clerk auth (native SDK)      │
│    RevenueCat billing           │
└──────────────┬──────────────────┘
               │ HTTPS / JWT
┌──────────────┴──────────────────┐
│    Node.js + Express + TS       │
│    Prisma ORM                   │
│    Bull queue (background jobs) │
│    AWS KMS encryption           │
└──────────┬──────┬───────────────┘
           │      │
    ┌──────┴──┐ ┌─┴────────┐
    │  Neon   │ │ Upstash  │
    │ Postgres│ │  Redis   │
    └─────────┘ └──────────┘
```

---

## Dependency Graph

```
Phase 0: Fix P0/P1 bugs in Flask (no dependencies)
    │
Phase 1: Flask API hardening (convert 7 HTML routes to JSON)
    │
Phase 2: React Native scaffolding + Clerk auth
    │
    ├── Phase 3a: Core screens (Home, Nutrition, Fitness)
    │       │
    │       └── Phase 3b: Secondary screens (Progress, Status, Profile)
    │               │
    │               └── Phase 3c: Overlays (Meal Detail, Barcode, Workout Session)
    │
Phase 4: Node.js/Express backend (parallel with Phase 3b)
    │
    ├── Phase 5: Neon PostgreSQL + data migration
    │
    ├── Phase 6: Upstash Redis + context engine
    │
    └── Phase 7: RevenueCat + App Store submission
```

**Critical path:** Phase 0 → 1 → 2 → 3a → 4 → 5 → 7
**Parallel work:** Phase 3b/3c can overlap with Phase 4

---

## Week-by-Week Breakdown

### PHASE 0: Fix Critical Bugs (Week 1)

Fix the 7 P0/P1 issues from TECH_DEBT.md in the current Flask codebase.

- [ ] **Day 1-2: Database fixes**
  - [ ] Re-add `sleep_logs` CREATE TABLE to `init_db()` (Garmin sync needs it)
  - [ ] Re-add `app_settings` CREATE TABLE or remove `get_setting()`/`set_setting()` functions
  - [ ] Add `_ob_jobs.pop()` cleanup in `api_onboarding_poll()` after status is "done" or "error"
  - [ ] Add `threading.Lock()` around `_ob_jobs` reads/writes

- [ ] **Day 3: Security fixes**
  - [ ] URL-encode Gmail OAuth error parameter (app.py line 1207)
  - [ ] Change `app.secret_key` to `os.environ["SECRET_KEY"]` (crash if missing)
  - [ ] Add `SECRET_KEY` to Railway environment variables

- [ ] **Day 4-5: Error handling**
  - [ ] Add `logger.warning()` to all 10 bare `except: pass` blocks in app.py
  - [ ] Add `timeout=30.0` to all Claude API calls in `claude_nutrition.py` and `claude_profile.py`
  - [ ] Test all AI endpoints still work with timeout

- [ ] **Rollback:** Git revert. All changes are additive, no data migration.

---

### PHASE 1: Flask API Hardening (Week 2)

Convert the 7 HTML-returning routes to JSON so React Native can consume them.

- [ ] **Day 1-2: Auth routes**
  - [ ] Create `POST /api/auth/login` → `{"ok": true, "user_id": int, "username": string}` or `{"error": string}`
  - [ ] Create `POST /api/auth/register` → same response shape
  - [ ] Create `POST /api/auth/logout` → `{"ok": true}`
  - [ ] Keep old `/login` GET/POST working for the web app (don't break existing users)

- [ ] **Day 3: Dashboard data route**
  - [ ] Create `GET /api/dashboard` → returns all data currently passed to `render_index()`:
    ```json
    {
      "meals": [...], "totals": {...}, "workouts": [...],
      "workout_burn": int, "tdee": int, "server_rmr": int,
      "display_name": string, "username": string, "user_id": int
    }
    ```

- [ ] **Day 4: Gmail OAuth routes**
  - [ ] Change `GET /api/gmail/connect` to return `{"auth_url": string}` instead of redirect
  - [ ] Change `GET /api/gmail/callback` to return `{"ok": true, "email": string}` instead of redirect

- [ ] **Day 5: Onboarding data route**
  - [ ] Create `GET /api/onboarding/data` → returns saved inputs + completion status as JSON
  - [ ] Add CORS headers for React Native development: `Access-Control-Allow-Origin: *` (dev only)

- [ ] **Rollback:** Git revert. Old routes still work, new routes are additive.

---

### PHASE 2: React Native Scaffolding (Weeks 3-4)

#### Week 3: Project setup

- [ ] **Day 1: Initialize Expo project**
  - [ ] `npx create-expo-app apex-mobile --template expo-template-blank-typescript`
  - [ ] Install core dependencies:
    ```
    expo-router, react-native-safe-area-context,
    @react-navigation/bottom-tabs, @react-navigation/native-stack,
    expo-secure-store, @tanstack/react-query
    ```

- [ ] **Day 2: Navigation structure**
  - [ ] Create bottom tab navigator with 6 tabs (matching Flask app)
  - [ ] Create stack navigators for drill-down screens
  - [ ] Set up app/(tabs)/ directory structure with Expo Router

- [ ] **Day 3: API client + auth**
  - [ ] Create `src/api/client.ts` — fetch wrapper with base URL, token injection, error handling
  - [ ] Create `src/api/types.ts` — TypeScript interfaces from API_CONTRACT.md
  - [ ] Install and configure Clerk: `@clerk/clerk-expo`
  - [ ] Create auth flow: SignIn → SignUp → Onboarding → Main App

- [ ] **Day 4-5: Design system**
  - [ ] Create `src/theme/colors.ts` — dark/light palette from CSS variables
  - [ ] Create `src/theme/typography.ts` — font sizes and weights
  - [ ] Create `src/theme/spacing.ts` — padding, margins, radii
  - [ ] Create shared components: `Card`, `Button`, `Input`, `ProgressBar`, `SectionLabel`

#### Week 4: Clerk auth + connecting to Flask

- [ ] **Day 1-2: Clerk integration**
  - [ ] Set up Clerk project (clerk.com dashboard)
  - [ ] Add Clerk middleware to Flask: verify JWT from Clerk, extract user_id
  - [ ] Map Clerk user IDs to existing Flask user IDs (bridge table or migration)
  - [ ] Test: React Native → Clerk auth → Flask API with JWT

- [ ] **Day 3-4: React Query setup**
  - [ ] Configure QueryClient with retry, staleTime, cacheTime
  - [ ] Create hooks: `useNutrition()`, `useWorkouts()`, `useProfile()`, `useMomentum()`
  - [ ] Test data fetching from Flask API on mobile device

- [ ] **Day 5: AsyncStorage migration**
  - [ ] Create `src/storage/` — typed wrappers around AsyncStorage
  - [ ] Map localStorage keys from FRONTEND_INVENTORY.md to AsyncStorage
  - [ ] `profileData`, `dailyLog`, `workoutPlan`, `workoutHistory`

- [ ] **Rollback:** Delete Expo project. Flask app unchanged.

---

### PHASE 3a: Core Screens (Weeks 5-8)

#### Week 5: Home Screen

- [ ] **Streak Bar component** — horizontal FlatList, 30 items, onPress opens day detail
- [ ] **Calorie Ring component** — SVG donut chart (react-native-svg)
- [ ] **Stats Grid** — 2x2 grid (Weight, Steps, Burn, Consumed)
- [ ] **Macros/Micros Card** — horizontal FlatList with pagingEnabled, page dots
- [ ] **Tasks Card** — checkbox list with add/toggle/delete
- [ ] Wire to `/api/dashboard`, `/api/mind/today`, `/api/momentum/today`

#### Week 6: Nutrition Screen

- [ ] **Daily Summary swipeable** — two-page ScrollView with pagingEnabled
- [ ] **Log Meal form** — TextInput + Get Macros button
- [ ] **Macro Edit Grid** — 4 inline number inputs
- [ ] **Item Breakdown** — FlatList of AI-parsed items
- [ ] **Meal Table** — FlatList with 32-char cap, swipe-to-delete
- [ ] Wire to `/api/log-meal`, `/api/estimate`, `/api/today-nutrition`

#### Week 7: Nutrition Screen (continued) + Photo/Barcode

- [ ] **Photo scanning** — expo-image-picker + base64 encoding → `/api/scan-meal`
- [ ] **Barcode scanner** — expo-barcode-scanner → Open Food Facts API
- [ ] **Saved meals** — modal list with re-log on tap
- [ ] **FAB button** — floating action button with quick-log modals
- [ ] **Re-analyze flow** — corrections textarea + button

#### Week 8: Fitness Screen

- [ ] **Log Activity form** — TextInput + Get Burn Estimate
- [ ] **Strength Card** — completed state / idle state / "Log Another"
- [ ] **Workout Entries** — FlatList with icon circles, calorie pills
- [ ] **Steps Card** — number input + Save Steps + NEAT breakdown
- [ ] **Weight Card** — number input + Save Weight
- [ ] **Workout Session** — exercise checklist overlay with timer
- [ ] Wire to `/api/log-workout`, `/api/burn-estimate`, `/api/today-workouts`, `/api/log-weight`

- [ ] **Rollback:** Keep Flask web app running. Mobile app is a separate project.

---

### PHASE 3b: Secondary Screens (Weeks 9-11)

#### Week 9: Progress Screen

- [ ] **Chart library setup** — react-native-chart-kit or Victory Native
- [ ] **Daily Score Chart** — line chart with stats row
- [ ] **Body Weight Trend** — line chart with projection dashed line
- [ ] **Activity Calendar** — custom grid component (7 columns, color-coded cells)
- [ ] Wire to `/api/history`, `/api/momentum/history`

#### Week 10: Progress Screen (continued) + Status Screen

- [ ] **History List** — FlatList of day cards, onPress → Day Detail
- [ ] **Deficit/Surplus Chart** — line chart with zero line
- [ ] **Day Detail Screen** — stack navigator, full meal/workout/macro breakdown
- [ ] **Status: Daily Score Card** — large number, category breakdown
- [ ] **Status: Insight Card** — AI text, day/week/month toggle
- [ ] **Status: Gmail Card** — email list with importance toggle
- [ ] Wire to `/api/day/{date}`, `/api/momentum/insight`, `/api/gmail/status`

#### Week 11: Profile Screen

- [ ] **About You** — collapsible card with inputs + RMR/NEAT sliders
- [ ] **Goals** — collapsible card with macro sliders + lock toggle
- [ ] **Workout Plan** — text input + AI parse + drag-drop builder
- [ ] **Theme** — dark/light toggle (React Native appearance API)
- [ ] **Language** — flag picker, i18n with react-i18next
- [ ] **Reminders** — expo-notifications for meal reminders
- [ ] **Account** — sign out + delete account
- [ ] Wire to `/api/profile`, `/api/goal/update`, `/api/parse-workout-plan`

- [ ] **Rollback:** Revert to Flask web app. All data is on the server.

---

### PHASE 3c: Overlays & Polish (Week 12)

- [ ] **Meal Detail Screen** — hero, macros, micros, AI edit, save/unsave
- [ ] **Workout Detail Screen** — hero, calories, AI edit
- [ ] **Barcode Scanner** — full-screen camera with overlay frame
- [ ] **Photo Source Picker** — camera vs gallery action sheet
- [ ] **Edit Meal Modal** — inline macro editing
- [ ] **Onboarding Flow** — 7-step wizard with AI profile generation
- [ ] **Pull-to-refresh** on all list screens
- [ ] **Loading states** — skeleton screens instead of spinners
- [ ] **Error states** — retry buttons on all API failures
- [ ] **Haptic feedback** on buttons (expo-haptics)

---

### PHASE 4: Node.js/Express Backend (Weeks 13-16)

#### Week 13: Project setup + business logic

- [ ] **Initialize project**
  - [ ] `mkdir apex-api && cd apex-api && npm init -y`
  - [ ] Install: `express typescript prisma @prisma/client @anthropic-ai/sdk ioredis bullmq cors helmet`
  - [ ] Set up `tsconfig.json`, ESLint, Prettier
  - [ ] Create directory structure:
    ```
    src/
      routes/       # Express route handlers
      services/     # Business logic
      models/       # Prisma schema
      middleware/   # Auth, error handling, rate limiting
      lib/          # AI client, Redis, queue
      types/        # Shared TypeScript types
    ```

- [ ] **Port business logic (from BUSINESS_LOGIC.md)**
  - [ ] `src/services/rmr.ts` — RMR calculation (Mifflin + Katch-McArdle)
  - [ ] `src/services/neat.ts` — NEAT with occupation bases + step calc
  - [ ] `src/services/tef.ts` — Thermic Effect of Food
  - [ ] `src/services/tdee.ts` — TDEE composition
  - [ ] `src/services/targets.ts` — Calorie & macro target calculation
  - [ ] `src/services/momentum.ts` — Daily score (100-point system)
  - [ ] `src/services/streak.ts` — Streak calculation
  - [ ] `src/services/email-importance.ts` — Sender scoring
  - [ ] **Write unit tests for each** using Vitest

#### Week 14: Database + Prisma

- [ ] **Prisma schema** (from DATABASE_SCHEMA.md)
  - [ ] `prisma/schema.prisma` — all 17 active tables
  - [ ] Drop 7 orphan tables (ai_outputs, daily_log, debrief_questions, exercise_sets, wealth_logs, app_settings, sleep_logs)
  - [ ] Drop 16 unused columns from active tables
  - [ ] Add proper indexes (from DATABASE_SCHEMA.md section 8)
  - [ ] Add `clerk_id` column to `users` table (for Clerk auth mapping)

- [ ] **Neon PostgreSQL setup**
  - [ ] Create Neon project + database
  - [ ] Run `prisma migrate dev` to create schema
  - [ ] Create `src/lib/db.ts` — Prisma client singleton

- [ ] **Data migration script**
  - [ ] `scripts/migrate-sqlite-to-postgres.ts`
  - [ ] Export all SQLite data as JSON
  - [ ] Transform (rename columns, fix types, map user IDs)
  - [ ] Import to Neon via Prisma
  - [ ] Verify row counts match

#### Week 15: API routes

- [ ] **Port all 52 routes from API_CONTRACT.md**
  - [ ] Auth routes (5) — Clerk handles auth, just need JWT verification middleware
  - [ ] Nutrition routes (12) — port request/response shapes exactly
  - [ ] Fitness routes (12) — same
  - [ ] Tasks routes (5) — same
  - [ ] History routes (3) — same
  - [ ] Gmail routes (7) — port OAuth flow
  - [ ] Momentum routes (5) — same
  - [ ] Saved items routes (6) — same

- [ ] **AI service layer**
  - [ ] `src/lib/anthropic.ts` — Anthropic client with 30s timeout + retry
  - [ ] `src/services/ai/nutrition.ts` — estimate, scan, suggest
  - [ ] `src/services/ai/fitness.ts` — burn estimate, plan generation
  - [ ] `src/services/ai/profile.ts` — profile generation, scoring
  - [ ] `src/services/ai/gmail.ts` — email summarization
  - [ ] Add exponential backoff retry (3 attempts)

#### Week 16: Middleware + testing

- [ ] **Middleware**
  - [ ] `src/middleware/auth.ts` — Clerk JWT verification
  - [ ] `src/middleware/rateLimiter.ts` — per-endpoint rate limits (especially AI routes)
  - [ ] `src/middleware/errorHandler.ts` — centralized error handling, Sentry integration
  - [ ] `src/middleware/encryption.ts` — AWS KMS for PHI columns

- [ ] **Integration tests**
  - [ ] Test each route against Neon database
  - [ ] Test AI endpoints with mock Anthropic responses
  - [ ] Test Gmail OAuth flow end-to-end
  - [ ] Load test: 50 concurrent users

- [ ] **Rollback:** Point React Native app back at Flask API (change base URL).

---

### PHASE 5: Upstash Redis + Context Engine (Week 17)

- [ ] **Upstash setup**
  - [ ] Create Upstash Redis instance
  - [ ] Create `src/lib/redis.ts` — typed get/set/delete helpers

- [ ] **Context engine (from build brief)**
  - [ ] `src/services/context/builder.ts` — assembles full life context object
  - [ ] `src/services/context/stripper.ts` — removes irrelevant modules per question category
  - [ ] Cache context per user with 15-minute TTL
  - [ ] Background job: rebuild context every 15 min via BullMQ

- [ ] **Chat endpoint**
  - [ ] `POST /api/chat` — reads cached context, calls Claude Sonnet
  - [ ] Rate limit: 50 messages/day/user
  - [ ] Store chat history in `chat_messages` table

- [ ] **Rollback:** Disable context engine, chat returns "coming soon".

---

### PHASE 6: RevenueCat + Polish (Weeks 18-19)

#### Week 18: Billing

- [ ] **RevenueCat setup**
  - [ ] Create RevenueCat project
  - [ ] Configure offerings: Free tier + $9.99/month Pro
  - [ ] Install `react-native-purchases`
  - [ ] Create paywall screen
  - [ ] Gate AI features behind Pro subscription
  - [ ] Free tier: manual tracking only

#### Week 19: Polish

- [ ] **Performance**
  - [ ] Add database indexes (from DATABASE_SCHEMA.md)
  - [ ] Redis cache warming on deploy
  - [ ] Image optimization for meal photos before upload
  - [ ] Lazy load chart library (only on Progress tab)

- [ ] **Accessibility**
  - [ ] Add `accessibilityLabel` to all interactive elements
  - [ ] Test with VoiceOver (iOS) and TalkBack (Android)
  - [ ] Ensure color contrast meets AA standard

- [ ] **i18n**
  - [ ] Port i18n.js translations to react-i18next
  - [ ] Add RTL support for Arabic

---

### PHASE 7: Launch Prep (Weeks 20-22)

#### Week 20: Legal + App Store

- [ ] **Legal documents**
  - [ ] Terms of Service
  - [ ] Privacy Policy (mention Anthropic data handling, Plaid, health data)
  - [ ] HIPAA notice (health data disclaimer)
  - [ ] Company email address for support

- [ ] **App Store assets**
  - [ ] App icon (1024x1024)
  - [ ] Screenshots (6.7", 6.5", 5.5" sizes)
  - [ ] App Store description
  - [ ] Keywords
  - [ ] TestFlight beta setup

#### Week 21: Beta testing

- [ ] **TestFlight deployment**
  - [ ] Internal testing (your own devices)
  - [ ] External beta (10-20 testers)
  - [ ] Bug fixes from beta feedback
  - [ ] Performance monitoring with Sentry

#### Week 22: Launch

- [ ] **Final checks**
  - [ ] All P0/P1 issues resolved
  - [ ] Data migration verified (counts match)
  - [ ] Billing flow tested end-to-end
  - [ ] Crash-free rate > 99.5%
  - [ ] App Store review submission

- [ ] **Flask shutdown plan**
  - [ ] Redirect web app to "Download our app" page
  - [ ] Keep Flask running read-only for 30 days
  - [ ] Export all remaining user data
  - [ ] Decommission Flask + SQLite

---

## Business Logic Port Order

Port in this order (each depends on the previous):

| # | Module | Source | Target | Lines | Dependencies |
|---|--------|--------|--------|-------|--------------|
| 1 | RMR | `goal_config.py` + `index.html` | `src/services/rmr.ts` | ~30 | None |
| 2 | NEAT | `index.html` | `src/services/neat.ts` | ~40 | None |
| 3 | TEF | `index.html` | `src/services/tef.ts` | ~15 | None |
| 4 | TDEE | `index.html` | `src/services/tdee.ts` | ~10 | RMR, NEAT, TEF |
| 5 | Targets | `goal_config.py` | `src/services/targets.ts` | ~50 | TDEE |
| 6 | Momentum | `db.py compute_momentum()` | `src/services/momentum.ts` | ~100 | Targets |
| 7 | Streak | `index.html` | `src/services/streak.ts` | ~20 | None |
| 8 | Email scoring | `db.py` | `src/services/email-importance.ts` | ~20 | None |

**Total: ~285 lines of TypeScript** to replace ~500 lines of Python/JS.

---

## Screen Mapping

| Flask Tab/Screen | React Native Screen | Navigator | Priority |
|------------------|---------------------|-----------|----------|
| Login (`login.html`) | `LoginScreen` | Auth Stack | Week 4 |
| Onboarding (`onboarding.html`) | `OnboardingScreen` | Auth Stack | Week 12 |
| Home (`#tab-home`) | `HomeScreen` | Bottom Tab | Week 5 |
| Nutrition (`#tab-meals`) | `NutritionScreen` | Bottom Tab | Week 6-7 |
| Fitness (`#tab-workout`) | `FitnessScreen` | Bottom Tab | Week 8 |
| Progress (`#tab-progress`) | `ProgressScreen` | Bottom Tab | Week 9-10 |
| Status (`#tab-mind`) | `StatusScreen` | Bottom Tab | Week 10 |
| Profile (`#tab-profile`) | `ProfileScreen` | Bottom Tab | Week 11 |
| Meal Detail (`#meal-detail-overlay`) | `MealDetailScreen` | Stack | Week 12 |
| Workout Detail (`#workout-detail-overlay`) | `WorkoutDetailScreen` | Stack | Week 12 |
| Day Detail (`#history-detail`) | `DayDetailScreen` | Stack | Week 10 |
| Barcode Scanner (`#barcode-overlay`) | `BarcodeScannerScreen` | Modal | Week 7 |
| Workout Session (`#checklist-overlay`) | `WorkoutSessionScreen` | Modal | Week 8 |
| Saved Meals (`#saved-meals-overlay`) | `SavedMealsScreen` | Modal | Week 7 |

---

## Data Migration Steps

### Phase 1 → 2 (Flask → Flask + Clerk)
- [ ] Add `clerk_id` column to `users` table in SQLite
- [ ] Create Clerk users for each existing SQLite user
- [ ] Map `users.id` → `clerk_id` in bridge table
- [ ] Both auth systems work simultaneously (session + JWT)

### Phase 4 → 5 (SQLite → Neon PostgreSQL)
- [ ] Export SQLite data: `sqlite3 life_dashboard.db .dump > backup.sql`
- [ ] Run migration script: SQLite JSON → Prisma insert
- [ ] Verify counts: `SELECT COUNT(*) FROM each_table` on both DBs
- [ ] Run Flask against PostgreSQL for 48 hours (dual-write mode)
- [ ] Cut over: point Node.js API at Neon
- [ ] Keep SQLite backup for 30 days

### Phase 7 (Flask shutdown)
- [ ] Verify all users can access data via mobile app
- [ ] Export any data created after migration date
- [ ] Run final sync script
- [ ] Archive SQLite file to S3

---

## Files to Delete During Migration

### After Phase 4 (Node.js backend is live):
```
DELETE: app.py              → replaced by src/routes/*.ts
DELETE: db.py               → replaced by prisma/schema.prisma + src/services/*.ts
DELETE: ai_client.py        → replaced by src/lib/anthropic.ts
DELETE: claude_nutrition.py  → replaced by src/services/ai/nutrition.ts
DELETE: claude_profile.py    → replaced by src/services/ai/profile.ts
DELETE: goal_config.py       → replaced by src/services/targets.ts
DELETE: garmin_sync.py       → replaced by src/services/integrations/garmin.ts
DELETE: gmail_sync.py        → replaced by src/services/integrations/gmail.ts
DELETE: requirements.txt     → replaced by package.json
DELETE: Procfile             → replaced by Dockerfile
DELETE: nixpacks.toml        → replaced by Dockerfile
```

### After Phase 7 (mobile app is live):
```
DELETE: templates/index.html      → replaced by React Native screens
DELETE: templates/login.html      → replaced by Clerk auth UI
DELETE: templates/onboarding.html → replaced by OnboardingScreen
DELETE: static/i18n.js            → replaced by react-i18next
DELETE: static/sw.js              → not needed (native app)
DELETE: static/manifest.json      → not needed (native app)
DELETE: life_dashboard.db         → migrated to Neon PostgreSQL
```

---

## New Files to Create

### React Native (`apex-mobile/`)
```
app/
  (auth)/
    sign-in.tsx
    sign-up.tsx
    onboarding.tsx
  (tabs)/
    index.tsx           # Home
    nutrition.tsx        # Nutrition
    fitness.tsx          # Fitness
    progress.tsx         # Progress
    status.tsx           # Status
    profile.tsx          # Profile
  meal/[id].tsx          # Meal Detail
  workout/[id].tsx       # Workout Detail
  day/[date].tsx         # Day Detail
  barcode.tsx            # Scanner
  workout-session.tsx    # Live workout

src/
  api/
    client.ts            # Fetch wrapper
    types.ts             # TypeScript interfaces
  hooks/
    useNutrition.ts
    useWorkouts.ts
    useProfile.ts
    useMomentum.ts
    useGmail.ts
  components/
    Card.tsx
    Button.tsx
    Input.tsx
    ProgressBar.tsx
    CalorieRing.tsx
    MacroGrid.tsx
    StreakBar.tsx
    MealTable.tsx
    WorkoutItem.tsx
    ChartWrapper.tsx
  theme/
    colors.ts
    typography.ts
    spacing.ts
    ThemeContext.tsx
  i18n/
    index.ts
    en.json, es.json, fr.json, de.json, pt.json,
    it.json, nl.json, pl.json, zh.json, ar.json
  storage/
    index.ts             # AsyncStorage wrappers
```

### Node.js API (`apex-api/`)
```
src/
  index.ts               # Express app entry
  routes/
    auth.ts, meals.ts, workouts.ts, tasks.ts,
    history.ts, gmail.ts, garmin.ts, momentum.ts,
    goals.ts, saved.ts, ai.ts, chat.ts
  services/
    rmr.ts, neat.ts, tef.ts, tdee.ts, targets.ts,
    momentum.ts, streak.ts, email-importance.ts
  services/ai/
    nutrition.ts, fitness.ts, profile.ts, gmail.ts
  services/integrations/
    garmin.ts, gmail.ts
  services/context/
    builder.ts, stripper.ts
  middleware/
    auth.ts, rateLimiter.ts, errorHandler.ts, encryption.ts
  lib/
    anthropic.ts, redis.ts, db.ts, queue.ts
  types/
    index.ts

prisma/
  schema.prisma
  migrations/

scripts/
  migrate-sqlite-to-postgres.ts
  seed.ts

tests/
  services/
    rmr.test.ts, neat.test.ts, targets.test.ts, momentum.test.ts
  routes/
    meals.test.ts, workouts.test.ts, auth.test.ts
```

---

## Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | **Clerk ↔ Flask auth bridge breaks** | Medium | High (users locked out) | Keep session auth as fallback for 4 weeks after Clerk goes live |
| 2 | **Data loss during SQLite → Postgres migration** | Low | Critical | Export SQLite backup before migration, verify row counts, keep SQLite for 30 days |
| 3 | **Claude API costs spike during development** | Medium | Medium ($50-200/mo) | Use Haiku for all dev testing, switch to Opus only for production |
| 4 | **App Store rejection** | Medium | High (2-week delay) | Follow Apple guidelines from day 1, avoid screenshots with placeholder data |
| 5 | **React Native chart library doesn't match quality** | Medium | Medium (UX regression) | Evaluate react-native-chart-kit vs Victory Native in Week 9 before committing |
| 6 | **Scope creep on "one more feature"** | High | High (timeline slip) | Freeze feature list at Week 3, only bug fixes after Week 15 |
| 7 | **Expo SDK 52 breaking changes** | Low | Medium | Pin exact versions, don't upgrade mid-migration |
| 8 | **Solo developer burnout** | Medium | High (project stall) | Commit to 4-hour focused blocks, not 12-hour marathons. Claude does the grunt work. |
| 9 | **Garmin/Gmail OAuth approvals delayed** | Medium | Low (features work in dev) | Start OAuth applications in Week 1, they take 2-4 weeks |
| 10 | **RevenueCat integration harder than expected** | Low | Medium | Budget an extra week (Week 19 buffer) |

---

## Weekly Effort Estimate

| Phase | Weeks | Hours/Week | Total Hours | Notes |
|-------|-------|------------|-------------|-------|
| 0: Bug fixes | 1 | 20 | 20 | Quick wins |
| 1: API hardening | 1 | 20 | 20 | Small route changes |
| 2: RN scaffolding | 2 | 30 | 60 | Most setup is boilerplate |
| 3a: Core screens | 4 | 35 | 140 | Heaviest frontend work |
| 3b: Secondary screens | 3 | 30 | 90 | Charts are the hard part |
| 3c: Overlays + polish | 1 | 30 | 30 | |
| 4: Node.js backend | 4 | 35 | 140 | Heaviest backend work |
| 5: Redis + context | 1 | 25 | 25 | |
| 6: RevenueCat + polish | 2 | 25 | 50 | |
| 7: Launch prep | 3 | 20 | 60 | Legal, assets, beta |
| **Total** | **22** | | **635** | ~29 hrs/week average |
