import {
  beginFrame, cancelFrame, createFrameLoop, endFrame, invalidate, markChanged, noteResize, takeResize,
  RESIZE_NONE, type FrameActivity, type FrameLoopState,
} from '../../../../lib/estate/frameLoop';
import { CALIBRATION_FRAMES } from '../../../../lib/estate/governorCore';

// Render only when something changes (plan §7.8). lib/estate/frameLoop.ts
// decides; this owns requestAnimationFrame and the resize timer. At rest it has
// no frame requested, ever: a frame is asked for by invalidate() (a command, a
// file arriving, an input) and the next only while the frame reports activity
// or owes settle frames. While stopped (frozen, lost, disposed) nothing is
// requested at all; invalidations are remembered and drawn on start().
//
// The one other use of rAF is a calibration burst (§7.9 amendment): frames that
// draw nothing, whose intervals tell the governor the display's own period.

export type FrameCallback = (time: number, continuous: boolean) => FrameActivity;

export interface LoopHost {
  requestAnimationFrame(callback: (time: number) => void): number;
  cancelAnimationFrame(handle: number): void;
  now(): number;
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const browserLoopHost = (): LoopHost => ({
  requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
  cancelAnimationFrame: (handle) => window.cancelAnimationFrame(handle),
  now: () => performance.now(),
  setTimeout: (run, ms) => window.setTimeout(run, ms),
  clearTimeout: (handle) => window.clearTimeout(handle as number),
});

export class RenderLoop {
  readonly state: FrameLoopState = createFrameLoop();
  private readonly host: LoopHost;
  private readonly frame: FrameCallback;
  private readonly applyResize: () => void;
  private handle: number | null = null;
  private running = false;
  private wanted = false;
  private resizeTimer: unknown = null;
  private calibrating: { left: number; last: number; intervals: number[]; done: (intervals: number[]) => void } | null = null;
  /** Requests made, for the debug readout and the idle test's cross-check. */
  requests = 0;

  constructor(host: LoopHost, frame: FrameCallback, applyResize: () => void) {
    this.host = host;
    this.frame = frame;
    this.applyResize = applyResize;
  }

  private readonly tick = (time: number) => {
    this.handle = null;
    if (this.calibrating) { this.calibrationTick(time); return; }
    if (!this.running) { cancelFrame(this.state); return; }
    const continuous = beginFrame(this.state);
    let activity: FrameActivity;
    try {
      activity = this.frame(time, continuous);
    } catch (error) {
      cancelFrame(this.state);
      throw error;
    }
    if (endFrame(this.state, activity)) this.request();
  };

  private request() {
    if (this.handle !== null || !this.running) return;
    this.requests += 1;
    this.handle = this.host.requestAnimationFrame(this.tick);
  }

  /** Something changed: one frame, merged with any already pending. */
  invalidate(): void {
    if (!this.running) { this.wanted = true; return; }
    if (invalidate(this.state)) this.request();
  }

  /** A geometry swap, band change or applied resize: the next two frames are drawn whatever else moves. */
  markChanged(): void {
    if (!this.running) { this.wanted = true; markChanged(this.state); cancelFrame(this.state); return; }
    if (markChanged(this.state)) this.request();
  }

  /** Begin (or resume) drawing; draws one frame. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.wanted = false;
    cancelFrame(this.state);
    if (invalidate(this.state)) this.request();
  }

  /** Stop requesting frames (freeze, context loss). */
  stop(): void {
    this.running = false;
    if (this.handle !== null) this.host.cancelAnimationFrame(this.handle);
    this.handle = null;
    cancelFrame(this.state);
    if (this.calibrating) {
      const { intervals, done } = this.calibrating;
      this.calibrating = null;
      done(intervals);
    }
  }

  get isRunning(): boolean { return this.running; }
  get isPending(): boolean { return this.handle !== null; }

  // ---- resize (debounced, frameLoop.ts) --------------------------------------------

  /** A ResizeObserver callback: the size is applied once the burst settles. */
  noteResize(): void {
    const delay = noteResize(this.state, this.host.now());
    if (this.resizeTimer !== null) return;
    this.armResize(delay);
  }

  /**
   * Forget a resize still settling: the caller has just read and applied the
   * size itself (resume() after a reopen), so the debounced one would only
   * repeat it.
   */
  cancelResize(): void {
    if (this.resizeTimer !== null) this.host.clearTimeout(this.resizeTimer);
    this.resizeTimer = null;
    takeResize(this.state, Infinity);
  }

  private armResize(ms: number) {

    this.resizeTimer = this.host.setTimeout(() => {
      this.resizeTimer = null;
      const wait = takeResize(this.state, this.host.now());
      if (wait === RESIZE_NONE) return;
      if (wait > 0) { this.armResize(wait); return; }
      this.applyResize();
      this.markChanged();
    }, ms);
  }

  // ---- calibration (§7.9) ---------------------------------------------------------

  /**
   * CALIBRATION_FRAMES frames that draw nothing; resolves with their intervals.
   * Runs whether or not the loop is started (warm-up happens in `loading`,
   * before start); a stop() ends it early with what it has.
   */
  calibrate(frames = CALIBRATION_FRAMES): Promise<number[]> {
    return new Promise((resolve) => {
      if (this.calibrating) { resolve([]); return; }
      this.calibrating = { left: frames + 1, last: Number.NaN, intervals: [], done: resolve };
      if (this.handle !== null) return; // the pending frame becomes the first calibration frame
      this.requests += 1;
      this.handle = this.host.requestAnimationFrame(this.tick);
    });
  }

  private calibrationTick(time: number) {
    const c = this.calibrating;
    if (!c) return;
    if (!Number.isNaN(c.last)) c.intervals.push(time - c.last);
    c.last = time;
    c.left -= 1;
    if (c.left > 0) {
      this.requests += 1;
      this.handle = this.host.requestAnimationFrame(this.tick);
      return;
    }
    this.calibrating = null;
    c.done(c.intervals);
    // Frames that were wanted meanwhile run now.
    if (this.running && (this.state.pending || this.wanted)) {
      cancelFrame(this.state);
      this.wanted = false;
      if (invalidate(this.state)) this.request();
    }
  }

  dispose(): void {
    this.stop();
    if (this.resizeTimer !== null) this.host.clearTimeout(this.resizeTimer);
    this.resizeTimer = null;
  }
}
