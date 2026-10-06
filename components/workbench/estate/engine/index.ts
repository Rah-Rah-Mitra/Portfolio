import type { EstateLocation } from '../../../../lib/estate/announce';
import type {
  CreateEngine, EstateEngine, EstateEngineFeatures, EstateEngineOptions, EstateInteriorView, EstatePopover, EstateResume,
  EstateView,
} from '../engineApi';
import { CONTROLS_FEATURES, createControls } from './controls';
import { EstateCore } from './core';
import { EngineEmitter } from './lifecycle';
import type { EngineNavigation, ViewAccess } from './navigation';

// The Estate engine's entry (plan §7.1): the lazy chunk's only export the shell
// sees, reached solely through estate/loadEngine.ts. three r186 and
// camera-controls may be imported here and under estate/live/, nowhere else
// (tests/estate-boundary.test.ts).
//
// This file is the EstateEngine handle: lifecycle and readiness rules, the view
// snapshot the shell's Esc listener reads, and command routing. The render core
// (core.ts and the modules beside it: renderer, clip, loaders, materials,
// scene, streaming, loop, governor, levels, stats, lifecycle) draws; the
// navigation module (navigation.ts: Overview, Fly, fly-to and picking in P4b,
// P5's Walk and Enter, P6's Plan) moves the camera. A command whose feature is
// not in this build returns false, as engineApi.ts promises.

/** The core's own features: none of the navigation ones. navigation.ts adds its own over these. */
const CORE_FEATURES: EstateEngineFeatures = Object.freeze({
  overview: false,
  fly: false,
  flyTo: false,
  walk: false,
  enter: false,
  // Interiors stream and the façade mask runs in the core itself (interior.ts, P5).
  interiors: true,
  plan: false,
});

const INITIAL_LOCATION: EstateLocation = Object.freeze({ site: null, storey: null, unit: null, room: null, mode: 'overview' as const });

const sameLocation = (a: EstateLocation, b: EstateLocation): boolean =>
  a.site === b.site && a.storey === b.storey && a.unit === b.unit && a.room === b.room && a.mode === b.mode;

const sameView = (a: EstateView, b: EstateView): boolean =>
  sameLocation(a.location, b.location) && a.selection === b.selection && a.transition === b.transition
  && a.flight === b.flight && a.popover === b.popover && a.moving === b.moving && a.pointerLocked === b.pointerLocked
  && a.pointerUnlockedAtMs === b.pointerUnlockedAtMs && a.lean === b.lean && a.flySpeed === b.flySpeed
  && (a.interior ?? null) === (b.interior ?? null);

const sameInterior = (a: EstateInteriorView | null, b: EstateInteriorView | null): boolean =>
  a === b || (a !== null && b !== null && a.site === b.site && a.state === b.state && a.storey === b.storey
    && a.band === b.band && a.reason === b.reason);


/** The handle and the render core behind it. The shell only ever sees the handle (createEngine); harnesses, benches and tests may drive the core directly. */
export interface EngineInternals {
  engine: EstateEngine;
  core: EstateCore;
}

export const createEngineInternals = (options: EstateEngineOptions): EngineInternals => {
  let view: EstateView = Object.freeze({
    location: INITIAL_LOCATION,
    selection: options.resume?.selection ?? null,
    transition: null,
    flight: false,
    popover: null,
    popoverOpen: false,
    moving: false,
    pointerLocked: false,
    pointerUnlockedAtMs: null,
    lean: options.lean,
  });

  const emitter = new EngineEmitter(options.token, options.onEvent);
  let core: EstateCore | null = null;
  /** Location events sent, so the one before `ready` is not sent twice when navigation's ready() already sent it. */
  let locations = 0;

  const emitLocation = (via?: string) => {
    locations += 1;
    emitter.emit({ type: 'location', ...view, ...(via !== undefined ? { via } : {}) });
  };

  const access: ViewAccess = {
    get: () => view,
    set: (patch, via) => {
      const location = patch.location ? { ...view.location, ...patch.location } : view.location;
      const popover = patch.popover !== undefined ? patch.popover : view.popover;
      const next: EstateView = { ...view, ...patch, location, popover, popoverOpen: popover !== null };
      if (sameView(next, view)) return false;
      view = Object.freeze({ ...next, location: Object.freeze(location) });
      if (core && core.isReady && !core.isDisposed) emitLocation(via);
      return true;
    },
    announce: (full, text) => {
      if (core && core.isReady) emitter.emit({ type: 'announce', full, text });
    },
  };

  let navigation: EngineNavigation | null = null;
  const engineCore = new EstateCore(options, emitter, {
    beforeReady: () => {
      const before = locations;
      navigation?.ready?.();
      if (locations === before) emitLocation();
    },
    moving: (moving) => { access.set({ moving }); },
    interior: (status) => {
      const next: EstateInteriorView | null = status.site === null || status.state === 'none' ? null : Object.freeze({
        site: status.site, state: status.state, storey: status.storeyTag, band: status.band, reason: status.reason,
      });
      if (sameInterior(view.interior ?? null, next)) return;
      access.set({ interior: next });
    },
  });
  core = engineCore;
  if (view.selection) engineCore.setFocus(view.selection);
  // P4b's controls (Overview, Fly, fly-to, picking); navigation.ts is the seam P5's Walk and P6's Plan extend.
  const nav = createControls(engineCore, access);
  navigation = nav;
  const features: EstateEngineFeatures = Object.freeze({ ...CORE_FEATURES, ...nav.features });

  /** Navigation commands act only on a live, unfrozen engine. */
  const live = (): boolean => engineCore.isReady && !engineCore.isDisposed && !engineCore.isFrozen;

  const select = (site: Parameters<EstateEngine['select']>[0]): boolean => {
    if (!live() || site === view.selection) return false;
    engineCore.setFocus(site);
    access.set({ selection: site });
    return true;
  };

  const setPopover = (popover: EstatePopover | null): boolean => {
    if (!live() || popover === view.popover) return false;
    access.set({ popover });
    return true;
  };

  const engine: EstateEngine = {
    token: options.token,
    features,
    preload: () => engineCore.preload(),
    start: () => engineCore.start(),
    freeze: () => {
      if (engineCore.isDisposed) return;
      nav.freeze?.();
      engineCore.freeze();
    },
    resume: () => engineCore.resume(),
    dispose: () => {
      if (engineCore.isDisposed) return;
      nav.dispose?.();
      engineCore.dispose();
    },
    getResume: (): EstateResume => {
      if (!engineCore.scene) {
        return options.resume ?? { mode: 'overview', selection: view.selection, position: [0, 0, 0], target: [0, 0, 0] };
      }
      const { position, target } = engineCore.cameraEstate();
      return { mode: view.location.mode, selection: view.selection, position, target, inside: null };
    },
    getView: () => view,
    subscribe: (listener) => emitter.subscribe(listener),

    flyTo: (site, flyOptions) => live() && nav.flyTo !== undefined && nav.flyTo(site, flyOptions),
    enter: (site, enterOptions) => live() && nav.enter !== undefined && nav.enter(site, enterOptions),
    setMode: (mode) => live() && mode !== view.location.mode && nav.setMode !== undefined && nav.setMode(mode),
    setStorey: (target) => live() && nav.setStorey !== undefined && nav.setStorey(target),
    takeLift: (level) => live() && nav.takeLift !== undefined && nav.takeLift(level),
    takeStairs: (direction) => live() && nav.takeStairs !== undefined && nav.takeStairs(direction),
    planView: (site, storey) => live() && nav.planView !== undefined && nav.planView(site, storey),
    walkStep: (step) => live() && nav.walkStep !== undefined && nav.walkStep(step),
    setStick: (x, y) => live() && nav.setStick !== undefined && nav.setStick(x, y),
    select,
    home: () => {
      if (!live()) return false;
      if (nav.home) return nav.home();
      const pose = engineCore.posterPose();
      if (!pose || engineCore.currentRig !== engineCore.staticRig) return false;
      engineCore.staticRig.setPose(pose.position, pose.target, pose.fovDeg);
      engineCore.invalidate();
      return true;
    },
    escape: (action) => {
      if (!live()) return false;
      switch (action) {
        case 'close-popover': return setPopover(null);
        case 'clear-selection': return select(null);
        case 'none': return false;
        default:
          if (nav.escape?.(action)) return true;
          // Leaving Plan clears the selection with it (§8.3 amendment).
          return action === 'exit-plan' ? select(null) : false;
      }
    },
    setPopover,
    capture: () => live() && nav.capture !== undefined && nav.capture(),
    setLean: (lean) => {
      if (engineCore.isDisposed) return;
      engineCore.setLean(lean);
      access.set({ lean });
    },
  };
  return { engine, core: engineCore };
};

export const createEngine: CreateEngine = (options) => createEngineInternals(options).engine;

/** What this build does (engineApi EstateEngineFeatures), for callers that need it before creating an engine. */
export const ENGINE_FEATURES: EstateEngineFeatures = Object.freeze({ ...CORE_FEATURES, ...CONTROLS_FEATURES });
