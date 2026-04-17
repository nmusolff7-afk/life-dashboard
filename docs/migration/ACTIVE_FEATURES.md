# APEX Life Dashboard — Active Features

Generated: 2026-04-17 | Features currently in use and under active maintenance

---

## 1. Meal Logging with AI Macro Estimation

| Property | Detail |
|----------|--------|
| **Purpose** | Log meals by text description; AI estimates calories and macros |
| **Routes** | `POST /api/log-meal`, `POST /api/estimate`, `POST /api/edit-meal/<id>`, `POST /api/delete-meal/<id>`, `GET /api/today-nutrition`, `POST /api/ai-edit-meal`, `POST /api/shorten` |
| **Files** | `app.py` (routes), `db.py` (insert_meal, get_today_meals, get_today_totals, update_meal, delete_meal), `claude_nutrition.py` (estimate_nutrition, shorten_label) |
| **DB Tables** | `meal_logs` |
| **AI Calls** | estimate_nutrition (Opus), shorten_label (Haiku), ai-edit-meal reuses estimate_nutrition (Opus) |
| **Frontend** | `index.html` #tab-meals — meal form, macro edit grid, item breakdown, meal table, daily summary |

---

## 2. Meal Photo Scanning

| Property | Detail |
|----------|--------|
| **Purpose** | Photograph a meal; AI identifies food and estimates nutrition |
| **Routes** | `POST /api/scan-meal` |
| **Files** | `app.py` (route), `claude_nutrition.py` (scan_meal_image) |
| **DB Tables** | None (estimation only, user logs manually after) |
| **AI Calls** | scan_meal_image (Opus, vision) |
| **Frontend** | `index.html` — camera overlay in Nutrition tab |

---

## 3. Pantry Scanner (Ingredient Identification + Meal Suggestion)

| Property | Detail |
|----------|--------|
| **Purpose** | Photo of ingredients; AI identifies items and suggests meals fitting remaining macros |
| **Routes** | `POST /api/meals/scan`, `POST /api/meals/suggest` |
| **Files** | `app.py` (routes), `claude_nutrition.py` (identify_ingredients, suggest_meal) |
| **DB Tables** | None |
| **AI Calls** | identify_ingredients (Opus, vision), suggest_meal (Opus) |
| **Frontend** | `index.html` — ingredient scanner flow in Nutrition tab |

---

## 4. Saved Meals

| Property | Detail |
|----------|--------|
| **Purpose** | Save and re-log frequently eaten meals |
| **Routes** | `GET /api/saved-meals`, `POST /api/saved-meals`, `DELETE /api/saved-meals/<id>` |
| **Files** | `app.py` (routes), `db.py` (save_meal, get_saved_meals, delete_saved_meal) |
| **DB Tables** | `saved_meals` |
| **AI Calls** | None |
| **Frontend** | `index.html` — saved meals list in Nutrition tab FAB |

---

## 5. Barcode Scanner

| Property | Detail |
|----------|--------|
| **Purpose** | Scan food barcodes; look up nutrition via Open Food Facts API |
| **Routes** | None (client-side only, calls Open Food Facts API directly) |
| **Files** | `index.html` (BarcodeDetector API + fetch to openfoodfacts.org) |
| **DB Tables** | None |
| **AI Calls** | None |
| **Frontend** | `index.html` — barcode scanner overlay. Only works in browsers with BarcodeDetector API (Chrome 83+, Safari 16.4+). |
| **Known Issue** | Button shows on all browsers even when unsupported (TECH_DEBT P3-22) |

---

## 6. Manual Workout Logging with AI Burn Estimation

| Property | Detail |
|----------|--------|
| **Purpose** | Log workouts by text description; AI estimates calories burned |
| **Routes** | `POST /api/log-workout`, `POST /api/burn-estimate`, `POST /api/edit-workout/<id>`, `POST /api/delete-workout/<id>`, `GET /api/today-workouts`, `POST /api/ai-edit-workout` |
| **Files** | `app.py` (routes), `db.py` (insert_workout, get_today_workouts, update_workout, delete_workout, get_today_workout_burn), `claude_nutrition.py` (estimate_burn) |
| **DB Tables** | `workout_logs` |
| **AI Calls** | estimate_burn (Opus), ai-edit-workout reuses estimate_burn (Opus) |
| **Frontend** | `index.html` #tab-workout — activity form, workout list, burn chart |

---

## 7. Saved Workouts

| Property | Detail |
|----------|--------|
| **Purpose** | Save and re-log frequently performed workouts |
| **Routes** | `GET /api/saved-workouts`, `POST /api/saved-workouts`, `DELETE /api/saved-workouts/<id>` |
| **Files** | `app.py` (routes), `db.py` (save_workout, get_saved_workouts, delete_saved_workout) |
| **DB Tables** | `saved_workouts` |
| **AI Calls** | None |
| **Frontend** | `index.html` — saved workouts in Fitness tab |

---

## 8. Strength Workout Tracking (Checklist + Timer)

| Property | Detail |
|----------|--------|
| **Purpose** | Follow a structured workout plan with set/rep tracking and rest timer |
| **Routes** | None (client-side state in localStorage: `workoutPlan`, `weeklyPlan`, `LS_TIMER_KEY`) |
| **Files** | `index.html` (workout checklist overlay, timer logic) |
| **DB Tables** | None (workout plan stored in localStorage; completed workouts logged via `/api/log-workout`) |
| **AI Calls** | None |
| **Frontend** | `index.html` — full-screen workout checklist overlay with exercise blocks, set rows, live timer, rest timer |

---

## 9. Workout Plan Generation

| Property | Detail |
|----------|--------|
| **Purpose** | AI generates a structured weekly workout plan from user preferences |
| **Routes** | `POST /api/parse-workout-plan`, `POST /api/generate-plan`, `POST /api/generate-comprehensive-plan`, `POST /api/revise-plan` |
| **Files** | `app.py` (routes), `claude_nutrition.py` (parse_workout_plan, generate_workout_plan, generate_comprehensive_plan, generate_plan_understanding, revise_plan) |
| **DB Tables** | None (plan stored in localStorage) |
| **AI Calls** | parse_workout_plan (Opus), generate_workout_plan (Haiku), generate_comprehensive_plan (Haiku), generate_plan_understanding (Haiku), revise_plan (Haiku) |
| **Frontend** | `index.html` #tab-profile — workout plan builder in Profile tab |

---

## 10. Weight Tracking (Manual Entry)

| Property | Detail |
|----------|--------|
| **Purpose** | Log daily body weight |
| **Routes** | `POST /api/log-weight` |
| **Files** | `app.py` (route), `db.py` (save_daily_weight, get_daily_weight) |
| **DB Tables** | `daily_activity` (only `weight_lbs` column is active; other columns are legacy) |
| **AI Calls** | None |
| **Frontend** | `index.html` #tab-workout — Today's Weight card |

---

## 11. Steps Tracking (Manual Entry)

| Property | Detail |
|----------|--------|
| **Purpose** | Log daily step count for NEAT calculation |
| **Routes** | None (stored in localStorage: `stepsToday`, `stepsLog`) |
| **Files** | `index.html` (steps form, localStorage read/write) |
| **DB Tables** | None (client-side only) |
| **AI Calls** | None |
| **Frontend** | `index.html` #tab-workout — Daily Steps card |

---

## 12. Daily Momentum Score

| Property | Detail |
|----------|--------|
| **Purpose** | Single 0-100 daily score measuring goal tracking adherence |
| **Routes** | `GET/POST /api/momentum/today`, `GET /api/momentum/history`, `POST /api/momentum/insight`, `POST /api/momentum/summary` |
| **Files** | `app.py` (routes), `db.py` (compute_momentum, get_momentum_history, get_momentum_history_with_deltas, save_momentum_summary, get_momentum_summary), `claude_nutrition.py` (generate_momentum_insight, generate_scale_summary) |
| **DB Tables** | `daily_momentum`, `momentum_summaries` |
| **AI Calls** | generate_momentum_insight (Haiku), generate_scale_summary (Haiku) |
| **Frontend** | `index.html` #tab-mind — score card, category breakdown, insight card with Day/Week/Month toggle |

---

## 13. Goal Setting (Calorie & Macro Targets)

| Property | Detail |
|----------|--------|
| **Purpose** | Set goal type (lose/gain/recomp/maintain), compute calorie and macro targets from body stats |
| **Routes** | `POST /api/goal/update`, `GET /api/profile` |
| **Files** | `app.py` (routes), `db.py` (upsert_user_goal, get_user_goal), `goal_config.py` (compute_targets, get_goal_config, GOAL_CONFIGS) |
| **DB Tables** | `user_goals` |
| **AI Calls** | None (targets computed deterministically from formulas in goal_config.py) |
| **Frontend** | `index.html` #tab-profile — About You section with sliders for RMR, NEAT, deficit, macros |

---

## 14. Task Tracking (Manual)

| Property | Detail |
|----------|--------|
| **Purpose** | Add, toggle, and delete daily tasks. Shown on Home and Status tabs. |
| **Routes** | `GET /api/mind/today`, `POST /api/mind/task`, `PATCH /api/mind/task/<id>`, `DELETE /api/mind/task/<id>` |
| **Files** | `app.py` (routes), `db.py` (insert_mind_task, get_mind_tasks, toggle_mind_task, delete_mind_task) |
| **DB Tables** | `mind_tasks` |
| **AI Calls** | None (manual task creation is AI-free; AI task extraction happens via check-ins — see Dormant Features) |
| **Frontend** | `index.html` #tab-home and #tab-mind — task list with add/toggle/delete |

---

## 15. Gmail Email Routing (Important / Stream Classification)

| Property | Detail |
|----------|--------|
| **Purpose** | Classify incoming emails as "important" or "stream" based on learned sender rules; AI-generate daily summary |
| **Routes** | `GET /api/gmail/status`, `GET /api/gmail/connect`, `GET /api/gmail/callback`, `POST /api/gmail/disconnect`, `POST /api/gmail/sync`, `POST /api/gmail/label`, `GET /api/gmail/debug` |
| **Files** | `app.py` (routes), `db.py` (gmail token/cache/summary/importance functions), `gmail_sync.py` (OAuth flow, email fetching, AI summarization) |
| **DB Tables** | `gmail_tokens`, `gmail_cache`, `gmail_summaries`, `gmail_importance` |
| **AI Calls** | summarize_emails (Haiku) — in gmail_sync.py |
| **Frontend** | `index.html` #tab-mind — Gmail card with Important/Stream toggle, email rows, label buttons |

---

## 16. Onboarding Quiz with AI Profile Generation

| Property | Detail |
|----------|--------|
| **Purpose** | 7-step onboarding wizard collecting body stats, goals, preferences; AI generates a profile map with 200+ variables |
| **Routes** | `GET /onboarding` (HTML), `POST /api/onboarding/save`, `GET /api/onboarding/status`, `POST /api/onboarding/complete`, `GET /api/onboarding/poll` |
| **Files** | `app.py` (routes, _run_profile_generation), `db.py` (get_onboarding, upsert_onboarding_inputs, complete_onboarding, get_profile_map, is_onboarding_complete), `claude_profile.py` (generate_profile_map), `templates/onboarding.html` |
| **DB Tables** | `user_onboarding` |
| **AI Calls** | generate_profile_map (Haiku) |
| **Frontend** | `templates/onboarding.html` — 7-step wizard with polling for async AI generation |

---

## 17. History & Day Detail

| Property | Detail |
|----------|--------|
| **Purpose** | View historical data by date: charts, calendar, day-level detail with edit/delete |
| **Routes** | `GET /api/history`, `GET /api/day/<date>` |
| **Files** | `app.py` (routes), `db.py` (get_meal_history, get_workout_history, get_day_detail) |
| **DB Tables** | `meal_logs`, `workout_logs`, `daily_momentum` (read-only aggregation) |
| **AI Calls** | None |
| **Frontend** | `index.html` #tab-progress — daily score chart, weight trend chart, activity calendar, history list, day detail overlay |

---

## 18. Theme Switcher

| Property | Detail |
|----------|--------|
| **Purpose** | Switch between dark, medium, and light themes |
| **Routes** | None (client-side only, stored in localStorage: `apex-theme`) |
| **Files** | `index.html` (theme CSS variables, theme toggle buttons, JS logic) |
| **Frontend** | `index.html` #tab-profile — theme buttons |

---

## 19. Multi-Language Support (i18n)

| Property | Detail |
|----------|--------|
| **Purpose** | Translate static UI text into 10 languages |
| **Routes** | None (client-side only, stored in localStorage: `appLang`) |
| **Files** | `static/i18n.js` (374 lines, translation dictionaries), `index.html` (applies translations via `data-i18n` attributes) |
| **Frontend** | `index.html` #tab-profile — language selector |
| **Known Issue** | Many dynamic strings (chart labels, error messages, JS-rendered HTML) not translated (TECH_DEBT P3-22) |

---

## 20. Authentication & Account Management

| Property | Detail |
|----------|--------|
| **Purpose** | User registration, login, password reset, account deletion |
| **Routes** | `GET/POST /login`, `GET /logout`, `POST /api/check-username`, `POST /api/reset-password`, `POST /api/delete-account` |
| **Files** | `app.py` (routes, login_required decorator, session management), `db.py` (create_user, verify_user, delete_account), `templates/login.html` |
| **DB Tables** | `users` |
| **AI Calls** | None |
| **Frontend** | `templates/login.html` — login/register form |

---

## Active Database Tables Summary

| Table | Used By Feature(s) |
|-------|-------------------|
| `users` | Authentication |
| `meal_logs` | Meal logging, History |
| `workout_logs` | Workout logging, History |
| `daily_activity` | Weight tracking (only `weight_lbs` column active) |
| `user_onboarding` | Onboarding |
| `mind_tasks` | Task tracking |
| `gmail_tokens` | Gmail |
| `gmail_cache` | Gmail |
| `gmail_summaries` | Gmail |
| `gmail_importance` | Gmail |
| `user_goals` | Goal setting |
| `daily_momentum` | Momentum score |
| `saved_meals` | Saved meals |
| `saved_workouts` | Saved workouts |
| `momentum_summaries` | Momentum insights |

**15 active tables** serving 20 active features.
