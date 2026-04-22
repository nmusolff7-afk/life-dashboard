import { describe, expect, it } from 'vitest';

import { computeMomentum, dayProgress, MOMENTUM_WEIGHTS } from '../momentum';

describe('MOMENTUM_WEIGHTS constants', () => {
  it('matches Flask weights: 40 / 25 / 25 / 0 / 10 = 100', () => {
    expect(MOMENTUM_WEIGHTS).toEqual({ nutrition: 40, macros: 25, activity: 25, checkin: 0, tasks: 10 });
    const sum = Object.values(MOMENTUM_WEIGHTS).reduce((s, v) => s + v, 0);
    expect(sum).toBe(100);
  });
});

describe('dayProgress', () => {
  it('hour 6 or earlier → 0.33 (floor)', () => {
    expect(dayProgress(6)).toBe(0.33);
    expect(dayProgress(0)).toBe(0.33);
  });
  it('hour 21 onward → 1.0 (ceiling)', () => {
    expect(dayProgress(21)).toBe(1.0);
    expect(dayProgress(23)).toBe(1.0);
  });
  it('hour 12 → 0.4 (midday)', () => {
    expect(dayProgress(12)).toBeCloseTo(0.4, 5);
  });
});

describe('computeMomentum — perfect day (score 100)', () => {
  it('all targets met at end of day', () => {
    const r = computeMomentum({
      hour: 21,
      calorieGoal: 2000, caloriesConsumed: 2000,
      proteinGoal: 150, proteinConsumed: 150,
      carbsGoal: 200, carbsConsumed: 200,
      fatGoal: 60, fatConsumed: 60,
      hasLoggedWorkout: true, workoutPlanned: true,
      totalTasks: 5, completedTasks: 5,
    });
    expect(r.score).toBe(100);
    expect(r.penalties.nutrition).toBe(0);
    expect(r.penalties.macros).toBe(0);
    expect(r.penalties.activity).toBe(0);
    expect(r.penalties.tasks).toBe(0);
  });
});

describe('computeMomentum — all penalties firing at once', () => {
  it('nothing logged, all goals set, planned workout skipped, tasks incomplete → score 0', () => {
    const r = computeMomentum({
      hour: 21,
      calorieGoal: 2000, caloriesConsumed: 0,
      proteinGoal: 150, proteinConsumed: 0,
      carbsGoal: 200, carbsConsumed: 0,
      fatGoal: 60, fatConsumed: 0,
      hasLoggedWorkout: false, workoutPlanned: true,
      totalTasks: 5, completedTasks: 0,
    });
    // cal_today=0 + cal_goal → nutrition_pen = 40
    // all macro consumed=0 with goals → weighted dev = 1.0 → macro_pen = 25
    // not done, planned → activity_pen = 25
    // 0/5 tasks → tasks_pen = 10
    // total = 100, score = 0
    expect(r.penalties.nutrition).toBe(40);
    expect(r.penalties.macros).toBe(25);
    expect(r.penalties.activity).toBe(25);
    expect(r.penalties.tasks).toBe(10);
    expect(r.score).toBe(0);
  });
});

describe('computeMomentum — individual component behavior', () => {
  it('calorie goal 2000 consumed 3000 (50% over) at hour 21 → nutrition_pen = 40 (full)', () => {
    // prorated = 2000, delta = 1000, dev = 0.5, pen = min(1, 0.5/0.5) * 40 = 40
    const r = computeMomentum({
      hour: 21,
      calorieGoal: 2000, caloriesConsumed: 3000,
      hasLoggedWorkout: false, workoutPlanned: false,
      totalTasks: 0, completedTasks: 0,
    });
    expect(r.penalties.nutrition).toBe(40);
  });

  it('calorie goal 2000 consumed 2200 (10% over) at hour 21 → partial nutrition penalty', () => {
    // prorated = 2000, delta = 200, dev = 0.1, pen = min(1, 0.1/0.5) * 40 = 0.2 * 40 = 8
    const r = computeMomentum({
      hour: 21,
      calorieGoal: 2000, caloriesConsumed: 2200,
      hasLoggedWorkout: true, workoutPlanned: true,
      totalTasks: 0, completedTasks: 0,
    });
    expect(r.penalties.nutrition).toBe(8);
    expect(r.score).toBe(92);
  });

  it('workout planned but not done → activity_pen = 25', () => {
    const r = computeMomentum({
      caloriesConsumed: 100,
      hasLoggedWorkout: false, workoutPlanned: true,
      totalTasks: 0, completedTasks: 0,
    });
    expect(r.penalties.activity).toBe(25);
  });

  it('rest day → activity_pen = 0 even without workout', () => {
    const r = computeMomentum({
      caloriesConsumed: 100,
      hasLoggedWorkout: false, workoutPlanned: false,
      totalTasks: 0, completedTasks: 0,
    });
    expect(r.penalties.activity).toBe(0);
    expect(r.rawDeltas.workout.rest_day).toBe(true);
  });

  it('3 of 5 tasks done → tasks_pen = 4', () => {
    // pen = (1 - 3/5) * 10 = 4
    const r = computeMomentum({
      caloriesConsumed: 100,
      hasLoggedWorkout: true, workoutPlanned: true,
      totalTasks: 5, completedTasks: 3,
    });
    expect(r.penalties.tasks).toBe(4);
  });

  it('no tasks → tasks_pen = 0', () => {
    const r = computeMomentum({
      caloriesConsumed: 100,
      hasLoggedWorkout: true, workoutPlanned: true,
      totalTasks: 0, completedTasks: 0,
    });
    expect(r.penalties.tasks).toBe(0);
  });
});

describe('computeMomentum — macro quirks matching Flask', () => {
  it('no macro goals AND cal_today=0 → macro_pen = 25 (Flask quirk, not in doc)', () => {
    const r = computeMomentum({
      caloriesConsumed: 0,
      hasLoggedWorkout: true, workoutPlanned: true,
      totalTasks: 0, completedTasks: 0,
    });
    expect(r.penalties.macros).toBe(25);
  });

  it('no macro goals but cal_today > 0 → macro_pen = 0', () => {
    const r = computeMomentum({
      caloriesConsumed: 500,
      hasLoggedWorkout: true, workoutPlanned: true,
      totalTasks: 0, completedTasks: 0,
    });
    expect(r.penalties.macros).toBe(0);
  });

  it('partial macro goals (protein only) → weights normalize', () => {
    // Only protein goal set (weight 0.4); totalWeight = 0.4 → normalized = 1.0
    // consumed = 75 vs prorated 150 (hour=21, full day) → dev = 0.5
    // weighted_dev = min(1, 0.5/0.75) * (0.4/0.4) = 0.6667
    // macro_pen = 0.6667 * 25 = 16.67
    const r = computeMomentum({
      hour: 21,
      caloriesConsumed: 500,
      proteinGoal: 150, proteinConsumed: 75,
      hasLoggedWorkout: true, workoutPlanned: true,
      totalTasks: 0, completedTasks: 0,
    });
    expect(r.penalties.macros).toBeCloseTo(16.67, 1);
  });
});

describe('computeMomentum — early-day proration', () => {
  it('hour 8, cal_goal 2000 consumed 500 → lighter penalty due to proration', () => {
    // day_progress = max(0.33, (8-6)/15) = max(0.33, 0.1333) = 0.33
    // prorated = 2000 * 0.33 = 660
    // delta = 500 - 660 = -160, dev = 160/660 ≈ 0.2424
    // pen = min(1, 0.2424/0.5) * 40 = 0.4848 * 40 ≈ 19.39
    const r = computeMomentum({
      hour: 8,
      calorieGoal: 2000, caloriesConsumed: 500,
      hasLoggedWorkout: true, workoutPlanned: true,
      totalTasks: 0, completedTasks: 0,
    });
    expect(r.penalties.nutrition).toBeCloseTo(19.39, 1);
  });
});

describe('computeMomentum — raw deltas shape', () => {
  it('returns calories target/actual/delta + workout/tasks state', () => {
    const r = computeMomentum({
      hour: 21,
      calorieGoal: 2000, caloriesConsumed: 1800,
      hasLoggedWorkout: true, workoutPlanned: true,
      totalTasks: 3, completedTasks: 2,
    });
    expect(r.rawDeltas.calories).toEqual({ target: 2000, actual: 1800, delta: -200 });
    expect(r.rawDeltas.workout).toEqual({ done: true, rest_day: false });
    expect(r.rawDeltas.tasks).toEqual({ total: 3, completed: 2 });
  });
});
