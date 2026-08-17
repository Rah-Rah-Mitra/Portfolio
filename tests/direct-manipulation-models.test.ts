import { describe, expect, it, vi } from 'vitest';
import { InteractionArbitrator } from '../lib/InteractionArbitrator';
import {
  computeFlowShopSchedule,
  createFlowShopState,
  reorderFlowShopJob,
  resetFlowShopState,
} from '../lib/flowShop';
import {
  DEFAULT_MARKER,
  SYNTHETIC_PLOTS,
  createSpatialState,
  moveSpatialMarker,
  resetSpatialState,
  toggleSpatialOverlay,
} from '../lib/spatialAllocation';

describe('InteractionArbitrator', () => {
  it('primes without capture or prevention, then starts dragging at the 8px threshold', () => {
    const events = vi.fn();
    const arbitrator = new InteractionArbitrator(events);

    expect(arbitrator.pointerDown({ pointerId: 7, x: 10, y: 10 }, 'spatial-systems')).toEqual({
      state: 'primed',
      capturePointer: false,
      preventDefault: false,
    });
    expect(arbitrator.pointerMove({ pointerId: 7, x: 17, y: 10 })).toEqual({
      state: 'primed',
      capturePointer: false,
      preventDefault: false,
    });
    expect(arbitrator.pointerMove({ pointerId: 7, x: 18, y: 10 })).toEqual({
      state: 'dragging',
      capturePointer: true,
      preventDefault: true,
    });
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ type: 'INTERACTION_PRIMED', sceneId: 'spatial-systems' }));
  });

  it('resolves movement under the threshold as a click without claiming control', () => {
    const arbitrator = new InteractionArbitrator();
    arbitrator.pointerDown({ pointerId: 3, x: 20, y: 20 }, 'spatial-systems');
    expect(arbitrator.pointerMove({ pointerId: 3, x: 24, y: 25 })).toMatchObject({ state: 'primed', capturePointer: false, preventDefault: false });
    expect(arbitrator.pointerUp()).toMatchObject({ state: 'idle', owner: 'story' });
  });

  it('releases ownership on Escape, scroll, focus loss, cancel, and reset', () => {
    const arbitrator = new InteractionArbitrator();
    arbitrator.pointerDown({ pointerId: 1, x: 0, y: 0 }, 'systems-in-motion');
    arbitrator.pointerMove({ pointerId: 1, x: 9, y: 0 });
    expect(arbitrator.owner).toBe('visitor');
    expect(arbitrator.escape()).toMatchObject({ state: 'idle', owner: 'story' });

    for (const release of ['scrollOut', 'focusLost', 'pointerCancel', 'reset'] as const) {
      arbitrator.pointerDown({ pointerId: 2, x: 0, y: 0 }, 'systems-in-motion');
      arbitrator.pointerMove({ pointerId: 2, x: 0, y: 10 });
      expect(arbitrator[release]()).toMatchObject({ state: 'idle', owner: 'story' });
    }
  });

  it('creates fine and coarse keyboard intents and hands Explore ownership back', () => {
    const events = vi.fn();
    const arbitrator = new InteractionArbitrator(events);
    expect(arbitrator.keyboardIntent('ArrowRight', false)).toEqual({ delta: 1, axis: 'x', preventDefault: true });
    expect(arbitrator.keyboardIntent('ArrowDown', true)).toEqual({ delta: 10, axis: 'y', preventDefault: true });
    expect(arbitrator.keyboardIntent('Enter', false)).toBeNull();
    arbitrator.enterExplore('selected-work');
    expect(arbitrator.state).toBe('exploring');
    expect(arbitrator.owner).toBe('visitor');
    arbitrator.escape();
    expect(arbitrator.owner).toBe('story');
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ type: 'EXPLORE_EXITED', sceneId: 'selected-work' }));
  });

  it('does not let a secondary pointer steal or terminate the active interaction', () => {
    const events = vi.fn();
    const arbitrator = new InteractionArbitrator(events);
    arbitrator.pointerDown({ pointerId: 11, x: 0, y: 0 }, 'spatial-systems');
    arbitrator.pointerMove({ pointerId: 11, x: 9, y: 0 });

    expect(arbitrator.pointerDown({ pointerId: 22, x: 50, y: 50 }, 'selected-work')).toMatchObject({ state: 'dragging', owner: 'visitor' });
    expect(arbitrator.pointerMove({ pointerId: 22, x: 80, y: 80 })).toMatchObject({ state: 'dragging', capturePointer: false, preventDefault: false });
    expect(arbitrator.pointerUp(22)).toMatchObject({ state: 'dragging', owner: 'visitor' });
    expect(arbitrator.pointerCancel(22)).toMatchObject({ state: 'dragging', owner: 'visitor' });
    expect(arbitrator.state).toBe('dragging');
    expect(events).not.toHaveBeenCalledWith(expect.objectContaining({ sceneId: 'selected-work' }));

    expect(arbitrator.pointerUp(11)).toMatchObject({ state: 'idle', owner: 'story' });
  });
});

describe('deterministic permutation flow shop', () => {
  it.each([
    [['A', 'B', 'C'], 18],
    [['A', 'C', 'B'], 17],
    [['B', 'A', 'C'], 21],
    [['B', 'C', 'A'], 22],
    [['C', 'A', 'B'], 18],
    [['C', 'B', 'A'], 20],
  ] as const)('computes %j with makespan %i', (order, makespan) => {
    expect(computeFlowShopSchedule([...order]).makespan).toBe(makespan);
  });

  it('computes hand-derived operation timing, idle time, and final critical operation', () => {
    const schedule = computeFlowShopSchedule(['A', 'B', 'C']);
    expect(schedule.machineTotals).toEqual({ M1: 13, M2: 14 });
    expect(schedule.machineIdle).toEqual({ M1: 5, M2: 4 });
    expect(schedule.operations).toEqual([
      expect.objectContaining({ id: 'A-M1', start: 0, end: 3 }),
      expect.objectContaining({ id: 'A-M2', start: 3, end: 10 }),
      expect.objectContaining({ id: 'B-M1', start: 3, end: 9 }),
      expect.objectContaining({ id: 'B-M2', start: 10, end: 12 }),
      expect.objectContaining({ id: 'C-M1', start: 9, end: 13 }),
      expect.objectContaining({ id: 'C-M2', start: 13, end: 18 }),
    ]);
    expect(schedule.criticalOperationId).toBe('C-M2');
  });

  it('rejects incomplete, duplicate, and unknown orders', () => {
    expect(() => computeFlowShopSchedule(['A', 'A', 'C'])).toThrow(/exactly once/i);
    expect(() => computeFlowShopSchedule(['A', 'B'])).toThrow(/three jobs/i);
    expect(() => computeFlowShopSchedule(['A', 'B', 'D'])).toThrow(/exactly once/i);
  });

  it('reorders and resets state without mutating the previous result', () => {
    const initial = createFlowShopState();
    const changed = reorderFlowShopJob(initial, 2, 1);
    expect(initial.order).toEqual(['A', 'B', 'C']);
    expect(changed.order).toEqual(['A', 'C', 'B']);
    expect(changed.schedule.makespan).toBe(17);
    expect(resetFlowShopState(changed)).toEqual(initial);
  });
});

describe('synthetic spatial allocation', () => {
  it('finds North as the default nearest eligible plot and exposes every distance', () => {
    const state = createSpatialState();
    expect(state.marker).toEqual(DEFAULT_MARKER);
    expect(state.nearestEligible.id).toBe('north');
    expect(state.distances.map((entry) => [entry.plot.id, entry.distance])).toEqual([
      ['north', 37.48],
      ['east', 43.05],
      ['south', 39.45],
      ['west', 37.54],
    ]);
    expect(state.route).toEqual({ from: [45, 44], to: [18, 18] });
  });

  it('clamps marker coordinates, ignores ineligible South, and resets overlays', () => {
    const initial = createSpatialState();
    const moved = moveSpatialMarker(initial, [90, 120]);
    expect(moved.marker).toEqual([90, 100]);
    expect(moved.nearestEligible.id).not.toBe('south');
    const overlayed = toggleSpatialOverlay(toggleSpatialOverlay(moved, 'eligibility'), 'capacity');
    expect(overlayed.overlays).toEqual({ eligibility: true, capacity: true });
    expect(resetSpatialState(overlayed)).toEqual(initial);
    expect(SYNTHETIC_PLOTS.find((plot) => plot.id === 'south')?.eligible).toBe(false);
  });
});
