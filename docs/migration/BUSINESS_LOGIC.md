# APEX Life Dashboard — Business Logic Specification

Generated: 2026-04-17 | Framework-agnostic | Reimplementable in any language

> **Verified against TypeScript port on 2026-04-22.** Where code and this document disagreed, code wins per [BUILD_APPROACH.md](BUILD_APPROACH.md) rule 2. Values in this document now reflect actual code behavior. Specific corrections applied: RMR §13 worked-example numbers recalculated from the formulas; NEAT §2 algorithm now includes the ambulatory-keyword filter step that was missing; NEAT §2 regex patterns updated to match the actual JS source. See `shared/src/logic/` for the ported implementation and test values.

---

## 1. Resting Metabolic Rate (RMR)

### Purpose
Estimates daily calories burned at complete rest. Foundation for all calorie calculations.

### Inputs
| Parameter | Type | Unit | Required |
|-----------|------|------|----------|
| weight | float | lbs | Yes |
| height_ft | int | feet | Yes |
| height_in | int | inches | Yes |
| age | int | years | Yes |
| sex | string | "male" or "female" | Yes |
| body_fat_pct | float | percent (0-100) | No |

### Algorithm

**Step 1: Unit conversion**
```
kg = weight * 0.453592
cm = (height_ft * 12 + height_in) * 2.54
```

**Step 2: Choose formula**

If `body_fat_pct` is provided and `0 < body_fat_pct < 100`:
```
// Katch-McArdle (more accurate with body fat data)
lean_body_mass_kg = kg * (1 - body_fat_pct / 100)
RMR = round(370 + 21.6 * lean_body_mass_kg)
```

Otherwise:
```
// Mifflin-St Jeor (standard formula)
base = 10 * kg + 6.25 * cm - 5 * age
if sex == "male":  RMR = round(base + 5)
if sex == "female": RMR = round(base - 161)
```

### Output
`RMR: integer` — kilocalories per day

### Edge Cases
- If `body_fat_pct` is 0, negative, or >= 100: falls back to Mifflin-St Jeor
- No minimum enforced (could theoretically return very low values for small/young people)

### Sources
- Mifflin et al. (1990) *Am J Clin Nutr*
- Katch & McArdle (1996)

---

## 2. Non-Exercise Activity Thermogenesis (NEAT)

### Purpose
Estimates calories burned through daily movement that isn't intentional exercise.

### Inputs
| Parameter | Type | Unit | Required |
|-----------|------|------|----------|
| occupation | string | "sedentary", "standing", "physical" | Yes |
| total_steps | int | steps | Yes |
| workout_descriptions | string[] | workout text descriptions | Yes |

### Constants
```
OCC_BASE = {
  sedentary: 200,   // desk job
  standing:  400,   // standing work
  physical:  700    // manual labor
}

KCAL_PER_STEP = 0.04
STEPS_PER_MILE = 2000
```

### Algorithm

**Step 1: Estimate workout steps (to subtract from total)**
```
workout_steps = 0
for each workout_description:
  lowercase = description.toLowerCase()

  // (a) Non-ambulatory activities → 0 steps
  if contains any of: "cycl", "bike", "row", "swim", "ellip", "strength",
     "lift", "bench", "squat", "deadlift", "press", "curl", "pulldown":
    continue

  // (b) Ambulatory-keyword filter — REQUIRED for distance extraction to apply.
  // Without a matching ambulatory keyword, workout_steps += 0 regardless of
  // parseable distance. ("drove 5 miles" must not count as 10,000 steps.)
  if NOT contains any of: "run", "ran", "jog", "walk", "hike", "treadmill":
    continue

  // (c) Extract miles — matches "mi", "mile", "miles" (case-insensitive via lowercase)
  miles_match = regex(/(\d+\.?\d*)\s*mi(?:le)?s?/)
  if miles_match:
    workout_steps += miles * 2000
    continue

  // (d) Extract kilometers — matches "km" only (NOT "kilo" or "kilometers")
  km_match = regex(/(\d+\.?\d*)\s*km/)
  if km_match:
    workout_steps += km * 0.621371 * 2000
    continue
```

**Step 2: Calculate net lifestyle steps**
```
net_steps = max(0, total_steps - workout_steps)
```

**Step 3: Calculate NEAT**
```
NEAT = OCC_BASE[occupation] + round(net_steps * 0.04)
```

### Output
```
{
  neat: integer,           // total NEAT kcal
  workout_steps: integer,  // steps attributed to workouts
  net_steps: integer       // lifestyle-only steps
}
```

### Edge Cases
- Unknown occupation: defaults to `sedentary` (200 kcal)
- No steps logged: NEAT = occupation base only
- Workout steps exceed total steps: `net_steps` clamped to 0

---

## 3. Thermic Effect of Food (TEF)

### Purpose
Estimates calories burned digesting food. Different macros have different thermic effects.

### Inputs
| Parameter | Type | Unit | Required |
|-----------|------|------|----------|
| calories | int | kcal | Yes |
| protein_g | float | grams | No |
| carbs_g | float | grams | No |
| fat_g | float | grams | No |

### Algorithm

If individual macros are available:
```
TEF = round(
  protein_g * 4 * 0.25 +   // 25% thermic effect
  carbs_g   * 4 * 0.08 +   // 8% thermic effect
  fat_g     * 9 * 0.03     // 3% thermic effect
)
```

If only total calories available:
```
TEF = round(calories * 0.10)   // 10% flat estimate
```

### Output
`TEF: integer` — kilocalories

---

## 4. Total Daily Energy Expenditure (TDEE)

### Purpose
Total calories burned in a day. Sum of all components.

### Formula
```
TDEE = RMR + NEAT + EAT + TEF

Where:
  RMR  = Resting Metabolic Rate (formula #1)
  NEAT = Non-Exercise Activity Thermogenesis (formula #2)
  EAT  = Exercise Activity Thermogenesis (sum of workout calories_burned)
  TEF  = Thermic Effect of Food (formula #3)
```

### Edge Cases
- If no workouts logged: `EAT = 0`
- If no food logged: `TEF = 0`
- TDEE can never be less than RMR (but this isn't explicitly enforced)

---

## 5. Calorie & Macro Targets

### Purpose
Compute daily intake targets based on user's goal.

### Inputs
| Parameter | Type | Required |
|-----------|------|----------|
| tdee | int | Yes |
| goal | string ("lose_weight", "build_muscle", "recomp", "maintain") | Yes |
| rmr | int | Yes |
| current_weight_lbs | float | Yes |
| target_weight_lbs | float | No |

### Constants
```
GOAL_CALORIE_ADJUSTMENTS = {
  lose_weight:  -0.20,   // 20% deficit
  build_muscle: +0.10,   // 10% surplus
  recomp:       -0.10,   // 10% deficit
  maintain:      0.00    // maintenance
}

GOAL_PROTEIN_G_PER_KG = {
  lose_weight:  2.0,
  build_muscle: 1.8,
  recomp:       2.2,
  maintain:     1.6
}

FAT_PERCENT_OF_CALORIES = 0.25    // 25%
FAT_FLOOR_G_PER_KG = 0.7         // minimum 0.7 g/kg body weight
CARB_MINIMUM_G = 100              // never below 100g carbs
```

### Algorithm

**Step 1: Calorie target**
```
adjustment = GOAL_CALORIE_ADJUSTMENTS[goal]
raw_target = round(tdee * (1 + adjustment))
calorie_target = max(raw_target, rmr)   // never eat below RMR
```

**Step 2: Protein target**
```
// For weight loss: use goal weight if set and lower than current
if goal == "lose_weight" AND target_weight < current_weight:
  reference_lbs = target_weight
else:
  reference_lbs = current_weight

reference_kg = reference_lbs * 0.453592
protein_g = round(reference_kg * GOAL_PROTEIN_G_PER_KG[goal])
```

**Step 3: Fat target**
```
body_kg = current_weight * 0.453592
fat_from_percent = round((calorie_target * 0.25) / 9)
fat_from_bodyweight = round(body_kg * 0.7)
fat_g = max(fat_from_percent, fat_from_bodyweight)
```

**Step 4: Carb target (remainder)**
```
remaining_calories = calorie_target - (protein_g * 4) - (fat_g * 9)
carbs_g = max(100, round(remaining_calories / 4))
```

### Output
```
{
  calorie_target: int,
  protein_g: int,
  carbs_g: int,
  fat_g: int,
  deficit_surplus: int   // calorie_target - tdee (negative = deficit)
}
```

### Edge Cases
- Carbs could go negative if protein + fat exceed calorie target → clamped to 100g minimum
- If calorie target < RMR: target raised to RMR
- If no target weight set: protein based on current weight

### Sources
- Helms et al. (2014) *J Int Soc Sports Nutr* — protein range 1.8-2.4 g/kg during restriction
- Morton et al. (2018) *Br J Sports Med* — diminishing returns above 1.6 g/kg for hypertrophy

---

## 6. Daily Momentum Score (0-100)

### Purpose
Single daily score measuring how well the user is tracking against their goals.

### Inputs
| Parameter | Type | Required |
|-----------|------|----------|
| user_id | int | Yes |
| date | string (YYYY-MM-DD) | Yes |
| calorie_goal | int | No (uses stored goal) |
| hour | int (0-23) | No (uses current hour) |
| planned_workout_today | bool | No |
| client_tdee | int | No |
| client_target_intake | int | No |

### Category Weights
```
WEIGHTS = {
  nutrition: 40,    // calorie accuracy
  macros:    25,    // protein/carbs/fat accuracy
  activity:  25,    // did you work out?
  checkin:    0,    // disabled (reserved for future)
  tasks:     10     // task completion rate
}
// Total: 100 points
```

### Algorithm

**Scoring method:** Start at 100, subtract penalties.

**Step 0: Time-of-day adjustment**
```
day_progress = clamp((hour - 6) / 15, 0.33, 1.0)
// 6 AM = 0.33 (33% of day)
// 12 PM = 0.40
// 9 PM = 1.0 (full day)
// Used to pro-rate targets so early-day scores aren't unfairly penalized
```

**Step 1: Nutrition penalty (0-40 points)**
```
if calorie_goal > 0 AND calories_consumed > 0:
  prorated_target = calorie_goal * day_progress
  deviation = abs(calories_consumed - prorated_target) / max(prorated_target, 1)
  penalty = min(1.0, deviation / 0.50) * 40
  // 50% deviation from prorated target = full 40-point penalty

if calories_consumed == 0 AND calorie_goal exists:
  penalty = 40  // full penalty for not logging

if no calorie goal:
  penalty = 0   // no goal = no penalty
```

**Step 2: Macros penalty (0-25 points)**
```
MACRO_WEIGHTS = { protein: 0.40, carbs: 0.30, fat: 0.30 }

for each macro in [protein, carbs, fat]:
  prorated = macro_goal * day_progress
  if macro_consumed > 0:
    deviation = abs(macro_consumed - prorated) / max(prorated, 1)
  else:
    deviation = 1.0  // no data = max deviation
  component = min(1.0, deviation / 0.75) * MACRO_WEIGHTS[macro]
  // 75% deviation = full penalty for that macro

macro_penalty = sum(components) * 25

if no macros logged but calories exist: penalty = 25
if no calorie data at all: penalty = 0
```

**Step 3: Activity penalty (0-25 points)**
```
// Only count manually-logged workouts (not Garmin auto-imports)
has_workout = any workout where garmin_activity_id IS NULL

if planned_workout_today == false: penalty = 0  // rest day
if has_workout: penalty = 0
if !has_workout AND planned: penalty = 25
```

**Step 4: Tasks penalty (0-10 points)**
```
if total_tasks > 0:
  penalty = (1 - completed_tasks / total_tasks) * 10
else:
  penalty = 0  // no tasks = no penalty
```

**Step 5: Final score**
```
total_penalty = nutrition_pen + macro_pen + activity_pen + task_pen
score = max(0, round(100 - total_penalty))
```

### Output
```
{
  momentum_score: int (0-100),
  nutrition_pct: float,
  protein_pct: float,
  activity_pct: float,
  checkin_done: int,
  task_rate: float,
  raw_deltas: object  // debug data
}
```

### Score Color Mapping
```
score >= 75: green
score >= 25: amber
score < 25:  red
```

---

## 7. Streak Calculation

### Purpose
Count consecutive days where the user logged any data.

### Inputs
| Parameter | Type |
|-----------|------|
| dailyLog | object (date → day data) |
| today | string (YYYY-MM-DD) |

### Algorithm
```
// Scroll window: 90 days displayed in horizontal bar
// Streak count: unlimited — scans backwards through entire dailyLog

logged(date) = entry.calories > 0 OR entry.weight OR entry.steps > 0 OR entry.deficit != null

// If today is logged, start counting from today
// If today is not yet logged, start counting from yesterday
startOffset = logged(today) ? 0 : 1

streak = 0
for i from startOffset to infinity:
  date = today - i days
  if logged(date):
    streak++
  else:
    break
```

### Output
`streak: integer` — consecutive days with any logged data (no upper limit)

### Edge Cases
- Today is allowed to be unlogged (streak counts from yesterday)
- If user has never logged: streak = 0
- Scroll bar shows 90 days; streak number can exceed 90 if logging history goes further back

---

## 8. Weight Loss Projection

### Purpose
Estimate weeks until user reaches goal weight.

### Inputs
| Parameter | Type | Unit |
|-----------|------|------|
| current_weight | float | lbs |
| target_weight | float | lbs |
| daily_deficit | int | kcal (positive value) |

### Formula
```
lbs_to_lose = current_weight - target_weight
if lbs_to_lose <= 0 OR daily_deficit <= 0: return null

weekly_deficit = daily_deficit * 7
lbs_per_week = weekly_deficit / 3500     // 3500 kcal = 1 lb
weeks = ceil(lbs_to_lose / lbs_per_week)
```

### Output
`weeks: integer | null`

---

## 9. Email Importance Classification

### Purpose
Classify emails as "important" or "stream" based on learned user preferences.

### Inputs
| Parameter | Type |
|-----------|------|
| sender_email | string |
| importance_rules | object (sender → score) |

### Algorithm

**Learning phase (user labels emails):**
```
// When user marks a sender as "important":
rules[sender.lower()] += 1
rules["@" + domain] += 0.5

// When user marks as "unimportant":
rules[sender.lower()] -= 1
rules["@" + domain] -= 0.5
```

**Scoring phase (classifying new emails):**
```
score = rules.get(sender.lower(), 0)
domain = sender.split("@")[1]
score += rules.get("@" + domain, 0)

if score > 0: classify as "important"
if score <= 0: classify as "stream"
```

### Output
`importance_score: float` — positive = important, zero/negative = stream

### Edge Cases
- New sender with no rules: score = 0 → classified as stream
- Domain-level rules apply to all senders from that domain
- Sender-level rules override domain-level

---

## 10. Calorie Ring Display

### Purpose
Visual representation of calorie balance as a donut chart.

### Inputs
| Parameter | Type |
|-----------|------|
| calories_consumed | int |
| calorie_target | int (intake target) |
| tdee | int |

### Algorithm

**Ring fill (shows progress toward intake target):**
```
pct = calorie_target > 0 ? min(1, max(0, calories_consumed / calorie_target)) : 0
ring_fill = round(pct * 314)    // 314 = 2π × 50 (SVG circle circumference)
```

**Ring color:**
```
remaining = calorie_target - calories_consumed
if remaining > 0:     color = green     // under target
if -200 < remaining <= 0: color = amber // slightly over
if remaining <= -200: color = red       // significantly over
if no data:           color = muted     // no food logged
```

**Center display:**
```
deficit_value = abs(tdee - calories_consumed)
if tdee >= calories_consumed: label = "DEFICIT", color = green
else: label = "OVER TARGET", color = red
```

**Equation row:**
```
"{tdee} burn − {consumed} eaten = {deficit} deficit"
```

---

## 11. Micronutrient Defaults

### Constants
```
SUGAR_GOAL_DEFAULT = 50      // grams per day (FDA recommendation)
FIBER_GOAL_DEFAULT = 30      // grams per day (FDA recommendation)
SODIUM_GOAL_DEFAULT = 2300   // milligrams per day (FDA recommendation)
```

These are user-adjustable via profile sliders.

---

## 12. Macro Energy Constants

```
CALORIES_PER_GRAM_PROTEIN = 4
CALORIES_PER_GRAM_CARBS = 4
CALORIES_PER_GRAM_FAT = 9
CALORIES_PER_POUND_BODY_WEIGHT = 3500
STEPS_PER_MILE = 2000
KCAL_PER_NET_STEP = 0.04
```

---

## 13. Unit Tests

**No unit tests exist in the codebase.** All formulas are tested manually through the UI.

### Recommended Test Cases

**RMR:**
- Male, 185 lbs, 5'10", 28 years → **1815 kcal** (Mifflin-St Jeor)
  — prior doc said "~1823"; formula `round(10·83.9145 + 6.25·177.8 - 5·28 + 5)` yields 1815 exactly.
- Same person with 18% body fat → **1856 kcal** (Katch-McArdle)
  — prior doc said "~1789"; LBM = 83.9145 × 0.82 = 68.8099, formula `round(370 + 21.6·68.8099)` yields 1856.
- Female, 140 lbs, 5'4", 30 years → **1340 kcal**
  — prior doc said "~1369"; formula `round(10·63.503 + 6.25·162.56 - 5·30 - 161)` yields 1340.

**Calorie Targets:**
- TDEE 2300, goal lose_weight → target = max(2300*0.8, RMR) = 1840
- TDEE 2300, goal build_muscle → target = 2300*1.1 = 2530
- TDEE 1500, RMR 1600, goal lose_weight → target = max(1200, 1600) = 1600 (RMR floor)

**Momentum Score:**
- Perfect day (all targets hit): 100
- Nothing logged, no goals: 100 (no penalties)
- Calorie goal 2000, consumed 3000 (50% over): nutrition_pen = 40
- All macros at 0, calorie goal exists: macro_pen = 25
- Workout planned but not done: activity_pen = 25
- 3 of 5 tasks done: task_pen = 4

**NEAT:**
- Sedentary + 8000 total steps, 2000 workout steps: NEAT = 200 + round(6000 * 0.04) = 440
- Physical + 0 steps: NEAT = 700

**TEF:**
- 150g protein, 250g carbs, 75g fat: TEF = round(150*4*0.25 + 250*4*0.08 + 75*9*0.03) = round(150+80+20.25) = 250

**Streak:**
- 7 consecutive days logged, today not yet: streak = 7
- Today logged, yesterday not: streak = 1
- Nothing logged ever: streak = 0

---

## Appendix A: Dormant Feature Logic (preserved for React Native rebuild)

### A.1 Check-In Scoring (score_brief)

**Status:** Dormant — UI removed, backend route exists but unreachable. Deleted from Flask codebase during pre-migration hardening. Rebuild in React Native when check-in feature is re-implemented.

**Purpose:** Score a morning or evening check-in and extract actionable tasks from free-text notes.

**AI Model:** Claude Haiku

**Prompt template:**
```
Analyze this {brief_type} check-in. Return ONLY valid JSON with these exact keys:
- "focus": integer 1-10 (goal clarity, motivation, mental sharpness)
- "wellbeing": integer 1-10 (mood, energy, stress — higher is better)
- "summary": string under 15 words capturing the key takeaway
- "tasks": array of CONCRETE actionable tasks only. STRICT RULES:
  1. Only include items the user EXPLICITLY stated as a specific thing they need to DO
  2. DO NOT include goals, aspirations, intentions, or desires
  3. DO NOT include habits, lifestyle advice, or anything implied by context
  4. DO NOT infer or suggest tasks — even if they seem obvious or helpful
  5. A task must be completable in a single action or session — not an ongoing goal
  6. Copy the user's wording closely. If nothing explicit, return empty array.
  Max 10 tasks.

Goals: {goals}
Notes: {notes}

Return JSON only, no other text:
```

**Output processing:**
- `focus`: clamped to 1-10
- `wellbeing`: clamped to 1-10
- `summary`: truncated to 100 chars
- `tasks`: each truncated to 120 chars, max 10 items
- Fallback on error: `{focus: 5, wellbeing: 5, summary: "Check-in recorded.", tasks: []}`

**Task routing:**
- Morning check-in tasks → created for today
- Evening check-in tasks → created for tomorrow
- Task source field set to `"morning_brief"` or `"evening_brief"`

### A.2 Check-In Momentum Weight

Check-ins were tracked in the momentum score but assigned **zero weight** (disabled):
```
MOMENTUM_WEIGHTS = { ..., "checkin": 0, ... }
```
If re-enabled, the penalty structure was:
- No morning check-in: 50% of checkin weight
- No evening check-in: 50% of checkin weight
