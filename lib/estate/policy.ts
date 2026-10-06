import budgets from './packBudgets.json';

// The Estate window's load policy (plan §9.3): one pure function from what the
// shell can observe to the phase the window should be in, plus the consent
// button's label. No timers and no memory: the shell keeps the clocks
// (closedMs, lostMs) and the loss record, and re-resolves whenever an input
// changes or a deadline below passes. Pure, so the whole table is node-tested.
//
// What each phase asks of the shell:
//  - poster       nothing downloads: prerender, never opened, closed with nothing
//                 loaded, or open before the policy resolves (so a deep link never
//                 flashes consent and then auto-loads);
//  - consent      poster plus the Load button: open, resolved, heavy assets not
//                 allowed, not asked yet;
//  - loading      the engine chunk and the first frame download. `autoLoad` says
//                 the start waits for an idle callback; `startEngine` says a
//                 resolved module may get its renderer now. Closed meanwhile, the
//                 downloads in flight finish and no renderer is made;
//  - live         renders on change; holds the GPU claim while focused;
//  - frozen       loaded but closed, hidden or off screen: no frames, GPU memory kept;
//  - released     ordered dispose (§7.10). Transient: once disposed the shell
//                 reports engine 'none', and the window reads poster until reopened;
//  - lost         live context loss, awaiting restore (engine kept; Retry offered);
//  - unavailable  no WebGL2 or DecompressionStream, two live resets in a minute,
//                 or no restore within 5 s;
//  - error        the engine or first frame failed to download (Retry);
//  - stale        a hashed file 404'd after a re-pack (Reload; no retry).
// unavailable, error and stale show the poster, so the shell disposes the engine
// and latches the engine state; a verdict reached here from resets or a missed
// restore must be latched as engine 'unavailable', or the count aging out of its
// window would hand the window back.
//
// Once the engine is loading or loaded the heavy-asset policy no longer gates
// it: like a backdrop's lease (desktopBackgroundPolicy.ts), a policy flip after
// the fact freezes nothing and tears nothing down.
//
// `halted` (motionHalted()) never changes the result. The Estate draws only when
// the visitor drives it, and halted motion turns its flights into cuts inside
// the engine (§8.1); freezing it would break e2e case 12, which flies to Blk 509
// with all motion paused. It is an input so the table is total, and a test pins
// that it is inert.

export const ESTATE_PHASES = [
  'poster', 'consent', 'loading', 'live', 'frozen', 'released', 'lost', 'unavailable', 'error', 'stale',
] as const;
export type EstatePhase = (typeof ESTATE_PHASES)[number];

/**
 * What the shell knows of the engine. 'loading': loadEngine() is in flight, or
 * its module is in and the engine is still warming up. 'ready': an engine
 * instance exists and has drawn. 'unavailable': its capability check failed
 * (context resets are counted here, through `liveResets` and `lostMs`).
 */
export const ESTATE_ENGINE_STATES = ['none', 'loading', 'ready', 'failed', 'unavailable', 'stale'] as const;
export type EstateEngineState = (typeof ESTATE_ENGINE_STATES)[number];

/** lib/experienceMode's ExperiencePolicy['reason'], restated because lib/estate imports nothing outside itself. A test pins the two. */
export type EstateHoldReason = 'query' | 'save-data' | 'reduced-motion' | 'default';

/** Closed this long, a loaded window is released, ms. */
export const RELEASE_AFTER_MS = 30_000;
/** A live loss not restored this long makes the window unavailable, ms. */
export const RESTORE_TIMEOUT_MS = 5_000;
/** Live resets are counted over this window, ms. */
export const RESET_WINDOW_MS = 60_000;
/** This many live resets inside RESET_WINDOW_MS make the window unavailable. */
export const MAX_LIVE_RESETS = 2;
/** An automatic start waits for requestIdleCallback with this timeout, ms (after readyState 'complete'). */
export const AUTO_LOAD_IDLE_TIMEOUT_MS = 500;

export interface EstatePolicyInput {
  /** The world-3d window is open on the desk. */
  open: boolean;
  /** It is the focused window. Only the GPU claim reads this. */
  focused: boolean;
  /** The stage intersects the viewport. */
  onscreen: boolean;
  /** document.hidden. */
  hidden: boolean;
  /** motionHalted(). Inert: see the header. */
  halted: boolean;
  allowHeavyAssets: boolean;
  /** The client has resolved the experience policy: `ctx?.resolved === true`, never `capabilities !== null` (V9). */
  policyResolved: boolean;
  /** The device's Save-Data capability. */
  saveData: boolean;
  /** The visitor pressed Load. An explicit request needs no resolved policy. */
  userRequested: boolean;
  engine: EstateEngineState;
  /** The engine's context is lost and not yet restored. Read only while the engine is 'ready'. */
  contextLost: boolean;
  /** …and it was lost while frozen: not counted; seen again unrestored, it is released and loaded afresh. */
  lostWhileFrozen: boolean;
  /** How long the window has been closed, ms. Ignored while open; NaN counts as just closed. */
  closedMs: number;
  /** The window body is mounted. False after unmount, which includes the phone layout. */
  mounted: boolean;
  /** document.readyState === 'complete'. Only an automatic start waits for it. */
  docReady: boolean;
  /**
   * The policy's `reason`: the consent line's wording, and whether the load is
   * lean (only a Save-Data hold is). Omitted, Save-Data is the only hold that
   * can be named, and the Save-Data capability decides lean alone.
   */
  policyReason?: EstateHoldReason;
  /** The visitor pressed the HUD's "Load full detail": lean mode ends. */
  fullDetail?: boolean;
  /** DESK closed every window (and this one has not reopened since): release without waiting. */
  closedByDesk?: boolean;
  /** Live losses inside RESET_WINDOW_MS, including a current one: liveResetCount(). */
  liveResets?: number;
  /** How long the current live loss has gone unrestored, ms. */
  lostMs?: number;
}

/** The side panel's button: consent's Load (labelled by consentLabel), Retry, or Reload. */
export type EstateAction = 'load' | 'retry' | 'reload';

export interface EstatePhaseResult {
  phase: EstatePhase;
  /** Lean streaming (§7.4): consent came from Save-Data, until "Load full detail". */
  lean: boolean;
  /** Why the window is not live, for the side panel; only on consent, lost, unavailable, error and stale. */
  reason?: string;
  /** Start loading without a click, after an idle callback. Only with phase 'loading' and engine 'none'. */
  autoLoad: boolean;
  /** A resolved engine module may be started (fresh canvas, renderer, warm-up) now. Phase 'loading' and open. */
  startEngine: boolean;
  /** Hold claimGpu('estate') (§7.10): live and focused. The shell also drops it while a .panel-backdrop exists. */
  claimGpu: boolean;
  action?: EstateAction;
}

export const ESTATE_REASONS = {
  /** Plan §7.6, verbatim. */
  stale: 'The site was updated. Reload to continue.',
  unsupported: 'This browser cannot draw the 3D estate.',
  resets: 'The graphics card reset the 3D view twice in a minute.',
  noRestore: 'The graphics card did not bring the 3D view back.',
  lost: 'The graphics card reset the 3D view.',
  error: 'The 3D estate did not finish downloading.',
} as const;

/**
 * The consent line, worded exactly as describeBackdropHold words the FX panel's
 * hold, so one device reads the same reason in both places. A test pins the
 * parity. Without a policy reason Save-Data is still nameable; anything else
 * gets no line rather than a guessed one.
 */
export const describeEstateHold = (reason: EstateHoldReason | undefined, saveData: boolean): string | undefined => {
  switch (reason) {
    case 'query': return 'held: this page was opened with ?mode=scan';
    case 'save-data': return 'held: Data Saver is on';
    case 'reduced-motion': return 'held: your system asks for reduced motion';
    default: return saveData ? 'held: Data Saver is on' : undefined;
  }
};

// unavailable offers Reload, as §7.10 has it: a missing capability or a GPU that
// reset twice in a minute will not come back on Retry. (§9.3's row says Retry;
// the plan disagrees with itself there, and §7.10 is the more specific.)
const ACTION: Partial<Record<EstatePhase, EstateAction>> = {
  consent: 'load', lost: 'retry', error: 'retry', unavailable: 'reload', stale: 'reload',
};

const result = (phase: EstatePhase, lean: boolean, reason?: string, flags?: Partial<Pick<EstatePhaseResult, 'autoLoad' | 'startEngine' | 'claimGpu'>>): EstatePhaseResult => {
  const out: EstatePhaseResult = {
    phase,
    lean,
    autoLoad: flags?.autoLoad === true,
    startEngine: flags?.startEngine === true,
    claimGpu: flags?.claimGpu === true,
  };
  if (reason !== undefined) out.reason = reason;
  const action = ACTION[phase];
  if (action) out.action = action;
  return out;
};

/** The §9.3 table. Total over its inputs; never throws. */
export const resolveEstatePhase = (input: EstatePolicyInput): EstatePhaseResult => {
  // Lean only when consent came from Save-Data (§9.3), as the policy's reason
  // says when the shell passes it: ?mode=scan on a Data Saver device is the
  // scan hold, worded and labelled as one (full overview bytes). Without a
  // reason the capability decides. A page allowed heavy assets (no consent, or
  // ?mode=guided overriding Data Saver) loads in full.
  const fromSaveData = input.policyReason !== undefined ? input.policyReason === 'save-data' : input.saveData;
  const lean = fromSaveData && !input.allowHeavyAssets && input.fullDetail !== true;
  const { engine } = input;

  // Unmounted: whatever was started is discarded, a pending module included
  // (it resolves into nothing and is never started).
  if (!input.mounted) return result(engine === 'none' ? 'poster' : 'released', lean);

  switch (engine) {
    case 'stale': return result('stale', lean, ESTATE_REASONS.stale);
    case 'unavailable': return result('unavailable', lean, ESTATE_REASONS.unsupported);
    case 'failed': return result('error', lean, ESTATE_REASONS.error);
    // Closed during loading keeps its downloads; only the renderer waits.
    case 'loading': return result('loading', lean, undefined, { startEngine: input.open });
    case 'none': {
      if (!input.open) return result('poster', lean);
      if (input.userRequested) return result('loading', lean, undefined, { startEngine: true });
      if (!input.policyResolved) return result('poster', lean);
      if (input.allowHeavyAssets) {
        return input.docReady ? result('loading', lean, undefined, { autoLoad: true, startEngine: true }) : result('poster', lean);
      }
      return result('consent', lean, describeEstateHold(input.policyReason, input.saveData));
    }
    case 'ready': {
      if ((input.liveResets ?? 0) >= MAX_LIVE_RESETS) return result('unavailable', lean, ESTATE_REASONS.resets);
      const liveLoss = input.contextLost && !input.lostWhileFrozen;
      if (liveLoss && (input.lostMs ?? 0) >= RESTORE_TIMEOUT_MS) return result('unavailable', lean, ESTATE_REASONS.noRestore);
      if (input.open && input.onscreen && !input.hidden) {
        // A loss taken while frozen and not restored by the time the window is
        // seen again cannot draw: a browser that dropped a background context,
        // or WEBGL_lose_context, may never send the restore. The instance is
        // released (pose kept) and loaded afresh from the HTTP cache, unseen
        // (§7.10's "re-creates silently on reopen"), never shown live on a dead canvas.
        if (input.contextLost && input.lostWhileFrozen) return result('released', lean);
        return liveLoss ? result('lost', lean, ESTATE_REASONS.lost) : result('live', lean, undefined, { claimGpu: input.focused });
      }
      if (!input.open && (input.closedByDesk === true || input.closedMs >= RELEASE_AFTER_MS)) return result('released', lean);
      return result('frozen', lean);
    }
  }
};

// ---- context-loss record ----------------------------------------------------------

/**
 * The shell's loss record after a loss at nowMs: earlier times still inside the
 * reset window, plus this one unless it happened while frozen. A frozen loss is
 * not counted (§7.10): browsers drop background contexts freely, and an
 * instance seen again unrestored is released and loaded afresh
 * (resolveEstatePhase). Rare, so it returns a fresh array.
 */
export const noteContextLoss = (lossTimesMs: readonly number[], nowMs: number, frozen: boolean): number[] => {
  const kept = lossTimesMs.filter((t) => t <= nowMs && nowMs - t <= RESET_WINDOW_MS);
  if (!frozen) kept.push(nowMs);
  return kept;
};

/** Losses at or before nowMs and no more than RESET_WINDOW_MS earlier: the `liveResets` input. */
export const liveResetCount = (lossTimesMs: readonly number[], nowMs: number): number => {
  let n = 0;
  for (const t of lossTimesMs) if (t <= nowMs && nowMs - t <= RESET_WINDOW_MS) n += 1;
  return n;
};

// ---- consent label ------------------------------------------------------------------

/** The engine chunk's gzip cap (packBudgets.json engineGzip). The label counts the cap, not a measurement, so it stays an upper bound. */
export const ENGINE_GZIP_CAP: number = budgets.engineGzip;
if (!Number.isInteger(ENGINE_GZIP_CAP) || ENGINE_GZIP_CAP <= 0) {
  throw new Error(`packBudgets.json engineGzip: expected a positive integer, got ${String(ENGINE_GZIP_CAP)}`);
}

/** Catalogue byte counts a load is labelled from; bytes as they travel (gzip), decimal. */
export interface EstateLoadBytes {
  /** pack.json (gzipped) plus every stage-0 file: the pack's totals.stage0Bytes, not byClass.s0, which leaves pack.json out. */
  stage0: number;
  /** ΣF, every building's façade file: totals.byClass.f. */
  f: number;
}

export type EstateLoadMode = 'full' | 'lean';

const checkBytes = (value: number, what: string): number => {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`estate load bytes: ${what} must be a finite, non-negative byte count, got ${String(value)}`);
  return value;
};

/**
 * What one click on Load can download (§6.5): engine cap + stage 0, plus ΣF for
 * a full load. Lean loads massing only, then about 0.3 MB per building entered,
 * which Enter labels on its own. The poster is already on screen and not counted.
 */
export const consentBytes = (bytes: EstateLoadBytes, mode: EstateLoadMode): number =>
  ENGINE_GZIP_CAP + checkBytes(bytes.stage0, 'stage0') + (mode === 'full' ? checkBytes(bytes.f, 'f') : 0);

/**
 * Decimal megabytes to one place, rounded UP: a label may overstate by under
 * 0.1 MB and never understates (1,900,000 B → '1.9 MB', 1,900,001 B → '2.0 MB').
 * Integer tenths, so no float formatting can round down. Throws on a negative or
 * non-finite count: a made-up label is worse than a failed build.
 */
export const formatMegabytes = (bytes: number): string => {
  const tenths = Math.ceil(checkBytes(bytes, 'bytes') / 100_000);
  return `${Math.floor(tenths / 10)}.${tenths % 10} MB`;
};

/** The consent button: 'Load the 3D estate · 2.1 MB'. */
export const consentLabel = (bytes: EstateLoadBytes, mode: EstateLoadMode): string =>
  `Load the 3D estate · ${formatMegabytes(consentBytes(bytes, mode))}`;

/** The lean HUD's way out (§7.4): 'Load full detail · +1.7 MB', ΣF as an upper bound on what is still to come. */
export const fullDetailLabel = (bytes: EstateLoadBytes): string => `Load full detail · +${formatMegabytes(checkBytes(bytes.f, 'f'))}`;

/** The files Enter fetches for one building: a pack site (schema.ts PackBuilding) fits as is. */
export interface EstateEnterFiles {
  name: string;
  facade?: { bytes: number };
  detail?: { bytes: number };
  interior?: { bytes: number };
  walk?: { bytes: number };
  nav?: { bytes: number };
}

/**
 * What entering one building can download (§6.5): its F, D, interior, walk and
 * nav bytes as they travel. F is counted even though an overview session may
 * already hold it, so the label stays an upper bound. A class the pack did not
 * ship counts 0.
 */
export const enterBytes = (building: EstateEnterFiles): number => {
  let total = 0;
  for (const file of [building.facade, building.detail, building.interior, building.walk, building.nav]) {
    if (file !== undefined) total += checkBytes(file.bytes, `${building.name} file`);
  }
  return total;
};

/** The registry's and HUD's Enter button: 'Enter Blk 509 · 0.3 MB'. */
export const enterLabel = (building: EstateEnterFiles): string => `Enter ${building.name} · ${formatMegabytes(enterBytes(building))}`;
