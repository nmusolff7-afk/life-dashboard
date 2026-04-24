# BUILD_PLAN_v1 — APEX Life Dashboard full v1 execution plan

**Date:** 2026-04-23
**Author:** CC synthesis from PRD v1.27 + BUILD_APPROACH + current repo state
**Status:** planning artifact — DO NOT begin execution until founder sign-off
**Scope of this plan:** Home + Fitness + Nutrition + Profile + scoring + chatbot base. Finance/Time/Notifications-deep are explicitly deferred (§11).

This document is **not** a replacement for MIGRATION_PLAN.md. It is the execution-phase breakdown referenced from BUILD_APPROACH Rule 1 ("PRD v1.0 is the ship target"), scoped to the features that are both (a) in PRD v1 scope and (b) unblocked for immediate build against the current Flask backend + RN mobile.

Sections:

1. Flask feature coverage audit
2. PRD-new feature audit
3. Scoring infrastructure plan
4. Chatbot implementation plan
5. Home tab reorganization
6. Fitness tab reorganization
7. Nutrition tab reorganization
8. Profile / Settings hierarchy
9. Day Summary / Day Detail screen
10. Proposed execution phasing
11. Out of scope for this build cycle
12. Founder action items
13. Open questions for founder review

---

## Section 1 — Flask feature coverage audit

Every row from [ACTIVE_FEATURES.md](ACTIVE_FEATURES.md) cross-checked against current mobile state, verified through codebase scan on [app.py](../../app.py) and [mobile/](../../mobile/) on branch `master` @ `2290561`.

| # | Feature | Flask status | Mobile status | PRD status | Gap | Work required |
|---|---|---|---|---|---|---|
| 1 | Text meal logging + AI macro estimate | Live — `POST /api/estimate` + `POST /api/log-meal` | Live in [LogMealCard.tsx](../../mobile/components/apex/LogMealCard.tsx) | PRESERVE §4.4.4 | None | None |
| 2 | Meal photo scan | Live — `POST /api/scan-meal` (current model: Haiku; legacy Opus) | Live in [MealPhotoScanner.tsx](../../mobile/components/apex/MealPhotoScanner.tsx) | ENHANCE §4.4.5 — Sonnet standard (Core), Opus Premium (Pro 10/day) | Flask backend model; tier split; Pro gating | Flask: split `/api/scan-meal` into `scan_meal_standard` (Sonnet) + `scan_meal_premium` (Opus). Mobile: add Pro-gated "Premium Scan" button. Tier gate stub OK until billing wired |
| 3 | Pantry scanner | Live — `POST /api/meals/scan` + `POST /api/meals/suggest` | Live in [PantryScanner.tsx](../../mobile/components/apex/PantryScanner.tsx) | ENHANCE §4.4.8 — Pro-gated, 10/day cap | Pro gating + daily cap missing | Flask: add quota check on `/api/meals/scan`. Mobile: hide behind Pro gate stub |
| 4 | Saved meals | Live — `GET/POST/DELETE /api/saved-meals` | Live in [SavedMealsPicker.tsx](../../mobile/components/apex/SavedMealsPicker.tsx) | PRESERVE + ENHANCE §4.4.7 — add smart-suggest (time-of-day surfacing) | Smart-suggest sort missing | Mobile: add deterministic time-of-day sort in [RecentMealsChips.tsx](../../mobile/components/apex/RecentMealsChips.tsx) |
| 5 | Barcode scanner | Client-side only — Open Food Facts direct | Live in [BarcodeScanner.tsx](../../mobile/components/apex/BarcodeScanner.tsx) | ENHANCE §4.4.6 — add AI fallback for products not in OFF | AI fallback missing | Flask: add `POST /api/barcode/lookup-ai`. Mobile: call on OFF 404 |
| 6 | Manual workout logging + AI burn estimate | Live — `POST /api/log-workout` + `POST /api/burn-estimate` | Live in [LogActivityCard.tsx](../../mobile/components/apex/LogActivityCard.tsx) | PRESERVE §4.3.5/§4.3.6 | None | None |
| 7 | Saved workouts | Live — `GET/POST/DELETE /api/saved-workouts` | Live in [SavedWorkoutsStrip.tsx](../../mobile/components/apex/SavedWorkoutsStrip.tsx) | PRESERVE | None | None |
| 8 | Strength workout tracking (checklist + rest timer) | Client-side only in Flask HTML | Live in [StrengthTrackerModal.tsx](../../mobile/components/apex/StrengthTrackerModal.tsx) + [useStrengthSession.tsx](../../mobile/lib/useStrengthSession.tsx) + [WorkoutActiveBanner.tsx](../../mobile/components/apex/WorkoutActiveBanner.tsx) | PRESERVE §4.3.5a | None | None |
| 9 | Workout plan generation (comprehensive) | Live — `POST /api/generate-comprehensive-plan` + `POST /api/parse-workout-plan` + `POST /api/revise-plan` (model: Haiku per current code) | Called from onboarding `generating.tsx`; no in-app plan editor | ENHANCE §4.1.6 + §4.3.10 — Sonnet for generation/revision, Haiku for understanding; Core 1/30d Pro 3/30d; revisions Core 3/plan Pro 10/plan | Model downgrade to Haiku (Flask) + no quota + no plan detail screen in Fitness | Flask: swap to Sonnet on gen/revise. Add quota counter. Mobile: Plan subsystem detail screen with Generate / Revise / Edit |
| 10 | Weight tracking (manual entry) | Live — `POST /api/log-weight` | Live in [profile/body-stats.tsx](../../mobile/app/settings/profile/body-stats.tsx) + Fitness weight card | ENHANCE §4.3.4 — HealthKit autopull fallback | HealthKit not wired | Mobile: add HealthKit integration later phase; manual entry stays as fallback |
| 11 | Steps tracking | Client-side only in Flask | Stored in AsyncStorage only, no Flask endpoint | ENHANCE §4.3.7 — HealthKit / Health Connect autopull | No server persistence | Flask: add `POST /api/log-steps`. Mobile: wire HealthKit later phase |
| 12 | Daily Momentum Score | Live — `POST /api/momentum/today`, `GET /api/momentum/history`, `POST /api/momentum/insight`, `POST /api/momentum/summary` | Used by [SubsystemsCard.tsx](../../mobile/components/apex/SubsystemsCard.tsx) home card; shared logic in [shared/src/logic/momentum.ts](../../shared/src/logic/momentum.ts) | **CUT + REPLACE** §9 — Flask's 4-component momentum replaced by PRD's 4 category scores + Overall | Entire scoring engine is wrong | See §3 below |
| 13 | Goal setting — calorie & macro targets | Live — `POST /api/goal/update`, `GET /api/profile`, `goal_config.py:compute_targets()` | Live in [profile/macros.tsx](../../mobile/app/settings/profile/macros.tsx) + [MacrosForm.tsx](../../mobile/components/apex/MacrosForm.tsx) | ENHANCE §4.10 — folded into unified 22-goal library | Goal picker is a radio group, not a library | See §10.5 and §11 (deferred to Phase 4+) |
| 14 | Task tracking | Live — `GET /api/mind/today` + `POST/PATCH/DELETE /api/mind/task/{id}` | Backend only — no mobile UI | PRESERVE §4.6.9 (Time category) | No mobile UI built | Deferred to Time-tab phase (out of scope §11) |
| 15 | Gmail routing | Live — full OAuth + sync + summarize (Haiku) | Backend only — no mobile UI beyond connections stub | ENHANCE §4.6.8 — deterministic 3-signal classifier replaces learned rules | Mobile UI missing; Flask classifier is single-signal | Deferred to Time-tab phase (out of scope §11) — but Flask classifier can be rewritten anytime |
| 16 | Onboarding quiz + AI profile generation | Live — `POST /api/onboarding/save/complete/poll`, `claude_profile.generate_profile_map()` | Live in [mobile/app/(onboarding)/](../../mobile/app/(onboarding)/) | PRESERVE §4.1 but remove archetype + profile-insight narration | Archetype still in profile_map; remove insight narration | Flask: remove archetype/insight narrative from prompt. Mobile: stop displaying archetype |
| 17 | History & Day Detail | Live — `GET /api/history` (meals+workouts+momentum rollup), `GET /api/day/{date}` | [mobile/app/history/index.tsx](../../mobile/app/history/index.tsx) = "Coming soon" stub; [mobile/app/day/[date].tsx](../../mobile/app/day/[date].tsx) = date-header placeholder | ENHANCE §4.2a — full Day Detail cross-category | Both mobile screens are stubs | See §9 below |
| 18 | Theme switcher | Client localStorage only | Live in [preferences.ts](../../mobile/lib/preferences.ts) + [theme.tsx](../../mobile/lib/theme.tsx) | ENHANCE §4.8.9 — dark/light/auto only; kill "Medium" | "Medium" theme doesn't exist in RN (only 2 modes) — already compliant | None |
| 19 | Multi-language (i18n) | 10 languages in `static/i18n.js` | EN + ES only in [preferences.ts](../../mobile/lib/preferences.ts:5-7) | CUT §14.14 — EN + ES only at v1 | Already compliant in mobile | None on mobile. Flask PWA keeps 10 langs until Flask decommissioned |
| 20 | Authentication & account mgmt | Live — Clerk bridge + JWT | Live in [useClerkBridge.ts](../../mobile/lib/useClerkBridge.ts) + [(auth)](../../mobile/app/(auth)/) | ENHANCE §4.1.2 — OAuth (Apple + Google + Email) via Clerk | Email OAuth not wired; Apple sign-in not wired | Mobile: wire Clerk's Apple + Google + email providers |
| 21 | Settings (prefs + toggles) | Scattered across user_goals + client localStorage | Live in [mobile/app/settings/](../../mobile/app/settings/) (14 screens) | ENHANCE §4.8 — sectional direct-edit replaces onboarding re-do | Most settings sub-screens partial; see §8 for full gap list | See §8 below |
| 22 | Meal detail view | Reused from `/api/day/{date}` | Live in [MealDetailModal.tsx](../../mobile/components/apex/MealDetailModal.tsx) | PRESERVE §4.4.11 | None | None |
| 23 | Workout detail view | Reused from `/api/day/{date}` | Live in [WorkoutEditSheet.tsx](../../mobile/components/apex/WorkoutEditSheet.tsx) | PRESERVE §4.3.12 | None | None |
| — | AI meal label shortener (`/api/shorten`) | Live — Haiku | Called in places | **CUT** — not in PRD §10.2 closed inventory | Flask call remains; mobile should stop calling | Mobile: stop calling `/api/shorten` |
| — | AI momentum insight narrative | Live — Haiku | Called by home, not surfaced visibly | **CUT** §3.2 — prescriptive AI banned | Call still exists in Flask | Mobile: remove call. Flask: leave endpoint but remove from any proactive trigger |
| — | AI scale summary (day/week/month) | Live — Haiku | Not surfaced in mobile | **CUT** §3.2 | — | Mobile: remove any remaining references |
| — | Archetype classification | Baked into `generate_profile_map()` output | Stored in profile_map but not shown | **CUT** §10.2 (removed v1.18) | Remove from prompt + storage | Flask: strip archetype from prompt. Don't break existing users' saved profile_map; just stop reading |
| — | Mood / morning / evening check-ins | Tables exist, dormant | Not wired | CUT §4.6 explicit | Already dormant | None |
| — | Garmin sync | Deleted from Flask | Not wired | ENHANCE §8 — official Health API if approved | Depends on Apple/Google approval | Out of scope this plan (§11) |

**Summary.** 23 active features. 18 are PRESERVE/already-wired. 4 require ENHANCE (meal scan tier split, pantry gating, workout plan model + quota, onboarding archetype strip). 1 major CUT+REPLACE (momentum → §9 scoring). 3 smaller CUTs (shorten, momentum insight, scale summary).

---

## Section 2 — PRD-new feature audit

Features specified in PRD v1 that do **not** exist in Flask. Scoped to Home / Fitness / Nutrition / Profile (skipping Finance, Time, deep Chatbot signal pool).

| # | PRD § | Feature | In scope? | Integration blocker | Interim UX | Scope |
|---|---|---|---|---|---|---|
| 1 | §4.2.2 | Weather widget (WeatherKit iOS / OpenWeatherMap Android) | Yes | None (WeatherKit free; OWM free tier fine for our scale) | — | M (2h — two platforms + cache + hide-on-denial) |
| 2 | §4.2.2 | Overall Score hero with 7-day sparkline | Yes | Needs §3 Flask endpoint | Renders "—" + CTA until 2 categories score | S (1h — once endpoint exists) |
| 3 | §4.2.2 | 4 category score cards (Fitness / Nutrition / Finance / Time) | Partial (Fitness + Nutrition this cycle; Finance + Time = "—" with CTA) | Finance needs Plaid; Time needs HealthKit/Calendar | Empty-state CTA per PRD | M (2h) |
| 4 | §4.2.2 | Day Timeline preview strip (home) | Deferred | Requires Time-tab work | Hidden | — |
| 5 | §4.2.7 | Pull-to-refresh on Home | Yes | None | — | S (45m) |
| 6 | §4.2a | Day Detail full cross-category screen | Yes (Fitness + Nutrition populated; Finance + Time = stub sections) | Finance / Time data not yet collected | Empty section with connection CTA | L (3-4h — see §9) |
| 7 | §4.3.2 Today tab | 7 subsystem cards stacked (Plan / Strength / Cardio / Body / Movement / Sleep / Recovery) | Yes (4 now: Body, Strength, Cardio, Movement; Plan as stub screen; Sleep + Recovery empty-state cards) | Sleep + Recovery need HealthKit | Show card w/ "Connect Apple Health" CTA | L (4-5h card layer; another 4-5h for detail screens — see §6) |
| 8 | §4.3.4 | Body subsystem detail screen — weight trend + body comp + goal tracking | Yes | None (weight already tracked) | — | M (2h) |
| 9 | §4.3.5 | Strength subsystem detail — PR chart, volume trends, recent sessions | Yes | None | — | M-L (3h, Strava-ish feel requires data reshape) |
| 10 | §4.3.6 | Cardio subsystem detail — cardio volume, HR zones, activity list | Yes (cardio volume derived from existing workout_logs); HR zones deferred | HR zones need HealthKit | Show volume chart only until HK wired | M (2h) |
| 11 | §4.3.7 | Movement subsystem — steps trend + NEAT breakdown | Yes (steps manual + later HK) | — | — | S (1-2h) |
| 12 | §4.3.8 | Sleep subsystem | Blocked — HealthKit-only data | Apple Health not integrated yet | "Connect Apple Health to activate Sleep" empty state | S (1h empty-state card + detail screen header) |
| 13 | §4.3.9 | Recovery subsystem | Blocked — HRV needs wearable | Same | Same empty-state pattern | S (1h) |
| 14 | §4.3.10 | Training Plan subsystem — persistent plan + adherence | Yes (plan exists; persistence + Fitness-tab editor is new) | — | — | M (2-3h) |
| 15 | §4.3.11 | Fitness Score (composite of 7 subsystems) | Yes — deterministic, via §3 | — | — | S once scoring engine exists |
| 16 | §4.4.3 | Daily Nutrition Summary ("the hero") — already in [TodayBalanceCard.tsx](../../mobile/components/apex/TodayBalanceCard.tsx) | Yes | — | — | S (already built; minor refinement) |
| 17 | §4.4.10 | Calorie rollover + auto-adjust | Already shipped in [profile/macros.tsx](../../mobile/app/settings/profile/macros.tsx) | — | — | None |
| 18 | §4.4.12 | Hydration tracking (opt-in silent default) | Yes | — | Off until user enables | M (2h — toggle in settings, widget on Nutrition, endpoint) |
| 19 | §4.4.13 | Nutrition Score (composite) | Yes — deterministic, via §3 | — | — | S once scoring engine exists |
| 20 | §4.4.17 Meal label shortening | — (already cut, see §1) | — | — | — |
| 21 | §4.7 | AI Chatbot overlay (FAB-replaces-shortcut) | Yes — base shell, Home + Nutrition + Fitness shortcuts + Haiku pipeline | None | — | L (6-8h — see §4) |
| 22 | §4.8.4 | Profile sectional direct-edit (replaces onboarding re-do) | Mostly done — see §8 | — | — | M (2-3h delta) |
| 23 | §4.8.5 | Subscription & billing (RevenueCat) | Stub only — deferred | RevenueCat setup required | Badge "Free trial mode" | Out of scope this plan |
| 24 | §4.8.6 | Connections management — 12+ integrations with connect/connected/disconnect state | Partial — Gmail real, others stub | — | Stub cards w/ "Coming soon" | M (2h to unify state model + stub layout) |
| 25 | §4.8.7 | Privacy — per-source AI consent + Chatbot Audit | Yes | None (audit table is new §4) | — | M (2h — see §4g) |
| 26 | §4.8.8 | Notifications settings entry | Stub — full nav + category toggles | Push infra not built | Toggles persist to prefs but no push yet | S (1h) |
| 27 | §4.8.10 | Security — Face ID / App Lock / change password / sign-out-all | Partial — see [security.tsx](../../mobile/app/settings/security.tsx) | — | — | S (30m delta) |
| 28 | §4.8.11 | Data & Account — Export stub + Sign Out + Delete Account | Yes | Export backend not built | Stub button with "Coming in backend migration" | S (30m) |
| 29 | §4.8.12 | Support & About — FAQ + Contact + Feedback + Legal | FAQ + Support exist ([faq.tsx](../../mobile/app/settings/faq.tsx)); Legal stubs | — | — | S (1h to add ToS/Privacy links) |
| 30 | §4.10 | Unified goal system (22-goal library, picker, detail, celebration) | Deferred to later phase | — | Current 4-preset calorie goal behaves as-is | Out of scope this plan |
| 31 | §4.9 | Push notifications full system | Deferred | Push infra + signal pool needed | — | Out of scope this plan |
| 32 | §4.11 | Data export (CSV Core + PDF Pro) | Deferred | Backend async worker + email | Stub | Out of scope this plan |
| 33 | §4.2.4 | Score bands (green ≥75, amber 50-74, red <50, grey "—") | Yes — trivial once scores exist | — | — | S (30m — one util + apply across score surfaces) |
| 34 | §9 | Category score "Calibrating" pill during 14-day warmup | Yes | Needs §3 endpoint surfacing warmup flag | — | S (30m) |

**In-scope this plan:** #1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12 (stub), 13 (stub), 14, 15, 16, 17, 18, 19, 21, 22, 24, 25, 26, 27, 28, 29, 33, 34. **Out of scope:** Finance (#23, 30), Time tab (#4), notifications (#31), data export (#32). Total in-scope rough estimate: **50–60 hours** of CC session time.

---

## Section 3 — Scoring infrastructure plan

Per PRD §9, Flask's 4-component momentum (`compute_momentum()` in [db.py](../../db.py)) is replaced by a tiered scoring engine. Signal scores → subsystem scores (Fitness only) → category scores → Overall. All deterministic, no AI.

### 3(a) Backend Flask endpoints to add

All under new prefix `/api/score/*`. Returns the same envelope shape for forward compatibility as Finance and Time fill in.

| Endpoint | Purpose | Response envelope |
|---|---|---|
| `GET /api/score/overall` | Overall 0–100 + contributing-categories label + score band + raw_deltas | `{ score: int\|null, band: "green"\|"amber"\|"red"\|"grey", contributing: ["fitness","nutrition"], reason: "ok"\|"insufficient_data", raw_deltas: [...], calibrating: bool, sparkline_7d: [...] }` |
| `GET /api/score/fitness` | Fitness 0–100 + per-subsystem scores + signal raw_deltas | `{ score, band, subsystems: { body: {...}, strength: {...}, cardio: {...}, movement: {...}, sleep: {...}, recovery: {...}, plan: {...} }, raw_deltas, calibrating }` |
| `GET /api/score/nutrition` | Nutrition 0–100 + per-signal breakdown | `{ score, band, signals: { calorie_adherence: {...}, protein_adherence: {...}, logging_consistency: {...}, macro_distribution: {...}, hydration: {...} }, raw_deltas, calibrating }` |
| `GET /api/score/finance` | Stubbed | `{ score: null, band: "grey", reason: "plaid_not_connected", cta: "Connect bank to activate Finance" }` |
| `GET /api/score/time` | Stubbed | `{ score: null, band: "grey", reason: "insufficient_connections", cta: "Connect at least 2 of: sleep, screen time, location" }` |

All endpoints accept `?date=YYYY-MM-DD` for historical recompute. Server caches today's result for 5 min; cache key `user:{id}:score:{category}:{date}:{data_version}` where `data_version` is `max(updated_at)` across the user's data tables.

### 3(b) Scoring math per PRD §9

**Universal formula (§9.4).** `score = clamp(round(Σ(signal_score[0..1] × weight) / Σ active_weights × 100), 0, 100)`. `raw_deltas` always returned.

**Signal normalization (§9.5).** Piecewise-linear safe-range-with-D_max. `score = 1.0 if deviation ≤ R else 1 − (deviation − R) / (D_max − R) clamped to 0`. Asymmetric signals use separate R_low/R_high (protein has floor only, sodium/budget have ceilings only, etc.).

**Personal baselines (§9.6).** Baselineable signals: Strength weekly volume, Cardio weekly volume, Daily steps, Sleep duration, HRV, Sleep Regularity (bedtime + wake SD), Attention Fragmentation (pickups/session length/longest focus block), Location Intentionality, Schedule Density Balance, Rhythm Adherence (wake/first-meal/workday-start/end). **30-day rolling median** (14 days for HRV + Sleep Regularity). **Min sample = ceil(window/3)**. Flat median (no recency weighting).

**14-day warmup (§9.6.3).** First 14 days use population defaults: Sleep 7.5h, Sleep SD 30min, Pickups 60, Session length 3min, Focus block 90min, Meetings 3h, Wake 7:00, First meal 8:30, Workday 9–18, Steps 6000. Location + HRV + Strength/Cardio volume = **excluded during warmup** (no defensible default). UI shows "Calibrating" pill during warmup.

**Safe-range bounds (§9.10).**

| Signal | Target source | Safe range | D_max |
|---|---|---|---|
| Nutrition / Calorie adherence | Goal-derived + prorated curve §9.9.2 | ±100 kcal | ±500 kcal |
| Nutrition / Protein adherence | Goal-derived (g/kg protocol) | −10g floor, no ceiling | −60g below target |
| Nutrition / Macro distribution (fat + carbs each) | Goal-derived | ±10% | ±30% |
| Nutrition / Logging consistency | Binary per meal window (breakfast/lunch/dinner) | Perfect = 1.0, 2/3 = 0.67, 1/3 = 0.33 | — |
| Nutrition / Hydration (opt-in) | User water goal | ±15% | — |
| Fitness / Movement — steps | Personal 30d median | ±15% | ±50% |
| Fitness / Strength — weekly volume | Personal 30d median | ±25% of baseline | — |
| Fitness / Cardio — weekly min | Personal 30d median | ±20% of baseline | — |
| Fitness / Sleep — duration | Personal 30d median | ±30 min | ±2h |
| Fitness / Sleep — consistency (SD) | Personal | ±45 min | — |
| Fitness / Recovery — HRV | 14-day EMA | ±10% | ±30% |
| Fitness / Body — weight trend | Goal-implied weekly pace | ±0.3 lb/week | — |
| Fitness / Body — logging consistency (7d) | ≥1 log | Binary | — |
| Fitness / Plan adherence | Scheduled-days completion rate | ≥90% = 1.0 | ≤50% = 0 |

**Score bands (§4.2.9).** Green ≥ 75. Amber 50–74. Red < 50. Grey "—" when insufficient data.

**Minimum-data thresholds (§9.8).**

| Tier | Threshold | Below-threshold UI |
|---|---|---|
| Signal | ≥1 valid data point per signal-specific rule | excluded from weighted sum |
| Subsystem (Fitness only) | ≥1 signal with data | card shows "—" + empty state |
| **Category** | **≥2 signals with data** | category score = "—" + CTA |
| **Overall** | **≥2 categories scored** | overall = "—" + "Overall · X + Y" label |

### 3(c) Data sources per signal

| Signal | Flask source (existing) | Missing data source |
|---|---|---|
| Calorie / protein / macro adherence | `meal_logs` + `user_goals` | — |
| Logging consistency | `meal_logs` aggregated by meal window (5–10a / 11a–2p / 5–9p) | — |
| Hydration | New column `hydration_oz` on `daily_activity` or new `hydration_logs` table | add migration |
| Movement — steps | `daily_activity.steps` (new column — currently localStorage only) | add migration + endpoint |
| Strength volume | `workout_logs` parsed for strength volume — new column `strength_volume_lbs` computed at log time or on-demand | add migration + backfill job |
| Cardio minutes | `workout_logs.duration_min` + type classification — parser enhancement | parser |
| Sleep duration / HRV / Recovery | HealthKit — NOT IN FLASK | deferred to post-HK phase |
| Sleep regularity | HealthKit | same |
| Attention / Location / Schedule / Rhythm | Screen Time / CoreLocation / Calendar — NOT IN FLASK | deferred |
| Body weight trend | `daily_activity.weight_lbs` | — |
| Body logging consistency | `daily_activity` presence | — |
| Plan adherence | Plan + `workout_logs` match | requires plan persistence (§6e) |

**Forward-compatibility note.** The `/api/score/fitness` response always includes the full 7-subsystem envelope; subsystems without data return `{ score: null, signals: {}, reason: "..." }`. This lets the mobile render placeholder cards without conditional branching.

### 3(d) Shared TypeScript types

Put in new file [shared/src/types/score.ts](../../shared/src/types/score.ts).

```typescript
export type ScoreBand = "green" | "amber" | "red" | "grey";
export type ScoreReason = "ok" | "insufficient_data" | "not_connected" | "warmup";

export interface ScoreSignal {
  signal_id: string;
  raw_value: number | null;
  target: number | null;
  deviation: number | null;
  normalized_score: number | null;  // [0, 1]
  weight: number;
  redistributed_weight: number;
  contribution: number;
}

export interface SubsystemScore {
  score: number | null;
  band: ScoreBand;
  reason: ScoreReason;
  signals: Record<string, ScoreSignal>;
}

export interface CategoryScoreResponse {
  score: number | null;
  band: ScoreBand;
  reason: ScoreReason;
  raw_deltas: ScoreSignal[];
  calibrating: boolean;       // true during 14-day warmup
  subsystems?: Record<string, SubsystemScore>;   // Fitness only
  sparkline_7d?: (number | null)[];
  cta?: string;
}

export interface OverallScoreResponse {
  score: number | null;
  band: ScoreBand;
  reason: ScoreReason;
  contributing: Array<"fitness" | "nutrition" | "finance" | "time">;
  raw_deltas: ScoreSignal[];
  calibrating: boolean;
  sparkline_7d: (number | null)[];
  weights: { fitness: number; nutrition: number; finance: number; time: number };
}
```

### 3(e) Minimum-data UI thresholds

Already folded into §3(b). Mobile behavior per PRD §4.2.8:

- Score = `null` → render "—" + CTA from response; card still tappable.
- `calibrating: true` → render number normally but show small "Calibrating" pill (first 14 days).
- Category with fewer than 2 signals → response has `score: null` already.

### Implementation notes

1. Port existing [shared/src/logic/momentum.ts](../../shared/src/logic/momentum.ts) math into new `shared/src/logic/scoring/{signals,normalize,baselines,category}.ts` files. Momentum stays for Flask PWA compatibility until Flask is decommissioned.
2. New Flask table `daily_scores` with columns `(user_id, score_date, category, score, band, raw_deltas, computed_at, data_version)` — mirrors §9.17 spec. Index `(user_id, score_date, category)`.
3. Nightly cron at 03:30 UTC to snapshot prior-day scores + recompute 30-day baselines. Today's scores compute lazily on request and cache 5 min.
4. Backfill: on first `/api/score/*` call for a new-on-mobile user, seed the score cache for the last 30 days from existing `meal_logs` / `workout_logs`. No AI cost (scoring is deterministic).

---

## Section 4 — Chatbot implementation plan

Per PRD §4.7. Base shell first (this cycle); signal pool fills out as other subsystems come online.

### 4(a) Overlay UI

Per §4.7.4. Tap existing FAB → `+` rotates 45° over 200ms to X. Chat input pill slides in from right. Dim background (30% light / 50% dark). Vertical shortcut button stack above the X. Shortcuts hide once conversation has content. Dismiss on X-tap, dim-tap, swipe-down, Android back button. `expo-haptics` subtle impact on open.

Components to add:

- [mobile/components/chat/ChatOverlay.tsx](../../mobile/components/chat/ChatOverlay.tsx) — root overlay portal rendered above tabs
- [mobile/components/chat/ChatInput.tsx](../../mobile/components/chat/ChatInput.tsx) — pill with mic + send states
- [mobile/components/chat/ChatBubble.tsx](../../mobile/components/chat/ChatBubble.tsx) — user + assistant variants; streaming cursor; long-press "Report this response"
- [mobile/components/chat/ChatShortcutRail.tsx](../../mobile/components/chat/ChatShortcutRail.tsx) — vertical stack; shortcut set by `useActiveSurface()` context
- [mobile/lib/useChatSession.tsx](../../mobile/lib/useChatSession.tsx) — RAM-only session state, 30-min background → end, conversation reset, 8-turn cap per §4.7.7

### 4(b) Context payload architecture — 9 containers per §4.7.10

Each container has schema, token budget target+cap, staleness policy, privacy gate.

| Container | Target / Cap | Staleness | Privacy gate |
|---|---|---|---|
| `ProfileContext` | 250 / 350 | Session-cached | None |
| `GoalsContext` | 150 / 250 | Session-cached | None |
| `NutritionContext` | 400 / 600 | Realtime | Nutrition data present |
| `FitnessContext` | 500 / 700 | Realtime | Fitness data present |
| `FinanceContext` | 400 / 600 | Realtime | Plaid + AI consent |
| `LifeContext` | 600 / 900 | Realtime | Life sources connected + AI consent |
| `HistoricalContext` | 800 / 1200 | On-demand (query mentions "last week"/"last month"/"usually") | Parent domain |
| `PatternsContext` | 300 / 400 | Session | Parent domain |
| `DayTimelineContext` | 500 / 800 | On-demand (day-specific query) | Life AI consent |

**Future-signal reservation.** Container schemas are versioned; each carries an `_v: 1` field. Empty slots for v1-build-but-not-yet-wired signals (HealthKit sleep/HRV/steps-autopull, Plaid categories, calendar, email counts) are included as `null`-valued keys so the prompt structure is stable. Example: `NutritionContext.today.water_oz: null` until hydration enabled; `FitnessContext.today.hrv_ms: null` until HealthKit wired.

**Redaction on assembly (PRD §3.6, §6.6.3, §4.7.15).** Flask server does all redaction before Anthropic call. **Raw financial data never sent** (merchant name → category; amounts rounded to dollar). **Email bodies never sent** (subject + sender + first 200 chars only; and only if importance classifier flagged "important"). **Location redacted** to user-labeled place names only; coordinates never sent. **Calendar titles** redacted to category tag unless user explicit-queries for it.

### 4(c) Message pipeline

Per §4.7.11. Mobile flow:

1. Client classifier (5ms, regex + keyword rules in new `mobile/lib/chat/classifier.ts`): `logging_intent | query_intent | ambiguous | out_of_scope` + domain tags (`[nutrition]`, `[fitness, life]`, `[all]`).
2. If `logging_intent` with confidence > 0.8 → show templated redirect message per §4.7.8 ("I don't log meals directly — tap Log Meal" / etc.). **No AI call, no quota burn.** User can tap "That was a question — answer it" to override.
3. If `out_of_scope` (medical, investment, external-world info) → templated refusal. No AI call.
4. Else → `POST /api/chatbot/query` with `{ query, classifier_output, conversation_history }` + `X-Client-Date`, `X-Client-Timezone` headers.
5. Flask authenticates (Clerk JWT), checks quota (4f), checks per-source consent, assembles containers in parallel, applies redaction, token-counts + truncates low-priority fields if over cap, calls Anthropic with streaming enabled (Haiku 4.5).
6. Flask streams response tokens back via SSE (`Transfer-Encoding: chunked`). Mobile renders into assistant bubble with typing cursor.
7. On stream close → decrement client-side quota counter (Core).

**New endpoint: `POST /api/chatbot/query`** (stream response)
- Request: `{ query: string, classifier_output: {intent, domains, confidence}, conversation_history: [{role, content}] }`
- Response: `text/event-stream` with SSE events. Each event is a token or a JSON metadata event (e.g., `{"type":"containers_loaded","skipped":["finance"]}`).

### 4(d) Prescriptive vs descriptive mode (§3.2, §10.13.2)

System prompt includes explicit `MODE: DESCRIPTIVE` header. Prescriptive content is gated by user query pattern: only permitted when user directly asks ("what should I do about my sleep?", "should I eat more protein?"). Classifier tags such queries as `explicit_prescriptive_request`. System prompt honors: "You may give direct recommendations only when the user has asked for them; otherwise describe the data and let the user decide."

Server-side schema validator on response detects prescriptive-drift (imperative verbs without prior user request) and logs a quality-review flag. Not blocking in v1 — will tune post-launch.

### 4(e) Per-surface shortcuts (§4.7.5)

| Surface | Shortcuts |
|---|---|
| Home | Log Meal · Log Workout · Add Task · Add Transaction (hidden unless Plaid connected) |
| Fitness | Log Workout · Log Weight · Log Freestyle Workout |
| Nutrition | Log Meal · Scan Meal · Barcode · Saved Meals · Log Water (if hydration active) · Pantry Scan (Pro) |
| Finance | Add Transaction · Mark Bill Paid · Check Balances |
| Time | Add Task · Add Calendar Event · View Today's Schedule |
| Profile / Settings | (no shortcuts — chatbot still available for questions) |

Each shortcut opens the **native flow**, not the chatbot. Tapping "Log Meal" opens [LogMealCard.tsx](../../mobile/components/apex/LogMealCard.tsx) — it does NOT pre-fill the chat input. Per §4.7.5 "Button Ordering Within Each Set": most-used at the bottom (closest to thumb).

Time-of-day soft emphasis (§4.7.5): between 5–10a / 11a–2p / 5–9p local, "Log Meal" gets a subtly thicker accent border. Deterministic, zero-cost.

### 4(f) Cost tracking and tier gating (PRD §4.7.16 + §13.3)

| Tier | Daily chatbot quota | Soft cap | Model |
|---|---|---|---|
| Core | 10/day | — | Haiku 4.5 |
| Pro | 50/day | 300/day (fraud flag above) | Haiku 4.5 |

Per §4.7.8 and §4.7.16: logging redirects, out-of-scope refusals, failed AI calls **do not** decrement quota. Counter resets at midnight **user local**.

Flask endpoint checks counter pre-call. If over quota → HTTP 402 with `{ reason: "quota_exceeded", upgrade_prompt, reset_at }`. Mobile renders the "You've used your 10 daily chats" modal (§4.7.16) with "Upgrade to Pro" + "OK" CTAs.

Tier state for v1: read from RevenueCat entitlement via `mobile/lib/tier.ts` stub. Until billing is wired, every user is treated as **Pro** (50/day) during dev. Flag: `EXPO_PUBLIC_DEV_TIER_OVERRIDE=pro`.

### 4(g) Audit log per §4.7.15 + §4.8.7

New Flask table `chatbot_audit`:

```
CREATE TABLE chatbot_audit (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  session_id TEXT NOT NULL,                 -- client-generated per session
  query_text TEXT NOT NULL,
  classifier_output JSONB NOT NULL,         -- intent + domains + confidence
  containers_loaded JSONB NOT NULL,         -- list of container names actually sent
  containers_skipped JSONB NOT NULL,        -- list of container names skipped for consent/privacy
  elevated_fields JSONB DEFAULT '[]',       -- per §4.7.15 "override for explicit queries"
  model TEXT NOT NULL,
  input_tokens INT,
  output_tokens INT,
  response_cost_usd NUMERIC(10, 6),
  response_text TEXT,                       -- full assistant response (for audit display)
  result_status TEXT NOT NULL,              -- "ok" | "error" | "quota_exceeded" | "timeout"
  latency_ms INT,
  duration_ms INT
);
CREATE INDEX ON chatbot_audit(user_id, created_at DESC);
```

**30-day retention both tiers** (PRD §4.7.16 / §13.3.3 update — transparency not monetized). Nightly cron purges rows older than 30 days. Settings → Privacy → Chatbot Audit screen renders last-30-day list.

Endpoint: `GET /api/chatbot/audit` → paginated list. `DELETE /api/chatbot/audit/{id}` → delete single record. `GET /api/chatbot/audit/export` → JSON dump for GDPR Article 15.

---

## Section 5 — Home tab reorganization

Current state ([mobile/app/(tabs)/index.tsx](../../mobile/app/(tabs)/index.tsx)): 13+ cards in Flask-inherited ordering including a `SubsystemsCard` that tries to serve the Home + Fitness roles simultaneously.

### 5(a) Proposed PRD-aligned ordering per §4.2.2

Top-to-bottom, reading like a BLUF:

1. **Header strip** (already right-looking) — Life Dashboard wordmark + Weather widget (small, centered; see §2 row 1) + Profile icon
2. **Overall Score hero** (new) — centered 0–100 number, ~48pt, 7-day sparkline behind, small band indicator (green/amber/red dot or "—" pill). See §3 + §2 row 2. "Calibrating" pill during first 14 days. No descriptive label beneath.
3. **90-day Streak Bar** (already built: [StreakBar.tsx](../../mobile/components/apex/StreakBar.tsx)) — staying where it is but reparented as a sibling directly beneath Overall Score
4. **Active Goal strip** (new layout on existing data) — horizontal scrollable cards per §4.2.2. Show all active goals (category chip + name + thin progress bar + progress label). Primary fitness goal leftmost if set. Hidden entirely if 0 goals. At v1 this renders the one calorie goal from `user_goals` as a single card until the 22-goal library lands
5. **Four category score cards — 2×2 grid** (new) — Fitness / Nutrition / Finance / Time. Each card = category name + 0–100 score (prominent) + band indicator + supporting data:
   - **Fitness card**: weight (current), steps today, cal burned today, last workout summary
   - **Nutrition card**: calories remaining (hero metric, "2340 − 1612 = 728"), macro bars (P/C/F vs target)
   - **Finance card**: empty state "Connect your bank to activate Finance" (v1 stub)
   - **Life card**: empty state "Connect calendar + email to activate Time" (v1 stub)
   - Tap any card → category detail view (§6, §7 for Fitness/Nutrition; stubs for Finance/Time)
6. **Day Timeline preview strip** (§4.2.2 item 6) — deferred; hidden until Time-tab data exists
7. **FAB** — same position (bottom-right), now opens Chatbot overlay per §4 (currently opens log menu)

### 5(b) Card consolidations (away from today's layout)

| Today's card/element | Destination |
|---|---|
| Current `SubsystemsCard` (Home) with tabs | **Retire from Home.** Its content (subsystem cards) lives in Fitness Today tab per §6 |
| Standalone weight card | Move into Fitness Today's "Today's summary card" (§6) + full detail in Body subsystem |
| Standalone steps card | Same — into Fitness Today summary + Movement subsystem |
| Standalone cals burned card | Merge into Fitness card's supporting data |
| Standalone cals consumed card | Merge into Nutrition card's supporting data |
| Standalone macro grid on Home | Merge into Nutrition card's supporting data (macro bars) |
| Activity Calendar on Home | Move into Fitness Progress tab (§4.3.2a — already planned) |
| `TodayBalanceCard` on Home | Move into Nutrition Today tab (§7); Home gets only score + light summary |

**Unclear / flag for founder:**

- **Category color accents.** PRD §4.2.9 specifies subtle color-band indicators on scores but says "no whole-card theming." Proposal: (a) category chip / icon uses category color (blue Fitness, green Nutrition, orange Finance, purple Time); (b) score indicator dot uses band color (green/amber/red); (c) card background stays neutral; (d) a thin top border (2pt) in category color on the score card. **Flag:** confirm whether the 2pt top-border accent is the right level of subtlety or too busy.
- **Goal strip vs Goal library.** The full 22-goal library (§4.10) is out of scope this plan. Goal strip renders only what's in `user_goals` today (1 goal: the active calorie-target goal). Once library lands, this becomes the full multi-goal strip without layout changes. **Confirm this is acceptable interim.**

### 5(c) Category accents applied subtly

Applied surfaces: category chip dot on goal cards (§4.2.2), score indicator pill on category cards, thin top-border of category score cards, active-tab indicator on bottom tab bar, section headers in Day Detail (§9). Never: full-card background theming, typography color, button color.

---

## Section 6 — Fitness tab reorganization

Current state ([mobile/app/(tabs)/fitness.tsx](../../mobile/app/(tabs)/fitness.tsx)): Today/Progress/History sub-tabs already exist. Subsystems currently live buried inside `SubsystemsCard`. PRD §4.3.2 says each gets a full-screen detail on tap.

### 6(a) Fitness Today sub-tab

Top to bottom:

1. **Fitness Score hero** — 0–100 + 7-day sparkline + band indicator. Single deterministic label beneath ("Strong recovery week" / "Training consistency down") derived from sparkline slope, not AI
2. **Active Fitness goals strip** — filtered view of `GoalsContext.active_goals.filter(g => g.category === "fitness")`, up to 2 visible + "+N more"
3. **Today's summary card** — cal burned · steps · active min · last workout ("Chest/Triceps — 3h ago"). Tap → Day Detail (§9)
4. **7 subsystem cards stacked** in order: **Plan · Strength · Cardio · Body · Movement · Sleep · Recovery**. Each card = subsystem name + subsystem score + tiny inline chart + quick-action button (varies). Tap anywhere on card → full-screen detail view (§6b)
5. **Fitness FAB shortcuts**: Log Workout · Log Weight · Log Freestyle Workout (per §4.7.5)

### 6(b) Each subsystem detail — tap-through full-screen

All screens are new. Route: `/fitness/subsystem/[key]`. Header: back button + subsystem name + overflow (info, edit). Per §4.3 detail spec.

- **Body** ([fitness/subsystem/body.tsx](../../mobile/app/fitness/subsystem/body.tsx)) — Large weight trend chart (reusing [WeightTrendCard.tsx](../../mobile/components/apex/WeightTrendCard.tsx)) + body-comp stats table (weight, BMI, BF% if entered, LBM) + goal-pace line overlay showing target weight trajectory + edit buttons
- **Strength** ([fitness/subsystem/strength.tsx](../../mobile/app/fitness/subsystem/strength.tsx)) — "Mini-Strava feel" per founder note. PR sparkline per lift (bench / squat / deadlift / OHP pulled from recent workout_logs parses) + weekly volume trend (7d trailing bar chart) + "Recent sessions" list with tap-drill-through to session detail (reuses [WorkoutEditSheet.tsx](../../mobile/components/apex/WorkoutEditSheet.tsx))
- **Cardio** ([fitness/subsystem/cardio.tsx](../../mobile/app/fitness/subsystem/cardio.tsx)) — Total cardio minutes trend (7/30/90d toggle) + activity list (runs, bikes, rows parsed from workout_logs) + per-session drill-through with map placeholder. HR zones section with "Connect Apple Health for HR data" CTA until HK wired
- **Movement** ([fitness/subsystem/movement.tsx](../../mobile/app/fitness/subsystem/movement.tsx)) — Steps trend chart + NEAT breakdown card (RMR · NEAT · TEF · EAT stacked with computed values from [shared/src/logic/neat.ts](../../shared/src/logic/neat.ts)) + active-min meter
- **Sleep** ([fitness/subsystem/sleep.tsx](../../mobile/app/fitness/subsystem/sleep.tsx)) — Empty state with HealthKit CTA: "Connect Apple Health to activate Sleep" + bullet points of what the subsystem will show once connected. Category weight redistributes away from sleep on scoring until wired
- **Recovery** ([fitness/subsystem/recovery.tsx](../../mobile/app/fitness/subsystem/recovery.tsx)) — Same HealthKit empty-state pattern
- **Plan** ([fitness/subsystem/plan.tsx](../../mobile/app/fitness/subsystem/plan.tsx)) — Current plan week-view · today's session card (tap → launch Strength Tracker for template) · "Edit Plan" / "Regenerate Plan" (Sonnet call per §10.3.9, quota Core 1/30d Pro 3/30d) / "Revise Plan" (Sonnet, Core 3/plan Pro 10/plan) · Plan Adherence chart (session-by-session completion rate over last 8 weeks, rest days excluded from denominator)

Each detail screen has its own **back button at top-left** + **optional minimize button** (top-right chevron-down) that keeps the screen in a stack when user jumps to FAB chatbot. Matches `WorkoutActiveBanner` pattern already in place.

### 6(c) Strength Workout Tracker modal

Already built ([StrengthTrackerModal.tsx](../../mobile/components/apex/StrengthTrackerModal.tsx) + [WorkoutActiveBanner.tsx](../../mobile/components/apex/WorkoutActiveBanner.tsx) + [useStrengthSession.tsx](../../mobile/lib/useStrengthSession.tsx)). Minimize/restore works per last user feedback.

### 6(d) Fitness Progress sub-tab

Per §4.3.2 Progress tab. Top to bottom:

1. **Scale toggle** (7D / 30D / 90D / All-time) applying to all charts below
2. **Activity Calendar** — already built ([ActivityCalendar.tsx](../../mobile/components/apex/ActivityCalendar.tsx))
3. **Weight trend chart**
4. **Strength volume trend** (weekly total lifted)
5. **Cardio volume trend** (weekly min)
6. **Steps trend**
7. **Sleep duration trend** (if connected; else hidden)
8. **HRV trend** (if connected; else hidden)

Each chart: tap a data point → Day Detail for that date (§9).

### 6(e) Fitness History sub-tab

Chronological list of logged workouts + weight entries + body measurements. Filter chips: `All | Workouts | Weight`. Date-range picker. Infinite scroll, 30-day chunks. Tap an entry → workout edit sheet ([WorkoutEditSheet.tsx](../../mobile/components/apex/WorkoutEditSheet.tsx)) or body stats modal.

---

## Section 7 — Nutrition tab reorganization

Current state ([mobile/app/(tabs)/nutrition.tsx](../../mobile/app/(tabs)/nutrition.tsx)): Today/History/Progress sub-tabs exist. PRD §4.4 confirms this structure.

### 7(a) Nutrition Today

Top to bottom (ordered for BLUF — answer "what can I eat right now?" on first scan):

1. **Nutrition Score hero** (new) — 0–100 + 7-day sparkline + band indicator
2. **Calorie Ring** ([CalorieRingCard.tsx](../../mobile/components/apex/CalorieRingCard.tsx)) — dominant visual anchor
3. **Macros/Micros card** ([NutritionMacrosCard.tsx](../../mobile/components/apex/NutritionMacrosCard.tsx)) — consolidated (protein/carbs/fat bars + secondary sugar/fiber/sodium sub-bars)
4. **Hydration widget** (new, opt-in) — only if user activated; "+8 / +16 / +24 oz" buttons, water goal bar
5. **Recent Meals chip strip** ([RecentMealsChips.tsx](../../mobile/components/apex/RecentMealsChips.tsx)) — quick re-log with time-of-day sort (§1 row 4 delta)
6. **Log a Meal card** ([LogMealCard.tsx](../../mobile/components/apex/LogMealCard.tsx)) — tab interface: Manual · Photo · Barcode · Saved · Pantry
7. **Today's meals list** ([TodayMealsList.tsx](../../mobile/components/apex/TodayMealsList.tsx)) — tap for meal detail
8. **Nutrition FAB shortcuts** per §4.7.5: Log Meal · Scan Meal · Barcode · Saved Meals · Log Water (if hydration active) · Pantry Scan (Pro)

### 7(b) Nutrition Progress

1. **Scale toggle** 7D / 30D / 90D / All-time
2. **Daily Calorie Balance chart** ([CalorieBalanceChart.tsx](../../mobile/components/apex/CalorieBalanceChart.tsx), renamed — currently titled "deficit/surplus")
3. **Calories Consumed chart** ([CaloriesConsumedChart.tsx](../../mobile/components/apex/CaloriesConsumedChart.tsx)) with target overlay
4. **Macro trend charts** ([MacroTrendsCard.tsx](../../mobile/components/apex/MacroTrendsCard.tsx)) — toggle between protein / carbs / fat, single chart

Tap data point → Day Detail.

### 7(c) Nutrition History

Chronological meals grouped by date with day summary pill ("2140 cal · 142P / 201C / 76F") at each date header. Reuses [MealHistoryList.tsx](../../mobile/components/apex/MealHistoryList.tsx).

### 7(d) Modals reachable from Today

- [MealDetailModal.tsx](../../mobile/components/apex/MealDetailModal.tsx) — from Today meals list or History
- [MealPhotoScanner.tsx](../../mobile/components/apex/MealPhotoScanner.tsx) — from Scan Meal shortcut
- [BarcodeScanner.tsx](../../mobile/components/apex/BarcodeScanner.tsx) — from Barcode shortcut
- [PantryScanner.tsx](../../mobile/components/apex/PantryScanner.tsx) — from Pantry shortcut (Pro gate)
- [SavedMealsPicker.tsx](../../mobile/components/apex/SavedMealsPicker.tsx) — from Saved Meals shortcut
- [MealEditSheet.tsx](../../mobile/components/apex/MealEditSheet.tsx) — from any meal entry

All already built; no new components needed.

---

## Section 8 — Profile / Settings hierarchy

Current state ([mobile/app/settings/](../../mobile/app/settings/)): 14 screens. Most partial. PRD §4.8 specifies sectional direct-edit replacing onboarding re-do.

### 8(a) Settings main screen list

[mobile/app/settings/index.tsx](../../mobile/app/settings/index.tsx) sections per §4.8.3:

- Profile (opens submenu)
- Subscription
- Connections
- Privacy
- Notifications
- App preferences
- Security
- Data & Account
- Support & About

### 8(b) Status per sub-screen

| Sub-screen | Path | Status | Gap to close |
|---|---|---|---|
| Profile — Body Stats | [settings/profile/body-stats.tsx](../../mobile/app/settings/profile/body-stats.tsx) | **REAL** — weight, height, age, sex, BF%; deterministic RMR/TDEE/macros recompute on save | None |
| Profile — Daily Life | [settings/profile/daily-life.tsx](../../mobile/app/settings/profile/daily-life.tsx) | **REAL** — occupation, work style, stress; deterministic NEAT recompute | None |
| Profile — Diet Preferences | [settings/profile/diet.tsx](../../mobile/app/settings/profile/diet.tsx) | **REAL** — flags `profile_map_out_of_sync` per §4.8.4 | Verify flag is being set on Flask side |
| Profile — Macro Targets | [settings/profile/macros.tsx](../../mobile/app/settings/profile/macros.tsx) + [MacrosForm.tsx](../../mobile/components/apex/MacrosForm.tsx) | **REAL** — slider overrides, deficit slider, time-to-goal projection | None |
| Profile — Advanced | Missing | **TO BUILD** — calorie rollover toggle + auto-adjust toggle + RMR override with lock | S (1h) — toggles persist to `user_goals` flags |
| Profile — Regenerate AI Profile Map | [settings/profile/regenerate.tsx](../../mobile/app/settings/profile/regenerate.tsx) + [RegenerateAiProfileCard.tsx](../../mobile/components/apex/RegenerateAiProfileCard.tsx) | **REAL** — explicit standalone action with confirm modal | None |
| Subscription | [settings/subscription.tsx](../../mobile/app/settings/subscription.tsx) | **STUB** — stays stub until RevenueCat wired | Keep "Free trial mode" badge; "Manage subscription" button does nothing |
| Connections | [settings/connections.tsx](../../mobile/app/settings/connections.tsx) | **PARTIAL** — Gmail connection real, 11 others stub cards | **PHASE-4-DEFERRED** for HK/Plaid/Calendar/Outlook. Stubs now show "Coming soon" unified state |
| Privacy | [settings/privacy.tsx](../../mobile/app/settings/privacy.tsx) | **PARTIAL** — per-source AI consent toggles; Chatbot Audit missing | ADD: Chatbot Audit screen (§4g) — list last 30d of queries + container summary + delete action + export |
| Notifications | [settings/notifications.tsx](../../mobile/app/settings/notifications.tsx) | **PARTIAL** — aggressiveness dial + category toggles + quiet hours (persist to prefs) | **PHASE-4-DEFERRED** — backend push pipeline |
| App Preferences — Theme | [settings/preferences.tsx](../../mobile/app/settings/preferences.tsx) | **REAL** — dark/light/auto | None |
| App Preferences — Units | Same | **REAL** — auto-detect + override via [useUnits.ts](../../mobile/lib/useUnits.ts) | None |
| App Preferences — Language | Same | **REAL** — EN/ES only per [preferences.ts](../../mobile/lib/preferences.ts:5-7) | None |
| App Preferences — Haptics | Same | **REAL** — [useHaptics.ts](../../mobile/lib/useHaptics.ts) | None |
| Security | [settings/security.tsx](../../mobile/app/settings/security.tsx) | **PARTIAL** — biometric lock via `expo-local-authentication`; app lock; change password via Clerk user-portal; sign-out-all via Clerk `user.getSessions()` revoke | None; maybe wire passkey once Clerk supports |
| Data & Account — Export | Missing / stub in [settings/account.tsx](../../mobile/app/settings/account.tsx) | **STUB** — "Export coming in backend migration" | **PHASE-4-DEFERRED** |
| Data & Account — Sign Out | Same | **REAL** — Clerk signOut | None |
| Data & Account — Delete Account | Same | **REAL** — Clerk + Flask cascade via `POST /api/delete-account` | Add 30-day grace period per §4.11.9 — **PHASE-4-DEFERRED** |
| Support — FAQ | [settings/faq.tsx](../../mobile/app/settings/faq.tsx) | **REAL** — 10 expand-on-tap cards | None |
| Support — Contact | [settings/support.tsx](../../mobile/app/settings/support.tsx) | **REAL** — `expo-mail-composer` | None |
| Support — Feedback | Same | **REAL** — opens Anthropic feedback form or mail-composer | None |
| Support — Rate + What's New | Missing | **STUB** | S (30m) — deep-link to App Store review + empty "What's New" screen |
| Support — ToS / Privacy Policy / OSS Licenses | Missing | **STUB** | Need URLs once legal docs drafted — **FOUNDER ACTION ITEM** |

### 8(c) Regenerate AI Profile Map flow — verify

Per §4.8.4: "Regenerate AI Profile Map" is the **only** AI-firing action in Settings. Confirms all other profile edits (Body Stats, Daily Life, Diet, Advanced, Macros) are **deterministic-only** recompute paths with no AI call. Verified in [MacrosForm.tsx](../../mobile/components/apex/MacrosForm.tsx) — goal update uses `compute_targets()` from [goal_config.py](../../goal_config.py), not AI.

---

## Section 9 — Day Summary / Day Detail screen

Per §4.2a. New screen (currently [mobile/app/day/[date].tsx](../../mobile/app/day/[date].tsx) is a placeholder).

**Entry points:** Streak Bar dot tap · Activity Calendar cell tap · Weight-trend chart point tap · Calorie Balance chart point tap · any history list date header · Day Timeline block tap (deferred) · Chatbot deep-link when user asks "show me Tuesday" (deferred).

**Layout per §4.2a.3:**

1. **Header** — back button + date title ("Tuesday, April 16" or full year for past years) + day-of-streak chip ("Day 7 of current streak") + prev/next day arrows (swipe or tap)
2. **Summary stat grid** — fixed-height 2×3. Row 1: Weight · Calories (eaten/target) · Steps. Row 2: Deficit (burn − eaten) · Spending · Sleep (hours + quality)
   - Empty metrics show "—" (not 0) but remain tappable
   - Tap any cell → corresponding subsystem detail view for that date
3. **Category sections** (scrollable, collapsible, collapsed by default):
   - **Fitness** — workouts logged (with exercise detail, volume, duration), body metrics, PRs detected, plan adherence
   - **Nutrition** — meals with expand-on-tap, macros actual vs target, hydration, rollover/auto-adjust events
   - **Finance** — stub "Connect your bank to activate Finance" (v1)
   - **Time** — stub "Connect calendar + email to activate Time" (v1)
   - **Goals** — per-goal progress delta for this day
   - **Day Timeline** — stub pending Time-tab work
4. **"+ Add for this date" FAB** — separate from global FAB. Actions: Log Meal / Log Workout / Log Weight / Add Transaction / Add Task — each pre-fills the date picker to the viewed date

**Empty-state rules (§4.2a.4):**

- No data: all "—", collapsed summaries ("No activity logged"), "+ Add" prominently surfaced
- Pre-signup date: muted note "You joined Life Dashboard on [date]"; no sections, no add
- Archived date (Core > 90d): summary only + "Archived — upgrade to Pro for full details"
- Future date: calendar events + scheduled tasks only; no logging allowed

**Data source.** Already-existing `GET /api/day/{date}` returns meals + workouts + totals. Extend to include day-scoped score breakdown once §3 endpoints land. No new Flask endpoint needed in base build.

**Performance targets (§4.2a.5).** Today load <200ms from cache, any hot-window day <500ms. Prefetch next day when user lingers >1s.

---

## Section 10 — Proposed execution phasing

Each phase = one CC session (60–120 min) ending in a commit. Phases are independently mergeable against current master. Prereq arrows indicate hard dependencies.

### Phase 1 — Flask scoring endpoints (P1)

- **Prereqs:** founder decisions on OQ-1, OQ-2, OQ-3 below
- **Deliverables:** `/api/score/overall|fitness|nutrition` live and returning §9-compliant envelopes; `/api/score/finance|time` return proper stub envelopes; new `daily_scores` table + nightly cron scheduled; shared `shared/src/logic/scoring/*` TypeScript modules; jest tests covering 12+ worked examples from §9.5 and §9.10
- **Hours:** 4–5 (large — backend + shared + tests)
- **Risks:** Signal data availability for Strength volume (requires workout_logs parsing enhancement); macro-distribution weighting math needs sanity tests; caching invalidation keys
- **Founder decisions mid-phase:** none if OQs resolved pre-phase
- **Commit:** `feat(scoring): PRD §9 scoring engine endpoints + shared logic + nightly cron`

### Phase 2 — Shared types + mobile scoring hooks + Home score surfaces

- **Prereqs:** Phase 1
- **Deliverables:** [shared/src/types/score.ts](../../shared/src/types/score.ts); new [mobile/lib/api/score.ts](../../mobile/lib/api/score.ts) fetcher; new [mobile/lib/hooks/useScores.ts](../../mobile/lib/hooks/useScores.ts); Home renders Overall Score hero + 4 category score cards + band indicators + calibrating pill + "Fitness + Nutrition" contributing label
- **Hours:** 2–3
- **Risks:** Sparkline needs 7 days of `daily_scores` rows — empty until nightly cron runs once. Ship with last-7-days-or-empty pattern
- **Commit:** `feat(home): Overall Score hero + category score cards wired to /api/score`

### Phase 3 — Home tab reorganization (card consolidation + BLUF)

- **Prereqs:** Phase 2
- **Deliverables:** Home layout per §5(a); retire `SubsystemsCard` from Home (preserved in Fitness); retire standalone steps/weight/cals-burned/cals-consumed/macro-grid cards from Home; pull-to-refresh; category accents applied subtly per §5(c); FAB now opens chatbot overlay (shell only if Phase 4 not done yet — shows shortcut buttons only)
- **Hours:** 2
- **Risks:** FAB wiring to chatbot overlay has a dependency — if Phase 4 not done, FAB should still show shortcuts and a disabled chat input with tooltip "Chat coming in the next release"
- **Commit:** `feat(home): PRD §4.2.2 reorganized home — Overall first, 4 category cards, shortcut consolidation`

### Phase 4 — Chatbot base (overlay + pipeline + Flask endpoint + audit log)

- **Prereqs:** none (can run parallel to 1–3)
- **Deliverables:** [ChatOverlay.tsx](../../mobile/components/chat/ChatOverlay.tsx) + input + bubble + shortcut rail + classifier + `POST /api/chatbot/query` Flask endpoint + SSE streaming + 9 context containers (ProfileContext + GoalsContext + Nutrition + Fitness loaded for real; Finance + Life loaded as `null`-valued placeholders; Historical + Patterns + DayTimeline loaded as stubs); quota middleware (Core 10/day, Pro 50/day); `chatbot_audit` table + nightly retention purge; redaction layer; Chatbot Audit screen in Settings → Privacy
- **Hours:** 6–8 (largest phase)
- **Risks:** SSE through Flask may need threading/async tweaks; prompt injection safety; Haiku token-budget enforcement under load; classifier false-positive rate on logging intents
- **Founder decisions mid-phase:** OQ-5 below (chatbot quota reset at local midnight vs UTC); confirm redaction rules are strict enough (merchant → category, amount → dollar, location → place name, email body → 200ch)
- **Commit:** `feat(chatbot): base shell + /api/chatbot/query + 9 containers + audit log (§4.7)`

### Phase 5 — Fitness tab reorganization + 4 subsystem detail screens (no HealthKit)

- **Prereqs:** Phase 2 (Fitness score endpoint)
- **Deliverables:** Fitness Today reorders to §6(a); Body / Strength / Cardio / Movement detail screens built; Plan detail screen built with existing plan-gen endpoints (wired to Sonnet this phase per §1 row 9); Fitness History sub-tab gets filter chips + date-range picker
- **Hours:** 5–6
- **Risks:** Strength PR detection requires parsing workout_logs descriptions — may need a `POST /api/workouts/detect-prs` Flask helper; plan persistence from localStorage → server requires new `user_plans` table
- **Commit:** `feat(fitness): subsystem detail screens (Body/Strength/Cardio/Movement/Plan) + history filters`

### Phase 6 — Fitness HealthKit-dependent subsystems with empty states (Sleep + Recovery)

- **Prereqs:** Phase 5
- **Deliverables:** Sleep + Recovery subsystem detail screens with "Connect Apple Health to activate" empty state; HealthKit connection scaffolding in [settings/connections.tsx](../../mobile/app/settings/connections.tsx) (not full sync — just OAuth + permission request per Apple guidelines); score engine redistributes weights correctly when these subsystems lack data
- **Hours:** 2–3 (mostly scaffolding; full HK wiring is a separate later phase)
- **Risks:** iOS-specific code paths; Android Health Connect is separate; testing requires physical device or HealthKit simulator data
- **Commit:** `feat(fitness): Sleep + Recovery empty states + HealthKit permission scaffolding`

### Phase 7 — Nutrition tab reorganization + Progress charts + hydration

- **Prereqs:** Phase 2 (Nutrition score endpoint)
- **Deliverables:** Nutrition Today reorders to §7(a); Nutrition Score hero + calibrating pill; hydration widget (toggle in settings + opt-in display + `POST /api/log-water` + hydration signal into scoring); Nutrition Progress gets scale toggle + 3 charts wired to existing `/api/charts/*`; Nutrition History gets day-summary pills on date headers
- **Hours:** 2–3
- **Risks:** hydration signal weight (5) redistributes when off — needs test coverage
- **Commit:** `feat(nutrition): PRD §4.4 reorg + Nutrition Score + hydration opt-in`

### Phase 8 — Nutrition scanners full wiring (photo tier split + barcode AI fallback + pantry quota)

- **Prereqs:** none (can run parallel)
- **Deliverables:** Meal photo scanner split into standard (Sonnet) + premium (Opus, Pro gate) in Flask; mobile adds Premium Scan toggle; barcode scanner falls through to AI on OFF 404 via new `POST /api/barcode/lookup-ai`; pantry scanner gets 10/day daily-cap check (Pro-gated)
- **Hours:** 2
- **Risks:** Opus cost accounting; Pro gate stub must default to "allowed" during dev
- **Commit:** `feat(nutrition): meal scan tier split (Sonnet/Opus) + pantry quota + barcode AI fallback`

### Phase 9 — Profile / Settings sectional editing deltas

- **Prereqs:** Phase 2 (for score context)
- **Deliverables:** Profile → Advanced screen (rollover + auto-adjust + RMR override + lock); verify `profile_map_out_of_sync` flag set by Diet edits in Flask; Rate + What's New stubs; legal-docs stub URLs; Connections screen unified stub layout for all 12 integrations; Notifications screen persists prefs (even though push pipeline is Phase 4 out of scope)
- **Hours:** 2–3
- **Risks:** none material
- **Commit:** `feat(settings): Profile Advanced + Rate + legal stubs + Connections unified state`

### Phase 10 — Day Detail cross-category wiring

- **Prereqs:** Phase 2 + Phase 5 + Phase 7
- **Deliverables:** Full Day Detail screen per §9 with Fitness + Nutrition sections real, Finance + Time stubbed; prev/next swipe; add-for-this-date FAB; edit-entry tap-through; Streak Bar + Activity Calendar + chart data points all route to Day Detail with correct date
- **Hours:** 3
- **Risks:** date-boundary edge cases (pre-signup / archived / future); prefetch-next-day needs careful memoization
- **Commit:** `feat(home): Day Detail cross-category drill-in (§4.2a)`

### Phase 11 — Polish pass

- **Prereqs:** Phases 1–10
- **Deliverables:** Category accents refined across all surfaces; loading skeletons consistent (replace spinners on cards with skeletons); empty states refined per PRD voice ("plain and low-pressure" §4.2.8); accessibility labels added (VoiceOver on stat grid cells, collapsible headers); analytics events per §4.2.13 / §4.3.18 / §4.4.20 wired; golden-test pass on the §9 worked examples
- **Hours:** 3–4
- **Risks:** accessibility + analytics tend to balloon; cap the phase at 4h and defer remaining to a follow-up
- **Commit:** `polish: v1 home/fitness/nutrition — accents, skeletons, a11y, analytics`

### Phasing summary

| Phase | Deliverable | Hours | Prereqs |
|---|---|---|---|
| 1 | Flask scoring endpoints | 4–5 | OQ resolutions |
| 2 | Scoring mobile hooks + Home score surfaces | 2–3 | P1 |
| 3 | Home tab reorganization | 2 | P2 |
| 4 | Chatbot base | 6–8 | — |
| 5 | Fitness subsystem screens (4 real + Plan) | 5–6 | P2 |
| 6 | Fitness Sleep/Recovery empty states + HK scaffolding | 2–3 | P5 |
| 7 | Nutrition reorg + Progress + hydration | 2–3 | P2 |
| 8 | Nutrition scanners tier split | 2 | — |
| 9 | Settings deltas | 2–3 | — |
| 10 | Day Detail | 3 | P2, P5, P7 |
| 11 | Polish | 3–4 | 1–10 |
| **Total** | | **33–42h** |

Plus ~10h buffer for unknowns / merge friction → **~45 CC session hours** across ~10 working sessions.

---

## Section 11 — Out of scope for this build cycle

Explicitly deferred. Features are in PRD v1 scope but blocked on dependencies this plan does not attempt to resolve.

- **Finance category (§4.5)** — Plaid integration required. Blocked on Plaid production approval + RevenueCat + backend rewrite of Finance domain. Home Finance card shows empty-state CTA; `/api/score/finance` returns `null`; Day Detail Finance section stubbed
- **Time tab (§4.6)** — HealthKit + Family Controls + CoreLocation + Calendar + Outlook all required. Blocked on integration approvals (Apple Family Controls entitlement; Google CASA Tier 2 for Gmail production; Microsoft Graph). Home Life card stubbed
- **Day Timeline (§4.6.5)** — depends on Time tab work + location signals + screen time
- **Full 22-goal library (§4.10)** — library picker + per-goal detail + auto-restart + celebration social card + completion signals for notifications. Home goal strip uses the existing single calorie goal as interim display. No `goal_templates` table yet
- **Notifications backend (§4.9)** — signal pool + rules layer + AI evaluator/composer + push infrastructure + deep-link router. Settings surface persists prefs but does not schedule notifications. Critical signals don't fire
- **Data export (§4.11)** — CSV async worker + email delivery + 30-day deletion grace period + restore flow
- **Chatbot beyond base (§4.7 signal pool growth)** — base shell ships; deeper context (DayTimeline, Patterns, HealthKit-derived Fitness signals) fills in as those subsystems come online
- **Biometric enrollment (§4.1.3)** — stub remains; full flow requires platform-specific conditional logic
- **Paywall enforcement (§4.1.9)** — stub counter remains; real paywall requires RevenueCat product config + trial mechanics
- **Subscription / billing flow (§4.8.5, §13.5)** — RevenueCat dashboard setup + StoreKit / Play Billing integration + Apple Developer / Play Console enrollment
- **Strava / Outlook / Apple EventKit / MS Graph** — downstream of Time + Finance

---

## Section 12 — Founder action items

Outside of code — only founder can do these. Rough deadlines per PRD §11 launch floor.

| Item | PRD ref | Deadline target | Status |
|---|---|---|---|
| **Apple Developer Program enrollment ($99/yr)** | §1.7, §11 | ~week 8 for TestFlight | Not started |
| **Google Play Console ($25 one-time)** | §1.7 | ~week 10–12 | Not started |
| **RevenueCat account setup** (free tier to start) | §4.8.5, §13.5 | Before paywall build | Not started |
| **Plaid production approval** | §8, §4.5.4 | Before Finance phase starts | Not started |
| **Apple Family Controls entitlement approval** | §4.6.10, §11 | Before Time Screen Time subsystem | Not started |
| **Google OAuth CASA Tier 2 verification** | §4.6.8 | Before Gmail production launch | Not started — using dev OAuth now |
| **Microsoft Graph app registration** | §4.6.7, §4.6.8 | Before Outlook support | Not started |
| **WeatherKit setup** (Apple Developer required) | §4.2.2 | With Phase 3 Home | Can start immediately after Apple Developer enrollment |
| **OpenWeatherMap API key (free tier)** | §4.2.2 | Same | Not started |
| **Privacy Policy draft** | §4.8.12 | Before TestFlight | Not drafted |
| **Terms of Service draft** | §4.8.12 | Same | Not drafted |
| **Open-source licenses aggregation** | §4.8.12 | Before TestFlight | Can auto-generate from package.json |
| **Domain purchase for marketing site** | §11 | Pre-launch | Not purchased |
| **App Store screenshots + metadata** | App Store / Play Store | Before TestFlight submission | Not started |
| **Anthropic API production key + billing alerts** | §10.8 | Before public chatbot | Currently using dev key |
| **Clerk production environment + custom domain** | §4.1.2, §7.8 | Before TestFlight | Currently dev env |

---

## Section 13 — Open questions for founder review

Things surfaced during this audit that I cannot resolve from reading the PRD alone. Decisions needed before the relevant phase starts.

### OQ-1 — Score endpoint envelope lock

**Question.** The PRD §9.4 pseudocode returns `raw_deltas` alongside the score. I've specified an envelope with `score | band | reason | raw_deltas | calibrating | sparkline_7d` for all five `/api/score/*` endpoints, with Fitness adding `subsystems: {...}` and Overall adding `contributing: [...]` + `weights: {...}`. Is this envelope acceptable as the stable v1 contract, or do you want additional fields (e.g., `explain_text`, `trend_delta`, `week_snapshot`)?

**Blocks:** Phase 1 start.

### OQ-2 — Overall Score weights default and editability

**Question.** PRD §9.11.2 defaults weights to 25/25/25/25. Do we ship weights as user-editable in v1 (Settings → Overall Score Weights per §4.2.2) or ship fixed at 25% each and make editability a v1.1 delta? Editing implies a new `user_settings.category_weights` column and the Settings screen + validation that weights sum to 100 and each is in [5, 55]. Not trivial to do alongside Phase 1 but not hard.

**Blocks:** Phase 2 UI work on Overall Score display.

### OQ-3 — Strength signal data source

**Question.** Strength weekly volume needs a reliable `volume_lbs = Σ sets × reps × weight` per workout. Flask's `workout_logs.description` is free-text. Three options: (a) parse description on read (every call; cache in scoring); (b) add `strength_volume_lbs` column, compute at log time, backfill with parser; (c) add parsing server-side helper `POST /api/workouts/detect-prs` that mobile calls after each strength log to fill a new `strength_sets` table. Option (b) is cheapest for scoring latency; (c) is richest for PR detection. Which direction?

**Blocks:** Phase 5.

### OQ-4 — Home category color accents level

**Question.** Per §5(b) unclear-items. Do you want (a) a 2pt category-color top border on each category score card, (b) just the small colored category chip with no border, or (c) both (b) plus card background tint of 4% opacity in category color? PRD §4.2.9 says "subtle but present"; this resolves interpretation.

**Blocks:** Phase 3 visual polish.

### OQ-5 — Chatbot quota reset boundary

**Question.** PRD §4.7.16 says "resets at midnight user-local time." We have `X-Client-Date` + `X-Client-Timezone` headers available. Confirm: reset boundary is midnight-of-client-timezone as the client reports it, not a server-side UTC boundary. This matters because if a user crosses time zones, their quota behavior shifts; we need to decide whether to trust the client tz or server-pin to the onboarding-declared tz.

**Blocks:** Phase 4.

### OQ-6 — Interim tier during pre-RevenueCat dev

**Question.** Until RevenueCat is wired, every logged-in user is treated as what — Core (conservative default) or Pro (so we can test premium features internally)? Current codebase has no tier logic at all. I've specified Pro as the `EXPO_PUBLIC_DEV_TIER_OVERRIDE` default because we need to exercise Pro quotas in testing, but it's a user-visible decision when internal builds hit TestFlight.

**Blocks:** Phase 4 (chatbot quota) and Phase 8 (Pantry Scanner Pro gate).

### OQ-7 — Goal strip rendering with only 1 goal

**Question.** §5(a) item 4 renders the active-goal strip using whatever's in `user_goals`. Today that's 0–1 goal (the calorie preset). PRD §4.2.2 goal-strip display rules say "1 goal → single card full-width with ~170pt padding." Is that still the right treatment when there's only ever 1 card, or should we hide the strip entirely until the 22-goal library lands and multiple goals become possible?

**Blocks:** Phase 3.

### OQ-8 — Plan subsystem persistence table

**Question.** Training plans currently live in localStorage in Flask and in mobile AsyncStorage. §4.3.10 requires persistent plan across devices + Plan Adherence scoring signal. Proposed: new table `user_plans(user_id, plan_json, active, created_at, updated_at)`. Plan Adherence signal reads scheduled-days vs completed-workouts from `workout_logs`. OK to introduce this table in Phase 5, or defer to later?

**Blocks:** Phase 5 Plan subsystem detail screen.

### OQ-9 — Hydration data source + scoring weight

**Question.** §4.4.12 specifies hydration as opt-in silent default. Storage: new `hydration_logs(user_id, log_date, oz, logged_at)` table or a single `daily_activity.water_oz` column? Signal weight is 5/100 in Nutrition when active, 0 when off — confirm weights redistribute correctly to the other 4 Nutrition signals when hydration is off (they should, per §9.7.1, but worth explicit confirmation).

**Blocks:** Phase 7.

### OQ-10 — Chatbot redaction auditability

**Question.** §4.7.15 says "The user can see what was sent." The `chatbot_audit` schema captures `containers_loaded` + `containers_skipped` + the redacted query payload. Do we also store the **actual redacted container values** that were sent (expensive — ~3-8KB per row × 30d retention × N users could grow fast), or only the container names? Tradeoff: full value storage enables true "what was sent" transparency but scales poorly; names-only is lighter but users can't see e.g. "I sent grocery=$47, food=$32" for this specific query.

**Blocks:** Phase 4 audit log design.

---

**End of BUILD_PLAN_v1.md.**
