import { Matrix4, PerspectiveCamera, Scene, Vector3 } from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { threeToEstate, type Vec3 } from '../../../../lib/estate/frames';
import { ESTATE_SITE_IDS, type EstateSiteId } from '../../../../lib/estate/ids';
import { ESTATE_VFOV_DEG, sseScale } from '../../../../lib/estate/lod';
import { EstateScheduler, type PlanContext } from '../../../../lib/estate/scheduler';
import { EstatePackError, parsePack, type EstatePack } from '../../../../lib/estate/schema';
import { ESTATE_TIER_TABLE, capPixelRatio, type EstateTier } from '../../../../lib/estate/tiers';
import type { FrameActivity } from '../../../../lib/estate/frameLoop';
import type { EstateEngineOptions } from '../engineApi';
import { applyClip, fogRange, type FogRange } from './clip';
import { EngineGovernor, type GovernorChange } from './governor';
import { ContextWatch, type EngineEmitter, runTeardown, TimerSet } from './lifecycle';
import { claimDecoder, createGlbLoader, fetchBytes, isAbort, PackFetchError, readPayload } from './loaders';
import { InteriorSystem, type InteriorStatus } from './interior';
import { createMaterialKit, type MaterialKit } from './materials';
import { createPalette } from './palette';
import type { Part } from './parts';
import {
  chooseStart, createRenderer, GpuTimer, missingCapability, probeGpu, readMsaaOff, shouldDropMsaa, writeMsaaOff,
  type CreatedRenderer, type UnavailableReason,
} from './renderer';
import { StaticRig, type CameraRig } from './rig';
import { EstateScene } from './scene';
import { clearReadouts, readoutValues, ReadoutThrottle, writeReadouts, type FrameStats } from './stats';
import { Streaming, type DecodedFile } from './streaming';
import { GeometryUploader } from './upload';
import { LevelWiring, type LevelFrame } from './levels';
import { browserLoopHost, RenderLoop, type LoopHost } from './loop';
import { posterPose, resumePose, type ThreePose } from './views';

// The render core (plan §7): one instance per engine, owning the canvas, the
// renderer, the scene, streaming, the frame loop, the governor and the
// readouts. index.ts wraps it in the EstateEngine handle and owns the view
// state; a CameraRig (rig.ts) moves the camera.
//
// start() runs, in order: capability check → the GPU's name (one probe per
// page, skipped under a tier override) → tier, pixel ratio, MSAA → the canvas
// and its context → pack.json and stage 0 (shared with preload) → palette,
// materials, scene → warm-up (every program compiled behind the poster) → a
// display-calibration burst → frames that upload stage 0, one geometry each →
// the first live frame, faded in over 200 ms, then `ready`.
//
// Each frame: rig → ≤ 1 upload → eviction → frustum → trees → interiors
// (current building and storey, band, façade mask, the interior's reserve;
// interior.ts) → detail selection → plan downloads → levels → clip planes and
// fog → draw → readouts → governor sample. Frames continue only while the rig
// moves, uploads wait or settle frames are owed (loop.ts); at rest none is
// requested.

const PROGRESS_INTERVAL_MS = 250;
/**
 * Edge lines draw only while a typical storey (2.8 m) spans at least this many
 * pixels on screen: at K = 519 (600 px, 60°) that is within ~180 m. Farther
 * out, 1 px lines a few pixels apart read as a dark mass, not as line work.
 */
export const EDGE_MIN_STOREY_PX = 8;
const TYPICAL_STOREY_M = 2.8;
const FADE_MS = 200;
const PACK_RETRIES = 2;
const PACK_BACKOFF_MS = 1000;
/**
 * A pixel-ratio notch reallocates the drawing buffer (setSize), which took
 * 56–437 ms on SwiftShader mid-orbit. While the visitor drives the camera it
 * waits for the first frame without motion, at most this long, ms.
 */
export const NOTCH_RESIZE_DEFER_MS = 2000;
/** Fly below this eye height (m) is among the tree crowns, which are not boxes: the near plane stays ≤ FLY_TREE_NEAR_M. */
export const TREE_CROWN_TOP_M = 16;
export const FLY_TREE_NEAR_M = 0.3;

export interface CoreHooks {
  /** The first live frame is drawn: emit the first `location` before `ready`. */
  beforeReady(): void;
  /** The camera started or stopped moving (the view's `moving`). */
  moving(moving: boolean): void;
  /** The interior status changed (building, storey, band, streaming or failed; interior.ts). */
  interior?(status: InteriorStatus): void;
}

type Phase = 'idle' | 'booting' | 'live' | 'failed' | 'disposed';

/** The pack folder's URL (with its trailing slash) from pack.json's. */
export const packBase = (packUrl: string): string => packUrl.slice(0, packUrl.lastIndexOf('/') + 1);

export class EstateCore {
  readonly options: EstateEngineOptions;
  private readonly emitter: EngineEmitter;
  private readonly hooks: CoreHooks;
  private readonly timers = new TimerSet();
  private readonly fetchImpl: typeof fetch;
  private readonly loopHost: LoopHost;
  private phase: Phase = 'idle';

  // preload
  private preloadPromise: Promise<void> | null = null;
  pack: EstatePack | null = null;
  streaming: Streaming | null = null;
  /**
   * Interiors, walk grids, nav files and the ground (§7.5, §8.4), from the
   * moment pack.json is read: the Walk controls' floor, location and entry
   * queries (interior.ts). null before then.
   */
  interiors: InteriorSystem | null = null;
  private loader: GLTFLoader | null = null;
  private releaseDecoder: (() => void) | null = null;
  private packAbort: AbortController | null = null;

  // the renderer and the scene
  private canvas: HTMLCanvasElement | null = null;
  private created: CreatedRenderer | null = null;
  private kit: MaterialKit | null = null;
  scene: EstateScene | null = null;
  private uploader: GeometryUploader | null = null;
  private levels: LevelWiring | null = null;
  private loop: RenderLoop | null = null;
  private governor: EngineGovernor | null = null;
  private gpuTimer: GpuTimer | null = null;
  private watch: ContextWatch | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private readouts: ReadoutThrottle<FrameStats> | null = null;
  private statsOut: ReadoutThrottle<FrameStats> | null = null;
  readonly camera = new PerspectiveCamera(45, 4 / 3, 1, 2000);
  readonly staticRig = new StaticRig(this.camera);
  private rig: CameraRig = this.staticRig;

  // state
  tier: EstateTier = 'mid';
  pixelRatio = 1;
  msaa = false;
  private cssWidth = 0;
  private cssHeight = 0;
  private frozen = false;
  private ready = false;
  private lost = false;
  private restoring = false;
  private compiling = false;
  private resized = false;
  private programs = 0;
  private wasMoving = false;
  private lastFrameTime = Number.NaN;
  private lastProgress = -Infinity;
  private progressTimer: ReturnType<typeof setTimeout> | null = null;
  private progressBurst = false;
  private lean: boolean;
  /** Index of the selected or targeted building (lean mode and P0 downloads follow it), or −1. */
  private focusIndex = -1;
  private calibrating = false;
  /** The size and ratio the drawing buffer was last given (setSize reallocates even when nothing changed). */
  private appliedWidth = 0;
  private appliedHeight = 0;
  private appliedRatio = 0;
  /** A governor notch's pixel ratio, waiting for a frame without motion (NOTCH_RESIZE_DEFER_MS), and since when. */
  private pendingRatio: number | null = null;
  private pendingRatioSince = 0;
  /** The timer that wakes the loop when a held level step comes due (lod.ts DWELL_MS), and when it fires. */
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private holdDue = Infinity;

  // per-frame scratch
  private readonly visible: boolean[] = ESTATE_SITE_IDS.map(() => false);
  private readonly projScreen = new Matrix4();
  private readonly eye: Vec3 = [0, 0, 0];
  private readonly target = new Vector3();
  private readonly reserve = { tris: 0, draws: 0 };
  private readonly fog: FogRange = { near: 0, far: 0 };
  private readonly clipScratch = { near: 0, far: 0 };
  private readonly clipPose = { nearestBoxDistance: Infinity, heightAboveFloor: 0, orbitDistance: 0, reversedDepth: false };
  private readonly planContext: PlanContext = { focus: null, mode: 'overview', lean: false, frozen: false };
  private readonly activity: FrameActivity = { controls: false, keys: false, tweens: false, uploads: false };
  private readonly eyeScratch: Vec3 = [0, 0, 0];
  private readonly levelFrame: LevelFrame = {
    now: 0, k: 1, tier: ESTATE_TIER_TABLE.mid, lean: false, focus: -1, inside: -1, eye: this.eye, visible: this.visible, reserveTris: 0, reserveDraws: 0,
  };
  private readonly interiorFrame = { now: 0, eye: this.eye, tier: 'mid' as EstateTier, furnitureRadius: 0 };
  private readonly partsOf = (id: string): readonly Part[] | null => this.streaming?.partsOf(id) ?? null;
  private readonly stats: FrameStats = {
    draws: 0, tris: 0, programs: 0, frameMs: 0, tier: 'mid', pixelRatio: 1, band: null, gpuBytes: 0,
  };

  constructor(options: EstateEngineOptions, emitter: EngineEmitter, hooks: CoreHooks, loopHost?: LoopHost) {
    this.options = options;
    this.emitter = emitter;
    this.hooks = hooks;
    this.lean = options.lean;
    this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.loopHost = loopHost ?? (typeof window === 'undefined' ? nodeLoopHost() : browserLoopHost());
  }

  get isDisposed(): boolean { return this.phase === 'disposed'; }
  get isReady(): boolean { return this.ready; }
  get isFrozen(): boolean { return this.frozen; }
  get mode() { return this.rig.mode; }

  // ---- preload: pack.json and stage 0 into CPU memory ---------------------------------

  preload(): Promise<void> {
    if (!this.preloadPromise) this.preloadPromise = this.loadPack().catch((error) => { this.fail(error); });
    return this.preloadPromise;
  }

  private async loadPack(): Promise<void> {
    const url = this.options.packUrl;
    let attempt = 0;
    for (;;) {
      if (this.isDisposed) return;
      this.packAbort = new AbortController();
      try {
        const stored = await fetchBytes(this.fetchImpl, url, { signal: this.packAbort.signal, priority: 'high' });
        const payload = await readPayload(stored, url);
        if (payload.kind !== 'json') throw new PackFetchError(url, null, `${url}: expected JSON, got ${payload.kind}`);
        const pack = parsePack(JSON.parse(new TextDecoder().decode(payload.bytes)));
        if (this.isDisposed) return;
        this.pack = pack;
        break;
      } catch (error) {
        if (this.isDisposed || isAbort(error)) return;
        if (error instanceof PackFetchError && error.status === 404) {
          this.stale(url);
          return;
        }
        if (error instanceof EstatePackError || error instanceof SyntaxError || attempt >= PACK_RETRIES) throw error;
        attempt += 1;
        await new Promise<void>((resolve) => { this.timers.after(PACK_BACKOFF_MS * 2 ** (attempt - 1), resolve); });
      }
    }
    const pack = this.pack;
    if (!pack) return;
    this.loader = createGlbLoader();
    this.releaseDecoder = claimDecoder();
    const scheduler = new EstateScheduler({ tier: this.tier });
    this.interiors = new InteriorSystem(pack, scheduler, (status) => { if (!this.isDisposed) this.hooks.interior?.(status); });
    this.streaming = new Streaming({
      pack,
      base: packBase(url),
      fetchImpl: this.fetchImpl,
      scheduler,
      loader: this.loader,
      now: () => this.loopHost.now(),
      setTimer: (ms, run) => this.timers.after(ms, run),
      hooks: {
        decoded: (file) => this.attach(file),
        wake: () => this.wake(),
        fatal: (message) => this.fail(new Error(message)),
        stale: (staleUrl) => this.stale(staleUrl),
        progress: () => this.progress(),
        entryBlocked: (site, message) => this.interiors?.markFailed(site, message),
      },
    });
    // Stage 0 only until the first frame plans the rest (frozen keeps P0 and P1;
    // with no views nothing is visible, so P1 is empty).
    this.streaming.pump(null, { focus: null, mode: 'overview', lean: this.lean, frozen: true });
  }

  private attach(file: DecodedFile) {
    const decoded = file.decoded;
    // CPU data goes to the interiors at once (no scene needed); geometry to the scene.
    if (decoded.kind === 'walk') { this.interiors?.addWalk(file.info.siteIndex, decoded.walk); return; }
    if (decoded.kind === 'nav') { this.interiors?.addNav(file.info.siteIndex, decoded.nav); return; }
    if (decoded.kind === 'ground') { this.interiors?.addGround(decoded.ground); return; }
    if (!this.scene) return; // attached in bulk once the scene exists
    this.scene.attach(file.info.id, decoded, file.info.siteIndex >= 0 ? file.info.siteIndex : null);
  }

  private wake() {
    if (this.isDisposed) return;
    if (this.frozen || !this.loop) {
      // No frames while frozen: keep P0/P1 downloads moving without drawing.
      this.streaming?.pump(this.levels?.views ?? null, this.planFor(true));
      return;
    }
    this.loop.invalidate();
  }

  // ---- start ------------------------------------------------------------------------

  start(): void {
    if (this.phase !== 'idle') return;
    this.phase = 'booting';
    this.boot().catch((error) => this.fail(error));
  }

  private hostSize(): { width: number; height: number } {
    return this.hostBox() ?? { width: 1, height: 1 };
  }

  /**
   * The host's CSS size, or null when it has no box: a closed or minimised
   * window is display:none, and its ResizeObserver reports 0 × 0. Sizing the
   * buffer to that drew every reopen at 1 × 1 (a grey frame, and every
   * building dropped to massing), so a boxless host keeps the last size.
   */
  private hostBox(): { width: number; height: number } | null {
    const host = this.options.host;
    let width = host.clientWidth;
    let height = host.clientHeight;
    if (!(width > 0 && height > 0)) {
      const rect = host.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
    }
    if (!(width >= 0.5 && height >= 0.5)) return null;
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  }

  private async boot(): Promise<void> {
    const missing = missingCapability();
    if (missing) { this.unavailable(missing); return; }
    const options = this.options;
    const createCanvas = options.createCanvas ?? (() => document.createElement('canvas'));
    const { width, height } = this.hostSize();
    this.cssWidth = width;
    this.cssHeight = height;
    const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;

    const identity = options.tier ? { renderer: null, caveat: false } : probeGpu(createCanvas);
    if (!identity) { this.unavailable('no-webgl2'); return; }
    const deviceMemory = (globalThis.navigator as { deviceMemory?: number } | undefined)?.deviceMemory ?? null;
    const choice = chooseStart({
      identity, deviceMemory, override: options.tier ?? null, cssWidth: width, cssHeight: height, devicePixelRatio: dpr, msaaOff: readMsaaOff(),
    });

    const canvas = createCanvas();
    canvas.className = 'wb-estate-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.dataset.estateCanvas = '';
    Object.assign(canvas.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', opacity: '0',
    });
    this.canvas = canvas;
    options.host.appendChild(canvas);

    const created = createRenderer(canvas, choice.msaa, identity.caveat);
    if (!created) { this.unavailable('context-failed'); return; }
    this.created = created;
    this.tier = created.caveat && !options.tier ? 'min' : choice.tier;
    this.msaa = created.msaa;
    this.watch = new ContextWatch(canvas, { lost: () => this.onLost(), restored: () => this.onRestored() });
    this.watch.attach();
    this.applySize(true);

    await this.preload();
    if (this.isDisposed || this.phase === 'failed') return;
    const pack = this.pack;
    const streaming = this.streaming;
    if (!pack || !streaming) return;

    const kit = createMaterialKit(createPalette(options.colours));
    this.kit = kit;
    const scene = new EstateScene(pack, kit);
    this.scene = scene;
    this.interiors?.bindScene(scene.buildings);
    for (const file of streaming.decoded.values()) this.attach(file);
    this.uploader = new GeometryUploader(created.renderer, kit.fog);
    this.levels = new LevelWiring(pack.sites);
    streaming.scheduler.setTier(this.tier);
    this.gpuTimer = GpuTimer.create(created.gl);
    this.governor = new EngineGovernor(this.tier, this.pixelRatio, this.gpuTimer);
    this.loop = new RenderLoop(this.loopHost, (time, continuous) => {
      try {
        return this.frame(time, continuous);
      } catch (error) {
        // A frame that throws ends the engine (`error`, Retry), not the page.
        this.fail(error);
        return this.activity;
      }
    }, () => this.applySize(false));
    this.readouts = new ReadoutThrottle((s) => writeReadouts(options.host, readoutValues(s)), () => this.loopHost.now());
    this.statsOut = new ReadoutThrottle((s) => this.emitStats(s), () => this.loopHost.now());
    this.updateDrawingBuffer();

    const pose = this.startPose(pack);
    this.staticRig.setPose(pose.position, pose.target, pose.fovDeg);

    this.compiling = true;
    this.progress();
    await this.warmUp();
    this.compiling = false;
    if (this.isDisposed) return;
    const intervals = await this.loop.calibrate();
    if (this.isDisposed) return;
    this.governor.calibrate(intervals);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.loop?.noteResize());
      this.resizeObserver.observe(options.host);
    }
    this.phase = 'live';
    if (!this.frozen && !this.lost) this.loop.start();
  }

  private startPose(pack: EstatePack): ThreePose {
    const aspect = this.cssWidth / this.cssHeight;
    const resume = this.options.resume;
    if (resume) return resumePose(resume.position, resume.target, ESTATE_VFOV_DEG[resume.mode]);
    return posterPose(pack.views.aerialNE, aspect);
  }

  /**
   * Every program compiled before the first upload (§7.3): with
   * KHR_parallel_shader_compile, compileAsync over one object per program;
   * otherwise one program per idle callback (100 ms timeout), so Firefox never
   * sees one long compile task.
   */
  private async warmUp(): Promise<void> {
    const created = this.created;
    const kit = this.kit;
    const scene = this.scene;
    if (!created || !kit || !scene) return;
    const { renderer, gl } = created;
    const camera = this.camera;
    const parallel = gl.getExtension('KHR_parallel_shader_compile') !== null;
    if (parallel) {
      const holder = new Scene();
      for (const object of kit.warmup) holder.add(object);
      await renderer.compileAsync(holder, camera, scene.root);
      holder.clear();
    } else {
      for (const object of kit.warmup) {
        if (this.isDisposed) return;
        await idle();
        const holder = new Scene();
        holder.add(object);
        renderer.compile(holder, camera, scene.root);
        holder.clear();
      }
    }
    this.programs = renderer.info.programs?.length ?? 0;
  }

  // ---- frames -------------------------------------------------------------------------

  private frame(time: number, continuous: boolean): FrameActivity {
    const created = this.created;
    const scene = this.scene;
    const streaming = this.streaming;
    const levels = this.levels;
    const kit = this.kit;
    const uploader = this.uploader;
    const governor = this.governor;
    const activity = this.activity;
    activity.controls = false;
    activity.keys = false;
    activity.tweens = false;
    activity.uploads = false;
    if (!created || !scene || !streaming || !levels || !kit || !uploader || !governor || this.isDisposed || this.lost) return activity;
    const { renderer } = created;
    const camera = this.camera;
    const scheduler = streaming.scheduler;
    const t0 = this.loopHost.now();
    const now = t0;
    const dt = continuous && !Number.isNaN(this.lastFrameTime) ? Math.min(0.1, Math.max(0, (time - this.lastFrameTime) / 1000)) : 0;
    this.lastFrameTime = time;
    const tier = ESTATE_TIER_TABLE[this.tier];

    // The camera.
    const rig = this.rig;
    const moving = rig.update(dt);
    camera.updateMatrixWorld();
    threeToEstate(camera.position.toArray(this.eyeScratch), this.eye);
    rig.getTarget(this.target);
    const orbitDistance = camera.position.distanceTo(this.target);
    if (moving !== this.wasMoving) {
      this.wasMoving = moving;
      this.hooks.moving(moving);
    }

    // At most one geometry to the GPU, then eviction (§7.6, §7.7). First, so
    // this frame's detail selection already counts what this upload completes
    // (the first frame shows the massing it just finished uploading).
    scheduler.beginFrame();
    scene.markSeen(scheduler, now);
    this.interiors?.markSeen(now);
    let uploaded = false;
    const ticket = scheduler.takeUpload(now);
    if (ticket) {
      if (ticket.evict.length) scene.evict(ticket.evict, this.partsOf);
      const part: Part | undefined = streaming.partsOf(ticket.id)?.[ticket.part];
      if (part) {
        uploader.upload(part.object, camera);
        part.uploaded = true;
        uploaded = true;
        if (part.role === 'trees') scene.invalidateTrees();
      }
    }
    scene.evict(scheduler.evict(now), this.partsOf);

    // What is in view, near/far trees, and what the site costs.
    this.projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    scene.cull(this.projScreen, camera.reversedDepth, this.visible);
    scene.updateTrees(camera.position.x, camera.position.z, tier.treeRadiusM);
    scene.reserve(this.reserve);

    // Interiors: the current building and storey, the band and the façade mask,
    // and what the active interior draws, booked before any building (§7.4).
    const interiors = this.interiors;
    let interiorChanged = false;
    if (interiors) {
      const fi = this.interiorFrame;
      fi.now = now;
      fi.tier = this.tier;
      fi.furnitureRadius = tier.furnitureRadiusM;
      interiorChanged = interiors.update(fi);
      this.reserve.tris += interiors.reserveTris;
      this.reserve.draws += interiors.reserveDraws;
    }

    // Detail selection, then downloads planned from the same numbers.
    const bufferHeight = Math.floor(this.cssHeight * this.pixelRatio);
    const k = sseScale(bufferHeight, ESTATE_VFOV_DEG[rig.mode]);
    const lf = this.levelFrame;
    lf.now = now;
    lf.k = k;
    lf.tier = tier;
    lf.lean = this.lean;
    lf.focus = this.planFocus();
    lf.inside = interiors?.insideIndex ?? -1;
    lf.reserveTris = this.reserve.tris;
    lf.reserveDraws = this.reserve.draws;
    const selector = levels.update(lf, scheduler);
    streaming.pump(levels.views, this.planFor(false));
    scheduler.setViews(levels.views);
    // A level step held by the 400 ms dwell comes due with nothing else moving:
    // wake one frame for it then (a timeout, not rAF, so rest stays rest).
    this.armHold(selector.holdUntil, now);

    // Levels, then the planes and fog for this pose.
    const edgeReach = (TYPICAL_STOREY_M * k) / (EDGE_MIN_STOREY_PX * this.pixelRatio);
    if (scene.applyLevels(selector.level, tier.edges, this.distances(levels), edgeReach) > 0 && this.ready) this.loop?.markChanged();
    // A band change, the interior turning on or off, furniture re-partitioned: two settle frames (§7.8).
    if (interiorChanged && this.ready) this.loop?.markChanged();
    let nearest = Infinity;
    for (let i = 0; i < this.visible.length; i += 1) {
      if (this.visible[i] && levels.inputs[i].distance < nearest) nearest = levels.inputs[i].distance;
    }
    // Low in Fly the camera is among tree crowns, which the box distance does
    // not see: hold the near plane at FLY_TREE_NEAR_M there.
    if (rig.mode === 'fly' && this.eye[2] < TREE_CROWN_TOP_M && nearest > 2 * FLY_TREE_NEAR_M) nearest = 2 * FLY_TREE_NEAR_M;
    const pose = this.clipPose;
    pose.nearestBoxDistance = nearest;
    pose.heightAboveFloor = Math.max(0, this.eye[2]);
    pose.orbitDistance = orbitDistance;
    pose.reversedDepth = created.reversedDepth;
    applyClip(camera, rig.mode, pose, this.clipScratch);
    fogRange(rig.mode, orbitDistance, this.fog);
    kit.setFog(this.fog.near, this.fog.far);

    // A governor notch's resize, deferred while the camera moved (or overdue).
    if (this.pendingRatio !== null && (!moving || now - this.pendingRatioSince >= NOTCH_RESIZE_DEFER_MS)) {
      const ratio = this.pendingRatio;
      this.pendingRatio = null;
      // Two settle frames: this one's detail selection used the old buffer height.
      if (this.applySize(false, ratio)) this.loop?.markChanged();
    }

    // Draw, once stage 0 can.
    let drew = false;
    if (scheduler.stage0Ready()) {
      governor.beginGpu(continuous && this.ready);
      renderer.info.reset();
      renderer.render(scene.root, camera);
      governor.endGpu();
      drew = true;
    }
    const programs = renderer.info.programs?.length ?? this.programs;
    const compiled = programs !== this.programs;
    this.programs = programs;
    const cpuMs = this.loopHost.now() - t0;

    if (drew) {
      const stats = this.stats;
      stats.draws = renderer.info.render.calls;
      stats.tris = renderer.info.render.triangles;
      stats.programs = programs;
      stats.frameMs = cpuMs;
      stats.tier = this.tier;
      stats.pixelRatio = this.pixelRatio;
      stats.band = interiors?.getStatus().band ?? null;
      stats.gpuBytes = scheduler.usedBytes();
      if (!this.ready) this.firstFrame();
      else if (this.restoring) {
        this.restoring = false;
        this.emitter.emit({ type: 'restored' });
      }
      this.readouts?.offer(this.stats);
      this.statsOut?.offer(this.stats);
      // A frame still drawn at the old ratio while a notch's resize waits is
      // not judged: it would step the ladder twice for one overload.
      const excluded = uploaded || compiled || this.resized || this.pendingRatio !== null;
      this.resized = false;
      const change = this.ready ? governor.sample(time, continuous, cpuMs, excluded) : null;
      if (change) this.applyNotch(change, moving, now);
      // The calibration burst draws nothing for 8 frames: never under the visitor's hand.
      if (governor.wantsCalibration && !moving) this.recalibrate();
    }
    this.progress();

    activity.controls = moving;
    activity.tweens = rig.busy;
    activity.uploads = scheduler.uploadsPending(now);
    return activity;
  }

  private readonly distanceOut = new Float64Array(ESTATE_SITE_IDS.length);

  private distances(levels: LevelWiring): Float64Array {
    for (let i = 0; i < this.distanceOut.length; i += 1) this.distanceOut[i] = levels.inputs[i].distance;
    return this.distanceOut;
  }

  /**
   * The building downloads put first (P0) and lean mode details: the one the
   * camera is inside, else the selected or targeted one (fly-to, Enter), else
   * the one it is peeking at (§7.6 "current or targeted building").
   */
  private planFocus(): number {
    const interiors = this.interiors;
    if (interiors && interiors.insideIndex >= 0) return interiors.insideIndex;
    if (this.focusIndex >= 0) return this.focusIndex;
    return interiors?.currentIndex ?? -1;
  }

  private planFor(frozen: boolean) {
    const ctx = this.planContext;
    const focus = this.planFocus();
    ctx.focus = focus >= 0 ? ESTATE_SITE_IDS[focus] : null;
    ctx.mode = this.rig.mode;
    ctx.lean = this.lean;
    ctx.frozen = frozen || this.frozen;
    return ctx;
  }

  private firstFrame() {
    this.ready = true;
    const canvas = this.canvas;
    if (canvas) {
      const halted = this.options.motionHalted();
      canvas.style.transition = halted ? 'none' : `opacity ${FADE_MS}ms linear`;
      canvas.style.opacity = '1';
    }
    this.hooks.beforeReady();
    this.emitter.emit({ type: 'ready', tier: this.tier, msaa: this.msaa, programs: this.programs });
  }

  /**
   * A governor notch: the tier at once (detail selection, streaming, trees);
   * the pixel ratio at once only while the camera is at rest, else on the
   * first frame without motion (NOTCH_RESIZE_DEFER_MS at most), because the
   * buffer reallocation is the one long task a notch costs.
   */
  private applyNotch(change: GovernorChange, moving: boolean, now: number) {
    const { notch } = change;
    this.tier = notch.tier;
    this.streaming?.scheduler.setTier(notch.tier);
    if (shouldDropMsaa(this.msaa, notch.tier)) writeMsaaOff();
    const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
    const ratio = capPixelRatio(this.tier, this.cssWidth, this.cssHeight, dpr, notch.pixelRatio);
    if (ratio !== this.appliedRatio && moving) {
      if (this.pendingRatio === null) this.pendingRatioSince = now;
      this.pendingRatio = notch.pixelRatio;
    } else {
      this.pendingRatio = null;
      this.applySize(false, notch.pixelRatio);
    }
    this.scene?.invalidateTrees();
    this.loop?.markChanged();
  }

  /** Keeps one timeout armed for the earliest held level step (`due`, loop-host ms), replacing a later one. */
  private armHold(due: number, now: number) {
    if (!(due < Infinity)) return;
    if (this.holdTimer !== null && this.holdDue <= due) return;
    if (this.holdTimer !== null) this.timers.cancel(this.holdTimer);
    this.holdDue = due;
    // +1 ms: the hold reads `now − since < DWELL_MS`, so the frame must come strictly after.
    this.holdTimer = this.timers.after(Math.max(0, due - now) + 1, () => {
      this.holdTimer = null;
      this.holdDue = Infinity;
      if (!this.frozen) this.invalidate();
    });
  }

  private recalibrate() {
    if (this.calibrating || !this.loop || !this.governor) return;
    this.calibrating = true;
    const loop = this.loop;
    const governor = this.governor;
    queueMicrotask(() => {
      void loop.calibrate().then((intervals) => {
        this.calibrating = false;
        if (!this.isDisposed) governor.calibrate(intervals);
      });
    });
  }

  /**
   * Reads the host's size and applies it with the §7.7 pixel ratio under the
   * governor's ceiling. A host with no box (the window closed) keeps the last
   * size, and a size and ratio already applied reallocate nothing (assigning a
   * canvas its own width still clears and reallocates its buffer). Returns
   * whether the buffer changed.
   */
  private applySize(initial: boolean, ceiling?: number): boolean {
    const created = this.created;
    if (!created) return false;
    if (!initial) {
      const box = this.hostBox();
      if (box) {
        this.cssWidth = box.width;
        this.cssHeight = box.height;
      }
    }
    const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
    // While a notch's resize waits, the old ratio stands (the frame decides when).
    const limit = ceiling ?? (this.pendingRatio !== null ? this.appliedRatio : this.governor?.notch.pixelRatio) ?? Infinity;
    const ratio = initial
      ? capPixelRatio(this.tier, this.cssWidth, this.cssHeight, dpr)
      : capPixelRatio(this.tier, this.cssWidth, this.cssHeight, dpr, limit);
    if (!initial && ratio === this.appliedRatio && this.cssWidth === this.appliedWidth && this.cssHeight === this.appliedHeight) return false;
    this.pixelRatio = ratio;
    this.appliedRatio = ratio;
    this.appliedWidth = this.cssWidth;
    this.appliedHeight = this.cssHeight;
    created.renderer.setPixelRatio(ratio);
    created.renderer.setSize(this.cssWidth, this.cssHeight, false);
    this.camera.aspect = this.cssWidth / this.cssHeight;
    this.camera.updateProjectionMatrix();
    this.resized = true;
    this.updateDrawingBuffer();
    return true;
  }

  private updateDrawingBuffer() {
    const created = this.created;
    const scheduler = this.streaming?.scheduler;
    if (!created || !scheduler) return;
    const gl = created.gl;
    const samples = created.msaa ? (gl.getParameter(gl.SAMPLES) as number) : 0;
    scheduler.setDrawingBuffer(gl.drawingBufferWidth, gl.drawingBufferHeight, samples);
  }

  // ---- events -------------------------------------------------------------------------

  private emitStats(s: FrameStats) {
    const debug = this.options.debug === true && this.governor ? this.governor.debug : null;
    this.emitter.emit({
      type: 'stats',
      draws: s.draws,
      tris: s.tris,
      programs: s.programs,
      frameMs: s.frameMs,
      tier: s.tier,
      pixelRatio: s.pixelRatio,
      band: s.band,
      gpuBytes: s.gpuBytes,
      // The governor's figures exist once a window has closed (2 s of continuous frames).
      ...(debug && Number.isFinite(debug.droppedPct) ? { droppedPct: debug.droppedPct } : {}),
      ...(debug && Number.isFinite(debug.cpuP95Ms) ? { cpuP95Ms: debug.cpuP95Ms } : {}),
      ...(debug && Number.isFinite(debug.gpuP95Ms) ? { gpuP95Ms: debug.gpuP95Ms } : {}),
    });
  }

  /**
   * Progress at most 4× a second while downloads or compiles are pending, and
   * once with pending 0 when a burst ends; never the same report twice.
   */
  private progress() {
    const streaming = this.streaming;
    if (!streaming || this.isDisposed) return;
    const pending = streaming.pending + (this.compiling ? 1 : 0);
    if (pending > 0) this.progressBurst = true;
    else if (!this.progressBurst) return;
    const now = this.loopHost.now();
    if (pending > 0 && now - this.lastProgress < PROGRESS_INTERVAL_MS) {
      if (this.progressTimer === null) {
        this.progressTimer = this.timers.after(PROGRESS_INTERVAL_MS - (now - this.lastProgress), () => {
          this.progressTimer = null;
          this.progress();
        });
      }
      return;
    }
    if (pending === 0) this.progressBurst = false;
    const firstFrame = !this.ready;
    const loadedBytes = firstFrame ? streaming.stage0Received : streaming.receivedBytes;
    const totalBytes = firstFrame ? streaming.stage0Bytes : Math.max(streaming.startedBytes, streaming.receivedBytes);
    const label = pending === 0 ? null : this.compiling ? 'COMPILING' : streaming.lastLabel;
    const stage = firstFrame ? 'first-frame' : 'streaming';
    const key = `${stage}|${loadedBytes}|${totalBytes}|${pending}|${label}`;
    if (key === this.lastProgressKey) return;
    this.lastProgressKey = key;
    this.lastProgress = now;
    this.emitter.emit({ type: 'progress', stage, loadedBytes, totalBytes, pending, label });
  }
  private lastProgressKey = '';

  // ---- context loss (§7.10) -------------------------------------------------------------

  private onLost() {
    if (this.isDisposed) return;
    this.lost = true;
    this.loop?.stop();
    this.governor?.rest();
    this.emitter.emit({ type: 'lost', frozen: this.frozen });
  }

  private onRestored() {
    if (this.isDisposed) return;
    this.lost = false;
    const streaming = this.streaming;
    if (streaming && this.scene) {
      streaming.scheduler.resetGpu();
      this.scene.markAllNotUploaded([...streaming.decoded.values()].map((file) => file.parts));
    }
    this.levels?.reset();
    this.interiors?.reset();
    this.gpuTimer?.reset();
    this.programs = 0;
    this.restoring = this.ready;
    if (!this.frozen && this.phase === 'live') this.loop?.start();
  }

  // ---- lifecycle ---------------------------------------------------------------------------

  freeze(): void {
    if (this.isDisposed || this.frozen) return;
    this.frozen = true;
    this.loop?.stop();
    if (this.holdTimer !== null) this.timers.cancel(this.holdTimer);
    this.holdTimer = null;
    this.holdDue = Infinity;
    this.governor?.rest();
    if (this.wasMoving) {
      this.wasMoving = false;
      this.hooks.moving(false);
    }
    // P2 and lower stop; P0 and P1 finish (§7.10).
    this.streaming?.pump(this.levels?.views ?? null, this.planFor(true));
  }

  resume(): void {
    if (this.isDisposed || !this.frozen) return;
    this.frozen = false;
    if (this.phase === 'live' && !this.lost) {
      // The window may have changed size while closed: read it now, so the
      // first frame back is drawn at the right size, not 150 ms later.
      this.loop?.cancelResize();
      if (this.applySize(false)) this.loop?.markChanged();
      this.loop?.start();
    }
  }


  invalidate(): void {
    if (this.isDisposed) return;
    this.loop?.invalidate();
  }

  setRig(rig: CameraRig): void {
    if (rig === this.rig) return;
    if (this.rig !== this.staticRig) this.rig.dispose();
    this.rig = rig;
    this.invalidate();
  }

  get currentRig(): CameraRig { return this.rig; }

  /** The selected or targeted building: P0 downloads and lean mode's one detailed building. */
  setFocus(site: EstateSiteId | null): void {
    const index = site === null ? -1 : ESTATE_SITE_IDS.indexOf(site);
    if (index === this.focusIndex) return;
    this.focusIndex = index;
    this.invalidate();
    if (this.frozen) this.wake();
  }

  setLean(lean: boolean): void {
    if (lean === this.lean) return;
    this.lean = lean;
    this.invalidate();
  }

  /** The poster camera (home in Overview). */
  posterPose(): ThreePose | null {
    return this.pack ? posterPose(this.pack.views.aerialNE, this.cssWidth / Math.max(1, this.cssHeight)) : null;
  }

  /** Camera position and target, estate frame. */
  cameraEstate(): { position: Vec3; target: Vec3 } {
    const target = this.rig.getTarget(new Vector3());
    return { position: threeToEstate(this.camera.position.toArray()), target: threeToEstate(target.toArray()) };
  }

  private unavailable(reason: UnavailableReason) {
    if (this.isDisposed) return;
    this.phase = 'failed';
    this.emitter.emit({ type: 'unavailable', reason });
  }

  private stale(url: string) {
    if (this.isDisposed) return;
    this.phase = 'failed';
    this.loop?.stop();
    this.emitter.emit({ type: 'stale', url });
  }

  private fail(error: unknown) {
    if (this.isDisposed || this.phase === 'failed') return;
    this.phase = 'failed';
    this.loop?.stop();
    this.activity.controls = false;
    this.activity.keys = false;
    this.activity.tweens = false;
    this.activity.uploads = false;
    this.emitter.emit({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }

  /** §7.10's ordered teardown; silent from its first step. */
  dispose(): void {
    if (this.isDisposed) return;
    this.phase = 'disposed';
    const created = this.created;
    runTeardown({
      close: () => {
        this.emitter.close();
        this.loop?.dispose();
        this.readouts?.stop();
        this.statsOut?.stop();
        this.resizeObserver?.disconnect();
      },
      detachContextListeners: () => this.watch?.detach(),
      clearTimers: () => {
        this.timers.clear();
        this.progressTimer = null;
      },
      // Geometries, materials, the palette texture and the timer queries are
      // not deleted one by one: the forced loss below frees every GL object of
      // the context at once, and after a restore three's pre-loss managers are
      // still listening on them, so a per-object dispose would delete objects
      // of the dead context (console warnings, nothing freed).
      disposeRenderer: created ? () => {
        this.uploader?.dispose();
        created.renderer.dispose();
      } : undefined,
      loseContext: created ? () => created.renderer.forceContextLoss() : undefined,
      removeCanvas: () => {
        this.canvas?.remove();
        clearReadouts(this.options.host);
      },
      releaseWorkers: () => {
        this.releaseDecoder?.();
        this.releaseDecoder = null;
      },
      abortDownloads: () => {
        this.packAbort?.abort();
        this.streaming?.close();
      },
    });
    if (this.rig !== this.staticRig) this.rig.dispose();
  }
}

const idle = (): Promise<void> => new Promise((resolve) => {
  const scope = globalThis as { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number };
  if (typeof scope.requestIdleCallback === 'function') scope.requestIdleCallback(() => resolve(), { timeout: 100 });
  else setTimeout(resolve, 0);
});

// For node (tests): a loop host without window. Frames never run there.
const nodeLoopHost = (): LoopHost => ({
  requestAnimationFrame: (callback) => setTimeout(() => callback(Date.now()), 16) as unknown as number,
  cancelAnimationFrame: (handle) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>),
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
});
