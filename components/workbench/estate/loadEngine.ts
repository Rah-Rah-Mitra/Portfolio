import type { EstateLoadFailure, EstateRuntime } from './engineApi';

// The only way into the Estate window's lazy chunk (plan §7.1): the engine
// (estate/engine/**, three r186 and camera-controls) and its HUD
// (estate/live/**) are reached from nowhere else, and only through the two
// import() calls below — tests/estate-boundary.test.ts holds that, and
// scripts/check-bundle.mjs keeps three out of the main bundle.
//
// The lib/physicsRuntime.ts pattern: one shared promise, so a second caller
// (StrictMode's double effect, a Retry pressed twice) waits on the same
// download; a failed download is not cached, so the next call imports again.
// Call from an effect or an event handler, never during render (App is
// prerendered).
//
// A failure rejects with an EstateLoadError whose `kind` the shell turns into
// the policy's engine state: 'stale' → Reload, 'failed' → Retry (§9.3).
//  - stale: the chunk 404'd because the site was redeployed under this page.
//    Vercel Hobby has no skew protection, so old hashed chunks are simply gone
//    after a deploy, and only a reload can fetch the new ones (§7.6).
//  - failed: anything else — offline, a 5xx, a module that threw while
//    evaluating. Trying again may work.
// A browser's import() rejection does not say which: Chrome's "Failed to fetch
// dynamically imported module" is the same for a 404 and for a dropped
// connection, and Safari names no URL at all. So a chunk failure is checked
// with one uncached HEAD: of the URL the message names, else of this module's
// own chunk (import.meta.url), which a redeploy that renamed the engine chunk
// renamed too — its content embeds the engine chunk's hashed name. 404 or 410
// means stale; anything else, failed.

export class EstateLoadError extends Error {
  readonly kind: EstateLoadFailure;
  readonly cause: unknown;

  constructor(kind: EstateLoadFailure, cause: unknown) {
    super(kind === 'stale'
      ? 'The Estate engine is no longer on the server: the site was updated.'
      : 'The Estate engine did not finish downloading.');
    this.name = 'EstateLoadError';
    this.kind = kind;
    this.cause = cause;
  }
}

/** HEAD a URL, uncached; its status, or null when the request itself failed. */
export type StatusProbe = (url: string) => Promise<number | null>;

const headStatus: StatusProbe = async (url) => {
  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store', credentials: 'same-origin' });
    return response.status;
  } catch {
    return null;
  }
};

// The messages engines use for a module script that did not load (Chrome,
// Firefox, Safari, Vite's preload helper, and webpack's name for the same thing).
const CHUNK_FAILURE = /dynamically imported module|Importing a module script failed|Unable to preload|ChunkLoadError|Loading chunk/i;
const GONE = new Set([404, 410]);

const recordOf = (value: unknown): Record<string, unknown> | null =>
  (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null);

const isHttp = (url: string): boolean => /^https?:\/\//i.test(url);

/** The first http(s) URL in an error message, minus trailing punctuation. */
export const failedUrl = (message: string): string | null => {
  const match = message.match(/https?:\/\/[^\s'"()<>]+/i);
  return match ? match[0].replace(/[.,;:]+$/, '') : null;
};

export interface ClassifyOptions {
  /** Default: an uncached HEAD through fetch. */
  probe?: StatusProbe;
  /** The URL of the chunk holding this module. Default import.meta.url. */
  selfUrl?: string;
  /** navigator.onLine. Default: read it when there is a navigator, else true. */
  online?: boolean;
}

// The error and the errors it wraps (`cause`), outermost first: a wrapper such
// as a test runner's mock layer keeps the browser's own error underneath.
const causeChain = (error: unknown): unknown[] => {
  const chain: unknown[] = [];
  for (let current = error; current !== null && current !== undefined && chain.length < 4; current = recordOf(current)?.cause) {
    chain.push(current);
  }
  return chain;
};

/**
 * Whether an import() rejection means the site moved on (stale) or the download
 * failed (failed). Never rejects. An error that names itself (a ChunkLoadError,
 * or one carrying status 404/410) needs no probe; an error that is not a
 * module-load failure at all (the module threw while evaluating) is 'failed';
 * offline is 'failed' without asking the network. Wrapped errors are read
 * through their `cause`.
 */
export const classifyLoadFailure = async (error: unknown, options: ClassifyOptions = {}): Promise<EstateLoadFailure> => {
  let message: string | null = null;
  for (const link of causeChain(error)) {
    const record = recordOf(link);
    const status = record?.status;
    if (typeof status === 'number' && GONE.has(status)) return 'stale';
    if (record?.name === 'ChunkLoadError') return 'stale';
    const text = typeof record?.message === 'string' ? record.message : String(link);
    if (message === null && CHUNK_FAILURE.test(text)) message = text;
  }
  if (message === null) return 'failed';
  const online = options.online ?? (typeof navigator === 'undefined' || navigator.onLine !== false);
  if (!online) return 'failed';
  const probe = options.probe ?? headStatus;
  const selfUrl = options.selfUrl ?? import.meta.url;
  const candidates = [failedUrl(message), selfUrl].filter((url): url is string => url !== null && isHttp(url));
  for (const url of new Set(candidates)) {
    const answer = await probe(url);
    if (answer !== null && GONE.has(answer)) return 'stale';
  }
  return 'failed';
};

let loaded: EstateRuntime | null = null;
let pending: Promise<EstateRuntime> | null = null;

/**
 * Downloads the engine and its HUD together (one chunk each, fetched in
 * parallel) and resolves both halves. Shared while in flight and once loaded;
 * a failure is dropped so the next call imports again, and rejects with an
 * EstateLoadError.
 */
export const loadEngine = (): Promise<EstateRuntime> => {
  if (loaded) return Promise.resolve(loaded);
  if (!pending) {
    pending = Promise.all([import('./engine'), import('./live/EstateHud')])
      .then(([engine, hud]) => {
        loaded = { createEngine: engine.createEngine, EstateHud: hud.EstateHud };
        return loaded;
      })
      .catch(async (error: unknown) => {
        pending = null;
        throw new EstateLoadError(await classifyLoadFailure(error), error);
      });
  }
  return pending;
};

/** The runtime if loadEngine() has resolved, else null. Never starts a download. */
export const peekEngine = (): EstateRuntime | null => loaded;
