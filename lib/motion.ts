// One switch for every animation loop on the site. Motion is halted when the
// visitor prefers reduced motion OR has pressed "Pause all motion" in the FX
// panel (EffectsProvider writes html[data-motion-paused="true"]). Loops read
// motionHalted() and re-sync through onMotionChange(); nothing else should
// query prefers-reduced-motion on its own.
//
// Browser-only: call these from effects, never during render (App is prerendered).

export const MOTION_PAUSED_ATTR = 'data-motion-paused';

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

export const prefersReducedMotion = (): boolean => window.matchMedia(REDUCED_QUERY).matches;

export const isMotionPaused = (): boolean => document.documentElement.getAttribute(MOTION_PAUSED_ATTR) === 'true';

export const motionHalted = (): boolean => prefersReducedMotion() || isMotionPaused();

export const onMotionChange = (callback: () => void): (() => void) => {
  const query = window.matchMedia(REDUCED_QUERY);
  query.addEventListener('change', callback);
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [MOTION_PAUSED_ATTR] });
  return () => {
    query.removeEventListener('change', callback);
    observer.disconnect();
  };
};
