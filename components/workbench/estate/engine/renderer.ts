import { WebGLRenderer, type WebGLRendererParameters } from 'three';
import { startingTier } from '../../../../lib/estate/governorCore';
import { capPixelRatio, msaaAtStart, tierRank, type EstateTier } from '../../../../lib/estate/tiers';
import type { EstateUnavailableEvent } from '../engineApi';

// The renderer and its context (plan §7.7, §7.9, §7.10). three r186's
// WebGLRenderer, never WebGPU. The decisions are pure functions so the node
// tests pin them; the rest touches a canvas.
//
// The starting tier needs the GPU's name, but MSAA has to be chosen before the
// context exists (it is a context attribute, and the governor never toggles
// it). So the name is read once per page from a throwaway probe context, which
// is lost again at once; an engine created with a tier override (the shell's
// ?estate-quality=) skips the probe. The tier lives here, not in
// lib/experienceMode.ts, whose test forbids GPU probes there.

export type UnavailableReason = EstateUnavailableEvent['reason'];

/** No WebGL2 or no DecompressionStream: nothing the engine could draw or read. */
export const missingCapability = (scope: {
  WebGL2RenderingContext?: unknown;
  DecompressionStream?: unknown;
} = globalThis as never): UnavailableReason | null => {
  if (typeof scope.WebGL2RenderingContext === 'undefined') return 'no-webgl2';
  if (typeof scope.DecompressionStream === 'undefined') return 'no-decompression-stream';
  return null;
};

// What gl.RENDERER says when the browser masks it: Chrome's "WebKit WebGL",
// Firefox's resistFingerprinting "Mozilla", and an empty string.
const MASKED = /^(?:webkit webgl|mozilla|)$/i;

/**
 * The renderer string for startingTier. gl.RENDERER first: Firefox already
 * reports its sanitised name there and logs a deprecation warning for the
 * debug extension, which the e2e would collect. Only a masked name falls back
 * to WEBGL_debug_renderer_info (Chrome, Safari).
 */
export const readRendererString = (gl: Pick<WebGL2RenderingContext, 'getParameter' | 'getExtension' | 'RENDERER'>): string | null => {
  try {
    const plain = gl.getParameter(gl.RENDERER);
    if (typeof plain === 'string' && !MASKED.test(plain.trim())) return plain;
    const ext = gl.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL: number } | null;
    if (ext) {
      const unmasked = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
      if (typeof unmasked === 'string' && unmasked.trim()) return unmasked;
    }
    return typeof plain === 'string' && plain.trim() ? plain : null;
  } catch {
    return null;
  }
};

/** What a probe (or the real context) found out about this page's GPU. */
export interface GpuIdentity {
  renderer: string | null;
  /** The context needed failIfMajorPerformanceCaveat: false (software, blocklisted): tier min. */
  caveat: boolean;
}

/** sessionStorage key the governor writes when it reaches `low` with MSAA on (§7.7). */
export const MSAA_OFF_KEY = 'estate:msaa';

export interface StartChoice {
  tier: EstateTier;
  pixelRatio: number;
  msaa: boolean;
}

/**
 * The starting tier, pixel ratio and MSAA (§7.7, §7.9). An override wins
 * outright. A context that only came up without failIfMajorPerformanceCaveat
 * starts at min. MSAA is on only from mid or better at ≤ 2.0 Mpx, and never
 * when a previous engine on this tab gave it up (`msaaOff`).
 */
export const chooseStart = (input: {
  identity: GpuIdentity;
  deviceMemory?: number | null;
  override?: EstateTier | null;
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
  msaaOff: boolean;
}): StartChoice => {
  const tier: EstateTier = input.override
    ?? (input.identity.caveat ? 'min' : startingTier(input.identity.renderer, input.deviceMemory ?? null));
  const pixelRatio = capPixelRatio(tier, input.cssWidth, input.cssHeight, input.devicePixelRatio);
  const pixels = Math.floor(input.cssWidth * pixelRatio) * Math.floor(input.cssHeight * pixelRatio);
  const msaa = !input.msaaOff && msaaAtStart(tier, pixels);
  return { tier, pixelRatio, msaa };
};

/** True once the governor has walked down to `low` or below with MSAA on: the next engine starts without it. */
export const shouldDropMsaa = (msaa: boolean, tier: EstateTier): boolean => msaa && tierRank(tier) >= tierRank('low');

/** sessionStorage, read and written in try/catch: it throws in some private modes and sandboxes. */
export const readMsaaOff = (): boolean => {
  try {
    return globalThis.sessionStorage?.getItem(MSAA_OFF_KEY) === 'off';
  } catch {
    return false;
  }
};

export const writeMsaaOff = (): void => {
  try {
    globalThis.sessionStorage?.setItem(MSAA_OFF_KEY, 'off');
  } catch {
    /* storage unavailable: the next engine simply decides again */
  }
};

// ---- the context ------------------------------------------------------------------------

/** The attributes of every Estate context (§7.10). */
export const contextAttributes = (antialias: boolean, failIfMajorPerformanceCaveat: boolean): WebGLContextAttributes => ({
  alpha: false,
  antialias,
  depth: true,
  stencil: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  powerPreference: 'default',
  failIfMajorPerformanceCaveat,
});

const getWebgl2 = (canvas: HTMLCanvasElement, attributes: WebGLContextAttributes): WebGL2RenderingContext | null => {
  try {
    return canvas.getContext('webgl2', attributes) as WebGL2RenderingContext | null;
  } catch {
    return null;
  }
};

const loseNow = (gl: WebGL2RenderingContext) => {
  try {
    (gl.getExtension('WEBGL_lose_context') as { loseContext(): void } | null)?.loseContext();
  } catch {
    /* already lost */
  }
};

// One probe per page: the GPU does not change under a tab (a window moved to
// another adapter re-creates contexts, and then the page's next engine reads a
// stale name, which costs at most one notch the governor corrects).
let probed: GpuIdentity | null = null;

/** Test seam: forget the cached probe. */
export const resetGpuProbe = (): void => { probed = null; };

/**
 * The GPU's name from a throwaway context: first with
 * failIfMajorPerformanceCaveat (so a software or blocklisted GPU says so),
 * then without. null when neither comes up: no usable WebGL2 at all.
 */
export const probeGpu = (createCanvas: () => HTMLCanvasElement): GpuIdentity | null => {
  if (probed) return probed;
  for (const caveat of [false, true]) {
    const canvas = createCanvas();
    canvas.width = 1;
    canvas.height = 1;
    const gl = getWebgl2(canvas, contextAttributes(false, !caveat));
    if (!gl) continue;
    probed = { renderer: readRendererString(gl), caveat };
    loseNow(gl);
    return probed;
  }
  return null;
};

/** The fields of a three render item the opaque sort reads. */
export interface SortItem {
  groupOrder: number;
  renderOrder: number;
  z: number;
  id: number;
  materialVariant: number;
  material: { id: number };
}

/**
 * The opaque draw order: nearest first. three's default sorts by material
 * before depth (WebGLRenderLists painterSortStable), and every building owns
 * its own materials, so the opaque list came out in building order: the room
 * underfoot drew last, after every façade it hides, and early depth testing
 * rejected nothing. Depth before material keeps three's own order among draws
 * that share a material (z, then id) and puts the nearest surfaces first
 * whatever their building. z is the sort depth three already negates under a
 * reversed depth buffer, so ascending is nearest first either way. Depth
 * testing is order-independent but for exactly equal depths, which the pack
 * keeps apart (no façade panel within 2 mm of a detail face); the edge lines
 * and the ground grid keep their places by renderOrder (materials.ts DRAW_ORDER).
 */
export const nearestFirst = (a: SortItem, b: SortItem): number =>
  a.groupOrder - b.groupOrder
  || a.renderOrder - b.renderOrder
  || a.z - b.z
  || a.material.id - b.material.id
  || a.materialVariant - b.materialVariant
  || a.id - b.id;

/** The renderer settings every estate renderer shares. */
export const configureRenderer = (renderer: Pick<WebGLRenderer, 'autoClear' | 'sortObjects' | 'info' | 'setOpaqueSort'>): void => {
  renderer.autoClear = true;
  renderer.sortObjects = true;
  renderer.info.autoReset = false;
  renderer.setOpaqueSort(nearestFirst);
};

export interface CreatedRenderer {
  renderer: WebGLRenderer;
  gl: WebGL2RenderingContext;
  /** The context came up only without failIfMajorPerformanceCaveat. */
  caveat: boolean;
  msaa: boolean;
  /** EXT_clip_control: a reversed-Z depth buffer (§7.2). */
  reversedDepth: boolean;
}

/**
 * The real context on the engine's own canvas, then the renderer around it.
 * First with failIfMajorPerformanceCaveat, then without (the caller drops to
 * tier min). null when no context comes up.
 */
export const createRenderer = (canvas: HTMLCanvasElement, msaa: boolean, preferCaveat: boolean): CreatedRenderer | null => {
  for (const caveat of preferCaveat ? [true] : [false, true]) {
    const gl = getWebgl2(canvas, contextAttributes(msaa, !caveat));
    if (!gl) continue;
    const reversedDepth = gl.getExtension('EXT_clip_control') !== null;
    // reversedDepthBuffer is a constructor parameter three r186 reads but its
    // published types do not list yet.
    const parameters = {
      canvas,
      context: gl as unknown as WebGLRenderingContext,
      alpha: false,
      antialias: msaa,
      depth: true,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'default',
      reversedDepthBuffer: reversedDepth,
    } as WebGLRendererParameters;
    const renderer = new WebGLRenderer(parameters);
    configureRenderer(renderer);
    return { renderer, gl, caveat, msaa, reversedDepth };
  }
  return null;
};

// ---- GPU timing (EXT_disjoint_timer_query_webgl2, mostly Chrome) ---------------------------

interface TimerExt { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

const RING = 4;

/**
 * A small ring of TIME_ELAPSED queries around the scene draw. Results arrive a
 * few frames late; poll() returns the oldest finished one (ms), or NaN.
 * Disjoint results (a GPU clock change) are dropped. Only begun while frames
 * run continuously, as the governor samples only those.
 */
export class GpuTimer {
  private readonly gl: WebGL2RenderingContext;
  private ext: TimerExt | null;
  private readonly queries: Array<WebGLQuery | null> = [];
  private readonly busy: boolean[] = [];
  private head = 0;
  private active: number = -1;

  static create(gl: WebGL2RenderingContext): GpuTimer | null {
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
    return ext ? new GpuTimer(gl, ext) : null;
  }

  private constructor(gl: WebGL2RenderingContext, ext: TimerExt) {
    this.gl = gl;
    this.ext = ext;
    for (let i = 0; i < RING; i += 1) {
      this.queries.push(gl.createQuery());
      this.busy.push(false);
    }
  }

  begin(): void {
    if (this.active >= 0 || !this.ext) return;
    const slot = this.head;
    const query = this.queries[slot];
    if (this.busy[slot] || !query) return; // all in flight: skip this frame
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query);
    this.active = slot;
  }

  end(): void {
    if (this.active < 0 || !this.ext) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.busy[this.active] = true;
    this.head = (this.active + 1) % RING;
    this.active = -1;
  }

  poll(): number {
    const gl = this.gl;
    if (!this.ext) return Number.NaN;
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT) === true;
    let result = Number.NaN;
    for (let k = 1; k <= RING; k += 1) {
      const slot = (this.head + k) % RING;
      const query = this.queries[slot];
      if (!this.busy[slot] || !query) continue;
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) continue;
      const ns = gl.getQueryParameter(query, gl.QUERY_RESULT) as number;
      this.busy[slot] = false;
      if (!disjoint && Number.isNaN(result)) result = ns / 1e6;
    }
    return result;
  }

  /**
   * After a context restore the old queries are gone and the extension must be
   * enabled again on the restored context (or every call is an INVALID_ENUM).
   */
  reset(): void {
    this.active = -1;
    this.ext = this.gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
    for (let i = 0; i < RING; i += 1) {
      this.queries[i] = this.gl.createQuery();
      this.busy[i] = false;
    }
  }
}
