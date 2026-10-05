import type {
  CreateEngine, EstateEngine, EstateEngineEvent, EstateEngineFeatures, EstateResume, EstateView,
} from '../engineApi';

// The Estate engine's entry (plan §7.1): the lazy chunk's only export the shell
// sees, reached solely through estate/loadEngine.ts. three r186 and
// camera-controls may be imported here and under estate/live/, nowhere else
// (tests/estate-boundary.test.ts).
//
// SKELETON. This file is the contract stub the engine is built into: it
// satisfies engineApi.ts so the shell, the HUD and their tests can be written
// against it, and start() throws until the renderer lands. The real modules go
// beside it (renderer, clip, loaders, materials, scene, streaming, loop,
// governor, picking, controls/{orbit,firstPerson,tween}; P5 adds interior,
// lifts) and this file wires them.

/** What this build does (engineApi EstateEngineFeatures). The stub does nothing yet. */
export const ENGINE_FEATURES: EstateEngineFeatures = Object.freeze({
  overview: false,
  fly: false,
  flyTo: false,
  walk: false,
  enter: false,
  interiors: false,
  plan: false,
});

const INITIAL_VIEW: EstateView = Object.freeze({
  location: Object.freeze({ site: null, storey: null, unit: null, room: null, mode: 'overview' as const }),
  selection: null,
  transition: null,
  flight: false,
  popover: null,
  popoverOpen: false,
  moving: false,
  pointerLocked: false,
  pointerUnlockedAtMs: null,
  lean: false,
});

export const createEngine: CreateEngine = (options) => {
  const listeners = new Set<(event: EstateEngineEvent) => void>();
  let disposed = false;
  let view: EstateView = { ...INITIAL_VIEW, lean: options.lean };
  const resume: EstateResume = options.resume ?? {
    mode: 'overview', selection: null, position: [0, 0, 0], target: [0, 0, 0],
  };
  const refuse = (): boolean => false;

  const engine: EstateEngine = {
    token: options.token,
    features: ENGINE_FEATURES,
    preload: () => Promise.resolve(),
    start: () => {
      if (disposed) return;
      throw new Error('not implemented: the Estate engine is a skeleton');
    },
    freeze: () => undefined,
    resume: () => undefined,
    dispose: () => {
      disposed = true;
      listeners.clear();
    },
    getResume: () => resume,
    getView: () => view,
    subscribe: (listener) => {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    flyTo: refuse,
    enter: refuse,
    setMode: refuse,
    setStorey: refuse,
    takeLift: refuse,
    takeStairs: refuse,
    planView: refuse,
    walkStep: refuse,
    setStick: refuse,
    select: refuse,
    home: refuse,
    escape: refuse,
    setPopover: refuse,
    capture: refuse,
    setLean: (lean) => {
      if (!disposed) view = { ...view, lean };
    },
  };
  return engine;
};
