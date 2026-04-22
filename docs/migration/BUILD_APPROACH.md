# APEX Life Dashboard — Build Approach

**Purpose.** This document governs every build decision from this point forward. It resolves the ambiguity that exists because Life Dashboard has *two* reference documents: the Flask PWA (what we already built and have running with 3 users) and [APEX_PRD_Final.md](APEX_PRD_Final.md) v1.0 (what we're shipping). Those two documents agree on some things, diverge on others, and conflict on a few. This document is the tiebreaker.

**Reflects PRD doc revision v1.27 (2026-04-22).** The Resolved Open Questions section below reflects decisions locked in v1.27 (unified goal system, sectional direct-edit settings, deterministic 3-signal email classifier, and three doc-bug reconciliations). If the PRD advances past v1.27, re-check the guidance here against the PRD change log before relying on it.

If you are Claude Code, a future engineer, or the founder reading this later: read this document first. If its guidance contradicts an older migration document ([MIGRATION_PLAN.md](MIGRATION_PLAN.md) in particular), this document wins.

---

## The Rule Set

### Rule 1 — PRD v1.0 is the ship target

The ship target is Life Dashboard v1.0 as documented in [APEX_PRD_Final.md](APEX_PRD_Final.md). The Flask PWA is **not** the ship target. The Flask PWA is running code serving three users today; it is a stepping stone, not the destination.

Every feature shipped in the React Native app must trace back to a PRD requirement. Features that exist in Flask but not the PRD are not automatically in scope (see Rule 5).

### Rule 2 — Flask is the functional and rough-visual reference

For any feature that exists in *both* Flask and PRD v1.0, the Flask implementation is the starting point — both for **what it does** and roughly for **how it feels to the user**. Don't redesign from scratch what's already been user-tested in Flask if the PRD confirms that behavior survives.

Concrete examples:
- Meal logging with text + AI macro estimation (PRD §4.4.4) — same flow as Flask's `/api/estimate` + `/api/log-meal`, adapted to mobile.
- Barcode scanner (PRD §4.4.6) — same Open Food Facts lookup Flask uses client-side.
- Weight projection math (PRD §4.1.5 +  BUSINESS_LOGIC.md §8) — same 3500-kcal-per-lb formula Flask uses.
- Goal-based calorie/macro targets (PRD §4.1.5 + BUSINESS_LOGIC.md §5) — same `compute_targets` math, already ported to [shared/src/logic/targets.ts](../../shared/src/logic/targets.ts).

### Rule 3 — React Native standards govern visual polish

Visual execution follows platform conventions: **iOS Human Interface Guidelines on iOS, Material Design on Android**. Do **not** port Flask CSS pixel values, font sizes, or exact pixel-level layouts. Flask was built as a web PWA with bespoke design; native apps have different norms.

Keep the **conceptual layout** similar where Flask's choices make sense (e.g., Home → category cards → detail view; meal/workout forms; bottom tab nav). Let platform conventions drive spacing, typography, elevation, haptics, and component specifics (native pickers over HTML selects, UIKit/MD buttons over CSS buttons, native list virtualization, etc.).

### Rule 4 — PRD governs architecture

Data storage, schema, scoring math, AI call inventory, AI call costs, model selection, privacy posture, integrations list, tier structure, quota limits — all follow the PRD, not Flask. When Flask's implementation contradicts the PRD, **PRD wins**. Examples of this conflict direction:

| Flask says | PRD says | Winner |
|---|---|---|
| SQLite (`life_dashboard.db`) | Neon/Postgres (§5.5, §11.6) | PRD |
| Single-user Garmin via scraped `garminconnect` library | Per-user Garmin via official Health API (§8.9) | PRD |
| 10 languages via `static/i18n.js` | English + Spanish at launch (§14.14) | PRD |
| 4-component momentum score (nutrition/macros/activity/tasks, weights 40/25/25/10) | 4 category scores + 1 Overall Score, 5-signal Time Score, 7-subsystem Fitness (§9.10–§9.11) | PRD |
| Username-based auth (`users.username`) | Email-based auth via Clerk (§4.1.2 + §7.8) | PRD |
| No billing — free for everyone | 14-day Pro trial → force-choice at Core $4.99 or Pro $9.99 (§13.4) | PRD |
| Opus for all meal photo scans | Sonnet (Core) / Opus (Pro-gated Premium Scan, 10/day) (§10.2 row 2+3) | PRD |
| Per-email learned sender/domain importance | Deterministic 3-signal classifier (§4.6.8) | PRD |
| No push notifications (client-side `setTimeout` only) | Full notification system with AI evaluator + composer (§4.9) | PRD |
| Descriptive AI momentum insight that auto-renders | Prescriptive AI banned everywhere except the opt-in Notifications surface (§3.2) | PRD |

### Rule 5 — Scope cuts follow the PRD

Anything Flask has that the PRD explicitly cuts **stays cut**. No feature smuggling. Examples already identified:

- `i18n.js` 10-language coverage — deferred (PRD ships English + Spanish only in v1; §14.14 and §15.2).
- Username-based auth — deprecated; Flask users migrate to email-based accounts (§4.1.2 explicit).
- AI-generated momentum insight prose ("Pattern Insight", `generate_momentum_insight`) — prohibited unless user-invoked (§3.2, §10.2).
- AI scale summary prose (`generate_scale_summary`) — same treatment as above.
- Archetype classification from onboarding — removed in PRD v1.18 (§10.2, "Removed from prior drafts").
- Mood / morning / evening check-ins — already dormant in Flask; stays dormant (§4.6 explicit).
- Flask's `/api/shorten` (AI label shortener for meal display) — not present in PRD §10.2 call inventory. Treat as CUT unless the PRD adds it back.

### Rule 6 — Scope additions follow the PRD

Anything the PRD adds that Flask doesn't have is in-scope for v1.0. Major additions (non-exhaustive): Finance category (whole category, §4.5), Time category's passive signals (Screen Time, CoreLocation, calendar density, sleep regularity, rhythm adherence), AI Chatbot FAB overlay (§4.7), 22-goal library (§4.10), full notifications system with AI evaluator (§4.9), biometric enrollment (§4.1.3), weather widget (§4.2.2), data export + 30-day deletion grace period (§4.11), Plaid, Strava, HealthKit, Health Connect, Outlook email+calendar, Google Calendar, Apple EventKit.

See the reference table below for the full disposition.

### Rule 7 — When in doubt, ask before inventing

Any build task that sits between Flask and PRD where neither document clearly wins: escalate rather than guess. Specific question patterns to watch for:

- "Flask does X one way, PRD doesn't explicitly contradict it, should I preserve X?" — ask.
- "PRD describes Y at a high level but the mechanics are ambiguous" — ask.
- "Flask has Z and PRD doesn't mention Z at all" — default to CUT, but flag for confirmation.
- "Implementation detail not covered by either doc" — ask. Don't invent product behavior.

Open Questions (below) are the current running list. Add to it; don't silently resolve ambiguity.

---

## Flask → PRD v1.0 Disposition Table

Legend:
- **PRESERVE** — Flask feature survives roughly intact. Port the UX and logic; polish to platform conventions per Rule 3.
- **ENHANCE** — Flask feature exists but PRD specifies a richer version. Port Flask's core as the starting point, then extend to PRD scope.
- **NEW** — PRD feature has no Flask equivalent. Greenfield design and implementation.
- **CUT** — Flask feature is removed per PRD. Do not carry forward.

### Onboarding & Auth

| Area | Flask state | PRD v1.0 scope | Disposition | PRD section |
|---|---|---|---|---|
| Account creation | Username + password, bcrypt hash | Email + password or OAuth (Apple / Google / Email) via Clerk | ENHANCE | §4.1.2, §7.8 |
| Biometric unlock | None | Face ID / Touch ID / fingerprint enrollment flow | NEW | §4.1.3 |
| Onboarding body-stats wizard | 3-step wizard (body stats / goal / daily life) | Same 3-step wizard preserved from Flask | PRESERVE | §4.1.4 |
| AI profile generation | `generate_profile_map` Haiku call during onboarding | Same concept, refined; archetype / insight narration removed | ENHANCE | §4.1.5, §10.2 (removals) |
| First goal selection | 4-goal picker (lose/build/recomp/maintain) tied to calorie/macro targets | Fitness-pre-filtered picker over the unified 22-goal library (PRD v1.27 §4.10.2). Picking a fitness body-composition goal sets calorie/macro targets as a deterministic side effect; picking a non-fitness goal or skipping leaves the calorie engine on maintenance defaults. | ENHANCE | §4.1.5a |
| Workout builder | Optional workout plan wizard; outputs weekly plan | Optional sub-flow preserved; 8-step wizard | PRESERVE | §4.1.6 |
| Connection connect | Gmail only (OAuth), Garmin (env-based, dormant) | Full connection panel: HealthKit/Health Connect, Plaid, Gmail, Outlook, Google Calendar, Apple EventKit, Strava, Garmin (pending), Screen Time, CoreLocation | ENHANCE | §4.1.7, §8 |
| Notification permission | None | Dedicated onboarding step for push notifications | NEW | §4.1.7a |
| Paywall at trial start | None | Paywall at signup — payment method required to enter 14-day Pro trial | NEW | §4.1.9, §13.4 |

### Home Dashboard

| Area | Flask state | PRD v1.0 scope | Disposition | PRD section |
|---|---|---|---|---|
| Four category cards | None — Flask has Home tab with mixed content (streak bar, stats grid, macros, tasks, calorie ring) | Four cards: Fitness / Nutrition / Finance / Time, each with a 0–100 score | NEW (layout); Fitness+Nutrition partial preservation | §4.2.2, §4.2.3 |
| Overall Score | None (Flask has a momentum score, distinct concept) | Single 0–100 Overall Score, weighted sum of 4 categories, user-adjustable weights | NEW | §4.2.2, §9.11 |
| Streak bar | 90-day scroll window, unlimited streak count | Dashboard widget preserved | PRESERVE | §4.2.2 (widget list) |
| Weather widget | None | WeatherKit (iOS) / OpenWeatherMap (Android), location-driven, refreshes hourly | NEW | §4.2.2 |
| FAB chatbot | None (Flask FAB is a meal-log shortcut) | FAB opens AI chatbot overlay with full context | NEW (purpose redefined) | §4.2.6, §4.7 |
| Pull-to-refresh | Not applicable (PWA) | Pull-to-refresh on dashboard | NEW | §4.2.7 |
| Day detail | `/api/day/<date>` returns per-day summary with meals/workouts | Day Detail overlay preserved | PRESERVE | §4.2a |

### Fitness Category

| Area | Flask state | PRD v1.0 scope | Disposition | PRD section |
|---|---|---|---|---|
| Manual workout logging + AI burn estimation | Text form, Haiku `estimate_burn`, saves to `workout_logs` | Same flow preserved | PRESERVE | §4.3.5, §4.3.6, §4.3.12 |
| Workout detail view | Exercise cards, set grids, collapsible, delete button | Same preserved | PRESERVE | §4.3.12 |
| Saved workouts | List, re-log, delete | Same preserved | PRESERVE | §4.3.12 |
| Strength workout tracking overlay | Full-screen checklist + rest timer (localStorage state) | Full-screen Workout Checklist Overlay preserved; uses `expo-keep-awake` | PRESERVE | §4.3.5, §4.3.12 |
| Workout plan generation | Haiku for all plan calls | Sonnet for plan generation; Haiku for understanding narration; quota-limited (Core 1/30d, Pro 3/30d) | ENHANCE (model + quota) | §4.1.6, §4.3.10, §10.2 |
| Plan revision | Haiku `revise_plan` | Sonnet; quota-limited (Core 3/plan, Pro 10/plan) | ENHANCE | §4.3.10, §10.2 |
| Body — weight tracking | Manual entry, `daily_activity.weight_lbs` | HealthKit / Health Connect autopull + manual entry fallback; weight trend + projection | ENHANCE | §4.3.4 |
| Steps tracking | localStorage only — no server persistence | HealthKit / Health Connect autopull | ENHANCE (data source) | §4.3.7 |
| Body subsystem metrics (HRV, body battery, training load) | None | From Garmin (if approved) via official API; otherwise HealthKit for what's available | NEW | §4.3.4, §4.3.9 |
| Sleep subsystem | None (Flask had sleep UI, deleted with Garmin) | HealthKit / Health Connect sleep; duration + regularity | NEW | §4.3.8 |
| Recovery subsystem | None | HRV-driven readiness (requires watch connection) | NEW | §4.3.9 |
| Training plan subsystem | Plan stored in localStorage | Persistent plan with scheduled rest days, tied into Plan Adherence scoring signal | ENHANCE | §4.3.10 |
| Activity calendar (progress tab) | Color-coded 7-column grid | Preserved | PRESERVE | §4.3.2a |
| Strava read-only | None | Read-only activity import, AI-excluded per Nov 2024 ToS | NEW | §8 |
| Garmin integration | Dormant (scraped `garminconnect` library) | Official Health API integration if approval secured | ENHANCE | §1.7 launch floor, §8 |

### Nutrition Category

| Area | Flask state | PRD v1.0 scope | Disposition | PRD section |
|---|---|---|---|---|
| Text meal logging + AI macro parse | `/api/estimate` Haiku | Same + voice input for accessibility | ENHANCE | §4.4.4 |
| Voice meal input | Browser speech recognition (in Flask JS) | Native speech-to-text per platform | ENHANCE | §4.4.4 |
| Meal photo scan | Opus `scan_meal_image` for all users | Sonnet standard scan (Core), Opus Premium Scan (Pro, 10/day) | ENHANCE (tier split) | §4.4.5, §10.2 |
| Pantry scanner | Haiku ingredient ID + Haiku meal suggestion | Same flow but Pro-gated (10/day) | ENHANCE (tier gate) | §4.4.8 |
| Barcode scanner | Client-side Open Food Facts API lookup | Same + AI fallback for missing products | ENHANCE | §4.4.6 |
| Saved meals | User saves + re-logs meals | Same + smart-suggest (time-of-day surfacing of recent meals) | ENHANCE | §4.4.7 |
| AI Edit Meal | `/api/ai-edit-meal` Haiku | Same preserved | PRESERVE | §4.4.11 |
| Meal label shortening (`/api/shorten`) | Haiku `shorten_label` for every meal | Not in PRD §10.2 closed AI inventory | CUT | Closed inventory per §10.2.2 |
| Calorie rollover, auto-adjust targets | Preserved | Preserved | PRESERVE | §4.4.10 |
| Macros / secondary nutrients (sugar/fiber/sodium) | Preserved | Preserved | PRESERVE | §4.4.9 |
| Hydration tracking | None | Opt-in silent default; water goal + logging | NEW | §4.4.12 |
| Daily Nutrition Summary (the "hero") | Flask has equivalent (calorie ring + macros) | Refined per PRD, same concept | ENHANCE | §4.4.3 |
| Meal edit / delete | Preserved | Preserved | PRESERVE | §4.4.11 |
| Meal history + trends charts | Preserved | Preserved | PRESERVE | §4.4.14 |

### Finance Category (all NEW)

Entire category is NEW. No Flask precedent; PRD §4.5 is the full specification. Everything below is NEW:

| Area | PRD v1.0 scope | PRD section |
|---|---|---|
| Plaid integration | Auth + Transactions + Identity | §4.5.4, §8 |
| Budget subsystem | User sets weekly/monthly budget; tracks adherence | §4.5.6 |
| Spending subsystem | Transaction categorization; spending patterns | §4.5.7, §4.5.11 |
| Bills subsystem | Bill detection, on-time tracking | §4.5.8 |
| Savings subsystem | Savings rate calculation | §4.5.9 |
| "Safe to Spend This Week" hero | Derived metric, updates with budget/spending/bills | §4.5.3 |
| Manual transaction entry | Fallback for cash / off-book transactions | §4.5.12 |
| Finance Score | Composite of budget/bills/savings/spending signals | §4.5.10, §9.10 |
| Finance privacy posture | Raw transactions never sent to AI; only categorical summaries | §4.5.4, §6.6, §3.5 |

### Time Category

| Area | Flask state | PRD v1.0 scope | Disposition | PRD section |
|---|---|---|---|---|
| Manual task tracking | `mind_tasks` CRUD | Preserved, integrated into Time Productivity subsystem | PRESERVE | §4.6.9 |
| Gmail email routing | Learned sender/domain `gmail_importance` rules | Deterministic 3-signal classifier (PRD does not specify exact signals beyond the §4.6.8 outline — see Open Questions) | ENHANCE (algorithm) | §4.6.8 |
| Gmail summarization | Haiku `summarize_emails` 1x/day | Preserved — daily summary AI call | PRESERVE | §4.6.8, §10.2 row 15 |
| AI-drafted email replies | None | Sonnet-drafted replies matched to user style (Pro, 20/day) | NEW | §4.6.8, §10.2 row 14 |
| Outlook email | None | Outlook email ingestion alongside Gmail | NEW | §4.6.8 |
| Google Calendar / Apple EventKit / Microsoft Outlook Calendar | None | Full calendar ingestion | NEW | §4.6.7 |
| Day Timeline | None | Flagship — unified visualization of how user spent the day | NEW | §4.6.5 |
| Sleep Regularity signal | None | 14-day bedtime/wake SD via HealthKit | NEW | §4.6 |
| Attention Fragmentation | None | Screen Time pickup count, session length, longest focus block | NEW | §4.6.10, §4.6.11 |
| Location Intentionality | None | CoreLocation visits-based place pattern | NEW | §4.6.12 |
| Schedule Density Balance | None | Calendar meeting-hours vs personal baseline | NEW | §4.6.6 |
| Rhythm Adherence | None | Wake/first-meal/workday-start/workday-end consistency | NEW | §4.6 baseline table |
| Time Patterns | None | Deterministic aggregations of user's own rhythm | NEW | §4.6.13 |
| Goals dashboard (cross-category) | None | View of all active goals across categories | NEW | §4.6.14 |
| Time Score | None (Flask momentum is a different concept) | 5-signal category score | NEW | §9.10, §4.6.15 |
| Mood / morning / evening check-ins | Dormant in Flask | Explicitly cut | CUT | §4.6 explicit |

### AI Chatbot (all NEW)

No Flask equivalent. Entire feature is NEW per PRD §4.7.

| Area | PRD v1.0 scope | PRD section |
|---|---|---|
| FAB chatbot overlay | Invoked from home or any category | §4.7.3, §4.7.4 |
| Shortcut buttons per screen | Context-specific shortcuts | §4.7.5 |
| Text + voice input | Both supported | §4.7.6 |
| Query classification | Deterministic routing | §4.7.9 |
| Context containers | Typed slots for profile, nutrition, fitness, finance, time | §4.7.10 |
| Streaming via SSE | First-token <1.5s target | §4.7.13 |
| Model | Haiku 4.5 | §4.7.14 |
| Quota | Core 10/day, Pro 50/day (300/day soft cap) | §4.7.16 |
| Chatbot Audit | Log of what context was sent in each prompt, 30-day retention | §4.7.15, §4.8.7 |
| Privacy redaction | Raw financial transactions → categories only; email bodies → snippets only; Strava excluded | §6.6, §6.7 |

### Goals, Notifications, Settings, Data/Account

| Area | Flask state | PRD v1.0 scope | Disposition | PRD section |
|---|---|---|---|---|
| Primary fitness goal (calorie/macro driver) | 4-goal picker (lose/build/recomp/maintain) → calorie/macro targets | Folded into the unified goal system (PRD v1.27 §4.10.2). Among a user's active goals, at most one is the designated "primary fitness goal" — the body-comp goal that drives calorie/macro recomputation. All four Flask calorie presets survive as goal-library entries; the side effect is now a per-goal-object flag rather than a separate settings concept. | ENHANCE | §4.10.2, §4.10.10 |
| Unified goal system (22-goal library) | None (Flask has only the 4 calorie presets) | Single unified goal system per PRD v1.27 §4.10 — all 22 goals tracked with identical rigor (progress, pace, deadline, celebration, auto-restart). Fitness body-comp goals have calorie/macro side effects; all other goals have zero side effect on user settings. | NEW (concept and catalog) | §4.10.3 |
| Goal picker UI | None (goal is a radio group in onboarding) | Dedicated picker screen with filtering | NEW | §4.10.7 |
| Active goal slots | None (1 implicit goal) | Core 3 active / Pro 6 active per v1.27 (Pro raised from prior 3); at most one active goal is the designated primary fitness goal | NEW | §4.10.10 |
| "Redo onboarding" edit flow | Available via `/onboarding?edit=1` | CUT per PRD v1.27 §4.1.1 — onboarding is first-time-only. Replaced by sectional direct-edit under §4.8.4 Profile (Body Stats / Daily Life / Diet Preferences / Advanced, each with minimum-necessary deterministic recompute). AI profile regeneration is an explicit standalone action. | CUT | §4.1.1, §4.8.4 |
| Goal progress / pace calculations | Weight projection only | Progress + pace for every goal type | ENHANCE | §4.10.5, §4.10.6 |
| Goal detail view | None | Dedicated view with history chart | NEW | §4.10.11 |
| Goal failure handling | None | Auto-restart, archive, grace periods | NEW | §4.10.13 |
| Completion social card | None | Share completion to social media | NEW | §4.10.14 |
| Push notifications | None (Flask uses setTimeout) | Full system: signal catalog, rules layer, AI evaluator + composer, aggressiveness levels, quiet hours, frequency caps | NEW | §4.9 |
| Deep-link routing from notifications | None | `lifedashboard://` scheme per notification | NEW | §4.9.12 |
| Theme switcher | Dark / Medium / Light | Platform appearance (dark/light/auto); no custom medium theme | ENHANCE (simplified) | §4.8.9 |
| Multi-language (i18n) | 10 languages | English + Spanish at v1 launch | CUT (8 languages) | §14.14 |
| Account deletion | Synchronous cascade delete | 30-day grace period → permanent purge; restore flow available | ENHANCE | §4.11.9–§4.11.13 |
| Data export | None | CSV export (Core), PDF report (Pro) | NEW | §4.11.4, §4.11.5 |
| Chatbot audit log view | None | Users can see exactly what was sent to AI in each prompt | NEW | §4.8.7 |
| Per-connection + per-data-type consent | Single "connect Gmail" toggle | Granular: Plaid on while "send Plaid to AI" off, etc. | ENHANCE | §6.4 |
| Subscription & billing | None | RevenueCat-managed; trial + upgrade/downgrade flows | NEW | §4.8.5, §13.5 |

### Architecture & Infrastructure

| Area | Flask state | PRD v1.0 scope | Disposition | PRD section |
|---|---|---|---|---|
| Backend language | Python 3.14 + Flask | Node.js + TypeScript + Express/Fastify | ENHANCE (rewrite) | §5.4 |
| Database | SQLite (`life_dashboard.db`) | PostgreSQL (Neon or RDS) | ENHANCE | §5.5, §11.6 |
| Auth provider | Custom Flask session + bcrypt | Clerk + JWT bearer tokens for mobile | ENHANCE | §5.6, §7.8 |
| Deployment | Railway | AWS-first serverless (ECS/Lambda), with interim managed Postgres | ENHANCE | §1.7, §11 |
| Hot + archived history | SQLite keeps everything hot | 90-day hot (Core + Pro); archived unlimited (Pro), 90-day cap (Core) | NEW | §13.3.1 |
| Secrets management | `.env` | AWS Secrets Manager / KMS | ENHANCE | §7.6, §11.9 |
| Observability | `logging` to stdout | OpenTelemetry + centralized metrics/logs/traces + cost monitoring | NEW | §5.12, §11.10 |
| Background jobs | In-process Python thread | SQS / EventBridge + Lambda / ECS scheduled workers | NEW | §5.8, §11.5 |

---

## Resolved Open Questions

These were open at the time BUILD_APPROACH.md was first drafted. All seven have since been answered — six by founder decisions baked into PRD v1.27, one dissolved by OQ-1's answer. Resolutions are recorded verbatim so the logic that drove the current build approach stays auditable.

### OQ-1 — Flask user migration when paywall is introduced — RESOLVED

**Resolution.** The three existing Flask users will **re-onboard** in the new app. No migration tooling, no grandfathering shortcuts, no preserved history. Clean cutover.

**Implication.** No work spent on localStorage exfiltration, account linking, or historical-score backfill. The mobile v1 app can assume every user is starting fresh.

### OQ-2 — Primary vs library goals — RESOLVED

**Resolution.** Unified into one goal system per PRD v1.27 §4.10.2 "The Unified Goal System." There is no separate "primary goal" concept anymore. Every goal is a first-class goal object with equal tracking rigor (progress, pace, deadline, completion celebration, auto-restart). Among a user's active goals, at most one is designated the **primary fitness goal** — the body-composition goal that drives calorie/macro target recomputation as a deterministic side effect. All other goals (strength PRs, streaks, finance, time) track progress but have zero side effect on user settings. Goal slot counts updated: Core 3 active / Pro 6 active (Pro raised from prior 3).

**Implication.** Onboarding §4.1.5a becomes a fitness-filtered picker over the 22-goal library. Settings §4.8.4 does not edit goals at all — goals live in §4.10 exclusively. Any code that treated "primary goal" as a distinct concept must now treat it as a per-goal flag (`is_primary_fitness_goal`) on the unified goal object.

### OQ-3 — Email-importance classifier signals — RESOLVED

**Resolution.** PRD v1.27 §4.6.8 locks the deterministic 3-signal classifier:

- **Signal 1 — Sender reputation** (clamped [-2.0, +2.0]). +1.0 / −1.0 per sender Mark-Important / Mark-Stream action; +0.5 / −0.5 domain half-credit on the same action.
- **Signal 2 — Content cues** (user-tunable keyword rules). Seeded with 15 boost keywords (*urgent, tomorrow, meeting, interview, offer, contract, invoice, deadline, action required, RSVP, flight, appointment, confirmation, canceled, reschedule*) and 15 demote keywords (*unsubscribe, deal, newsletter, trending, recommended for you, limited time, sale, % off, you might like, weekly digest, reminder to check, invitation to, upgrade, beta, feedback*). +0.3 per boost match, −0.3 per demote match, per-email cap ±1.0 to block keyword-stuffing. Keyword editing is **Core-tier** (not Pro-gated).
- **Signal 3 — Thread behavior** ([-0.6, +0.8]). Prior reply to the thread +0.5; direct address with ≤3 recipients +0.3; CC with >5 recipients −0.2; bulk-mail header detection (List-Unsubscribe, List-ID, Precedence:bulk, X-Bulk, X-Auto-Response-Suppress, X-Mailer mass-distribution, Feedback-ID) −0.4.
- **Final.** Sum clamped [-3.0, +3.0]. Threshold **≥1.0 → Important**, else Stream. Ties at exactly 1.0 are Important.

**Implication.** [shared/src/logic/importance.ts](../../shared/src/logic/importance.ts) can now be completed — the existing `keywordRules` API shape is compatible; seed lists, signal weights, the per-email cap, and the threshold need to be updated to the v1.27 locked values. Thread signal needs the bulk-header-detection list added.

### OQ-4 — Flask localStorage-only data on migration — RESOLVED

**Resolution.** Acceptable loss. The three existing Flask users re-enter plan / steps / theme in the mobile app. No migration tooling built.

**Implication.** Same consequence as OQ-1. Steps specifically are autopulled from HealthKit / Health Connect in the mobile app (PRD §4.3.7), so the localStorage-only path is moot for the mobile target state anyway.

### OQ-5 — Historical score reconciliation — RESOLVED

**Resolution.** Fresh start on new scoring. No backfill. Mobile day 1 is scoring day 1. Flask's legacy momentum scores stay in Flask (until Flask is decommissioned); they don't carry forward.

**Implication.** No dual-scoring bridge needed. Mobile Progress / History tabs render only dates where PRD §9 scoring has data. New users see `—` for dates before install, same as any clean-start user.

### OQ-6 — Opus grandfathering — DISSOLVED

**Resolution.** Dissolved by OQ-1. Since no migration and re-onboarding is the path, existing Flask users enter the mobile app as fresh users. Everyone — including the three existing ones — starts on Sonnet (Core) or Opus (Pro's Premium Scan) per PRD §10.2 and §13.3. No grandfathering mechanism needed.

### OQ-7 — Primary-goal editing outside onboarding — RESOLVED

**Resolution.** PRD v1.27 §4.8.4 "Sectional direct-edit settings" specifies: **onboarding is first-time-only**. Post-onboarding edits are direct-edit sections under Profile — Body Stats (deterministic RMR/TDEE/macros recompute), Daily Life (deterministic NEAT/TDEE/macros recompute), Diet Preferences (flags `profile_map_out_of_sync` on user record but no automatic AI call), Advanced overrides (direct edit with Lock toggle), and "Regenerate AI profile map" as an explicit standalone action with confirmation modal. Goal editing is removed from Settings entirely — goals live in §4.10 only. Workout plan editing moves to Fitness tab §4.3.10.

**Implication.** No "re-do onboarding" route in mobile. Settings is a collection of narrow edit surfaces each doing the minimum math needed per field. AI fires only via the explicit "Regenerate AI profile map" action.

---

## Known Flask → PRD Discrepancies Already Caught

These were surfaced by the `port-shared-logic` branch while porting business logic to TypeScript. They are documented here so future work doesn't re-discover them.

### Importance classifier scope gap — RESOLVED in PRD v1.27 §4.6.8

Flask had a **single-signal** classifier: learned sender/domain rules from the `gmail_importance` table, surfaced via `score_email_importance(sender, rules)` in [db.py](../../db.py). PRD v1.26 specified a "three-signal deterministic classifier" without pinning the other two signals, which forced the port (see [shared/src/logic/importance.ts](../../shared/src/logic/importance.ts)) to scaffold keyword and thread signals as placeholder design.

**PRD v1.27 §4.6.8 locks the spec** — see Resolved OQ-3 above for full signal weights, seed lists, cold-start behavior, and the 1.0 threshold. The scaffold in `importance.ts` is API-compatible but its seed keyword lists, weights, per-email cap (±1.0), and bulk-header detection need to be updated to match v1.27. Queued as a follow-up commit, not re-surveyed here.

### Minimum-data-threshold behavior for scoring

Flask's `compute_momentum` in [db.py](../../db.py) contains a quirky branch: when a user has **no macro goals AND no calories logged**, the macros penalty goes to 25 (the full category weight). Users starting fresh with no goals set and nothing logged get a 50 baseline score (25 macros + 25 activity if `workout_planned` defaults true), not 100. This is documented in BUSINESS_LOGIC.md §6 as "penalty = 25" but the doc text is imprecise about the triggering conditions.

PRD §9.8 replaces this behavior entirely with the **minimum-data-threshold rule**: if a category has fewer than 2 signals with data, the category shows `—` rather than computing a (low) score. This is a cleaner design but means the Flask user's expectation ("my score is always a number") changes — a fresh Flask user migrating to mobile may see `—` placeholders they didn't see before until they connect more signals.

Flag: on migration, we should ensure the "why is my score a dash?" CTA is clear so users understand that this is the PRD's intentional graceful-degradation behavior, not an app bug.

### BUSINESS_LOGIC.md arithmetic errors (RMR worked examples)

Three arithmetic errors in BUSINESS_LOGIC.md §13 "Recommended Test Cases" were surfaced by running the formulas directly:

- "Male, 185 lbs, 5'10", 28 years → expect ~1823 kcal" — formula actually yields **1815** (off by 8). Doc's value is wrong.
- "Same person with 18% body fat → ~1789 kcal (Katch-McArdle)" — formula actually yields **1856** (off by 67). The doc example appears to have computed `370 + 21.6 × 65.69 = 1789` where 65.69 kg is *not* the LBM of 185 lbs × 82% = 68.81 kg. The doc example is arithmetically wrong.
- "Female, 140 lbs, 5'4", 30 years → expect ~1369 kcal" — formula actually yields **1340** (off by 29). Doc's value is wrong.

The TypeScript port's test file uses the formula-derived values (1815 / 1856 / 1340), not the BUSINESS_LOGIC approximations. BUSINESS_LOGIC.md will be updated in a separate commit of this branch.

### BUSINESS_LOGIC.md §2 NEAT — missing ambulatory-keyword filter

BUSINESS_LOGIC.md §2 shows a 2-step algorithm for estimating workout steps from a description: (1) skip if non-ambulatory keywords match, (2) extract miles/km. The actual Flask/JS implementation (in [templates/index.html](../../templates/index.html) `estimateWorkoutSteps`) has a **three-step** algorithm: non-ambulatory filter, **then an ambulatory-keyword filter** (`run`, `ran`, `jog`, `walk`, `hike`, `treadmill`), only then miles/km extraction. Without a positive ambulatory match, `workoutSteps = 0` regardless of parseable distance. This filter is load-bearing — "driving 5 miles" would otherwise count as 10,000 steps.

The TypeScript port (see [shared/src/logic/neat.ts](../../shared/src/logic/neat.ts)) matches the JS implementation. BUSINESS_LOGIC.md §2 will be updated to document the missing step.

### BUSINESS_LOGIC.md §2 NEAT — regex pattern drift

Two regex mismatches in BUSINESS_LOGIC.md §2 versus the JS code:

- Miles regex documented as `(\d+\.?\d*)\s*(mi|mile)/i`. Actual JS is `/(\d+\.?\d*)\s*mi(?:le)?s?/`. The doc misses plural `miles`.
- Kilometers regex documented as `(\d+\.?\d*)\s*(km|kilo)/i`. Actual JS is `/(\d+\.?\d*)\s*km/`. The doc overstates coverage — `kilo` / `kilometers` / `kilometres` are not matched.

Neither drift is critical in practice (users typically write `ran 3 miles` or `5km`), but the doc should match the code.

### BUSINESS_LOGIC.md §1 body-fat range clinical tightening (intentional, not an error)

BUSINESS_LOGIC.md §1 documents `body_fat_pct > 0 AND body_fat_pct < 100` as the Katch-McArdle validity window, matching Flask. The TypeScript port uses a **tighter clinical window of 5–60%** to reject clearly invalid profile values (0, 99, -1). This is an intentional deviation from Flask, flagged here so future work understands the difference.
