import React from 'react';
import { chipText, LocationAnnouncer, siteChipLabel, siteSpokenName, type AnnounceResult } from '../../../../lib/estate/announce';
import type { EstateViewMode } from '../../../../lib/estate/frames';
import type {
  EstateEngine, EstateEngineEvent, EstateHudProps, EstateProgressEvent, EstateStatsEvent, EstateView, EstateWalkStep,
} from '../engineApi';

// The Estate viewer's HUD (plan §8.6, §8.7): drawn over the stage while an
// engine instance exists, in the lazy chunk beside the engine (estate/live/),
// reached only through estate/loadEngine.ts. engineApi.ts EstateHudProps is its
// whole input; it subscribes to the engine itself.
//
//   top left      location chip (no live role) · the selection, with its
//                 mirrored Fly-to / Enter / Clear · debug readouts
//   top right     [OVERVIEW | WALK | FLY] (.wb-domainseg, the active one filled
//                 accent-700) · HOME · KEYS (help popover, next in tab order) ·
//                 CAPTURE · FULLSCREEN on div#world · north arrow · KEYS ACTIVE
//   right         storey strip (P5: drawn once Walk or Plan is in the build)
//   bottom left   pointer-lock state · STREAMING … with a 1 px accent-700
//                 progress line · lean mode's Load full detail · mode prompt
//   bottom right  step buttons, for everyone: the DOM equivalent of every drag
//                 (§8.7). Overview: pan pad, zoom, orbit, tilt. Fly: move pad,
//                 strafe, climb and sink, look. P5's Walk: steps and turns.
//
// Rules it keeps: chips are opaque --paper-55 tags with a 1 px divider border
// and square corners, in survey-annotation language (no crosshair, minimap or
// score chrome); the smallest text is --color-neutral-700, and the one solid
// fill (the active mode) is accent-700 under white; every pointer action is a
// button with an accessible name; one visually hidden role="status" node takes
// the LocationAnnouncer's text, and the chip itself has no live role. Every
// control is disabled (and dimmed) outside the live phase, and the KEYS chip
// and prompt, which describe a live stage, are not drawn outside it.
//
// Nothing in the top-right row may change width between a press and its
// release: a press moves focus off the stage, and when the KEYS chip resized
// on that blur the row reflowed by 74 px under the pointer, so the click
// landed on the row and was lost (every second HUD click, measured). The chip
// therefore reserves the width of its longer label.
//
// Focus: a control that had focus and then vanishes or is disabled (Clear,
// Load full detail, Capture once the mouse is held, any control a mode change
// removes) hands focus to the stage rather than to the page, or the next Esc
// would skip the window's layers and minimise it. The north arrow is turned by
// the engine itself (its [data-estate-north] dial, a composited transform), so
// orbiting re-renders nothing here. No colour is written in this file:
// index.css's .wb-estate-hud* rules hold them, all tokens.

const MODE_LABEL: Readonly<Record<EstateViewMode, string>> = { overview: 'Overview', walk: 'Walk', fly: 'Fly', plan: 'Plan' };

/** What the bottom-left prompt says per mode: survey annotation, pointer first (the keys are in KEYS and #estate-keys). */
const PROMPT: Readonly<Record<EstateViewMode, string>> = {
  overview: 'Drag orbit · Right-drag pan · Wheel zoom · Click select · Double-click fly to',
  fly: 'W A S D move · E / Space up · Q / C down · R / F look · Shift ×3 · Drag look · Wheel speed',
  walk: 'W A S D walk · Drag look · PgUp / PgDn stairs and lifts',
  plan: 'Click a room · ↑ ↓ cycle rooms · Enter walk in',
};

/** The same, once the stage has seen a finger. */
const TOUCH_PROMPT: Readonly<Record<EstateViewMode, string>> = {
  overview: 'Drag orbit · Two fingers pan and zoom · Tap select · Double-tap fly to',
  fly: 'Drag look · Two-finger drag strafe · Buttons move, climb and look',
  walk: 'Stick walk · Drag look · Buttons step and turn',
  plan: 'Tap a room · Double-tap walk in',
};

/** The KEYS chip's two labels; it reserves the longer one's width. */
const KEYS_ON = 'Keys active';
const KEYS_OFF = 'Click or Tab to control';
const KEYS_OFF_TOUCH = 'Tap or Tab to control';

/** The help popover's key list, per mode (lib/estate/input.ts' tables, in words). */
const KEY_HELP: Readonly<Partial<Record<EstateViewMode, ReadonlyArray<readonly [string, string]>>>> = {
  overview: [
    ['Drag', 'Orbit'],
    ['Right- or Shift-drag', 'Pan'],
    ['Wheel or pinch', 'Zoom to the cursor'],
    ['Click · double-click', 'Select · fly to a building'],
    ['W S · ↑ ↓', 'Tilt'],
    ['← →', 'Rotate'],
    ['A D', 'Pan sideways'],
    ['Shift + arrows', 'Pan'],
    ['Enter', 'Fly to the selected building'],
    ['Home', 'Aerial view'],
    ['1 · 3', 'Overview · Fly'],
    ['I', 'Say where you are'],
    ['Esc', 'Clear the selection, then minimise'],
  ],
  fly: [
    ['W S · ↑ ↓', 'Forward · back'],
    ['A D', 'Strafe'],
    ['← →', 'Turn'],
    ['R F', 'Look up · down'],
    ['E Space · Q C', 'Up · down'],
    ['Shift', 'Three times faster'],
    ['Drag', 'Look'],
    ['Right- or Shift-drag', 'Strafe'],
    ['Wheel', 'Speed'],
    ['L', 'Capture the mouse'],
    ['Home', 'Back to the aerial view'],
    ['1 · 3', 'Overview · Fly'],
    ['I', 'Say where you are'],
    ['Esc', 'Back to Overview'],
  ],
};

/**
 * The stage's accessible description (its aria-describedby, #estate-keys-desc):
 * short and per mode, read on every focus of the stage. The full list stays
 * under KEYS and in the side panel's #estate-keys.
 */
const KEY_SUMMARY: Readonly<Record<EstateViewMode, string>> = {
  overview: 'Arrow keys rotate and tilt; A and D, or Shift with the arrows, pan; Enter flies to the selected building; 3 switches to Fly; Esc steps back. The full list is under Keys.',
  fly: 'W A S D move; the arrows turn; R and F look up and down; E and C climb and sink; Home returns to the aerial view; Esc goes back to Overview. The full list is under Keys.',
  walk: 'W A S D walk; the arrows turn; Page Up and Page Down take stairs and lifts; Esc goes back to Overview. The full list is under Keys.',
  plan: 'Up and down arrows cycle rooms; Enter walks in; Esc leaves the plan. The full list is under Keys.',
};

/** The id the live stage's aria-describedby names (EstateWindow.tsx). */
export const ESTATE_KEYS_DESC_ID = 'estate-keys-desc';


/** One step button: what it does (its accessible name) and its icon. */
interface StepButton { step: EstateWalkStep; label: string; icon: string; area: string }

// Two clusters: a pad (the four arrows) and a 2 × 3 block of pairs.
const STEPS: Readonly<Partial<Record<EstateViewMode, readonly StepButton[]>>> = {
  overview: [
    { step: 'up', label: 'Pan ahead', icon: 'arrowUp', area: 'pu' },
    { step: 'left', label: 'Pan left', icon: 'arrowLeft', area: 'pl' },
    { step: 'down', label: 'Pan back', icon: 'arrowDown', area: 'pd' },
    { step: 'right', label: 'Pan right', icon: 'arrowRight', area: 'pr' },
    { step: 'forward', label: 'Zoom in', icon: 'plus', area: 'a1' },
    { step: 'back', label: 'Zoom out', icon: 'minus', area: 'b1' },
    { step: 'turn-left', label: 'Orbit left', icon: 'ccw', area: 'a2' },
    { step: 'turn-right', label: 'Orbit right', icon: 'cw', area: 'b2' },
    { step: 'look-up', label: 'Tilt towards the horizon', icon: 'tiltUp', area: 'a3' },
    { step: 'look-down', label: 'Tilt towards the plan', icon: 'tiltDown', area: 'b3' },
  ],
  fly: [
    { step: 'forward', label: 'Fly forward', icon: 'up', area: 'pu' },
    { step: 'turn-left', label: 'Turn left', icon: 'left', area: 'pl' },
    { step: 'back', label: 'Fly back', icon: 'down', area: 'pd' },
    { step: 'turn-right', label: 'Turn right', icon: 'right', area: 'pr' },
    { step: 'up', label: 'Climb', icon: 'climb', area: 'a1' },
    { step: 'down', label: 'Sink', icon: 'sink', area: 'b1' },
    { step: 'left', label: 'Strafe left', icon: 'arrowLeft', area: 'a2' },
    { step: 'right', label: 'Strafe right', icon: 'arrowRight', area: 'b2' },
    { step: 'look-up', label: 'Look up', icon: 'tiltUp', area: 'a3' },
    { step: 'look-down', label: 'Look down', icon: 'tiltDown', area: 'b3' },
  ],
  walk: [
    { step: 'forward', label: 'Step forward', icon: 'up', area: 'pu' },
    { step: 'turn-left', label: 'Turn left', icon: 'left', area: 'pl' },
    { step: 'back', label: 'Step back', icon: 'down', area: 'pd' },
    { step: 'turn-right', label: 'Turn right', icon: 'right', area: 'pr' },
  ],
};

const STEP_GROUP: Readonly<Partial<Record<EstateViewMode, string>>> = { overview: 'Pan, zoom, orbit and tilt', fly: 'Move, climb and look', walk: 'Move and turn' };

// Lucide-style strokes (24-unit box, stroke 1.5 in CSS).
const ICON: Readonly<Record<string, string>> = {
  plus: 'M5 12h14M12 5v14',
  minus: 'M5 12h14',
  up: 'm18 15-6-6-6 6',
  down: 'm6 9 6 6 6-6',
  left: 'm15 18-6-6 6-6',
  right: 'm9 18 6-6-6-6',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  arrowDown: 'M12 5v14M19 12l-7 7-7-7',
  arrowLeft: 'M19 12H5M12 19l-7-7 7-7',
  arrowRight: 'M5 12h14M12 5l7 7-7 7',
  climb: 'm17 11-5-5-5 5M17 18l-5-5-5 5',
  sink: 'm7 6 5 5 5-5M7 13l5 5 5-5',
  tiltUp: 'M4 19h16M7 14l5-5 5 5',
  tiltDown: 'M4 5h16M7 10l5 5 5-5',
  ccw: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5',
  cw: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8M21 3v5h-5',
};

const Icon: React.FC<{ name: string }> = ({ name }) => (
  <svg className="wb-estate-hud-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d={ICON[name]} />
  </svg>
);

interface ProgressState { label: string | null; share: number | null }

const MB = 1024 * 1024;
const integer = new Intl.NumberFormat('en-GB');
const ms = (value: number | undefined) => (value === undefined ? '—' : value.toFixed(1));
/** How long "Mouse released: drag to look" stays up after the lock goes, ms. */
const RELEASED_LINE_MS = 4000;

const nowMs = (): number => performance.now();

const progressState = (event: EstateProgressEvent): ProgressState | null => {
  if (event.stage !== 'streaming' || event.pending === 0) return null;
  return {
    label: event.label,
    share: event.totalBytes > 0 ? Math.min(1, event.loadedBytes / event.totalBytes) : null,
  };
};

/**
 * The view, kept current from `location` events, and the announcer's text for
 * the live region. Going live says nothing: the first view is taken as heard.
 */
const useEngineView = (engine: EstateEngine, debug: boolean) => {
  const [view, setView] = React.useState<EstateView>(() => engine.getView());
  const [spoken, setSpoken] = React.useState('');
  const [progress, setProgress] = React.useState<ProgressState | null>(null);
  const [stats, setStats] = React.useState<EstateStatsEvent | null>(null);

  React.useEffect(() => {
    const announcer = new LocationAnnouncer();
    const first = engine.getView();
    setView(first);
    announcer.reset(first.location);
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;
    const speak = (result: AnnounceResult) => {
      // The announcer reuses its result object: read both fields now.
      const text = result.speak;
      const due = result.dueMs;
      if (text !== null) setSpoken(text);
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (due !== null) {
        timer = setTimeout(() => {
          timer = null;
          if (alive) speak(announcer.tick(nowMs()));
        }, Math.max(0, due - nowMs()));
      }
    };
    const onEvent = (event: EstateEngineEvent) => {
      switch (event.type) {
        case 'location':
          setView(event);
          speak(announcer.update(event.location, event.moving, nowMs(), event.via));
          break;
        case 'announce':
          if (event.full) speak(announcer.full(nowMs()));
          else if (event.text) speak(announcer.say(event.text, nowMs()));
          break;
        case 'progress':
          setProgress(progressState(event));
          break;
        case 'stats':
          if (debug) setStats(event);
          break;
        default:
          break;
      }
    };
    const off = engine.subscribe(onEvent);
    return () => {
      alive = false;
      off();
      if (timer !== null) clearTimeout(timer);
    };
  }, [engine, debug]);

  return { view, spoken, progress, stats };
};

const stageOf = (rootRef: React.RefObject<HTMLDivElement | null>) => rootRef.current?.closest<HTMLElement>('[data-estate-stage]') ?? null;

/** Stage focus (the KEYS ACTIVE chip), and whether the stage has seen a finger (touch wording). */
const useStageInput = (rootRef: React.RefObject<HTMLDivElement | null>) => {
  const [active, setActive] = React.useState(false);
  const [touch, setTouch] = React.useState(false);
  React.useEffect(() => {
    const stage = stageOf(rootRef);
    if (!stage) return undefined;
    const sync = () => setActive(document.activeElement === stage);
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType === 'touch') setTouch(true);
      else if (event.pointerType === 'mouse') setTouch(false);
    };
    sync();
    stage.addEventListener('focus', sync);
    stage.addEventListener('blur', sync);
    stage.addEventListener('pointerdown', onPointer, { capture: true, passive: true });
    return () => {
      stage.removeEventListener('focus', sync);
      stage.removeEventListener('blur', sync);
      stage.removeEventListener('pointerdown', onPointer, { capture: true });
    };
  }, [rootRef]);
  return { active, touch };
};

/**
 * A control that held focus and then left the DOM or was disabled drops focus
 * to the page; this hands it on instead (preventScroll): to KEYS when it was
 * inside the help popover (its Close, or Esc on one of its controls), else to
 * the stage. Only while focus really is nowhere (body, or still the dead
 * control), so it never takes focus from anything the visitor chose. Checked
 * after every commit.
 */
const useFocusRescue = (rootRef: React.RefObject<HTMLDivElement | null>, keysRef: React.RefObject<HTMLButtonElement | null>) => {
  const lastRef = React.useRef<{ el: HTMLElement; inPopover: boolean } | null>(null);
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const onFocusIn = (event: FocusEvent) => {
      const el = event.target as HTMLElement;
      lastRef.current = { el, inPopover: el.closest?.('.wb-estate-popover') != null };
    };
    root.addEventListener('focusin', onFocusIn);
    return () => root.removeEventListener('focusin', onFocusIn);
  }, [rootRef]);
  React.useLayoutEffect(() => {
    const last = lastRef.current;
    if (!last) return;
    const gone = !last.el.isConnected || (last.el as HTMLButtonElement).disabled === true;
    if (!gone) return;
    lastRef.current = null;
    const active = document.activeElement;
    if (active !== null && active !== document.body && active !== last.el) return;
    const keys = keysRef.current;
    if (last.inPopover && keys?.isConnected && !keys.disabled) keys.focus({ preventScroll: true });
    else stageOf(rootRef)?.focus({ preventScroll: true });
  });
};

/** Fullscreen on div#world (stage and side panel together, so the registry's DOM equivalents stay). */
const useFullscreen = (rootRef: React.RefObject<HTMLDivElement | null>) => {
  const [available, setAvailable] = React.useState(false);
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    const world = rootRef.current?.closest<HTMLElement>('#world') ?? null;
    setAvailable(world !== null && document.fullscreenEnabled === true && typeof world.requestFullscreen === 'function');
    const sync = () => setOn(world !== null && document.fullscreenElement === world);
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, [rootRef]);
  const toggle = React.useCallback(() => {
    const world = rootRef.current?.closest<HTMLElement>('#world');
    if (!world) return;
    const request = document.fullscreenElement === world ? document.exitFullscreen() : world.requestFullscreen();
    void request?.catch?.(() => {});
  }, [rootRef]);
  return { available, on, toggle };
};

/**
 * The pointer-lock line's states: a refused lock ("WAIT, THEN CLICK CAPTURE")
 * until the next lock or a mode change, and a lock just lost ("MOUSE RELEASED:
 * DRAG TO LOOK") for RELEASED_LINE_MS or until the mode changes.
 */
const useLockNotes = (mode: EstateViewMode, locked: boolean, unlockedAt: number | null) => {
  const [refused, setRefused] = React.useState(false);
  const [released, setReleased] = React.useState(false);
  React.useEffect(() => {
    const onError = () => setRefused(true);
    const onChange = () => { if (document.pointerLockElement) setRefused(false); };
    document.addEventListener('pointerlockerror', onError);
    document.addEventListener('pointerlockchange', onChange);
    return () => {
      document.removeEventListener('pointerlockerror', onError);
      document.removeEventListener('pointerlockchange', onChange);
    };
  }, []);
  React.useEffect(() => { setRefused(false); setReleased(false); }, [mode]);
  React.useEffect(() => { if (locked) { setRefused(false); setReleased(false); } }, [locked]);
  React.useEffect(() => {
    if (unlockedAt === null) return undefined;
    setReleased(true);
    const id = setTimeout(() => setReleased(false), RELEASED_LINE_MS);
    return () => clearTimeout(id);
  }, [unlockedAt]);
  return { refused, released };
};

/**
 * P5 slots in here: the storey strip ("RF +45.60 … L1 ±0.00", from the data),
 * which opens Plan from Overview and routes lifts and stairs in Walk (§8.5).
 * Nothing to draw until Walk or Plan is in the build.
 */
const StoreyStrip: React.FC<{ engine: EstateEngine; view: EstateView }> = ({ engine, view }) => {
  if (!(engine.features.walk || engine.features.plan) || view.location.site === null) return null;
  return null;
};

export function EstateHud({ engine, phase, fullDetail, debug }: EstateHudProps): React.ReactElement {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const keysToggleRef = React.useRef<HTMLButtonElement>(null);
  const popoverId = React.useId();
  const { view, spoken, progress, stats } = useEngineView(engine, debug);
  const { active: keysActive, touch } = useStageInput(rootRef);
  const fullscreen = useFullscreen(rootRef);
  const mode = view.location.mode;
  const lock = useLockNotes(mode, view.pointerLocked, view.pointerUnlockedAtMs);
  const live = phase === 'live';
  const { features } = engine;
  useFocusRescue(rootRef, keysToggleRef);


  const focusStage = () => stageOf(rootRef)?.focus({ preventScroll: true });
  /** A control pressed with the pointer hands the keys back to the stage; one pressed from the keyboard keeps focus. */
  const toStage = (event: React.MouseEvent) => {
    if (event.detail === 0) return;
    focusStage();
  };

  const modes: EstateViewMode[] = [];
  if (features.overview) modes.push('overview');
  if (features.walk) modes.push('walk');
  if (features.fly) modes.push('fly');

  const firstPerson = mode === 'fly' || mode === 'walk';
  const canCapture = firstPerson && (features.fly || features.walk);
  const selection = view.selection;
  const steps = STEPS[mode];
  const help = KEY_HELP[mode];

  let lockLine: string | null = null;
  if (firstPerson) {
    if (view.pointerLocked) lockLine = 'Mouse captured · Esc releases it';
    else if (lock.refused) lockLine = 'Wait, then click Capture';
    else if (lock.released) lockLine = 'Mouse released: drag to look';
  }

  const offLabel = touch ? KEYS_OFF_TOUCH : KEYS_OFF;
  let prompt = (touch ? TOUCH_PROMPT : PROMPT)[mode];
  if (mode === 'fly' && view.flySpeed !== undefined && Math.abs(view.flySpeed - 1) > 1e-3) prompt = `Speed ×${view.flySpeed.toFixed(2)} · ${prompt}`;

  const helpPopover = view.popover === 'help' && help ? (
    <div className="wb-estate-popover-slot">
      <div className="wb-estate-popover" id={popoverId} role="region" aria-label={`${MODE_LABEL[mode]} keys`} data-estate-scroll>
        <div className="wb-estate-popover-head">
          <span>{`${MODE_LABEL[mode]} keys`}</span>
          <button type="button" className="wb-estate-hud-btn" disabled={!live} onClick={() => engine.setPopover(null)}>Close</button>
        </div>
        <dl className="wb-estate-keylist">
          {help.map(([key, action]) => (
            <React.Fragment key={key}>
              <dt>{key}</dt>
              <dd>{action}</dd>
            </React.Fragment>
          ))}
        </dl>
      </div>
    </div>
  ) : null;

  return (
    <div className="wb-estate-hud" ref={rootRef} data-phase={phase}>
      <p className="sr-only" role="status">{spoken}</p>
      <p id={ESTATE_KEYS_DESC_ID} hidden>{KEY_SUMMARY[mode]}</p>

      <div className="wb-estate-hud-top">
        <div className="wb-estate-hud-col">
          <p className="wb-estate-chip wb-estate-chip-loc" data-estate-location>{chipText(view.location)}</p>
          {selection && (
            <div className="wb-estate-chip wb-estate-chip-sel">
              <span className="wb-estate-chip-key">Selected</span>
              <span>{siteChipLabel(selection)}</span>
              {features.flyTo && (
                <button
                  type="button"
                  className="wb-estate-hud-btn"
                  disabled={!live}
                  aria-label={`Fly to ${siteSpokenName(selection)}`}
                  onClick={(event) => { if (engine.flyTo(selection)) toStage(event); }}
                >Fly to</button>
              )}
              {features.enter && (
                <button
                  type="button"
                  className="wb-estate-hud-btn"
                  disabled={!live}
                  aria-label={`Enter ${siteSpokenName(selection)}`}
                  onClick={(event) => { if (engine.enter(selection)) toStage(event); }}
                >Enter</button>
              )}
              <button
                type="button"
                className="wb-estate-hud-btn"
                disabled={!live}
                aria-label="Clear the selection"
                // The button leaves with the selection: focus goes to the stage either way.
                onClick={() => { if (engine.select(null)) focusStage(); }}
              >Clear</button>
            </div>
          )}
          {debug && stats && (
            <p className="wb-estate-chip wb-estate-chip-quiet wb-estate-debug" data-estate-debug>
              {`Dropped ${stats.droppedPct === undefined ? '—' : `${stats.droppedPct.toFixed(1)}%`} · CPU p95 ${ms(stats.cpuP95Ms)} ms · `
                + `${integer.format(stats.draws)} draws · ${integer.format(stats.tris)} tris · ${(stats.gpuBytes / MB).toFixed(1)} MB · `
                + `${stats.programs} programs · ${stats.tier} ×${stats.pixelRatio}`}
            </p>
          )}
        </div>

        <div className="wb-estate-hud-col wb-estate-hud-col-end">
          <div className="wb-estate-hud-row">
            {modes.length > 1 && (
              <div className="wb-domainseg" role="group" aria-label="Camera mode">
                {modes.map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={!live}
                    aria-pressed={m === mode}
                    data-active={m === mode ? '' : undefined}
                    onClick={(event) => { engine.setMode(m); toStage(event); }}
                  >{MODE_LABEL[m]}</button>
                ))}
              </div>
            )}
            {mode !== 'walk' && (
              <button
                type="button"
                className="wb-estate-hud-btn"
                disabled={!live}
                aria-label="Home: the aerial view"
                onClick={(event) => { if (engine.home()) toStage(event); }}
              >Home</button>
            )}
            {help && (
              <button
                ref={keysToggleRef}
                type="button"
                className="wb-estate-hud-btn"
                disabled={!live}
                aria-expanded={view.popover === 'help'}
                aria-controls={view.popover === 'help' ? popoverId : undefined}
                onClick={() => engine.setPopover(view.popover === 'help' ? null : 'help')}
              >Keys</button>
            )}
            {/* Next in tab order after KEYS, drawn on its own line under the row. */}
            {helpPopover}
            {canCapture && (
              <button
                type="button"
                className="wb-estate-hud-btn"
                disabled={!live || view.pointerLocked}
                aria-label="Capture the mouse to look around (Esc releases it)"
                // The stage takes the keys first, so W A S D fly while the mouse is held.
                onClick={() => { focusStage(); engine.capture(); }}
              >Capture</button>
            )}
            {fullscreen.available && (
              <button
                type="button"
                className="wb-estate-hud-btn"
                disabled={!live}
                aria-pressed={fullscreen.on}
                onClick={fullscreen.toggle}
              >{fullscreen.on ? 'Exit fullscreen' : 'Fullscreen'}</button>
            )}
            <span className="wb-estate-chip wb-estate-north" aria-hidden="true">
              {/* The engine turns this HTML dial, not the svg: a CSS transform on an
                  SVG root is resolved in layout, so turning the svg relaid and
                  repainted it every frame of an orbit; an HTML layer composites. */}
              <span className="wb-estate-north-dial" data-estate-north>
                <svg viewBox="0 0 24 24" focusable="false">
                  <path className="wb-estate-north-arrow" d="M12 1.5 16.5 14 12 11.2 7.5 14Z" />
                  <text x="12" y="22.5" textAnchor="middle">N</text>
                </svg>
              </span>
            </span>
            {live && (
              <span
                className="wb-estate-chip wb-estate-chip-keys"
                data-on={keysActive ? '' : undefined}
                // The other label, drawn invisibly under this one (index.css), so
                // the chip's width never changes when focus moves.
                data-sizer={keysActive ? offLabel : KEYS_ON}
              ><span>{keysActive ? KEYS_ON : offLabel}</span></span>
            )}
          </div>
        </div>
      </div>

      <StoreyStrip engine={engine} view={view} />

      <div className="wb-estate-hud-bottom">
        {fullDetail && (
          <button type="button" className="wb-estate-hud-btn" disabled={!live} onClick={fullDetail.onLoad}>{fullDetail.label}</button>
        )}
        {progress && (
          <p className="wb-estate-chip wb-estate-chip-quiet wb-estate-streaming">
            <span>{progress.label ?? 'Streaming detail'}</span>
            <span className="wb-estate-hud-progress" aria-hidden="true">
              <span style={{ width: `${Math.round((progress.share ?? 0) * 100)}%` }} />
            </span>
          </p>
        )}
        {lockLine && <p className="wb-estate-chip wb-estate-chip-lock">{lockLine}</p>}
        {live && <p className="wb-estate-chip wb-estate-chip-quiet wb-estate-prompt">{prompt}</p>}
      </div>

      {steps && (
        <div className="wb-estate-steps" data-mode={mode} role="group" aria-label={STEP_GROUP[mode]}>
          {steps.map(({ step, label, icon, area }) => (
            <button
              key={step}
              type="button"
              className={`wb-estate-hud-btn wb-estate-step-${area}`}
              disabled={!live}

              aria-label={label}
              title={label}
              onClick={() => engine.walkStep(step)}
            ><Icon name={icon} /></button>
          ))}
        </div>
      )}
    </div>
  );
}

export default EstateHud;
