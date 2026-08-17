import { describe, expect, it } from 'vitest';
import { COURIER_CLIP_ALIASES, reactionForEvent, shouldRestartReaction, traversalClipFor } from '../lib/courierReactions';

describe('Courier reaction and traversal policy', () => {
  it('maps typed events to centralized aliases and priorities', () => {
    expect(reactionForEvent({ type: 'JOB_REORDERED', oldMakespan: 18, newMakespan: 17, makespanDelta: -1, order: ['A', 'C', 'B'] })).toMatchObject({ alias: 'point', priority: 50 });
    expect(reactionForEvent({ type: 'CAMERA_CALIBRATED', reprojectionError: .3 })).toMatchObject({ alias: 'success', priority: 60 });
    expect(reactionForEvent({ type: 'CAMERA_CALIBRATED', reprojectionError: 3 })).toMatchObject({ alias: 'puzzled', priority: 60 });
    expect(COURIER_CLIP_ALIASES).toMatchObject({ inspect: expect.any(String), point: expect.any(String), success: expect.any(String), puzzled: expect.any(String), stepAside: expect.any(String), look: expect.any(String) });
  });

  it('coalesces continuous drag reactions instead of restarting per frame', () => {
    const current = reactionForEvent({ type: 'MAP_MARKER_MOVED', markerId: 'm', coordinates: [1, 2], selectedPlot: 'north', distance: 3 });
    expect(shouldRestartReaction(current, current, 20)).toBe(false);
    expect(shouldRestartReaction(current, reactionForEvent({ type: 'QUALITY_CHANGED', tier: 'static' }), 20)).toBe(true);
  });

  it('uses direction-specific snapshots and never reverse-plays parkour', () => {
    expect(traversalClipFor({ direction: 'reverse', rapid: true, family: 'vault' })).toEqual({ alias: 'arrivalReverse', reversePlayback: false });
    expect(traversalClipFor({ direction: 'reverse', rapid: false, family: 'mechanical' })).toEqual({ alias: 'mechanicalNeutral', reversePlayback: true });
  });
});
