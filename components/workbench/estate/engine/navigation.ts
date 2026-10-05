import type { EstateViewMode } from '../../../../lib/estate/frames';
import type { EstateSiteId, EstateStoreyTag } from '../../../../lib/estate/ids';
import type { EscapeAction } from '../../../../lib/estate/input';
import type {
  EstateEngineFeatures, EstateEnterOptions, EstateFlyOptions, EstateStep, EstateView, EstateWalkStep,
} from '../engineApi';
import type { EstateCore } from './core';

// The seam for everything that moves the camera on request (plan §8): Overview
// (camera-controls), Fly, fly-to and picking in P4b; Walk, Enter, stairs and
// lifts in P5; Plan in P6. index.ts owns the handle and the view; it routes
// every navigation command here, and treats a missing method as "not in this
// build" (false). A navigation module drives the camera by giving the core a
// CameraRig (core.setRig) and reports what changed through `view.set`, which
// emits the `location` event.
//
// The default below navigates nothing: the render core alone draws the estate
// from the poster camera (or a resume pose) and answers select(), home() and
// the popover and selection Esc layers itself. P4b's controls replace
// createNavigation; the core and the handle stay as they are.

/** What a navigation module may read and change of the view. */
export interface ViewAccess {
  get(): EstateView;
  /** Merge a change; emits `location` (once ready) when anything differs. */
  set(patch: Partial<Omit<EstateView, 'popoverOpen' | 'location'>> & { location?: Partial<EstateView['location']> }, via?: string): boolean;
  /** Something to speak now (engineApi EstateAnnounceEvent). */
  announce(full: boolean, text: string | null): void;
}

export interface EngineNavigation {
  /** The features it adds; merged over the core's (all false). */
  readonly features: Partial<EstateEngineFeatures>;
  flyTo?(site: EstateSiteId, options?: EstateFlyOptions): boolean;
  enter?(site: EstateSiteId, options?: EstateEnterOptions): boolean;
  setMode?(mode: EstateViewMode): boolean;
  setStorey?(target: EstateStep | EstateStoreyTag): boolean;
  takeLift?(level: EstateStoreyTag): boolean;
  takeStairs?(direction: EstateStep): boolean;
  planView?(site: EstateSiteId, storey: EstateStoreyTag): boolean;
  walkStep?(step: EstateWalkStep): boolean;
  setStick?(x: number, y: number): boolean;
  /** Home: Overview and Plan → the aerial view; Walk → its spawn. Missing: the core's cut to the poster camera. */
  home?(): boolean;
  /** One Esc layer beyond the popover and selection ones index.ts handles. */
  escape?(action: EscapeAction): boolean;
  capture?(): boolean;
  /** The first live frame is up: install rigs and listeners on the canvas. */
  ready?(): void;
  /** Frozen: release held keys and stop transitions at their end. */
  freeze?(): void;
  dispose?(): void;
}

export type NavigationFactory = (core: EstateCore, view: ViewAccess) => EngineNavigation;

/**
 * A navigation that moves nothing: the core alone, drawing from its static
 * pose. This build mounts controls/index.ts createControls instead (P4b's
 * Overview, Fly, fly-to and picking); this stays for harnesses and benches.
 */
export const createNavigation: NavigationFactory = () => ({ features: {} });
