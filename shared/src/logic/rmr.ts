/**
 * Resting Metabolic Rate — Mifflin-St Jeor (default) or Katch-McArdle (when body-fat known).
 *
 * Sources: Mifflin et al. (1990) Am J Clin Nutr; Katch & McArdle (1996).
 */

export type Sex = 'male' | 'female';
export type RmrFormula = 'mifflin' | 'katch';

export interface RmrInput {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  sex: Sex;
  bodyFatPct?: number;
}

export interface RmrResult {
  kcalPerDay: number;
  kcalPerDayExact: number;
  formulaUsed: RmrFormula;
}

/**
 * Body-fat validity window for Katch-McArdle. The Python reference in goal_config.py
 * uses 0 < bf < 100, but clinically plausible human values sit in 5-60 — using the
 * tighter range here rejects clearly-invalid profile_map values (e.g. 0, 99, -1).
 * Docs-vs-code deviation is flagged in the port's STATE report.
 */
const KATCH_BF_MIN = 5;
const KATCH_BF_MAX = 60;

export function computeRmr(input: RmrInput): RmrResult {
  const { weightKg, heightCm, ageYears, sex, bodyFatPct } = input;

  if (bodyFatPct !== undefined && bodyFatPct >= KATCH_BF_MIN && bodyFatPct <= KATCH_BF_MAX) {
    const leanBodyMassKg = weightKg * (1 - bodyFatPct / 100);
    const exact = 370 + 21.6 * leanBodyMassKg;
    return {
      kcalPerDay: Math.round(exact),
      kcalPerDayExact: Math.round(exact * 100) / 100,
      formulaUsed: 'katch',
    };
  }

  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  const exact = sex === 'male' ? base + 5 : base - 161;
  return {
    kcalPerDay: Math.round(exact),
    kcalPerDayExact: Math.round(exact * 100) / 100,
    formulaUsed: 'mifflin',
  };
}
