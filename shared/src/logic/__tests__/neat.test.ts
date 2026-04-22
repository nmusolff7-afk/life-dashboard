import { describe, expect, it } from 'vitest';

import { computeNeat, estimateWorkoutSteps, OCC_BASE } from '../neat';

describe('OCC_BASE constants', () => {
  it('matches index.html values', () => {
    expect(OCC_BASE).toEqual({ sedentary: 200, standing: 400, physical: 700 });
  });
});

describe('estimateWorkoutSteps', () => {
  it('"ran 3 miles" → 6000 steps', () => {
    expect(estimateWorkoutSteps('ran 3 miles')).toBe(6000);
  });

  it('"walked 1.5 mi" → 3000 steps', () => {
    expect(estimateWorkoutSteps('walked 1.5 mi')).toBe(3000);
  });

  it('"jogged 5km" → 6214 steps (5 × 0.621371 × 2000 = 6213.71)', () => {
    expect(estimateWorkoutSteps('jogged 5km')).toBe(6214);
  });

  it('"treadmill 2 miles" → 4000 steps', () => {
    expect(estimateWorkoutSteps('treadmill 2 miles')).toBe(4000);
  });

  it('non-ambulatory "cycling 10 miles" → 0 (bike wins over miles)', () => {
    expect(estimateWorkoutSteps('cycling 10 miles')).toBe(0);
  });

  it('non-ambulatory "strength training" → 0', () => {
    expect(estimateWorkoutSteps('strength training')).toBe(0);
  });

  it('"bench press 3x10" → 0 (bench and press both match)', () => {
    expect(estimateWorkoutSteps('bench press 3x10')).toBe(0);
  });

  it('"swimming laps" → 0', () => {
    expect(estimateWorkoutSteps('swimming laps')).toBe(0);
  });

  it('"yoga session" → 0 (not in ambulatory list)', () => {
    expect(estimateWorkoutSteps('yoga session')).toBe(0);
  });

  it('"walked a bit" without distance → 0', () => {
    expect(estimateWorkoutSteps('walked a bit')).toBe(0);
  });
});

describe('computeNeat', () => {
  it('sedentary, 0 steps, no workouts → 200 kcal', () => {
    const r = computeNeat({ occupation: 'sedentary', totalSteps: 0 });
    expect(r.neatKcal).toBe(200);
    expect(r.workoutSteps).toBe(0);
    expect(r.netSteps).toBe(0);
  });

  it('physical, 0 steps → 700 kcal', () => {
    expect(computeNeat({ occupation: 'physical', totalSteps: 0 }).neatKcal).toBe(700);
  });

  it('standing, 5000 steps, no workouts → 400 + round(5000*0.04) = 600', () => {
    const r = computeNeat({ occupation: 'standing', totalSteps: 5000 });
    expect(r.neatKcal).toBe(600);
    expect(r.netSteps).toBe(5000);
  });

  it('BUSINESS_LOGIC ref: sedentary + 8000 total - "ran 1 mile" (2000 steps) → NEAT = 200 + 240 = 440', () => {
    const r = computeNeat({
      occupation: 'sedentary',
      totalSteps: 8000,
      workoutDescriptions: ['ran 1 mile'],
    });
    expect(r.workoutSteps).toBe(2000);
    expect(r.netSteps).toBe(6000);
    expect(r.neatKcal).toBe(440);
  });

  it('workout steps exceed total → net clamped to 0', () => {
    const r = computeNeat({
      occupation: 'sedentary',
      totalSteps: 1000,
      workoutDescriptions: ['ran 3 miles'],
    });
    expect(r.workoutSteps).toBe(6000);
    expect(r.netSteps).toBe(0);
    expect(r.neatKcal).toBe(200);
  });

  it('multiple workouts sum their steps', () => {
    const r = computeNeat({
      occupation: 'standing',
      totalSteps: 20000,
      workoutDescriptions: ['ran 2 miles', 'walked 1 mile'],
    });
    expect(r.workoutSteps).toBe(6000);
    expect(r.netSteps).toBe(14000);
    expect(r.neatKcal).toBe(400 + 560);
  });

  it('non-ambulatory workout → no subtraction', () => {
    const r = computeNeat({
      occupation: 'sedentary',
      totalSteps: 5000,
      workoutDescriptions: ['strength training 45 minutes'],
    });
    expect(r.workoutSteps).toBe(0);
    expect(r.netSteps).toBe(5000);
  });
});
