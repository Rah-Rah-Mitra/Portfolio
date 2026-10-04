import { afterEach, describe, expect, it, vi } from 'vitest';

// lib/physicsRuntime.ts shares one download promise between callers. The drop
// test (FIG. 05e) retries a failed load on the visitor's next action, which
// only works if a rejected download is not the promise every later call gets.

describe('loadMatter', () => {
  afterEach(() => {
    vi.doUnmock('matter-js');
    vi.resetModules();
  });

  it('does not cache a failed download: the next call imports again', async () => {
    vi.resetModules();
    let attempts = 0;
    vi.doMock('matter-js', async (importOriginal) => {
      attempts += 1;
      if (attempts === 1) throw new Error('chunk failed to load');
      return importOriginal();
    });
    const { loadMatter, peekMatter } = await import('../lib/physicsRuntime');
    // vitest wraps a throwing factory's error in its own, so assert the rejection, not its text.
    await expect(loadMatter()).rejects.toThrow();
    expect(attempts).toBe(1);
    expect(peekMatter()).toBeNull();
    const M = await loadMatter();
    expect(typeof M.Engine.create).toBe('function');
    expect(peekMatter()).toBe(M);
    expect(attempts).toBe(2);
    // And a success is shared, not re-imported.
    expect(await loadMatter()).toBe(M);
    expect(attempts).toBe(2);
  });
});
