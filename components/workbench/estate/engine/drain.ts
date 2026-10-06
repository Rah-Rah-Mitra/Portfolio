// Waiting for the GPU without blocking the page (P7, §7.9 amendment).
//
// Resizing a WebGL canvas makes the browser wait, on the main thread, for every
// frame still queued for the GPU. On SwiftShader that wait was a governor
// notch's whole long task (72–402 ms mid-orbit, P7 bench), while the same
// resize of a drained GPU took 3–5 ms. Any getParameter-style read would wait
// the same way, so the engine never asks: it places a fence after the last
// frame, draws nothing more, and reads the fence's status between tasks, which
// WebGL 2 answers without a round trip (the status only changes between
// tasks). Only then does it resize.

/** How often the fence is read, ms. */
export const DRAIN_POLL_MS = 8;
/** The longest wait before resizing anyway, ms. */
export const DRAIN_MAX_MS = 1000;

/** The WebGL 2 sync calls this needs (a fake in tests). */
export type FenceGl = Pick<
  WebGL2RenderingContext,
  'fenceSync' | 'flush' | 'getSyncParameter' | 'deleteSync' | 'SYNC_GPU_COMMANDS_COMPLETE' | 'SYNC_STATUS' | 'SIGNALED'
>;

export interface DrainHost {
  /** Run `run` after `ms` (the engine's TimerSet, so dispose cancels it). */
  after(ms: number, run: () => void): void;
  now(): number;
  /** The wait no longer matters (disposed, or the context was lost): stop, and do not call done. */
  abandoned(): boolean;
}

/**
 * Calls `done(signalled)` once everything queued on `gl` so far has finished
 * (true), or after `maxMs` without that (false). Never calls it once
 * `host.abandoned()` holds, and never deletes a fence of a lost context.
 */
export const whenGpuIdle = (gl: FenceGl, host: DrainHost, done: (signalled: boolean) => void, maxMs = DRAIN_MAX_MS, pollMs = DRAIN_POLL_MS): void => {
  const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  const since = host.now();
  const check = () => {
    if (host.abandoned()) return;
    const signalled = fence === null || gl.getSyncParameter(fence, gl.SYNC_STATUS) === gl.SIGNALED;
    if (!signalled && host.now() - since < maxMs) {
      host.after(pollMs, check);
      return;
    }
    if (fence) gl.deleteSync(fence);
    done(signalled);
  };
  host.after(0, check);
};
