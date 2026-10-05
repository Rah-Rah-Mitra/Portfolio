import type { ComponentType } from 'react';
import type { EstateViewMode, Vec3 } from '../../../lib/estate/frames';
import type { EstateSiteId, EstateStoreyTag } from '../../../lib/estate/ids';
import type { EscapeAction, EstateInputState } from '../../../lib/estate/input';
import type { EstateLocation } from '../../../lib/estate/announce';
import type { TokenColours } from '../../../lib/estate/palette';
import type { EstatePhase } from '../../../lib/estate/policy';
import type { EstateTier } from '../../../lib/estate/tiers';

// The contract between the Estate window's shell (main bundle, prerendered:
// EstateWindow and its hooks) and its engine (the lazy chunk: estate/engine/**
// and estate/live/**, which alone may import three and camera-controls). Plan
// §7.1 and §7.10, with the 2026-10-05 amendments: the shell counts context
// resets, the engine only reports losses; Esc is decided in the shell by
// lib/estate/input.ts::decideEscape from state this contract exposes, and
// carried out by the engine through `escape()` (exitSubMode is gone).
//
// TYPES ONLY. This file must compile to nothing: no value exports, no runtime
// import, and never three — the shell imports it statically, and
// tests/estate-boundary.test.ts holds both rules. Anything the two sides share
// at run time is either here as a type or in lib/estate (pure).
//
// How the two sides meet:
//   1. The shell calls loadEngine() (estate/loadEngine.ts), which resolves an
//      EstateRuntime: this createEngine and the HUD component.
//   2. When the policy says startEngine (lib/estate/policy.ts), the shell finds
//      the stage by DOM scan (`[data-estate-stage]`), mints a fresh token and
//      calls createEngine(options) then start(). It never holds a ref to the
//      canvas: the engine makes its own canvas inside the stage, per instance.
//   3. Events reach the shell through options.onEvent and anyone else (the HUD)
//      through subscribe(). Every event carries the instance token; the shell
//      drops events whose token is not its current instance's, so a disposed
//      engine can never move the window into a phase.
//   4. The shell renders <EstateHud engine={…}/> inside the stage once the
//      engine is ready; the HUD calls engine commands directly.
//
// Phases. P4b ships Overview, Fly, fly-to, picking and the HUD. Walk, Enter,
// interiors, stairs and lifts are P5 and Plan is P6: their commands exist now
// so the shell, the HUD and the assistant are written once, return false (not
// done) until their phase, and `features` says which are live.

// ---- options ------------------------------------------------------------------------------

/** What createEngine needs. Nothing here is read during render; the shell builds it in an effect. */
export interface EstateEngineOptions {
  /**
   * The stage: `figure[data-estate-stage]` inside `section[data-win="world-3d"]`,
   * found by DOM scan in the effect that creates the engine (never a ref). The
   * engine appends a fresh canvas to it on start() (aria-hidden, filling it,
   * after React's own children: the poster and the HUD) and removes that canvas
   * on dispose(). Pointer and wheel input is taken on the canvas only, so a press
   * on a HUD chip never starts an orbit; keys on the host, and only when
   * event.target is the host itself (input.ts scope 1), so a focused HUD or
   * registry button keeps its native Enter and Space. It observes the host's size
   * with a ResizeObserver (debounced, frameLoop.ts) and writes the readout
   * attributes data-estate-draws/-tris/-ms/-programs/-band on it at most twice a
   * second (§7.8); React renders none of those, so it never clobbers them. It
   * never touches the rest of the window: Esc (scope 2), focus moves, tabIndex
   * and role belong to the shell.
   */
  host: HTMLElement;
  /**
   * Instance token, minted by the shell (a counter), stamped on every event this
   * instance emits and returned as `engine.token`. A shell that re-creates the
   * engine (Retry, release and reopen, StrictMode's double effect) ignores
   * anything carrying an older token.
   */
  token: number;
  /**
   * ESTATE_CATALOGUE.packUrl: the content-hashed pack.json, e.g.
   * '/estate/v1.2/pack.2fa7069b.json'. The engine fetches and parsePack()s it;
   * every FileRef.path resolves against this URL's folder.
   */
  packUrl: string;
  /**
   * Starting tier override (`?estate-quality=`, parsed by the shell with
   * governorCore's parseQualityOverride). Omitted, the engine picks one from the
   * renderer string and deviceMemory (startingTier, §7.9) — in engine/renderer.ts,
   * never in lib/experienceMode.ts, whose test forbids GPU probes.
   */
  tier?: EstateTier;
  /**
   * Start in lean mode (§7.4): massing everywhere; facade, detail and interior
   * only for the selected or targeted building; no P2/P3 prefetch. The shell
   * passes the policy result's `lean` and later calls setLean().
   */
  lean: boolean;
  /**
   * lib/motion's motionHalted, passed in so tests can drive it. Read when a
   * transition starts and on every frame while one runs: halted, every arc, FOV
   * change, fade and climb is a cut (camera-controls smoothing 0, no inertia),
   * and a transition already running when it turns true lands at its end on the
   * next frame. Visitor-driven movement (drag, keys) still renders. Never read
   * by a loop to decide whether to sleep: at rest the engine requests no frames
   * whatever this says.
   */
  motionHalted: () => boolean;
  /**
   * The design tokens' colours, read once at start for the 32-slot palette
   * texture and the scene colours (lib/estate/palette.ts buildPaletteTable and
   * resolveSceneColours). The shell passes a resolver over
   * getComputedStyle(document.documentElement) — `(token) => value or null` —
   * or, in tests, a plain record. No colour is ever written in engine code.
   */
  colours: TokenColours;
  /**
   * Every event this instance emits, before subscribers see it: the shell's one
   * listener. Delivery may be synchronous, from inside the command or start()
   * that caused it, so a listener must not assume it runs later. A listener may
   * call any command, dispose() included (the shell disposes on error, stale
   * and unavailable); after dispose() the event goes no further.
   */
  onEvent: (event: EstateEngineEvent) => void;
  /**
   * Debug readouts (`?estate-debug=1` or `?estate-bench=1`): the engine emits
   * `stats` with GPU timings and the HUD shows its debug row. Default false.
   */
  debug?: boolean;
  /**
   * Where a previous instance left off (getResume() before its dispose()): the
   * first live frame starts there instead of at the poster camera. Release after
   * 30 s closed keeps this in the shell's memory; reopening reuses it and the
   * HTTP cache, so nothing re-downloads.
   */
  resume?: EstateResume;
  /** Test seam: makes the per-instance canvas. Default document.createElement('canvas'). */
  createCanvas?: () => HTMLCanvasElement;
  /** Test seam: the fetch every pack download goes through. Default globalThis.fetch. */
  fetch?: typeof fetch;
}

/** The engine module's one export. Synchronous and side-effect free: no DOM, GPU or network until start() or preload(). */
export type CreateEngine = (options: EstateEngineOptions) => EstateEngine;

// ---- commands -----------------------------------------------------------------------------

/** One storey down (-1) or up (+1). */
export type EstateStep = -1 | 1;

/** A Walk step button (§8.6 bottom row): 0.5 m forward or back, or a 15° turn. */
export type EstateWalkStep = 'forward' | 'back' | 'turn-left' | 'turn-right';

/**
 * HUD popovers whose open state is an Esc layer (§8.3 level 1). The engine owns
 * the flag so the shell can read it synchronously in its Esc listener; the HUD
 * renders from it.
 */
export type EstatePopover = 'help' | 'lift';

/** Which commands do anything in this build. Constant per engine build; the HUD hides or disables the rest. */
export interface EstateEngineFeatures {
  /** Orbit, pan, zoom, picking, select(), home(). P4b. */
  overview: boolean;
  /** setMode('fly') and the 3 key; capture(). P4b. */
  fly: boolean;
  /** flyTo(). P4b. */
  flyTo: boolean;
  /** setMode('walk'), the 2 key, walkStep(), setStick(), the walk half of setStorey(). P5. */
  walk: boolean;
  /** enter(), Enter on a selection, takeLift(), takeStairs(). P5. */
  enter: boolean;
  /** Interiors stream and the facade mask runs (§7.5). P5. */
  interiors: boolean;
  /** planView(), setMode('plan'), the plan half of setStorey(). P6. */
  plan: boolean;
}

/** A pose to come back to, in the estate frame (x east, y north, z up, metres; lib/estate/frames.ts). */
export interface EstateResume {
  readonly mode: EstateViewMode;
  readonly selection: EstateSiteId | null;
  /** Camera position. */
  readonly position: Vec3;
  /** Orbit target in Overview and Plan; a point 10 m along the view direction in Walk and Fly. */
  readonly target: Vec3;
  /** Walk only (P5): the building and storey the walker stood in. */
  readonly inside?: { readonly site: EstateSiteId; readonly storey: EstateStoreyTag } | null;
}

export interface EstateFlyOptions {
  /** Cut instead of the 1.2 s arc, whatever motionHalted() says. Halted motion always cuts. */
  instant?: boolean;
}

export interface EstateEnterOptions extends EstateFlyOptions {
  /** Arrive on this storey (by lift from the entrance) rather than at the entrance spawn on L1. */
  storey?: EstateStoreyTag;
}

/**
 * The handle createEngine returns. Navigation commands return true when they
 * acted, false when they did nothing: before `ready`, after dispose(), while
 * frozen, when the feature is not in this build (`features`), or when the
 * request is already satisfied. They never throw on such input; the shell holds
 * a focusEstate request until `ready` (§9.4) and replays it then.
 */
export interface EstateEngine {
  /** The options.token this instance stamps on its events. */
  readonly token: number;
  readonly features: EstateEngineFeatures;

  // -- lifecycle (§7.10) --

  /**
   * Fetch pack.json and the stage-0 files (massing, site) into CPU memory
   * without a canvas. Idempotent, shared with start(). Lets the first frame
   * download while the window is closed during `loading` (§9.3): in-flight
   * downloads finish, and no renderer exists until start(). Never rejects: a
   * failure is reported as an `error` or `stale` event.
   */
  preload(): Promise<void>;
  /**
   * Make the canvas and the WebGL2 context (antialias per §7.7, no alpha,
   * depth, no stencil, failIfMajorPerformanceCaveat, retried without it at tier
   * min), check capabilities (no WebGL2 or no DecompressionStream → `unavailable`
   * and nothing else), preload, warm up (programs compiled behind the poster,
   * display calibration burst), upload stage 0, draw the first frame at the
   * resume pose or the poster camera with a 200 ms cross-fade, then emit `ready`.
   * Progress goes out as `progress` events. Idempotent; a no-op after dispose().
   */
  start(): void;
  /**
   * Closed, hidden or off screen: no frames, P2 and lower downloads cancelled,
   * held keys released, GPU memory kept. Idempotent. A context loss while frozen
   * is reported with `frozen: true` (the shell does not count it) and repaired
   * silently on resume().
   */
  freeze(): void;
  /** Back from freeze(): re-plan downloads and draw one frame. Idempotent. */
  resume(): void;
  /**
   * Ordered teardown, then silence: disposing = true; remove the engine's own
   * webglcontextlost/-restored listeners; clear the restore and reset timers;
   * renderer.dispose() then forceContextLoss(); remove the canvas; terminate the
   * decoder workers; abort every download. No event is emitted during or after
   * it, the synchronous contextlost that forceContextLoss() fires included.
   * Idempotent.
   */
  dispose(): void;
  /** The pose to hand the next instance's options.resume. Valid until dispose() returns. */
  getResume(): EstateResume;

  // -- reading state --

  /**
   * The current view, synchronously: what the last `location` event carried
   * (before the first one, Overview with nothing selected). The shell's Esc
   * listener reads it to build decideEscape's input; never stale by a frame,
   * because commands update it before returning. The first `location` goes out
   * just before `ready`.
   */
  getView(): EstateView;
  /** Listen to this instance's events (the HUD does). Returns the unsubscribe. Nothing is delivered after dispose(). */
  subscribe(listener: (event: EstateEngineEvent) => void): () => void;

  // -- navigation (§8.1) --

  /**
   * Select the building and frame it over 1.2 s (a cut when `instant` or
   * halted), loading its facade, detail and interior at P0 from the start.
   * From Walk or Fly the camera returns to Overview first. Emits `location`
   * when the flight starts (selection, `flight: true`) and when it lands.
   */
  flyTo(site: EstateSiteId, options?: EstateFlyOptions): boolean;
  /**
   * P5. The 1.2 s arc to the nearest entrance spawn (void deck 1.5 m out; MSCP
   * Entrance E; NC the nearest of its 8), rising by max(20 m, half the height),
   * FOV 45° → 60°, into Walk; with `storey`, then a lift to that storey. Refused
   * (false, and an `announce` with the reason) while the building's interior has
   * failed permanently (§7.5). Returns false in P4b.
   */
  enter(site: EstateSiteId, options?: EstateEnterOptions): boolean;
  /**
   * Switch mode. 'overview' ↔ 'fly' keep the pose (Fly → Overview orbits about a
   * point ahead). 'walk' (P5) from Overview cuts to the entrance spawn nearest the
   * orbit target. 'plan' (P6) needs a selected building; use planView(). Returns
   * false for a mode not in `features`, or the mode already on.
   */
  setMode(mode: EstateViewMode): boolean;
  /**
   * Plan (P6): one storey, or straight to a tag. Walk (P5): the storey strip —
   * by lift to the highest served level, then the stair path (§8.5); refused with
   * an `announce` reason when nothing reaches the tag. False in Overview and Fly.
   */
  setStorey(target: EstateStep | EstateStoreyTag): boolean;
  /** P5, Walk, within 1.5 m of a landing: the 250 ms fade ride to `level` (0 bytes downloaded; a cut when halted). */
  takeLift(level: EstateStoreyTag): boolean;
  /** P5, Walk, in a stair room: follow the stair path one storey up or down at 2.0 m/s (a cut when halted). */
  takeStairs(direction: EstateStep): boolean;
  /** P6: the 55° plan view of `site` cut at `storey` floor + 1.2 m. False in P4b and P5. */
  planView(site: EstateSiteId, storey: EstateStoreyTag): boolean;
  /** P5: one Walk step-button press (0.5 m, 15°), for pointer and touch alike. */
  walkStep(step: EstateWalkStep): boolean;
  /** P5: the touch stick's deflection, each axis −1…1 (x strafe, y forward); 0, 0 releases it. */
  setStick(x: number, y: number): boolean;
  /**
   * Highlight a building (registry row, HUD, a click on the stage) or clear the
   * selection with null. No camera move. Emits `location`. Works in every
   * feature set once ready.
   */
  select(site: EstateSiteId | null): boolean;
  /** Home: Overview and Plan → the aerial view (pack.views.aerialNE); Walk → back to its spawn. */
  home(): boolean;
  /**
   * Carry out one Esc layer the shell decided with decideEscape (§8.3):
   * close-popover, cancel-transition (land at the nearest end), overview (from
   * Walk the 1.0 s reverse arc), exit-plan (and clear the selection),
   * clear-selection. 'none' does nothing and returns false.
   */
  escape(action: EscapeAction): boolean;
  /** Open a HUD popover, or close the open one with null. Reflected in the view's `popover`/`popoverOpen`. */
  setPopover(popover: EstatePopover | null): boolean;
  /**
   * Ask for pointer lock on the canvas (the L key and the HUD's CAPTURE button;
   * opt-in, C16). Walk and Fly only. A refusal shows "WAIT, THEN CLICK CAPTURE";
   * a lost lock keeps the mode (§8.3).
   */
  capture(): boolean;
  /**
   * Lean mode on or off (§7.4). Off is the HUD's "Load full detail": every
   * class streams by distance as usual. Not a navigation command: honoured
   * before ready too.
   */
  setLean(lean: boolean): void;
}

// ---- state --------------------------------------------------------------------------------

/**
 * Where the camera is and what the Esc layers need, as one snapshot.
 * `location` feeds lib/estate/announce.ts (chipText and LocationAnnouncer);
 * `transition`, `popoverOpen`, `pointerLocked` and `pointerUnlockedAtMs` are
 * lib/estate/input.ts's EstateInputState fields verbatim, and `selection !==
 * null` is its `selection`.
 */
export interface EstateView {
  readonly location: EstateLocation;
  /** The selected building (registry highlight, HUD's mirrored Fly-to and Enter), or null. */
  readonly selection: EstateSiteId | null;
  /** A stair climb or lift fade is running (an Esc layer). Fly-to and Enter arcs are not: see `flight`. */
  readonly transition: EstateInputState['transition'];
  /** A fly-to, enter or exit arc is running. */
  readonly flight: boolean;
  readonly popover: EstatePopover | null;
  /** popover !== null. */
  readonly popoverOpen: boolean;
  /** The camera or walker moved on the frame that produced this view (LocationAnnouncer's `moving`). */
  readonly moving: boolean;
  /** document.pointerLockElement is this engine's canvas. */
  readonly pointerLocked: boolean;
  /** When the last pointerlockchange to unlocked fired, on performance.now's clock; null if never. */
  readonly pointerUnlockedAtMs: number | null;
  readonly lean: boolean;
}

// ---- events -------------------------------------------------------------------------------

export interface EstateEventBase {
  /** The emitting instance's options.token. */
  readonly token: number;
}

/** The first live frame is on screen. The shell moves to `live`. */
export interface EstateReadyEvent extends EstateEventBase {
  readonly type: 'ready';
  /** The tier the engine started on (after any override). */
  readonly tier: EstateTier;
  readonly msaa: boolean;
  /** Shader programs compiled during warm-up (§7.3: 6 expected). */
  readonly programs: number;
}

/**
 * Download and warm-up progress: the HUD's 1 px progress line and its
 * "STREAMING …" prompt. `stage` 'first-frame' is everything start() waits for;
 * 'streaming' is later detail. Emitted at most 4×/s, and once with pending 0
 * when a burst ends.
 */
export interface EstateProgressEvent extends EstateEventBase {
  readonly type: 'progress';
  readonly stage: 'first-frame' | 'streaming';
  /** Bytes received / expected in this burst (pack sizes, so they are known up front). */
  readonly loadedBytes: number;
  readonly totalBytes: number;
  /** Downloads queued or in flight. */
  readonly pending: number;
  /** What the HUD may print beside the line: 'STREAMING BLK 509 FAÇADE', 'COMPILING', or null. */
  readonly label: string | null;
}

/**
 * The view changed: a building, storey, room, mode, selection, popover,
 * transition or pointer-lock change, or movement starting or stopping. Not per
 * frame: at most once per frame, and only when a field differs.
 */
export interface EstateLocationEvent extends EstateEventBase, EstateView {
  readonly type: 'location';
  /**
   * Prefix for the storey announcement this change causes (LocationAnnouncer's
   * `via`): 'Lift 2' on a lift arrival, so it is one utterance.
   */
  readonly via?: string;
}

/**
 * Something to speak now, outside the location rules: `full` for the I key
 * (LocationAnnouncer.full()), otherwise `text` (a refusal, a Plan room pick:
 * LocationAnnouncer.say()).
 */
export interface EstateAnnounceEvent extends EstateEventBase {
  readonly type: 'announce';
  readonly full: boolean;
  readonly text: string | null;
}

/**
 * Renderer readouts, at most twice a second while frames run (none at rest).
 * The same numbers go onto the host's data-estate-* attributes. GPU and
 * governor fields are filled only with options.debug.
 */
export interface EstateStatsEvent extends EstateEventBase {
  readonly type: 'stats';
  readonly draws: number;
  readonly tris: number;
  readonly programs: number;
  /** CPU ms of the last frame (update + render). */
  readonly frameMs: number;
  readonly tier: EstateTier;
  readonly pixelRatio: number;
  /** storeys.ts bandLabel of the active interior band, or null (no data-estate-band). */
  readonly band: string | null;
  /** GPU memory in use, geometry plus drawing buffer, bytes (§7.7). */
  readonly gpuBytes: number;
  readonly droppedPct?: number;
  readonly cpuP95Ms?: number;
  readonly gpuP95Ms?: number;
}

/** webglcontextlost (default prevented). The shell counts live losses (policy.noteContextLoss); `frozen` ones are not counted. */
export interface EstateLostEvent extends EstateEventBase {
  readonly type: 'lost';
  readonly frozen: boolean;
}

/** webglcontextrestored: everything re-uploaded from CPU copies and drawing again. */
export interface EstateRestoredEvent extends EstateEventBase {
  readonly type: 'restored';
}

/** The capability check failed at start(). Terminal: the shell disposes and latches engine 'unavailable'. */
export interface EstateUnavailableEvent extends EstateEventBase {
  readonly type: 'unavailable';
  readonly reason: 'no-webgl2' | 'no-decompression-stream' | 'context-failed';
}

/**
 * The first frame could not be fetched or parsed after its retries, or the
 * engine threw. Terminal: the shell disposes and offers Retry (a new instance).
 * A later detail file that fails falls back to a coarser level and is not an
 * error.
 */
export interface EstateErrorEvent extends EstateEventBase {
  readonly type: 'error';
  readonly message: string;
}

/**
 * A content-hashed pack file (pack.json or anything it lists, under
 * /estate/v1.2/) 404'd: the site was re-packed under this page (§7.6, no retry).
 * Terminal; the shell offers Reload.
 */
export interface EstateStaleEvent extends EstateEventBase {
  readonly type: 'stale';
  readonly url: string;
}

export type EstateEngineEvent =
  | EstateReadyEvent
  | EstateProgressEvent
  | EstateLocationEvent
  | EstateAnnounceEvent
  | EstateStatsEvent
  | EstateLostEvent
  | EstateRestoredEvent
  | EstateUnavailableEvent
  | EstateErrorEvent
  | EstateStaleEvent;

export type EstateEngineEventType = EstateEngineEvent['type'];

// ---- HUD ------------------------------------------------------------------------------------

/**
 * live/EstateHud.tsx's props (§8.6). The shell renders it as the last child of
 * the stage figure while an engine instance exists and the phase is live,
 * frozen or lost. The HUD subscribes to `engine` in an effect for location,
 * progress, stats and announce, runs the LocationAnnouncer into its one visually
 * hidden role="status" node (the chip itself has no live role), finds the stage
 * with closest('[data-estate-stage]') for the KEYS ACTIVE chip, and requests
 * fullscreen on closest('#world'). Every pointer action it offers is a button
 * with an accessible name. Building facts come from ESTATE_CATALOGUE, imported
 * directly.
 */
export interface EstateHudProps {
  engine: EstateEngine;
  /** The window's phase; the HUD dims and disables its controls outside 'live'. */
  phase: EstatePhase;
  /**
   * Lean mode's "Load full detail · +X MB" (policy.fullDetailLabel), or null when
   * not lean. The shell's handler records the request (policy input fullDetail)
   * and calls engine.setLean(false).
   */
  fullDetail: { readonly label: string; readonly onLoad: () => void } | null;
  /** Show the debug row (dropped % · CPU p95 · draws · triangles · MB · programs). */
  debug: boolean;
}

// ---- the lazy chunk -------------------------------------------------------------------------

/** estate/engine/index.ts. */
export interface EstateEngineModule {
  createEngine: CreateEngine;
}

/** estate/live/EstateHud.tsx. */
export interface EstateHudModule {
  EstateHud: ComponentType<EstateHudProps>;
}

/** What loadEngine() resolves: both halves of the lazy chunk, downloaded together. */
export interface EstateRuntime {
  createEngine: CreateEngine;
  EstateHud: ComponentType<EstateHudProps>;
}

/**
 * How a failed loadEngine() rejects (EstateLoadError in loadEngine.ts carries
 * it): 'stale' when the chunk 404'd because the site was redeployed under the
 * page (the shell latches engine 'stale' and offers Reload), 'failed' for
 * anything else (engine 'failed', Retry imports again).
 */
export type EstateLoadFailure = 'stale' | 'failed';
