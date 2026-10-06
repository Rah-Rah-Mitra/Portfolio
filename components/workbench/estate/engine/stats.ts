import type { EstateTier } from '../../../../lib/estate/tiers';

// Renderer readouts (plan §7.8): the host's data-estate-* attributes and the
// `stats` event, each at most twice a second while frames run, plus one
// trailing write after the last frame so the numbers at rest are the last
// frame's. The e2e reads the attributes (draws ≤ 150, tris ≤ 1.2 M, programs
// ≤ 6, ms unchanged at rest), so they are written from the renderer's own
// counters, not from the pack's.

/** Minimum spacing of readout writes, ms (≤ 2× a second). */
export const READOUT_INTERVAL_MS = 500;

export interface FrameStats {
  draws: number;
  tris: number;
  programs: number;
  /** CPU ms of the frame (update + render). */
  frameMs: number;
  tier: EstateTier;
  pixelRatio: number;
  band: string | null;
  gpuBytes: number;
  droppedPct?: number;
  cpuP95Ms?: number;
  gpuP95Ms?: number;
}

/** The attribute names the shell's CSS, the HUD and the e2e read. React renders none of them. */
export const READOUT_ATTRIBUTES = {
  draws: 'data-estate-draws',
  tris: 'data-estate-tris',
  ms: 'data-estate-ms',
  programs: 'data-estate-programs',
  band: 'data-estate-band',
  /** Downloads in flight plus a compile under way (core.ts progress), written as it changes, not per frame. */
  pending: 'data-estate-pending',
} as const;

/** What a readout write puts on the host: attribute → value, null to remove. */
export const readoutValues = (stats: FrameStats): Record<string, string | null> => ({
  [READOUT_ATTRIBUTES.draws]: String(stats.draws),
  [READOUT_ATTRIBUTES.tris]: String(stats.tris),
  [READOUT_ATTRIBUTES.ms]: stats.frameMs.toFixed(2),
  [READOUT_ATTRIBUTES.programs]: String(stats.programs),
  [READOUT_ATTRIBUTES.band]: stats.band,
});

/**
 * Throttles a per-frame report to one per READOUT_INTERVAL_MS with a trailing
 * flush: offer() each frame; it calls `write` at once when the spacing allows,
 * else keeps the latest and arms one timer for the remainder. Times come from
 * the injected clock, so the test drives it without waiting.
 */
export class ReadoutThrottle<T> {
  private last = -Infinity;
  private pending: T | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    private readonly write: (value: T) => void,
    private readonly now: () => number,
    private readonly interval = READOUT_INTERVAL_MS,
  ) {}

  offer(value: T): void {
    if (this.stopped) return;
    const t = this.now();
    if (t - this.last >= this.interval) {
      this.flushNow(value, t);
      return;
    }
    this.pending = value;
    if (this.timer === null) {
      this.timer = setTimeout(() => {
        this.timer = null;
        if (this.pending !== null && !this.stopped) this.flushNow(this.pending, this.now());
      }, Math.max(0, this.interval - (t - this.last)));
    }
  }

  private flushNow(value: T, t: number) {
    this.pending = null;
    this.last = t;
    this.write(value);
  }

  /** Drops anything pending and refuses further offers. */
  stop(): void {
    this.stopped = true;
    this.pending = null;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}

/** Writes readout values onto the host, only where they changed. */
export const writeReadouts = (host: Element, values: Record<string, string | null>): void => {
  for (const name of Object.keys(values)) {
    const value = values[name];
    if (value === null) {
      if (host.hasAttribute(name)) host.removeAttribute(name);
    } else if (host.getAttribute(name) !== value) {
      host.setAttribute(name, value);
    }
  }
};

/** Removes every readout attribute (dispose: the next instance starts clean). */
export const clearReadouts = (host: Element): void => {
  for (const name of Object.values(READOUT_ATTRIBUTES)) host.removeAttribute(name);
};
