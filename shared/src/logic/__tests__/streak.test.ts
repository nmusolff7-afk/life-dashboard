import { describe, expect, it } from 'vitest';

import { computeStreak, isLogged } from '../streak';

describe('isLogged', () => {
  it('undefined entry → false', () => {
    expect(isLogged(undefined)).toBe(false);
  });

  it('empty object → false', () => {
    expect(isLogged({})).toBe(false);
  });

  it('calories > 0 → true', () => {
    expect(isLogged({ calories: 500 })).toBe(true);
  });

  it('calories 0 alone → false', () => {
    expect(isLogged({ calories: 0 })).toBe(false);
  });

  it('weight present → true', () => {
    expect(isLogged({ weight: 175 })).toBe(true);
  });

  it('steps > 0 → true', () => {
    expect(isLogged({ steps: 8000 })).toBe(true);
  });

  it('deficit non-null (even zero) → true', () => {
    expect(isLogged({ deficit: 0 })).toBe(true);
    expect(isLogged({ deficit: -200 })).toBe(true);
  });

  it('deficit null → false', () => {
    expect(isLogged({ deficit: null })).toBe(false);
  });
});

describe('computeStreak', () => {
  const today = '2026-04-22';

  function buildLog(pattern: boolean[]): Record<string, { calories?: number }> {
    // pattern[0] = today, pattern[1] = yesterday, etc.
    const log: Record<string, { calories?: number }> = {};
    for (let i = 0; i < pattern.length; i++) {
      const d = new Date(Date.UTC(2026, 3, 22)); // Apr 22 2026 (month is 0-indexed)
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      if (pattern[i]) log[key] = { calories: 500 };
    }
    return log;
  }

  it('empty log → 0', () => {
    expect(computeStreak({ dailyLog: {}, today })).toBe(0);
  });

  it('today logged only → 1', () => {
    expect(computeStreak({ dailyLog: buildLog([true]), today })).toBe(1);
  });

  it('7 consecutive days logged, today included → 7', () => {
    expect(computeStreak({ dailyLog: buildLog([true, true, true, true, true, true, true]), today })).toBe(7);
  });

  it('today NOT logged but yesterday and back 6 more days are → 7 (BUSINESS_LOGIC §7)', () => {
    // pattern[0]=false (today), 1-7 true
    const log = buildLog([false, true, true, true, true, true, true, true]);
    expect(computeStreak({ dailyLog: log, today })).toBe(7);
  });

  it('today logged, yesterday NOT → 1', () => {
    const log = buildLog([true, false]);
    expect(computeStreak({ dailyLog: log, today })).toBe(1);
  });

  it('today logged, yesterday logged, 2 days ago logged, 3 days ago NOT → streak = 3', () => {
    const log = buildLog([true, true, true, false, true, true, true]);
    expect(computeStreak({ dailyLog: log, today })).toBe(3);
  });

  it('unbroken 30 days, today not yet logged → 30 (starts from yesterday)', () => {
    const pattern = [false, ...Array(30).fill(true)];
    expect(computeStreak({ dailyLog: buildLog(pattern), today })).toBe(30);
  });

  it('weight-only log still counts', () => {
    const d = new Date(Date.UTC(2026, 3, 22));
    const log: Record<string, { weight: number }> = { [today]: { weight: 175 } };
    d.setUTCDate(d.getUTCDate() - 1);
    log[d.toISOString().slice(0, 10)] = { weight: 176 };
    expect(computeStreak({ dailyLog: log, today })).toBe(2);
  });
});
