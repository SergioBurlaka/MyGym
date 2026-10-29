import { describe, expect, it } from 'vitest';
import {
  addedLoad,
  lastRepsForSet,
  loadPerRep,
  pickTargetUpSet,
  targetReps,
  totalReps,
  volumeKg,
} from '../src/modules/progression/load.js';

// The user's reference exercises (docs/tasks/exercise-load-model.md).
describe('loadPerRep / volumeKg', () => {
  it('barbell row: bar 20 + 2 x 16.25 = 52.5 kg, 3 x 12 -> 1890', () => {
    const load = loadPerRep('barbell', { weightPerUnitKg: '16.25', weightUnits: 2, barKg: '20' });
    expect(load).toBe(52.5);
    expect(volumeKg(load, [12, 12, 12], false)).toBe(1890);
  });

  it('biceps with two dumbbells together: 2 x 7.5 = 15', () => {
    expect(loadPerRep('dumbbell', { weightPerUnitKg: '7.5', weightUnits: 2 })).toBe(15);
  });

  it('alternating biceps (one dumbbell moves per rep): 7.5', () => {
    expect(loadPerRep('dumbbell', { weightPerUnitKg: 7.5, weightUnits: 1 })).toBe(7.5);
  });

  it('lunges with two dumbbells, each leg: 2 x 10 = 20, 3 x 13 per leg -> 1560', () => {
    const load = loadPerRep('dumbbell', { weightPerUnitKg: '10', weightUnits: 2 });
    expect(load).toBe(20);
    expect(totalReps([13, 13, 13], true)).toBe(78);
    expect(volumeKg(load, [13, 13, 13], true)).toBe(1560);
  });

  it('one-dumbbell French press, each arm: 5, 3 x 12 per arm -> 360', () => {
    const load = loadPerRep('dumbbell', { weightPerUnitKg: '5', weightUnits: 1 });
    expect(load).toBe(5);
    expect(volumeKg(load, [12, 12, 12], true)).toBe(360);
  });

  it('leg raises without weight: no load, volume in reps', () => {
    const load = loadPerRep('bodyweight', { weightPerUnitKg: null, weightUnits: null });
    expect(load).toBeNull();
    expect(volumeKg(load, [20, 18], false)).toBeNull();
    expect(totalReps([20, 18], false)).toBe(38);
  });

  it('bodyweight with added weight counts it once', () => {
    expect(loadPerRep('bodyweight', { weightPerUnitKg: '10', weightUnits: 1 })).toBe(10);
  });

  it('barbell without a bar (0) and a bar with no plates', () => {
    expect(loadPerRep('barbell', { weightPerUnitKg: '10', weightUnits: 2, barKg: '0' })).toBe(20);
    expect(loadPerRep('barbell', { weightPerUnitKg: '0', weightUnits: 2, barKg: '20' })).toBe(20);
    // No weight logged at all stays "no weight", whatever the bar.
    expect(loadPerRep('barbell', { weightPerUnitKg: null, weightUnits: null, barKg: '20' })).toBeNull();
  });

  it('added load leaves the bar out', () => {
    expect(addedLoad('barbell', { weightPerUnitKg: '16.25', weightUnits: 2, barKg: '20' })).toBe(32.5);
    expect(addedLoad('dumbbell', { weightPerUnitKg: '10', weightUnits: 2 })).toBe(20);
  });
});

describe('try-more target: +1 in one set', () => {
  it('picks the weakest set, the first of equals', () => {
    expect(pickTargetUpSet([12, 12, 11])).toBe(2);
    expect(pickTargetUpSet([12, 12, 12])).toBe(0);
    expect(pickTargetUpSet([10, 11, 12])).toBe(0);
    expect(pickTargetUpSet([])).toBe(-1);
  });

  it('adds one rep there only', () => {
    expect(targetReps([12, 12, 11])).toEqual({ reps: [12, 12, 12], upSetIndex: 2 });
    expect(targetReps([12, 12, 12])).toEqual({ reps: [13, 12, 12], upSetIndex: 0 });
    expect(targetReps([])).toBeNull();
  });
});

describe('lastRepsForSet (placeholders)', () => {
  it('same set number, or the last one when there were fewer sets', () => {
    expect(lastRepsForSet([12, 11], 0)).toBe(12);
    expect(lastRepsForSet([12, 11], 1)).toBe(11);
    expect(lastRepsForSet([12, 11], 3)).toBe(11);
    expect(lastRepsForSet([], 0)).toBeNull();
  });
});
