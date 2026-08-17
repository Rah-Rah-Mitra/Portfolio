import { describe, expect, it, vi } from 'vitest';
import { WorldAnchorRegistry } from '../lib/WorldAnchorRegistry';
import type { CameraShotDefinition, WorldAnchorDefinition } from '../types';

const rect = (left: number, top: number, width: number, height: number): DOMRectReadOnly => ({
  left, top, width, height, right: left + width, bottom: top + height, x: left, y: top,
  toJSON: () => ({ left, top, width, height }),
} as DOMRectReadOnly);

const definition: WorldAnchorDefinition = {
  id: 'lab', elementId: 'technical-lab', chapterId: 'technical-lab', worldOffset: [1, 2, 3],
  projectionDepth: 5, worldNormal: [0, 0, 1], occluderElementIds: ['lab-copy'],
  responsive: { mobile: { worldOffset: [0, 1, 0] } },
};
const shot: CameraShotDefinition = {
  id: 'lab-shot', chapterId: 'technical-lab', position: [0, 0, 0], target: [0, 0, 1], fov: 60,
  near: 0.1, far: 100, scrollRange: [0, 1], transition: { duration: 0.3, easing: 'power2.out' },
};

describe('WorldAnchorRegistry', () => {
  it('separates authored data from runtime DOMRects and resolves safe text', () => {
    const anchor = document.createElement('section');
    anchor.id = 'technical-lab';
    anchor.getBoundingClientRect = () => rect(400, 200, 200, 100);
    const copy = document.createElement('p');
    copy.id = 'lab-copy';
    copy.getBoundingClientRect = () => rect(420, 220, 120, 40);
    document.body.append(anchor, copy);
    const registry = new WorldAnchorRegistry({ getViewport: () => ({ width: 1000, height: 600 }), refresh: vi.fn() });
    registry.register(definition);
    const resolved = registry.resolve(shot, 'desktop')[0];
    expect([resolved.screenRect.left, resolved.screenRect.top, resolved.screenRect.width, resolved.screenRect.height]).toEqual([400, 200, 200, 100]);
    expect(resolved.safeTextRects).toHaveLength(1);
    expect(resolved.worldPosition[0]).toBeCloseTo(1, 10);
    expect(resolved.worldPosition[1]).toBeGreaterThan(2);
    expect(resolved.worldPosition[2]).toBeCloseTo(8, 10);
    expect(JSON.stringify(definition)).not.toContain('screenRect');
    registry.destroy();
    anchor.remove(); copy.remove();
  });

  it('batches invalidations, applies responsive overrides, refreshes after settle, and cleans up', async () => {
    vi.useFakeTimers();
    const anchor = document.createElement('section'); anchor.id = 'technical-lab'; anchor.getBoundingClientRect = () => rect(0, 0, 100, 100); document.body.append(anchor);
    const refresh = vi.fn();
    const registry = new WorldAnchorRegistry({ getViewport: () => ({ width: 390, height: 844 }), refresh, requestFrame: (cb) => window.setTimeout(cb, 0), cancelFrame: window.clearTimeout });
    registry.register(definition);
    registry.invalidate('resize'); registry.invalidate('media'); registry.invalidate('project-expansion');
    await vi.runAllTimersAsync();
    expect(refresh).toHaveBeenCalledTimes(1);
    const mobileY = registry.resolve(shot, 'mobile')[0].worldPosition[1];
    const desktopY = registry.resolve(shot, 'desktop')[0].worldPosition[1];
    expect(mobileY).toBeCloseTo(desktopY - 1, 10);
    registry.destroy();
    registry.invalidate('resize'); await vi.runAllTimersAsync();
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.useRealTimers(); anchor.remove();
  });

  it('observes media inserted after start and removes its listeners on destroy', async () => {
    vi.useFakeTimers(); const refresh = vi.fn();
    const registry = new WorldAnchorRegistry({ refresh, requestFrame: (cb) => window.setTimeout(cb, 0), cancelFrame: window.clearTimeout });
    registry.start(); const image = document.createElement('img'); document.body.append(image);
    await Promise.resolve(); image.dispatchEvent(new Event('load')); await vi.runAllTimersAsync();
    expect(refresh).toHaveBeenCalled(); const calls = refresh.mock.calls.length;
    registry.destroy(); image.dispatchEvent(new Event('load')); await vi.runAllTimersAsync(); expect(refresh).toHaveBeenCalledTimes(calls);
    image.remove(); vi.useRealTimers();
  });
});
