import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyLoadFailure, failedUrl, type StatusProbe } from '../components/workbench/estate/loadEngine';

// components/workbench/estate/loadEngine.ts: the Estate window's one way into
// its lazy chunk (plan §7.1, §10.2). One shared promise; a failed download is
// not cached; a chunk the server no longer has is 'stale' (Reload), anything
// else 'failed' (Retry).

const ENGINE = '../components/workbench/estate/engine';
const HUD = '../components/workbench/estate/live/EstateHud';
const CHUNK = 'https://rahul-mitra.com/assets/engine-3f9a1c2e.js';
const SELF = 'https://rahul-mitra.com/assets/index-0b1c2d3e.js';

/** A probe that answers from a table and records what it was asked. */
const probeOf = (statuses: Record<string, number | null>) => {
  const asked: string[] = [];
  const probe: StatusProbe = async (url) => {
    asked.push(url);
    return url in statuses ? statuses[url] : 200;
  };
  return { probe, asked };
};

describe('loadEngine', () => {
  afterEach(() => {
    vi.doUnmock(ENGINE);
    vi.doUnmock(HUD);
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('shares one download between callers and resolves both halves of the chunk', async () => {
    vi.resetModules();
    let engineImports = 0;
    let hudImports = 0;
    vi.doMock(ENGINE, async (importOriginal) => {
      engineImports += 1;
      return importOriginal();
    });
    vi.doMock(HUD, async (importOriginal) => {
      hudImports += 1;
      return importOriginal();
    });
    const { loadEngine, peekEngine } = await import('../components/workbench/estate/loadEngine');
    expect(peekEngine()).toBeNull();

    const first = loadEngine();
    const second = loadEngine();
    expect(second).toBe(first);
    const runtime = await first;
    expect(typeof runtime.createEngine).toBe('function');
    expect(typeof runtime.EstateHud).toBe('function');
    expect(peekEngine()).toBe(runtime);
    // Loaded is loaded: no second import.
    expect(await loadEngine()).toBe(runtime);
    expect([engineImports, hudImports]).toEqual([1, 1]);
  });

  it('does not cache a failed download: the next call imports again', async () => {
    vi.resetModules();
    let attempts = 0;
    vi.doMock(ENGINE, async (importOriginal) => {
      attempts += 1;
      if (attempts === 1) throw new Error('engine threw while evaluating');
      return importOriginal();
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { loadEngine, peekEngine, EstateLoadError } = await import('../components/workbench/estate/loadEngine');

    const failure = await loadEngine().then(() => null, (error: unknown) => error);
    expect(failure).toBeInstanceOf(EstateLoadError);
    expect((failure as InstanceType<typeof EstateLoadError>).kind).toBe('failed');
    // Not a module-load failure, so nothing was asked of the network.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(peekEngine()).toBeNull();

    const runtime = await loadEngine();
    expect(typeof runtime.createEngine).toBe('function');
    expect(attempts).toBe(2);
  });

  it('maps a chunk the server no longer has (404) to stale', async () => {
    vi.resetModules();
    vi.doMock(ENGINE, () => {
      throw new TypeError(`Failed to fetch dynamically imported module: ${CHUNK}`);
    });
    const fetchSpy = vi.fn(async () => ({ status: 404 }));
    vi.stubGlobal('fetch', fetchSpy);
    const { loadEngine, EstateLoadError } = await import('../components/workbench/estate/loadEngine');

    const failure = await loadEngine().then(() => null, (error: unknown) => error);
    expect(failure).toBeInstanceOf(EstateLoadError);
    expect((failure as InstanceType<typeof EstateLoadError>).kind).toBe('stale');
    expect(fetchSpy).toHaveBeenCalledWith(CHUNK, expect.objectContaining({ method: 'HEAD', cache: 'no-store' }));
  });

  it('keeps a chunk the server still has as failed, so Retry imports again', async () => {
    vi.resetModules();
    let attempts = 0;
    vi.doMock(ENGINE, async (importOriginal) => {
      attempts += 1;
      if (attempts === 1) throw new TypeError(`Failed to fetch dynamically imported module: ${CHUNK}`);
      return importOriginal();
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200 })));
    const { loadEngine, EstateLoadError } = await import('../components/workbench/estate/loadEngine');

    const failure = await loadEngine().then(() => null, (error: unknown) => error);
    expect((failure as InstanceType<typeof EstateLoadError>).kind).toBe('failed');
    await expect(loadEngine()).resolves.toMatchObject({ createEngine: expect.any(Function) });
    expect(attempts).toBe(2);
  });
});

describe('classifyLoadFailure', () => {
  it('takes an error that names itself at its word, without a probe', async () => {
    const { probe, asked } = probeOf({});
    const chunkLoadError = Object.assign(new Error('Loading chunk 7 failed.'), { name: 'ChunkLoadError' });
    expect(await classifyLoadFailure(chunkLoadError, { probe, selfUrl: SELF })).toBe('stale');
    expect(await classifyLoadFailure(Object.assign(new Error('gone'), { status: 404 }), { probe, selfUrl: SELF })).toBe('stale');
    expect(await classifyLoadFailure(Object.assign(new Error('gone'), { status: 410 }), { probe, selfUrl: SELF })).toBe('stale');
    expect(asked).toEqual([]);
  });

  it('calls an error that is not a module-load failure failed, without a probe', async () => {
    const { probe, asked } = probeOf({ [SELF]: 404 });
    expect(await classifyLoadFailure(new ReferenceError('WebGLRenderer is not defined'), { probe, selfUrl: SELF })).toBe('failed');
    expect(await classifyLoadFailure('a string', { probe, selfUrl: SELF })).toBe('failed');
    expect(await classifyLoadFailure(undefined, { probe, selfUrl: SELF })).toBe('failed');
    expect(asked).toEqual([]);
  });

  it('probes the URL a Chrome or Firefox message names, then this module\'s own chunk', async () => {
    const chrome = new TypeError(`Failed to fetch dynamically imported module: ${CHUNK}`);
    const firefox = new TypeError(`error loading dynamically imported module: ${CHUNK}`);
    for (const error of [chrome, firefox]) {
      const gone = probeOf({ [CHUNK]: 404 });
      expect(await classifyLoadFailure(error, { probe: gone.probe, selfUrl: SELF })).toBe('stale');
      expect(gone.asked).toEqual([CHUNK]);

      const there = probeOf({ [CHUNK]: 200, [SELF]: 200 });
      expect(await classifyLoadFailure(error, { probe: there.probe, selfUrl: SELF })).toBe('failed');
      expect(there.asked).toEqual([CHUNK, SELF]);
    }
  });

  it('probes this module\'s own chunk when the message names no URL (Safari, Vite\'s preload)', async () => {
    const safari = new TypeError('Importing a module script failed.');
    const preload = new Error('Unable to preload CSS for /assets/engine-3f9a1c2e.css');
    for (const error of [safari, preload]) {
      const redeployed = probeOf({ [SELF]: 404 });
      expect(await classifyLoadFailure(error, { probe: redeployed.probe, selfUrl: SELF })).toBe('stale');
      expect(redeployed.asked).toEqual([SELF]);
    }
    // In tests and file:// there is no server to ask.
    const local = probeOf({});
    expect(await classifyLoadFailure(safari, { probe: local.probe, selfUrl: 'file:///C:/repo/loadEngine.ts' })).toBe('failed');
    expect(local.asked).toEqual([]);
  });

  it('calls a probe that cannot reach the server failed, and asks nothing while offline', async () => {
    const error = new TypeError(`Failed to fetch dynamically imported module: ${CHUNK}`);
    const unreachable = probeOf({ [CHUNK]: null, [SELF]: null });
    expect(await classifyLoadFailure(error, { probe: unreachable.probe, selfUrl: SELF })).toBe('failed');

    const offline = probeOf({ [CHUNK]: 404 });
    expect(await classifyLoadFailure(error, { probe: offline.probe, selfUrl: SELF, online: false })).toBe('failed');
    expect(offline.asked).toEqual([]);
  });

  it('reads a wrapped error through its cause', async () => {
    const wrapped = Object.assign(new Error('[runner] There was an error when mocking a module. Read more: https://example.test/docs'), {
      cause: new TypeError(`Failed to fetch dynamically imported module: ${CHUNK}`),
    });
    const { probe, asked } = probeOf({ [CHUNK]: 404 });
    expect(await classifyLoadFailure(wrapped, { probe, selfUrl: SELF })).toBe('stale');
    // The wrapper's own URL is never mistaken for the chunk.
    expect(asked).toEqual([CHUNK]);
  });

  it('pulls the failing URL out of a message', () => {
    expect(failedUrl(`Failed to fetch dynamically imported module: ${CHUNK}`)).toBe(CHUNK);
    expect(failedUrl(`error loading dynamically imported module: ${CHUNK}.`)).toBe(CHUNK);
    expect(failedUrl(`Loading module from "${CHUNK}" was blocked`)).toBe(CHUNK);
    expect(failedUrl('Importing a module script failed.')).toBeNull();
  });
});
