import { describe, expect, it } from 'vitest';

import { composeTdee, computeTdee } from '../tdee';

describe('computeTdee (direct sum)', () => {
  it('RMR 1674 + NEAT 440 + EAT 300 + TEF 250 = 2664', () => {
    expect(computeTdee({ rmr: 1674, neat: 440, eat: 300, tef: 250 })).toBe(2664);
  });

  it('all zeros → 0', () => {
    expect(computeTdee({ rmr: 0, neat: 0, eat: 0, tef: 0 })).toBe(0);
  });
});

describe('composeTdee (integration)', () => {
  it('realistic day: male 70kg sedentary, 8000 steps, ran 1 mile, 500 kcal burn, 2000 kcal 150P/250C/75F', () => {
    const r = composeTdee({
      rmr: { weightKg: 70, heightCm: 175, ageYears: 25, sex: 'male' },
      neat: {
        occupation: 'sedentary',
        totalSteps: 8000,
        workoutDescriptions: ['ran 1 mile'],
      },
      eatKcal: 500,
      macros: { proteinG: 150, carbsG: 250, fatG: 75 },
      caloriesConsumed: 2000,
    });

    // RMR = 1674 (from rmr test), NEAT = 440 (from neat test), EAT = 500, TEF = 250
    expect(r.components).toEqual({ rmr: 1674, neat: 440, eat: 500, tef: 250 });
    expect(r.tdee).toBe(2864);
    expect(r.rmrFormula).toBe('mifflin');
    expect(r.workoutSteps).toBe(2000);
    expect(r.netSteps).toBe(6000);
  });

  it('no food logged → TEF falls back to flat 10% of caloriesConsumed', () => {
    const r = composeTdee({
      rmr: { weightKg: 70, heightCm: 175, ageYears: 25, sex: 'male' },
      neat: { occupation: 'sedentary', totalSteps: 0 },
      eatKcal: 0,
      caloriesConsumed: 1500,
    });
    // TEF = round(1500 * 0.10) = 150
    expect(r.components.tef).toBe(150);
  });

  it('zero calories consumed and no macros → TEF is 0', () => {
    const r = composeTdee({
      rmr: { weightKg: 70, heightCm: 175, ageYears: 25, sex: 'male' },
      neat: { occupation: 'sedentary', totalSteps: 0 },
      eatKcal: 0,
    });
    expect(r.components.tef).toBe(0);
    expect(r.tdee).toBe(1674 + 200);
  });
});
