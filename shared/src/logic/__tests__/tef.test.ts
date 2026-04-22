import { describe, expect, it } from 'vitest';

import { computeTef, computeTefFlat, resolveTef } from '../tef';

describe('computeTef — explicit formula', () => {
  it('BUSINESS_LOGIC ref: 150P / 250C / 75F → 250 kcal', () => {
    // 150*4*0.25 + 250*4*0.08 + 75*9*0.03 = 150 + 80 + 20.25 = 250.25 → 250
    expect(computeTef({ proteinG: 150, carbsG: 250, fatG: 75 })).toBe(250);
  });

  it('zero macros → 0', () => {
    expect(computeTef({ proteinG: 0, carbsG: 0, fatG: 0 })).toBe(0);
  });

  it('protein-only: 100g → round(100*4*0.25) = 100', () => {
    expect(computeTef({ proteinG: 100, carbsG: 0, fatG: 0 })).toBe(100);
  });
});

describe('computeTefFlat', () => {
  it('2000 kcal → 200', () => {
    expect(computeTefFlat(2000)).toBe(200);
  });

  it('0 kcal → 0', () => {
    expect(computeTefFlat(0)).toBe(0);
  });
});

describe('resolveTef', () => {
  it('with macros → uses explicit formula', () => {
    expect(resolveTef(2000, { proteinG: 150, carbsG: 250, fatG: 75 })).toBe(250);
  });

  it('no macros → uses flat 10%', () => {
    expect(resolveTef(2000, {})).toBe(200);
  });

  it('all-zero macros → falls back to flat 10% (matches index.html calcTEF)', () => {
    expect(resolveTef(2000, { proteinG: 0, carbsG: 0, fatG: 0 })).toBe(200);
  });

  it('one macro nonzero → uses explicit formula even if others absent', () => {
    expect(resolveTef(2000, { proteinG: 100 })).toBe(100);
  });
});
