import { describe, expect, it } from 'vitest';

import {
  GOAL_CONFIGS,
  MICRO_DEFAULTS,
  computeCalorieTarget,
  computeMacroTargets,
  computeTargets,
  getGoalConfig,
} from '../targets';

describe('GOAL_CONFIGS constants', () => {
  it('has all four goals with Flask-matching values', () => {
    expect(GOAL_CONFIGS.lose_weight.calAdjust).toBe(-0.20);
    expect(GOAL_CONFIGS.lose_weight.proteinGPerKg).toBe(2.0);
    expect(GOAL_CONFIGS.lose_weight.proteinRef).toBe('goal');
    expect(GOAL_CONFIGS.build_muscle.calAdjust).toBe(0.10);
    expect(GOAL_CONFIGS.build_muscle.proteinGPerKg).toBe(1.8);
    expect(GOAL_CONFIGS.build_muscle.proteinRef).toBe('current');
    expect(GOAL_CONFIGS.recomp.calAdjust).toBe(-0.10);
    expect(GOAL_CONFIGS.recomp.proteinGPerKg).toBe(2.2);
    expect(GOAL_CONFIGS.maintain.calAdjust).toBe(0.0);
    expect(GOAL_CONFIGS.maintain.proteinGPerKg).toBe(1.6);
  });

  it('MICRO_DEFAULTS match FDA values in BUSINESS_LOGIC.md §11', () => {
    expect(MICRO_DEFAULTS).toEqual({ sugarG: 50, fiberG: 30, sodiumMg: 2300 });
  });
});

describe('getGoalConfig', () => {
  it('returns the matched config', () => {
    expect(getGoalConfig('build_muscle').calAdjust).toBe(0.10);
  });
  it('falls back to lose_weight for unknown keys', () => {
    expect(getGoalConfig('not-a-real-goal').key).toBe('lose_weight');
  });
});

describe('computeCalorieTarget', () => {
  it('lose_weight: TDEE 2500 → round(2500*0.8)=2000 (not floored)', () => {
    const r = computeCalorieTarget({ tdee: 2500, rmr: 1700, goal: 'lose_weight' });
    expect(r.calorieTarget).toBe(2000);
    expect(r.flooredToRmr).toBe(false);
    expect(r.deficitSurplus).toBe(-500);
  });

  it('build_muscle: TDEE 2500 → 2750 surplus', () => {
    const r = computeCalorieTarget({ tdee: 2500, rmr: 1700, goal: 'build_muscle' });
    expect(r.calorieTarget).toBe(2750);
    expect(r.deficitSurplus).toBe(250);
  });

  it('RMR floor: TDEE 1000 + RMR 1145 + lose_weight → target clamped to 1145', () => {
    // raw = round(1000*0.8) = 800; max(800, 1145) = 1145
    const r = computeCalorieTarget({ tdee: 1000, rmr: 1145, goal: 'lose_weight' });
    expect(r.calorieTarget).toBe(1145);
    expect(r.flooredToRmr).toBe(true);
  });

  it('TDEE=0 uses RMR as fallback', () => {
    const r = computeCalorieTarget({ tdee: 0, rmr: 1700, goal: 'maintain' });
    expect(r.tdeeUsed).toBe(1700);
    expect(r.calorieTarget).toBe(1700);
  });
});

describe('computeMacroTargets', () => {
  it('lose_weight with goal weight < current → protein uses goal weight', () => {
    // weightKg=81.6466 (180 lbs), targetKg=77.1106 (170 lbs), calorieTarget=2000
    // proteinG = round(77.1106 * 2.0) = 154
    // fatFromPct = round(2000*0.25/9) = round(55.555...) = 56
    // fatFromBw = round(81.6466 * 0.7) = round(57.1526) = 57
    // fatG = 57
    // remaining = 2000 - 616 - 513 = 871
    // carbsG = max(100, round(871/4)) = max(100, 218) = 218
    const r = computeMacroTargets({
      calorieTarget: 2000,
      weightKg: 180 * 0.453592,
      targetWeightKg: 170 * 0.453592,
      goal: 'lose_weight',
    });
    expect(r.proteinG).toBe(154);
    expect(r.fatG).toBe(57);
    expect(r.carbsG).toBe(218);
  });

  it('build_muscle ignores goal weight (uses current)', () => {
    // weightKg=81.6466, targetKg=77.1106 (ignored because proteinRef='current')
    // proteinG = round(81.6466 * 1.8) = 147
    const r = computeMacroTargets({
      calorieTarget: 2750,
      weightKg: 180 * 0.453592,
      targetWeightKg: 170 * 0.453592,
      goal: 'build_muscle',
    });
    expect(r.proteinG).toBe(147);
  });

  it('carbs clamped to 100g minimum if protein + fat exceed calorie target', () => {
    // calorieTarget=500 (absurdly low), weight=180 lbs (81.6466 kg), build_muscle
    // protein = round(81.6466 * 1.8) = 147 → 588 kcal
    // fatFromPct = round(500*0.25/9) = round(13.89) = 14
    // fatFromBw = round(57.15) = 57 → 57*9 = 513
    // fatG = 57
    // remaining = 500 - 588 - 513 = -601; round(-601/4) = -150
    // carbsG = max(100, -150) = 100
    const r = computeMacroTargets({
      calorieTarget: 500,
      weightKg: 180 * 0.453592,
      goal: 'build_muscle',
    });
    expect(r.carbsG).toBe(100);
  });
});

describe('computeTargets (full bundle)', () => {
  it('scenario: lose_weight, 180 lbs / target 170 / 5\'10" / 30y / male / TDEE 2500', () => {
    const r = computeTargets({
      goal: 'lose_weight',
      weightLbs: 180, targetWeightLbs: 170,
      heightFt: 5, heightIn: 10, ageYears: 30, sex: 'male',
      tdee: 2500,
    });
    expect(r.rmr).toBe(1783);
    expect(r.rmrMethod).toBe('mifflin_st_jeor');
    expect(r.tdeeUsed).toBe(2500);
    expect(r.calorieTarget).toBe(2000);
    expect(r.deficitSurplus).toBe(-500);
    expect(r.proteinG).toBe(154);
    expect(r.fatG).toBe(57);
    expect(r.carbsG).toBe(218);
    expect(r.sugarG).toBe(50);
  });

  it('scenario: build_muscle, same stats, TDEE 2500 → 2750 cal target, 147/76/370', () => {
    const r = computeTargets({
      goal: 'build_muscle',
      weightLbs: 180,
      heightFt: 5, heightIn: 10, ageYears: 30, sex: 'male',
      tdee: 2500,
    });
    expect(r.calorieTarget).toBe(2750);
    expect(r.proteinG).toBe(147);
    expect(r.fatG).toBe(76);
    expect(r.carbsG).toBe(370);
  });

  it('scenario: recomp, 180 lbs / target 175 / 5\'10" / 30y / male / TDEE 2400 → exact macro sum', () => {
    const r = computeTargets({
      goal: 'recomp',
      weightLbs: 180, targetWeightLbs: 175,
      heightFt: 5, heightIn: 10, ageYears: 30, sex: 'male',
      tdee: 2400,
    });
    expect(r.calorieTarget).toBe(2160);
    expect(r.proteinG).toBe(180);
    expect(r.fatG).toBe(60);
    expect(r.carbsG).toBe(225);
    // Sum: 180*4 + 60*9 + 225*4 = 720 + 540 + 900 = 2160 (exact match to target)
    expect(r.proteinG * 4 + r.fatG * 9 + r.carbsG * 4).toBe(2160);
  });

  it('scenario: maintain, 180 lbs / 5\'10" / 30y / male / TDEE 2500 → target=2500', () => {
    const r = computeTargets({
      goal: 'maintain',
      weightLbs: 180,
      heightFt: 5, heightIn: 10, ageYears: 30, sex: 'male',
      tdee: 2500,
    });
    expect(r.calorieTarget).toBe(2500);
    expect(r.deficitSurplus).toBe(0);
    expect(r.proteinG).toBe(131);
    expect(r.fatG).toBe(69);
    expect(r.carbsG).toBe(339);
  });

  it('edge: very low TDEE triggers RMR floor', () => {
    // 110 lbs / 5\' / 20y / female: RMR should be ~1145
    // TDEE 1000 (lower than RMR after deficit), goal lose_weight
    // raw = round(1000 * 0.8) = 800; floored to RMR = 1145
    const r = computeTargets({
      goal: 'lose_weight',
      weightLbs: 110,
      heightFt: 5, heightIn: 0, ageYears: 20, sex: 'female',
      tdee: 1000,
    });
    expect(r.calorieTarget).toBe(r.rmr);
    expect(r.deficitSurplus).toBe(r.rmr - 1000);
  });

  it('macro math sums to within ±3 kcal of calorieTarget across all scenarios', () => {
    const scenarios: Parameters<typeof computeTargets>[0][] = [
      { goal: 'lose_weight', weightLbs: 180, targetWeightLbs: 170, heightFt: 5, heightIn: 10, ageYears: 30, sex: 'male', tdee: 2500 },
      { goal: 'build_muscle', weightLbs: 180, heightFt: 5, heightIn: 10, ageYears: 30, sex: 'male', tdee: 2500 },
      { goal: 'recomp', weightLbs: 180, targetWeightLbs: 175, heightFt: 5, heightIn: 10, ageYears: 30, sex: 'male', tdee: 2400 },
      { goal: 'maintain', weightLbs: 180, heightFt: 5, heightIn: 10, ageYears: 30, sex: 'male', tdee: 2500 },
    ];
    for (const s of scenarios) {
      const r = computeTargets(s);
      const sum = r.proteinG * 4 + r.fatG * 9 + r.carbsG * 4;
      expect(Math.abs(sum - r.calorieTarget)).toBeLessThanOrEqual(3);
    }
  });
});
