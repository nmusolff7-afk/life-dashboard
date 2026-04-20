# APEX Life Dashboard — AI Call Inventory

Generated: 2026-04-19 | All AI calls reflect current codebase post-dormant deletion

---

## Summary

| Metric | Current |
|--------|---------|
| Total active AI calls in code | 15 |
| Using Opus | 1 |
| Using Haiku | 14 |
| Dormant (deleted) | 2 (generate_evening_prompt, score_brief) |
| Calls with timeout | 15/15 (all) |

---

## Active AI Calls — Full Inventory

| # | Call Site | File:Line | Purpose | Model | Max Output Tokens | Timeout | Frequency (per user/day) |
|---|----------|-----------|---------|-------|-------------------|---------|------------------------|
| 1 | `estimate_nutrition()` | claude_nutrition.py:93 | Estimate macros from meal text description | **Haiku** | 1024 | 30s | 3-5x/day |
| 2 | `scan_meal_image()` | claude_nutrition.py:159 | Identify food in photo and estimate macros | **Opus** | 1024 | 30s | 0-2x/day |
| 3 | `identify_ingredients()` | claude_nutrition.py:214 | List ingredients visible in photo(s) | **Haiku** | 400 | 30s | 0-1x/day |
| 4 | `suggest_meal()` | claude_nutrition.py:285 | Suggest 3 meals fitting remaining macros | **Haiku** | 1200 | 30s | 0-1x/day |
| 5 | `estimate_burn()` | claude_nutrition.py:356 | Estimate workout calories burned | **Haiku** | 300 | 30s | 1-3x/day |
| 6 | `shorten_label()` | claude_nutrition.py:385 | Shorten meal/workout description to 2-5 words | **Haiku** | 32 | 30s | 3-5x/day |
| 7 | `generate_workout_plan()` | claude_nutrition.py:474 | Generate weekly workout plan from preferences | **Haiku** | 1024 | 30s | 0-0.1x/day |
| 8 | `generate_comprehensive_plan()` | claude_nutrition.py:548 | Full workout plan from quiz payload | **Haiku** | 8192 | 60s | 0-0.1x/day |
| 9 | `generate_plan_understanding()` | claude_nutrition.py:604 | 3-sentence summary of plan rationale | **Haiku** | 200 | 30s | 0-0.1x/day |
| 10 | `revise_plan()` | claude_nutrition.py:633 | Modify workout plan per user feedback | **Haiku** | 8192 | 60s | 0-0.1x/day |
| 11 | `generate_scale_summary()` | claude_nutrition.py:718 | AI summary at day/week/month scale | **Haiku** | 200 | 30s | 1-3x/day |
| 12 | `generate_momentum_insight()` | claude_nutrition.py:866 | 1-2 sentence calorie insight | **Haiku** | 200 | 30s | 1-3x/day |
| 13 | `parse_workout_plan()` | claude_nutrition.py:882 | Parse free-text workout plan into JSON | **Haiku** | 1024 | 30s | 0-0.1x/day |
| 14 | `generate_profile_map()` | claude_profile.py:64 | Generate 200+ variable profile from onboarding | **Haiku** | 1024 | 60s | 0-0.1x/day |
| 15 | `summarize_emails()` | gmail_sync.py:271 | Summarize recent emails in 3-5 bullets | **Haiku** | 300 | 30s | 0-2x/day |

---

## Deleted AI Calls (removed with dormant features)

| Call Site | File | Model | Reason Deleted |
|-----------|------|-------|----------------|
| `generate_evening_prompt()` | claude_profile.py | Haiku | Never called from any route; dead code |
| `score_brief()` | claude_profile.py | Haiku | Only caller was deleted check-in route |

---

## Model Assignments: Completed Changes

### 5 Opus-to-Haiku switches (completed)

| # | Function | Was | Now | Result |
|---|----------|-----|-----|--------|
| 1 | `estimate_nutrition()` | Opus | **Haiku** | Working — structured JSON extraction |
| 2 | `identify_ingredients()` | Opus | **Haiku** | Working — flat list from photos |
| 3 | `suggest_meal()` | Opus | **Haiku** | Working — structured generation from constraints |
| 4 | `estimate_burn()` | Opus | **Haiku** | Working — single number + note |
| 5 | `parse_workout_plan()` | Opus | **Haiku** | Working — structured extraction, exact schema |

### Kept on Opus (1 call)

| Function | Reason |
|----------|--------|
| `scan_meal_image()` | Photo-to-nutrition requires strong vision + reasoning about portions, presentation, and hidden ingredients. Highest-value AI call — accuracy directly affects user trust. |

---

## Cost Estimate: Current State (Post-Optimization)

### Pricing (per million tokens, as of 2026-04)

| Model | Input | Output |
|-------|-------|--------|
| claude-opus-4-6 | $15.00 | $75.00 |
| claude-haiku-4-5 | $0.80 | $4.00 |

### Per-Call Cost Estimate

| # | Function | Model | Est. Input Tokens | Est. Output Tokens | Cost/Call |
|---|----------|-------|-------------------|-------------------|----------|
| 1 | estimate_nutrition | Haiku | ~500 | ~500 | $0.0024 |
| 2 | scan_meal_image | **Opus** | ~1500 (image) | ~500 | $0.060 |
| 3 | identify_ingredients | Haiku | ~1200 (image) | ~200 | $0.0018 |
| 4 | suggest_meal | Haiku | ~1500 (images) | ~600 | $0.0036 |
| 5 | estimate_burn | Haiku | ~300 | ~150 | $0.0008 |
| 6 | shorten_label | Haiku | ~200 | ~20 | $0.0002 |
| 7 | generate_workout_plan | Haiku | ~300 | ~500 | $0.0022 |
| 8 | gen_comprehensive_plan | Haiku | ~2500 | ~3000 | $0.014 |
| 9 | gen_plan_understanding | Haiku | ~300 | ~100 | $0.0006 |
| 10 | revise_plan | Haiku | ~2000 | ~3000 | $0.014 |
| 11 | gen_scale_summary | Haiku | ~500 | ~100 | $0.0008 |
| 12 | gen_momentum_insight | Haiku | ~400 | ~100 | $0.0007 |
| 13 | parse_workout_plan | Haiku | ~300 | ~500 | $0.0022 |
| 14 | generate_profile_map | Haiku | ~500 | ~500 | $0.0024 |
| 15 | summarize_emails | Haiku | ~500 | ~150 | $0.0010 |

### Daily Cost Per Active User (estimated usage pattern)

| Activity | Calls/Day | Cost/Day |
|----------|-----------|----------|
| Log 3 meals (estimate + shorten each) | 6 | $0.015 |
| Scan 1 meal photo | 1 | $0.060 |
| Log 2 workouts (burn estimate + shorten) | 4 | $0.002 |
| Check momentum insight | 2 | $0.001 |
| Check scale summary | 1 | $0.001 |
| **Daily total** | **14** | **$0.079** |

### Monthly Cost Projection

| Metric | Cost |
|--------|------|
| Cost per active user per day | $0.079 |
| Cost per active user per month | $2.37 |
| 100 active users per month | $237 |
| 1,000 active users per month | $2,370 |

**Reduction from original (pre-optimization): 78%** ($0.365/day -> $0.079/day per user)

---

## Redundant / Cacheable Calls

### Already well-optimized
- `generate_scale_summary()` — cached in `momentum_summaries` table with force-refresh option
- `generate_profile_map()` — runs once during onboarding, result persisted in DB

### Potential optimization (not implemented)
- `shorten_label()` — called for every logged meal/workout. Could cache by input hash since the same description always shortens the same way. Saves ~5 Haiku calls/day. Low priority — Haiku calls are cheap.
- `estimate_nutrition()` — if a user logs "2 scrambled eggs" repeatedly, could cache the result. But portion sizes vary and profile context changes, so cache invalidation is tricky. **Not recommended** without more thought.

### Calls that could be deterministic
- None identified. The closest candidate was `shorten_label()` but the variety of inputs makes regex impractical. Haiku at 32 max_tokens is already minimal cost.
