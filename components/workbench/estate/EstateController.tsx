import React from 'react';
import { useOptionalExperienceMode } from '../../../contexts/ExperienceModeContext';
import { dispatchWorkbenchOpen } from '../../../lib/workbench';
import { track } from '../../../lib/analytics';
import { motionHalted } from '../../../lib/motion';
import { claimGpu, releaseGpu } from '../../../lib/gpuClaim';
import { ESTATE_CATALOGUE } from '../../../lib/estate/catalogue.generated';
import type { EstateSiteId } from '../../../lib/estate/ids';
import { siteShortName } from '../../../lib/estate/announce';
import { ESTATE_FOCUS_EVENT, validateEstateFocus, type EstateFocusDetail } from '../../../lib/estate/events';
import { decideEscape, type KeyTargetKind } from '../../../lib/estate/input';
import {
  AUTO_LOAD_IDLE_TIMEOUT_MS,
  RELEASE_AFTER_MS,
  RESTORE_TIMEOUT_MS,
  consentLabel,
  enterLabel,
  fullDetailLabel,
  liveResetCount,
  noteContextLoss,
  resolveEstatePhase,
  type EstateEngineState,
  type EstatePhase,
} from '../../../lib/estate/policy';
import type { EstateEngine, EstateEngineEvent, EstateResume, EstateRuntime } from './engineApi';
import { EstateLoadError, loadEngine } from './loadEngine';
import { ESTATE_SECTION, ESTATE_STAGE, usePanePresence } from './usePanePresence';
import { benchFromSearch, debugFromSearch, onDocumentComplete, qualityFromSearch, readTokenColours, releaseMsFromSearch, reloadPage, whenIdle } from './shellDom';
import type { EstateControllerProps, EstateModel, EstateModelAction, EstateModelHandlers, EstateModelRowAction } from './estateModel';

// The Estate window's controller (WIN-07, #world): a lazy chunk the window
// imports when it first opens (estateModel.ts says why the view and this are
// split). It renders nothing; it decides what the view shows and reports it
// through onModel. The 3D engine and its HUD are a further lazy chunk
// (estate/engine/**, estate/live/**) reached only through loadEngine(), and this
// file knows them only through engineApi.ts's types.
//
//  - the phase is lib/estate/policy.ts resolveEstatePhase(), recomputed every
//    render from what has been observed (usePanePresence, the experience
//    policy, the engine's events); the effects below carry out what it says;
//  - an automatic load waits for readyState 'complete' and then idle, and for
//    the window to have been in front once (the boot layout opens it behind
//    Home); a deep link never shows consent before the policy has resolved;
//  - the engine's host is found by DOM scan ('[data-estate-stage]'), never a
//    ref, and every instance gets a fresh token; events carrying any other
//    token are dropped, so a disposed engine can never move the window;
//  - Esc is scope 2 (lib/estate/input.ts): one native keydown listener on the
//    window's section peels one layer per press and stops propagation only for
//    a press it consumes, so FieldWorkbench's handler minimises the window on
//    exactly the presses that pass;
//  - a press or focus inside the body raises the window (a body click does not,
//    FieldWorkbench.tsx), or Esc would minimise whichever window was on top.

const LOAD_BYTES = { stage0: ESTATE_CATALOGUE.bytes.stage0, f: ESTATE_CATALOGUE.bytes.f } as const;
const FLY_THERE = 'Load the 3D estate to fly there.';
/**
 * The engine chunk did not load. A failed import() is final for the document's
 * life (the module map keeps the failure; importing the URL again rejects with
 * no request), so the policy's Retry would be a dead end: the action becomes
 * Reload. Failures after the chunk evaluated (pack files, engine errors) fetch
 * afresh and keep Retry.
 */
const MODULE_FAILED = 'The 3D viewer did not download. Reload to try again.';
const LIVE_TEXT = '3D view live: drag to orbit, or use the keys listed below.';
const FAILURE_PHASES: ReadonlySet<EstatePhase> = new Set(['lost', 'error', 'stale', 'unavailable']);
/** Where the AI and FX panels mount their .panel-backdrop: beside their dock buttons. */
const DOCK_TRIGGERS = '[data-open-assistant], .effects-dock';

// Controls with their own keyboard behaviour (input.ts KeyTargetKind 'button').
const BUTTONISH = 'button, a, summary, input, select, textarea, [role="button"]';

/** Instance tokens: one counter for the page, so no two engines ever share one. */
let tokenCounter = 0;

interface LossState {
  /** The context is lost and not yet restored. */
  lost: boolean;
  /** …and it was lost while frozen (not counted). */
  frozen: boolean;
  /** A live loss went RESTORE_TIMEOUT_MS without a restore. */
  overdue: boolean;
  /** Live losses inside the reset window. */
  resets: number;
}
const NO_LOSS: LossState = { lost: false, frozen: false, overdue: false, resets: 0 };

const STAGE_PHASES: ReadonlySet<EstatePhase> = new Set(['live', 'frozen']);
const HUD_PHASES: ReadonlySet<EstatePhase> = new Set(['live', 'frozen', 'lost']);

const plateText = (phase: EstatePhase, reason: string | undefined): string | null => {
  switch (phase) {
    case 'loading': return 'Loading the 3D estate';
    case 'lost': case 'unavailable': case 'error': case 'stale': return reason ?? null;
    default: return null;
  }
};

const EstateControllerImpl: React.FC<EstateControllerProps> = ({ rootRef, onModel, takePending }) => {
  const presence = usePanePresence(rootRef);
  // Latched the first time the window is in front: the policy's `raised`.
  const [raised, setRaised] = React.useState(false);
  if (!raised && presence.open && presence.focused) setRaised(true);
  const experience = useOptionalExperienceMode();
  const policyResolved = experience?.resolved === true;
  const policy = policyResolved ? experience?.policy : undefined;

  const [engineState, setEngineState] = React.useState<EstateEngineState>('none');
  const [userRequested, setUserRequested] = React.useState(false);
  const [docReady, setDocReady] = React.useState(false);
  const [releaseDue, setReleaseDue] = React.useState(false);
  const [loss, setLoss] = React.useState<LossState>(NO_LOSS);
  const [fullDetail, setFullDetail] = React.useState(false);
  const [runtime, setRuntime] = React.useState<EstateRuntime | null>(null);
  const [engine, setEngine] = React.useState<EstateEngine | null>(null);
  // A request that came before this chunk did: the window held it.
  const [pending] = React.useState<EstateFocusDetail | null>(() => {
    const request = validateEstateFocus(takePending());
    return request.site ? request : null;
  });
  const [selected, setSelected] = React.useState<EstateSiteId | null>(pending?.site ?? null);
  // Walk's building underfoot (null outdoors), or undefined outside Walk: the registry's Exit row.
  const [walkSite, setWalkSite] = React.useState<EstateSiteId | null | undefined>(undefined);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [focusIntent, setFocusIntent] = React.useState(false);
  // A focus move for the view to make after its next commit (it owns the DOM).
  const [focusMove, setFocusMove] = React.useState<EstateModel['focus']>(null);
  const [debug, setDebug] = React.useState(false);
  // Why a ready engine was latched unavailable (two resets, no restore): the
  // policy's own reason for engine 'unavailable' is the capability one.
  const [latchedReason, setLatchedReason] = React.useState<string | null>(null);
  // The engine chunk itself failed to load (MODULE_FAILED): only a reload helps.
  const [moduleFailed, setModuleFailed] = React.useState(false);
  // Has the window been live this mount? The status line keeps "live" while
  // frozen after that, so reopening does not announce it again.
  const [beenLive, setBeenLive] = React.useState(false);

  const result = resolveEstatePhase({
    open: presence.open,
    focused: presence.focused,
    raised,
    onscreen: presence.onscreen,
    hidden: presence.hidden,
    halted: presence.halted,
    allowHeavyAssets: policy?.allowHeavyAssets === true,
    policyResolved,
    saveData: experience?.capabilities?.saveData === true,
    userRequested,
    engine: engineState,
    contextLost: loss.lost,
    lostWhileFrozen: loss.frozen,
    closedMs: releaseDue ? RELEASE_AFTER_MS : 0,
    mounted: true,
    docReady,
    policyReason: policy?.reason,
    fullDetail,
    closedByDesk: presence.closedByDesk,
    liveResets: loss.resets,
    lostMs: loss.overdue ? RESTORE_TIMEOUT_MS : 0,
  });
  const { phase } = result;

  // Mutable mirrors for listeners that outlive a render.
  const mountedRef = React.useRef(false);
  const loadingRef = React.useRef(false);
  const engineRef = React.useRef<EstateEngine | null>(null);
  const tokenRef = React.useRef(0);
  const startedRef = React.useRef<EstateEngine | null>(null);
  const preloadedRef = React.useRef<EstateEngine | null>(null);
  const engineStateRef = React.useRef(engineState);
  engineStateRef.current = engineState;
  const phaseRef = React.useRef(phase);
  phaseRef.current = phase;
  const resumeRef = React.useRef<EstateResume | undefined>(undefined);
  /** When the current instance's start() was called (the estate_live event's ms_to_live). */
  const startedAtRef = React.useRef(0);
  const heldRef = React.useRef<EstateFocusDetail | null>(pending);
  const lossTimesRef = React.useRef<number[]>([]);
  const restoreTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = React.useRef<(event: EstateEngineEvent) => void>(() => {});
  /** Whether the last element focused on the page was inside this window (focus that fell to the body stays "inside"). */
  const focusInsideRef = React.useRef(false);

  const stageEl = () => rootRef.current?.querySelector<HTMLElement>(ESTATE_STAGE) ?? null;

  const clearRestoreTimer = () => {
    if (restoreTimerRef.current !== null) clearTimeout(restoreTimerRef.current);
    restoreTimerRef.current = null;
  };

  /** Ordered teardown of the current instance (the engine's own dispose, §7.10) and the shell's hold on it. */
  const dropEngine = React.useCallback((keepPose: boolean) => {
    const instance = engineRef.current;
    if (!instance) return;
    if (keepPose) {
      try { resumeRef.current = instance.getResume(); } catch { /* keep the previous pose */ }
    }
    engineRef.current = null;
    tokenRef.current = 0;
    startedRef.current = null;
    preloadedRef.current = null;
    clearRestoreTimer();
    try { instance.dispose(); } catch (error) { console.warn('[estate] dispose', error); }
  }, []);

  /** The instance failed for good: drop it and latch the engine state (stale / failed / unavailable). */
  const fail = React.useCallback((state: Extract<EstateEngineState, 'failed' | 'unavailable' | 'stale'>, error?: unknown) => {
    if (error !== undefined) console.warn('[estate]', error);
    dropEngine(true);
    loadingRef.current = false;
    lossTimesRef.current = [];
    setEngine(null);
    setLoss(NO_LOSS);
    setProgress(null);
    setEngineState(state);
  }, [dropEngine]);

  /** Closed 30 s, DESK, or a Retry over a lost context: dispose, keep the pose, read as never loaded. */
  const release = React.useCallback(() => {
    dropEngine(true);
    loadingRef.current = false;
    lossTimesRef.current = [];
    setEngine(null);
    setLoss(NO_LOSS);
    setProgress(null);
    setEngineState('none');
  }, [dropEngine]);

  const beginLoad = React.useCallback(() => {
    if (loadingRef.current || !mountedRef.current) return;
    loadingRef.current = true;
    setEngineState('loading');
    loadEngine().then((loaded) => {
      // Unmounted while the chunk downloaded: the module is discarded, never started.
      if (!mountedRef.current) return;
      setRuntime(loaded);
    }, (error: unknown) => {
      loadingRef.current = false;
      if (!mountedRef.current) return;
      console.warn('[estate]', error);
      const stale = error instanceof EstateLoadError && error.kind === 'stale';
      setModuleFailed(!stale);
      setEngineState(stale ? 'stale' : 'failed');
    });
  }, []);

  /**
   * Carry out a focus request (the assistant's focusEstate, or a row pressed
   * before live): enter walks in (to the storey, by lift, when one is named); a
   * storey without enter opens Plan there; else a fly-to. Never moves DOM focus.
   */
  const applyFocus = (instance: EstateEngine, request: EstateFocusDetail): boolean => {
    const site = request.site;
    if (!site) return false;
    if (request.enter === true && instance.features.enter && instance.enter(site, request.storey ? { storey: request.storey } : undefined)) return true;
    if (request.enter !== true && request.storey && instance.features.plan) {
      // The plan already on screen is done, not a fly-to: a model repeats its
      // command on a follow-up ("what rooms are on this floor?"), and planView
      // refuses the storey it already shows. (request.storey is canonical.)
      const shown = instance.getView().plan;
      if (shown && shown.site === site && shown.storey === request.storey) return true;
      if (instance.planView(site, request.storey)) return true;
    }
    if (instance.features.flyTo && instance.flyTo(site)) return true;
    return instance.select(site);
  };

  // Every engine event goes through here; only the current instance's count.
  onEventRef.current = (event) => {
    if (event.token !== tokenRef.current || engineRef.current === null) return;
    switch (event.type) {
      case 'ready':
        loadingRef.current = false;
        setProgress(null);
        setEngineState('ready');
        track('estate_live', {
          tier: event.tier, msaa: event.msaa, ms_to_live: Math.round(performance.now() - startedAtRef.current), lean: result.lean, resumed: resumeRef.current !== undefined,
        });
        break;
      case 'progress':
        if (event.stage === 'first-frame') setProgress(event.totalBytes > 0 ? Math.min(1, event.loadedBytes / event.totalBytes) : null);
        break;
      case 'location':
        setSelected(event.selection);
        setWalkSite(event.location.mode === 'walk' ? event.walk?.site ?? event.location.site : undefined);
        break;
      case 'lost': {
        const now = performance.now();
        lossTimesRef.current = noteContextLoss(lossTimesRef.current, now, event.frozen);
        clearRestoreTimer();
        if (!event.frozen) {
          restoreTimerRef.current = setTimeout(() => {
            restoreTimerRef.current = null;
            setLoss((prev) => (prev.lost ? { ...prev, overdue: true } : prev));
          }, RESTORE_TIMEOUT_MS);
        }
        setLoss({ lost: true, frozen: event.frozen, overdue: false, resets: liveResetCount(lossTimesRef.current, now) });
        break;
      }
      case 'restored':
        clearRestoreTimer();
        setLoss((prev) => ({ lost: false, frozen: false, overdue: false, resets: prev.resets }));
        break;
      case 'unavailable': fail('unavailable'); break;
      case 'error': fail('failed', event.message); break;
      case 'stale': fail('stale', event.url); break;
      default: break;
    }
  };

  // Mounted flag and the unmount teardown. StrictMode's rehearsal unmount runs
  // before any engine can exist, and the re-run sets the flag again.
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      heldRef.current = null;
      dropEngine(true);
      loadingRef.current = false;
    };
  }, [dropEngine]);

  React.useEffect(() => onDocumentComplete(() => setDocReady(true)), []);

  // Loading: automatic loads wait for idle; a click loads now.
  React.useEffect(() => {
    if (phase !== 'loading' || engineState !== 'none') return undefined;
    if (!result.autoLoad) {
      beginLoad();
      return undefined;
    }
    return whenIdle(beginLoad, AUTO_LOAD_IDLE_TIMEOUT_MS);
  }, [phase, engineState, result.autoLoad, beginLoad]);

  // The chunk is in: make the instance (no DOM, GPU or network until start/preload).
  React.useEffect(() => {
    if (!runtime || engineState !== 'loading' || engineRef.current) return;
    const host = stageEl();
    if (!host) return;
    const token = ++tokenCounter;
    const search = window.location.search;
    const wantDebug = debugFromSearch(search);
    let created: EstateEngine;
    try {
      created = runtime.createEngine({
        host,
        token,
        packUrl: ESTATE_CATALOGUE.packUrl,
        tier: qualityFromSearch(search),
        lean: result.lean,
        motionHalted,
        colours: readTokenColours(),
        onEvent: (event) => onEventRef.current(event),
        debug: wantDebug,
        bench: benchFromSearch(search),
        resume: resumeRef.current,
      });
    } catch (error) {
      fail('failed', error);
      return;
    }
    engineRef.current = created;
    tokenRef.current = token;
    setDebug(wantDebug);
    setEngine(created);
    // result.lean is read once here; later changes go through setLean below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime, engineState, fail]);

  // Open: start it (fresh canvas, renderer, warm-up). Closed during loading:
  // let the first frame download, and make no renderer until it opens.
  React.useEffect(() => {
    const instance = engineRef.current;
    if (!instance || instance !== engine || engineState !== 'loading') return;
    if (result.startEngine) {
      if (startedRef.current === instance) return;
      startedRef.current = instance;
      startedAtRef.current = performance.now();
      try { instance.start(); } catch (error) { fail('failed', error); }
    } else if (preloadedRef.current !== instance) {
      preloadedRef.current = instance;
      void instance.preload();
    }
  }, [engine, engineState, result.startEngine, fail]);

  // Loaded: follow the phase.
  React.useEffect(() => {
    const instance = engineRef.current;
    if (!instance || instance !== engine || engineState !== 'ready') return;
    switch (phase) {
      case 'live': {
        instance.resume();
        const held = heldRef.current;
        heldRef.current = null;
        if (held) applyFocus(instance, held);
        setNotice(null);
        break;
      }
      case 'frozen': instance.freeze(); break;
      // Closed 30 s or DESK; or seen again with a context lost while frozen and
      // never restored (the policy): disposed, and an open window loads afresh.
      // A held focus request waits for the next instance.
      case 'released': release(); break;
      // Reached from resets or a missed restore: latched, or the count aging
      // out of its window would hand the window back.
      case 'unavailable':
        setLatchedReason(result.reason ?? null);
        fail('unavailable');
        break;
      default: break;
    }
    // applyFocus reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, engine, engineState, release, fail]);

  React.useEffect(() => {
    engineRef.current?.setLean(result.lean);
  }, [result.lean, engine]);

  // The GPU claim (§7.10): live and focused, and no AI or FX panel's backdrop
  // over the desk (the stage cannot have focus behind one). A mounted desk
  // backdrop yields while it is held.
  React.useEffect(() => {
    if (!result.claimGpu) return undefined;
    const sync = () => (document.querySelector('.panel-backdrop') ? releaseGpu('estate') : claimGpu('estate'));
    sync();
    // Only where a backdrop can appear: beside the dock buttons, and the body.
    // A subtree watch on the body ran this on every React commit on the page and
    // on the desk clock's tick, once a second, at rest.
    const panels = new MutationObserver(sync);
    const parents = new Set<Node>([document.body]);
    for (const trigger of document.querySelectorAll(DOCK_TRIGGERS)) if (trigger.parentNode) parents.add(trigger.parentNode);
    for (const parent of parents) panels.observe(parent, { childList: true });
    return () => {
      panels.disconnect();
      releaseGpu('estate');
    };
  }, [result.claimGpu]);

  // Closed with an instance alive: release after 30 s unless it reopens
  // (`?estate-release-ms=` shortens the wait for the release-and-reopen e2e).
  React.useEffect(() => {
    if (presence.open || !engine) {
      setReleaseDue(false);
      return undefined;
    }
    const id = setTimeout(() => setReleaseDue(true), releaseMsFromSearch(window.location.search, RELEASE_AFTER_MS));
    return () => clearTimeout(id);
  }, [presence.open, engine]);

  // Focus follows a click-initiated load (§8.3): onto the stage when the Load
  // button disappears and when it goes live; onto the action button when it
  // fails. Never on an automatic load or a focus request, and never once the
  // visitor has pressed or focused anything outside this window meanwhile: a
  // load that lands after they moved to another window must not pull focus
  // (and the window) back over it.
  const moveFocus = (target: 'stage' | 'action') => setFocusMove((prev) => ({ target, seq: (prev?.seq ?? 0) + 1 }));
  React.useEffect(() => {
    const section = rootRef.current?.closest<HTMLElement>(ESTATE_SECTION) ?? rootRef.current;
    if (!section) return undefined;
    const onFocusIn = (event: FocusEvent) => {
      const inside = section.contains(event.target as Node);
      focusInsideRef.current = inside;
      if (!inside) setFocusIntent(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!section.contains(event.target as Node)) setFocusIntent(false);
    };
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, []);
  React.useEffect(() => {
    if (!focusIntent) return;
    if (phase === 'loading' || phase === 'live') {
      moveFocus('stage');
      if (phase === 'live') setFocusIntent(false);
      return;
    }
    if (phase !== 'poster') moveFocus('action');
    setFocusIntent(false);
  }, [phase, focusIntent]);

  // A live window that fails (GPU reset, a download, a redeploy) takes the
  // stage's focusability with it: if focus was in the window, it goes to the
  // side panel's Retry or Reload (which the view scrolls into sight). Back to
  // live from a reset, it returns to the stage. Never from another window.
  const previousPhase = React.useRef(phase);
  React.useEffect(() => {
    const was = previousPhase.current;
    previousPhase.current = phase;
    if (phase === 'live') setBeenLive(true);
    if (was === phase) return;
    if (FAILURE_PHASES.has(phase) && !FAILURE_PHASES.has(was)) {
      if ((was === 'live' || was === 'frozen') && focusInsideRef.current) moveFocus('action');
    } else if (phase === 'live' && was === 'lost' && focusInsideRef.current) {
      moveFocus('stage');
    }
  }, [phase]);

  // The assistant's focusEstate (P6 sends it; the event exists now): held until
  // live, delivered once, and never a DOM focus move.
  React.useEffect(() => {
    const onFocusRequest = (event: Event) => {
      const request = validateEstateFocus((event as CustomEvent<unknown>).detail);
      if (!request.site) return;
      const instance = engineRef.current;
      if (instance && phaseRef.current === 'live' && applyFocus(instance, request)) return;
      heldRef.current = request;
      setSelected(request.site);
      setNotice(phaseRef.current === 'consent' ? FLY_THERE : null);
    };
    window.addEventListener(ESTATE_FOCUS_EVENT, onFocusRequest);
    return () => window.removeEventListener(ESTATE_FOCUS_EVENT, onFocusRequest);
    // applyFocus reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc (scope 2) and raising the window, on the window's own section.
  React.useEffect(() => {
    const section = rootRef.current?.closest<HTMLElement>(ESTATE_SECTION);
    if (!section) return undefined;
    const raise = (event: Event) => {
      const target = event.target as Element | null;
      // The titlebar raises on drag itself, and its × must not re-raise a window it is closing.
      if (target?.closest?.('.wb-titlebar')) return;
      if (!section.hasAttribute('data-focused')) dispatchWorkbenchOpen({ appId: 'world-3d' });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && event.code !== 'Escape') return;
      const instance = engineRef.current;
      if (!instance || engineStateRef.current !== 'ready') return;
      const view = instance.getView();
      const target = event.target as Element | null;
      const targetKind: KeyTargetKind = target === stageEl() ? 'stage' : target?.matches?.(BUTTONISH) ? 'button' : 'other';
      const decision = decideEscape({
        code: 'Escape',
        targetKind,
        repeat: event.repeat,
        mode: view.location.mode,
        state: {
          popoverOpen: view.popoverOpen,
          transition: view.transition,
          selection: view.selection !== null,
          pointerLocked: view.pointerLocked,
          pointerUnlockedAtMs: view.pointerUnlockedAtMs,
        },
        nowMs: event.timeStamp,
      });
      if (!decision.consume) return;
      event.preventDefault();
      event.stopPropagation();
      if (decision.action !== 'none') instance.escape(decision.action);
      // A registry row's Enter leaves with the selection Esc just cleared: focus
      // goes to that row's own button, never to the page (whose next Esc would
      // be the workbench's).
      if (decision.action === 'clear-selection' && target?.matches?.('[data-estate-row-action]')) {
        target.parentElement?.querySelector<HTMLElement>('[data-estate-site]')?.focus({ preventScroll: true });
      }
    };
    section.addEventListener('pointerdown', raise);
    section.addEventListener('focusin', raise);
    section.addEventListener('keydown', onKeyDown);
    return () => {
      section.removeEventListener('pointerdown', raise);
      section.removeEventListener('focusin', raise);
      section.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const requestLoad = () => {
    setFocusIntent(true);
    setNotice(null);
    setUserRequested(true);
  };

  const retry = () => {
    if (moduleFailed) {
      reloadPage();
      return;
    }
    if (engineRef.current) release();
    else setEngineState('none');
    requestLoad();
  };

  const onSite = (site: EstateSiteId) => {
    const instance = engineRef.current;
    if (instance && phase === 'live') {
      if (instance.features.flyTo && instance.flyTo(site)) {
        moveFocus('stage');
        return;
      }
      if (instance.select(site)) return;
    }
    // Not live: highlight it, and fly there once the viewer is.
    heldRef.current = { site };
    setSelected(site);
    setNotice(phase === 'consent' ? FLY_THERE : null);
  };

  // action and hud stay the same objects while unchanged: the window compares models shallowly.
  const reloadOnly = moduleFailed && phase === 'error';
  const actionLabel = result.action === 'load' ? consentLabel(LOAD_BYTES, result.lean ? 'lean' : 'full')
    : result.action === 'retry' ? (reloadOnly ? 'Reload' : 'Retry') : result.action === 'reload' ? 'Reload' : null;
  const action = React.useMemo<EstateModelAction | null>(
    () => (actionLabel ? { label: actionLabel, primary: actionLabel !== 'Retry' && actionLabel !== 'Reload' } : null),
    [actionLabel],
  );

  // The registry's mirror of the HUD's Enter and Exit (§8.6): Exit on the row of
  // the building Walk stands in, else Enter on the selected row (outdoors in
  // Walk too), labelled with what entering downloads (pack.json's sizes, so
  // only once the engine has it).
  const canEnter = phase === 'live' && engine?.features.enter === true;
  let rowSite: EstateSiteId | null = null;
  let rowKind: EstateModelRowAction['kind'] = 'enter';
  let rowLabel = '';
  if (canEnter && walkSite) {
    rowSite = walkSite; rowKind = 'exit'; rowLabel = `Exit ${siteShortName(walkSite)}`;
  } else if (canEnter && selected && engine) {
    const files = engine.siteFiles(selected);
    rowSite = selected;
    rowLabel = files ? enterLabel({ ...files, name: siteShortName(selected) }) : `Enter ${siteShortName(selected)}`;
  }
  const rowAction = React.useMemo<EstateModelRowAction | null>(
    () => (rowSite ? { site: rowSite, kind: rowKind, label: rowLabel } : null),
    [rowSite, rowKind, rowLabel],
  );

  // One polite status line in the side panel speaks the viewer's phase; the
  // HUD's own (visually hidden) status speaks where the camera is. Two regions,
  // two subjects, never the same words.
  let stateText = '';
  if (phase === 'consent') stateText = result.reason ? `Still render · ${result.reason}.` : 'Still render.';
  else if (phase === 'loading') stateText = 'Loading the 3D estate…';
  else if (phase === 'live') stateText = LIVE_TEXT;
  // Frozen is closed, hidden or off screen: nobody reads it, and a "paused"
  // line here was re-announced as "live" on every reopen.
  else if (phase === 'frozen') stateText = beenLive ? LIVE_TEXT : '3D view paused while the window is closed or off screen.';
  const reason = reloadOnly ? MODULE_FAILED : phase === 'unavailable' && latchedReason ? latchedReason : result.reason;
  if (!stateText && reason) stateText = reason;
  // Consent behind Home (the boot layout) says nothing until the window comes
  // forward, or the line would be read out at page load for a window nobody
  // has looked at. Its Load button stands.
  if (phase === 'consent' && !raised) stateText = '';

  // The view's handlers stay the same functions for this controller's life and
  // call the latest closures.
  const latest = React.useRef({ onSite, onAction: () => {}, onRowAction: () => {} });
  latest.current = {
    onSite,
    onRowAction: () => {
      const instance = engineRef.current;
      if (!instance || phase !== 'live' || !rowAction) return;
      // Enter and Exit from the registry leave the keys on the stage (§8.3), as a row's fly-to does.
      const acted = rowAction.kind === 'exit' ? instance.setMode('overview') : instance.enter(rowAction.site);
      if (acted) moveFocus('stage');
    },
    onAction: () => {
      if (result.action === 'load') requestLoad();
      else if (result.action === 'retry') retry();
      else if (result.action === 'reload') reloadPage();
    },
  };
  const handlers = React.useMemo<EstateModelHandlers>(() => ({
    onSite: (site) => latest.current.onSite(site),
    onAction: () => latest.current.onAction(),
    onRowAction: () => latest.current.onRowAction(),
  }), []);
  const loadFullDetail = React.useCallback(() => {
    setFullDetail(true);
    engineRef.current?.setLean(false);
  }, []);
  const fullDetailText = result.lean ? fullDetailLabel(LOAD_BYTES) : null;
  const fullDetailOffer = React.useMemo(
    () => (fullDetailText ? { label: fullDetailText, onLoad: loadFullDetail } : null),
    [fullDetailText, loadFullDetail],
  );

  const Hud = runtime?.EstateHud;
  const Rooms = runtime?.EstatePlanRooms;
  const hudEngine = engine && HUD_PHASES.has(phase) ? engine : null;
  const hud = React.useMemo(
    () => (Hud && hudEngine ? { Hud, props: { engine: hudEngine, phase, fullDetail: fullDetailOffer, debug } } : null),
    [Hud, hudEngine, phase, fullDetailOffer, debug],
  );
  // Plan's room list in the side panel (P6): same engine and phase as the HUD.
  const side = React.useMemo(() => (Rooms && hud ? { Hud: Rooms, props: hud.props } : null), [Rooms, hud]);
  const model: EstateModel = {
    phase,
    stateText,
    action,
    selected,
    notice,
    plate: plateText(phase, reason),
    progress,
    interactive: STAGE_PHASES.has(phase),
    focusable: focusIntent && phase === 'loading',
    focus: focusMove,
    rowsFly: phase === 'live' && engine?.features.flyTo === true,
    rowAction,
    hud,
    side,
  };
  // Before paint, so a phase change and its focus move land in one frame.
  React.useLayoutEffect(() => { onModel(model, handlers); });

  return null;
};

/** Memoized: the window re-renders when the model it was given changes, and that must not re-run this. */
export const EstateController = React.memo(EstateControllerImpl);

export default EstateController;
