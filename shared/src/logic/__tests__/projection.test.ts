import { describe, expect, it } from 'vitest';

import { computeProjection } from '../projection';

describe('computeProjection — steady deficit (lose)', () => {
  it('10 lbs to lose at 500 kcal/day → ceil(10 / 1 lb/week) = 10 weeks', () => {
    const r = computeProjection({
      currentWeightLbs: 180,
      targetWeightLbs: 170,
      dailyDeficitKcal: 500,
      today: '2026-04-22',
    });
    expect(r.weeks).toBe(10);
    expect(r.projectedDate).toBe('2026-07-01');
    // Points: week 0..10 → 11 checkpoints
    expect(r.points).toHaveLength(11);
    expect(r.points[0].date).toBe('2026-04-22');
    expect(r.points[0].projectedWeightLbs).toBe(180);
    expect(r.points[10].date).toBe('2026-07-01');
    expect(r.points[10].projectedWeightLbs).toBe(170);
  });

  it('5 lbs to lose at 250 kcal/day → 0.5 lb/week, ceil(5 / 0.5) = 10 weeks', () => {
    const r = computeProjection({
      currentWeightLbs: 150,
      targetWeightLbs: 145,
      dailyDeficitKcal: 250,
      today: '2026-04-22',
    });
    expect(r.weeks).toBe(10);
  });

  it('exact match at the formula boundary: 7 lbs at 500/day → ceil(7/1) = 7 weeks', () => {
    const r = computeProjection({
      currentWeightLbs: 177,
      targetWeightLbs: 170,
      dailyDeficitKcal: 500,
      today: '2026-04-22',
    });
    expect(r.weeks).toBe(7);
  });
});

describe('computeProjection — surplus (gain)', () => {
  it('5 lbs to gain at 250 kcal/day surplus (negative deficit) → 10 weeks', () => {
    const r = computeProjection({
      currentWeightLbs: 150,
      targetWeightLbs: 155,
      dailyDeficitKcal: -250,
      today: '2026-04-22',
    });
    expect(r.weeks).toBe(10);
    expect(r.points[0].projectedWeightLbs).toBe(150);
    expect(r.points[10].projectedWeightLbs).toBe(155);
  });
});

describe('computeProjection — impossible / edge cases', () => {
  it('zero deficit → null', () => {
    const r = computeProjection({
      currentWeightLbs: 180,
      targetWeightLbs: 170,
      dailyDeficitKcal: 0,
      today: '2026-04-22',
    });
    expect(r.weeks).toBe(null);
    expect(r.projectedDate).toBe(null);
    expect(r.points).toEqual([]);
  });

  it('already at target → weeks 0', () => {
    const r = computeProjection({
      currentWeightLbs: 170,
      targetWeightLbs: 170,
      dailyDeficitKcal: 500,
      today: '2026-04-22',
    });
    expect(r.weeks).toBe(0);
    expect(r.projectedDate).toBe('2026-04-22');
  });

  it('surplus with loss goal (direction mismatch) → null', () => {
    const r = computeProjection({
      currentWeightLbs: 180,
      targetWeightLbs: 170,
      dailyDeficitKcal: -500,
      today: '2026-04-22',
    });
    expect(r.weeks).toBe(null);
  });

  it('deficit with gain goal (direction mismatch) → null', () => {
    const r = computeProjection({
      currentWeightLbs: 150,
      targetWeightLbs: 160,
      dailyDeficitKcal: 500,
      today: '2026-04-22',
    });
    expect(r.weeks).toBe(null);
  });

  it('missing weights → null', () => {
    expect(
      computeProjection({ currentWeightLbs: 180, dailyDeficitKcal: 500, today: '2026-04-22' }).weeks,
    ).toBe(null);
  });

  it('kg inputs work identically to lbs', () => {
    const r = computeProjection({
      currentWeightKg: 180 * 0.453592,
      targetWeightKg: 170 * 0.453592,
      dailyDeficitKcal: 500,
      today: '2026-04-22',
    });
    expect(r.weeks).toBe(10);
  });
});
