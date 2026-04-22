import { describe, expect, it } from 'vitest';

import { computeRmr } from '../rmr';

describe('computeRmr — Mifflin-St Jeor', () => {
  it('male 70kg / 175cm / 25y → 1674 kcal', () => {
    // base = 10*70 + 6.25*175 - 5*25 = 1668.75; +5 = 1673.75 → 1674
    const r = computeRmr({ weightKg: 70, heightCm: 175, ageYears: 25, sex: 'male' });
    expect(r.kcalPerDay).toBe(1674);
    expect(r.formulaUsed).toBe('mifflin');
  });

  it('female 60kg / 165cm / 30y → 1320 kcal', () => {
    // base = 600 + 1031.25 - 150 = 1481.25; -161 = 1320.25 → 1320
    const r = computeRmr({ weightKg: 60, heightCm: 165, ageYears: 30, sex: 'female' });
    expect(r.kcalPerDay).toBe(1320);
    expect(r.formulaUsed).toBe('mifflin');
  });

  it('BUSINESS_LOGIC ref: male 185 lbs (83.914 kg) / 70 in (177.8 cm) / 28y → 1815 kcal', () => {
    // 185 * 0.453592 = 83.91452 kg; 70 * 2.54 = 177.8 cm
    // base = 839.1452 + 1111.25 - 140 = 1810.3952; +5 = 1815.3952 → 1815
    // Note: doc says "~1823" — that's a doc error (off by 8).
    const r = computeRmr({ weightKg: 185 * 0.453592, heightCm: 70 * 2.54, ageYears: 28, sex: 'male' });
    expect(r.kcalPerDay).toBe(1815);
  });

  it('female 140 lbs / 64 in / 30y → 1340 kcal (doc says ~1369, actually 1340)', () => {
    const r = computeRmr({ weightKg: 140 * 0.453592, heightCm: 64 * 2.54, ageYears: 30, sex: 'female' });
    expect(r.kcalPerDay).toBe(1340);
  });
});

describe('computeRmr — Katch-McArdle', () => {
  it('15% body fat at 70 kg → 1655 kcal (height/age ignored)', () => {
    // LBM = 70 * 0.85 = 59.5 kg; 370 + 21.6*59.5 = 1655.2 → 1655
    const r = computeRmr({
      weightKg: 70,
      heightCm: 175,
      ageYears: 25,
      sex: 'male',
      bodyFatPct: 15,
    });
    expect(r.kcalPerDay).toBe(1655);
    expect(r.formulaUsed).toBe('katch');
  });

  it('boundary: 5% body fat uses Katch', () => {
    const r = computeRmr({ weightKg: 70, heightCm: 175, ageYears: 25, sex: 'male', bodyFatPct: 5 });
    expect(r.formulaUsed).toBe('katch');
  });

  it('boundary: 60% body fat uses Katch', () => {
    const r = computeRmr({ weightKg: 70, heightCm: 175, ageYears: 25, sex: 'male', bodyFatPct: 60 });
    expect(r.formulaUsed).toBe('katch');
  });
});

describe('computeRmr — fallback to Mifflin on invalid body fat', () => {
  it('undefined bodyFatPct → Mifflin', () => {
    const r = computeRmr({ weightKg: 70, heightCm: 175, ageYears: 25, sex: 'male' });
    expect(r.formulaUsed).toBe('mifflin');
  });

  it('bodyFatPct = 0 → Mifflin', () => {
    const r = computeRmr({ weightKg: 70, heightCm: 175, ageYears: 25, sex: 'male', bodyFatPct: 0 });
    expect(r.formulaUsed).toBe('mifflin');
  });

  it('bodyFatPct = 70 (out of range) → Mifflin', () => {
    const r = computeRmr({ weightKg: 70, heightCm: 175, ageYears: 25, sex: 'male', bodyFatPct: 70 });
    expect(r.formulaUsed).toBe('mifflin');
  });

  it('bodyFatPct = -5 (negative) → Mifflin', () => {
    const r = computeRmr({ weightKg: 70, heightCm: 175, ageYears: 25, sex: 'male', bodyFatPct: -5 });
    expect(r.formulaUsed).toBe('mifflin');
  });
});

describe('computeRmr — result shape', () => {
  it('returns both rounded and exact (2-decimal) kcal', () => {
    const r = computeRmr({ weightKg: 70, heightCm: 175, ageYears: 25, sex: 'male' });
    expect(r.kcalPerDay).toBe(Math.round(r.kcalPerDayExact));
    expect(r.kcalPerDayExact).toBe(1673.75);
  });
});
