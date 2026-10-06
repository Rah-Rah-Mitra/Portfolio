// Render only when something changes (plan §7.8), as a pure state machine. The
// engine's loop (estate/engine/loop.ts) owns requestAnimationFrame and the
// timers; this decides when to call them. Every function that may need a frame
// returns true exactly when the caller must call requestAnimationFrame now, so
// any number of invalidations between two frames merge into one request.
//
// At rest nothing is requested: a frame is drawn only on invalidate(), and
// another follows only while endFrame() is told something is still moving, or
// while frames owed to a geometry swap, band change or resize remain. The e2e
// idle case (§10.2 case 11) counts rAF calls on the real engine to prove it.
//
// The rAF callback brackets its work:
//   const continuous = beginFrame(loop);
//   …controls, detail selection, ≤ 1 upload, draw…
//   if (continuous) governorSample(gov, sample);
//   if (endFrame(loop, activity)) requestAnimationFrame(tick);
//
// Booleans and numbers only, so nothing here allocates per frame.

/** Frames drawn after a geometry swap, band change or applied resize. */
export const SETTLE_FRAMES = 2;
/** ResizeObserver bursts settle for this long before the buffer is resized (FluidField's RESIZE_SETTLE_MS). */
export const RESIZE_DEBOUNCE_MS = 150;
/** takeResize(): no resize is waiting. */
export const RESIZE_NONE = -1;

/** What is still moving once a frame has run. Any true keeps frames coming. */
export interface FrameActivity {
  /** camera-controls' update(dt) reported motion (a drag, damping or a transition). */
  controls: boolean;
  /** First-person movement, or any movement key still held. */
  keys: boolean;
  /** A fly-to, stair climb or fade is running. Under motionHalted() these are cuts and never run. */
  tweens: boolean;
  /** Geometry is queued for the GPU (≤ 1 upload a frame drains it). */
  uploads: boolean;
}

export interface FrameLoopState {
  /** A frame is requested and has not run yet. */
  pending: boolean;
  /** Between beginFrame and endFrame. */
  inFrame: boolean;
  // The pending frame was requested during the previous frame or by its end,
  // so its interval is one display period and not a rest.
  chained: boolean;
  /** Set by beginFrame: this frame directly follows a drawn frame. */
  continuous: boolean;
  /** Frames still owed to a swap, band change or resize, counting the one about to run. */
  settle: number;
  /** Set by beginFrame: this frame pays one owed frame. */
  settling: boolean;
  /** Time of the latest unapplied resize, ms; NaN when none. */
  resizeAt: number;
}

export const createFrameLoop = (): FrameLoopState => ({
  pending: false,
  inFrame: false,
  chained: false,
  continuous: false,
  settle: 0,
  settling: false,
  resizeAt: Number.NaN,
});

/**
 * Something changed: draw a frame. True when the caller must request one; false
 * when one is already pending, which this one merges into.
 */
export const invalidate = (loop: FrameLoopState): boolean => {
  if (loop.pending) return false;
  loop.pending = true;
  if (loop.inFrame) loop.chained = true;
  return true;
};

/**
 * A geometry swap, band change or applied resize: the next SETTLE_FRAMES frames
 * are drawn whatever else is moving. Called during a frame, they are the frames
 * after it. Never shortens a debt already owed.
 */
export const markChanged = (loop: FrameLoopState): boolean => {
  if (loop.settle < SETTLE_FRAMES) loop.settle = SETTLE_FRAMES;
  return invalidate(loop);
};

/**
 * First thing in the rAF callback. Returns whether this frame directly follows
 * a drawn one — only then is its interval a governor sample. The first frame
 * after a rest carries the whole rest in its interval.
 */
export const beginFrame = (loop: FrameLoopState): boolean => {
  loop.continuous = loop.chained;
  loop.chained = false;
  loop.pending = false;
  loop.inFrame = true;
  loop.settling = loop.settle > 0;
  if (loop.settling) loop.settle -= 1;
  return loop.continuous;
};

/**
 * Last thing in the rAF callback. True when the caller must request the next
 * frame: something in `activity` is still moving or a settle frame is owed, and
 * no invalidation during this frame has already requested it.
 */
export const endFrame = (loop: FrameLoopState, activity: FrameActivity): boolean => {
  loop.inFrame = false;
  if (loop.pending) return false;
  if (loop.settle > 0 || activity.controls || activity.keys || activity.tweens || activity.uploads) {
    loop.pending = true;
    loop.chained = true;
    return true;
  }
  return false;
};

/**
 * The caller cancelled its pending rAF (freeze, dispose): forget it, so the next
 * invalidate() requests afresh instead of merging into a frame that never comes.
 * Owed settle frames and a waiting resize survive for the next run.
 */
export const cancelFrame = (loop: FrameLoopState): void => {
  loop.pending = false;
  loop.inFrame = false;
  loop.chained = false;
};

/**
 * A ResizeObserver callback at time `now` (ms). Nothing is drawn yet — the
 * browser stretches the last frame meanwhile — and the delay to arm a timer
 * with is returned; a later call pushes the deadline back.
 */
export const noteResize = (loop: FrameLoopState, now: number): number => {
  loop.resizeAt = now;
  return RESIZE_DEBOUNCE_MS;
};

/**
 * The resize timer fired at `now`. 0: apply the size now (consumed), then
 * markChanged(). > 0: a later resize moved the deadline, re-arm for that many
 * ms. RESIZE_NONE: nothing is waiting. Re-arming rather than trusting the timer
 * matters because a timeout and performance.now() can disagree by a fraction of
 * a millisecond, which would otherwise strand the last resize.
 */
export const takeResize = (loop: FrameLoopState, now: number): number => {
  if (Number.isNaN(loop.resizeAt)) return RESIZE_NONE;
  const wait = loop.resizeAt + RESIZE_DEBOUNCE_MS - now;
  if (wait > 0) return wait;
  loop.resizeAt = Number.NaN;
  return 0;
};
