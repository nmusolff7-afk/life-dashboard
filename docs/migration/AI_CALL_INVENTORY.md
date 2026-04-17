# APEX Life Dashboard — AI Call Inventory

Generated: 2026-04-17 | Active features only | Dormant calls excluded

---

## Summary

| Metric | Current |
|--------|---------|
| Total active AI calls in code | 14 |
| Using Opus | 6 |
| Using Haiku | 8 |
| Dormant (to be deleted Phase 4) | 3 |
| Calls with timeout | 17/17 (all, including dormant) |

---

## Active AI Calls — Full Inventory

| # | Call Site | File:Line | Purpose | Current Model | System Prompt Tokens | Max Output Tokens | Frequency (per user/day) | Recommended Model | Reason |
|---|----------|-----------|---------|---------------|---------------------|-------------------|------------------------|-------------------|--------|
| 1 | `estimate_nutrition()` | claude_nutrition.py:92 | Estimate macros from meal text description | **Opus** | ~384 + ~50 user | 1024 | 3-5x/day | **Haiku** | Structured JSON extraction from short text. Haiku handles nutrition lookups well — this is pattern matching, not reasoning. |
| 2 | `scan_meal_image()` | claude_nutrition.py:157 | Identify food in photo and estimate macros | **Opus** | ~380 | 1024 | 0-2x/day | **Opus** | Vision + complex estimation. Keep Opus — photo analysis quality matters for accuracy. |
| 3 | `identify_ingredients()` | claude_nutrition.py:212 | List ingredients visible in photo(s) | **Opus** | ~87 | 400 | 0-1x/day | **Haiku** | Simple visual identification returning a flat list. No reasoning needed. |
| 4 | `suggest_meal()` | claude_nutrition.py:310 | Suggest 3 meals fitting remaining macros | **Opus** | ~450 + ~100 context | 1200 | 0-1x/day | **Haiku** | Structured generation from clear constraints. The prompt is highly specific with exact calorie/macro targets — Haiku can follow these instructions. |
| 5 | `estimate_burn()` | claude_nutrition.py:387 | Estimate workout calories burned | **Opus** | ~159 + ~50 user | 300 | 1-3x/day | **Haiku** | Short JSON extraction. Input is a workout description + body stats. Output is a single integer + note. Classic Haiku task. |
| 6 | `shorten_label()` | claude_nutrition.py:416 | Shorten meal/workout description to 2-5 words | Haiku | ~153 | 32 | 3-5x/day | Haiku | Already Haiku. Correct. |
| 7 | `generate_workout_plan()` | claude_nutrition.py:505 | Generate weekly workout plan from preferences | Haiku | ~255 | 1024 | 0-0.1x/day | Haiku | Already Haiku. Correct. |
| 8 | `generate_comprehensive_plan()` | claude_nutrition.py:579 | Full workout plan from quiz payload | Haiku | ~1000 inline | 8192 | 0-0.1x/day | Haiku | Already Haiku. Correct. |
| 9 | `generate_plan_understanding()` | claude_nutrition.py:635 | 3-sentence summary of plan rationale | Haiku | ~150 inline | 200 | 0-0.1x/day | Haiku | Already Haiku. Correct. |
| 10 | `revise_plan()` | claude_nutrition.py:664 | Modify workout plan per user feedback | Haiku | ~300 inline | 8192 | 0-0.1x/day | Haiku | Already Haiku. Correct. |
| 11 | `generate_scale_summary()` | claude_nutrition.py:749 | AI summary at day/week/month scale | Haiku | ~340 | 200 | 1-3x/day | Haiku | Already Haiku. Correct. |
| 12 | `generate_momentum_insight()` | claude_nutrition.py:897 | 1-2 sentence calorie insight | Haiku | ~281 | 200 | 1-3x/day | Haiku | Already Haiku. Correct. |
| 13 | `parse_workout_plan()` | claude_nutrition.py:913 | Parse free-text workout plan into JSON | **Opus** | ~168 | 1024 | 0-0.1x/day | **Haiku** | Structured extraction from text to JSON. The prompt gives an exact schema. Classic Haiku task. |
| 14 | `summarize_emails()` | gmail_sync.py:271 | Summarize recent emails in 3-5 bullets | Haiku | ~200 inline | 300 | 0-2x/day | Haiku | Already Haiku. Correct. |

---

## Dormant AI Calls (deleted in Phase 4, not inventoried for optimization)

| Call Site | File:Line | Model | Status |
|-----------|-----------|-------|--------|
| `generate_profile_map()` | claude_profile.py:64 | Haiku | **Active** (onboarding) — keep |
| `generate_evening_prompt()` | claude_profile.py:270 | Haiku | **Dormant** — never called, delete |
| `score_brief()` | claude_profile.py:308 | Haiku | **Dormant** — check-in route removed, delete |

Note: `generate_profile_map()` is active (used during onboarding). The other two are dormant.

Corrected active total: **15 calls** (14 in table above + generate_profile_map).

---

## Proposed Model Changes

### Opus → Haiku (4 calls)

| # | Function | Current | Proposed | Quality Risk | Mitigation |
|---|----------|---------|----------|-------------|------------|
| 1 | `estimate_nutrition()` | Opus | **Haiku** | Medium — Haiku may be less accurate on complex meals | The prompt is highly structured with exact JSON schema. Test with 20 diverse meals and compare accuracy. If >10% error rate on calories, revert. |
| 2 | `identify_ingredients()` | Opus | **Haiku** | Low — flat list extraction from photos | Vision capabilities in Haiku are sufficient for object identification. |
| 3 | `suggest_meal()` | Opus | **Haiku** | Low — structured generation from constraints | The prompt provides exact calorie/macro targets. Haiku can follow arithmetic constraints. |
| 4 | `parse_workout_plan()` | Opus | **Haiku** | Low — structured extraction, exact schema given | Very similar to `generate_workout_plan()` which is already Haiku. |
| 5 | `estimate_burn()` | Opus | **Haiku** | Low — single number + note | Simpler than nutrition estimation. Body stats provided for context. |

### Keep as Opus (1 call)

| Function | Reason to Keep |
|----------|---------------|
| `scan_meal_image()` | Photo-to-nutrition requires strong vision + reasoning about portions, presentation, and hidden ingredients. This is the highest-value AI call — accuracy directly affects user trust. |

---

## Cost Estimate: Before and After

### Pricing (per million tokens, as of 2026-04)

| Model | Input | Output |
|-------|-------|--------|
| claude-opus-4-6 | $15.00 | $75.00 |
| claude-haiku-4-5 | $0.80 | $4.00 |

### Per-Call Cost Estimate

| # | Function | Current Model | Est. Input Tokens | Est. Output Tokens | Current Cost | Proposed Model | Proposed Cost |
|---|----------|--------------|-------------------|-------------------|-------------|----------------|--------------|
| 1 | estimate_nutrition | Opus | ~500 | ~500 | $0.045 | Haiku | $0.0024 |
| 2 | scan_meal_image | Opus | ~1500 (image) | ~500 | $0.060 | Opus (keep) | $0.060 |
| 3 | identify_ingredients | Opus | ~1200 (image) | ~200 | $0.033 | Haiku | $0.0018 |
| 4 | suggest_meal | Opus | ~1500 (images) | ~600 | $0.068 | Haiku | $0.0036 |
| 5 | estimate_burn | Opus | ~300 | ~150 | $0.016 | Haiku | $0.0008 |
| 6 | shorten_label | Haiku | ~200 | ~20 | $0.0002 | Haiku | $0.0002 |
| 7 | generate_workout_plan | Haiku | ~300 | ~500 | $0.0022 | Haiku | $0.0022 |
| 8 | gen_comprehensive_plan | Haiku | ~2500 | ~3000 | $0.014 | Haiku | $0.014 |
| 9 | gen_plan_understanding | Haiku | ~300 | ~100 | $0.0006 | Haiku | $0.0006 |
| 10 | revise_plan | Haiku | ~2000 | ~3000 | $0.014 | Haiku | $0.014 |
| 11 | gen_scale_summary | Haiku | ~500 | ~100 | $0.0008 | Haiku | $0.0008 |
| 12 | gen_momentum_insight | Haiku | ~400 | ~100 | $0.0007 | Haiku | $0.0007 |
| 13 | parse_workout_plan | Opus | ~300 | ~500 | $0.042 | Haiku | $0.0022 |
| 14 | summarize_emails | Haiku | ~500 | ~150 | $0.0010 | Haiku | $0.0010 |
| 15 | generate_profile_map | Haiku | ~500 | ~500 | $0.0024 | Haiku | $0.0024 |

### Daily Cost Per Active User (estimated usage pattern)

| Activity | Calls/Day | Current Cost/Day | Proposed Cost/Day |
|----------|-----------|-----------------|------------------|
| Log 3 meals (estimate + shorten each) | 6 | $0.271 | $0.015 |
| Scan 1 meal photo | 1 | $0.060 | $0.060 |
| Log 2 workouts (burn estimate + shorten) | 4 | $0.032 | $0.002 |
| Check momentum insight | 2 | $0.001 | $0.001 |
| Check scale summary | 1 | $0.001 | $0.001 |
| **Daily total** | **14** | **$0.365** | **$0.079** |

### Monthly Cost Projection

| Metric | Current | Proposed | Reduction |
|--------|---------|----------|-----------|
| Cost per active user per day | $0.365 | $0.079 | **78%** |
| Cost per active user per month | $10.95 | $2.37 | **78%** |
| 100 active users per month | $1,095 | $237 | **$858 saved** |
| 1,000 active users per month | $10,950 | $2,370 | **$8,580 saved** |

---

## Redundant / Cacheable Calls

### Already well-optimized
- `generate_scale_summary()` — already cached in `momentum_summaries` table with force-refresh option
- `generate_profile_map()` — runs once during onboarding, result persisted in DB

### Potential optimization (propose, not implement now)
- `shorten_label()` — called for every logged meal/workout. Could cache by input hash since the same description always shortens the same way. Saves ~5 Haiku calls/day. Low priority — Haiku calls are cheap.
- `estimate_nutrition()` — if a user logs "2 scrambled eggs" repeatedly, could cache the result. But portion sizes vary and profile context changes, so cache invalidation is tricky. **Not recommended** without more thought.

### Calls that could be deterministic
- None identified. The closest candidate was `shorten_label()` but the variety of inputs makes regex impractical. Haiku at 32 max_tokens is already minimal cost.

---

## Recommendation

**Switch 5 Opus calls to Haiku. Keep scan_meal_image on Opus.**

This achieves a 78% cost reduction per user per day ($0.365 → $0.079) without expected quality degradation on the switched calls. The highest-risk change is `estimate_nutrition()` — if Haiku produces noticeably worse macro estimates, it can be reverted to Opus independently.

**Awaiting approval before changing any model strings.**
