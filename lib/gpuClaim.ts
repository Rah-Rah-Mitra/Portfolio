// One GPU, two WebGL surfaces (plan §7.10): the FX desk backdrops and the Estate
// window. While the Estate is live, focused, on screen and under no modal panel,
// it claims the GPU, and a mounted backdrop yields: it keeps its context and its
// last frame but stops animating (desktopBackgroundPolicy 'yielded'), so the
// estate's frame budget is not shared with smoke behind the window.
//
// Claims are named, so two holders cannot release each other's, and every
// change is announced on window as `portfolio:gpu-claim`. Browser-only in
// practice: call from effects and handlers, never during render (App is
// prerendered). On the server nothing claims, and isGpuClaimed() is false.

export const GPU_CLAIM_EVENT = 'portfolio:gpu-claim';

/** Who may hold the GPU. */
export type GpuClaimant = 'estate';

const holders = new Set<GpuClaimant>();

const announce = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(GPU_CLAIM_EVENT));
};

/** Take the GPU for `who`. Idempotent: a second claim by the same holder announces nothing. */
export const claimGpu = (who: GpuClaimant): void => {
  if (holders.has(who)) return;
  holders.add(who);
  announce();
};

/** Give it back. Idempotent, and a holder only ever releases its own claim. */
export const releaseGpu = (who: GpuClaimant): void => {
  if (holders.delete(who)) announce();
};

/** Someone holds the GPU now. */
export const isGpuClaimed = (): boolean => holders.size > 0;

/** Call `callback` on every claim or release. Returns the unsubscribe. */
export const onGpuClaimChange = (callback: () => void): (() => void) => {
  window.addEventListener(GPU_CLAIM_EVENT, callback);
  return () => window.removeEventListener(GPU_CLAIM_EVENT, callback);
};
