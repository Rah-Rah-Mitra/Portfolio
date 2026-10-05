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
//                 accent-700) · HOME · KEYS (help popover) · CAPTURE · FULLSCREEN
//                 on div#world · north arrow · KEYS ACTIVE chip
//   right         storey strip (P5: drawn once Walk or Plan is in the build)
//   bottom left   pointer-lock state · STREAMING … with a 1 px accent-700
//                 progress line · lean mode's Load full detail · mode prompt
//   bottom right  step buttons, for everyone (Overview: zoom and orbit; Fly and
//                 P5's Walk: move and turn)
//
// Rules it keeps: chips are opaque --paper-55 tags with a 1 px divider border
// and square corners, in survey-annotation language (no crosshair, minimap or
// score chrome); the smallest text is --color-neutral-700, and the one solid
// fill (the active mode) is accent-700 under white; every pointer action is a
// button with an accessible name; one visually hidden role="status" node takes
// the LocationAnnouncer's text, and the chip itself has no live role. Every
// control is disabled (and dimmed) outside the live phase. The north arrow
// turns by the --estate-north angle the engine writes on the stage, so orbiting
// re-renders nothing here. No colour is written in this file: index.css's
// .wb-estate-hud* rules hold them, all tokens.

const MODE_LABEL: Readonly<Record<EstateViewMode, string>> = { overview: 'Overview', walk: 'Walk', fly: 'Fly', plan: 'Plan' };

/** What the bottom-left prompt says per mode: survey annotation, pointer first (the keys are in KEYS and #estate-keys). */
const PROMPT: Readonly<Record<EstateViewMode, string>> = {
  overview: 'Drag orbit · Right-drag pan · Wheel zoom · Click select · Double-click fly to',
  fly: 'W A S D move · E / Space up · Q / C down · Shift ×3 · Drag look · Wheel speed',
  walk: 'W A S D walk · Drag look · PgUp / PgDn stairs and lifts',
  plan: 'Click a room · ↑ ↓ cycle rooms · Enter walk in',
};

/** The help popover's key list, per mode (lib/estate/input.ts' tables, in words). */
const KEY_HELP: Readonly<Partial<Record<EstateViewMode, ReadonlyArray<readonly [string, string]>>>> = {
  overview: [
    ['Drag', 'Orbit'],
    ['Right- or Shift-drag', 'Pan'],
    ['Wheel or pinch', 'Zoom to the cursor'],
    ['Click · double-click', 'Select · fly to a building'],
    ['W S · ↑ ↓', 'Tilt'],
    ['← →', 'Rotate'],
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
    ['E Space · Q C', 'Up · down'],
    ['Shift', 'Three times faster'],
    ['Drag', 'Look'],
    ['Right- or Shift-drag', 'Strafe'],
    ['Wheel', 'Speed'],
    ['L', 'Capture the mouse'],
    ['1 · 3', 'Overview · Fly'],
    ['I', 'Say where you are'],
    ['Esc', 'Back to Overview'],
  ],
};

type StepLabels = Readonly<Record<EstateWalkStep, string>>;
const STEP_LABELS: Readonly<Partial<Record<EstateViewMode, StepLabels>>> = {
  overview: { forward: 'Zoom in', back: 'Zoom out', 'turn-left': 'Orbit left', 'turn-right': 'Orbit right' },
  fly: { forward: 'Fly forward', back: 'Fly back', 'turn-left': 'Turn left', 'turn-right': 'Turn right' },
  walk: { forward: 'Step forward', back: 'Step back', 'turn-left': 'Turn left', 'turn-right': 'Turn right' },
};

// Lucide-style strokes (24-unit box, stroke 1.5 in CSS).
const ICON: Readonly<Record<string, string>> = {
  plus: 'M5 12h14M12 5v14',
  minus: 'M5 12h14',
  up: 'm18 15-6-6-6 6',
  down: 'm6 9 6 6 6-6',
  left: 'm15 18-6-6 6-6',
  right: 'm9 18 6-6-6-6',
  ccw: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5',
  cw: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8M21 3v5h-5',
};

const STEP_ICONS: Readonly<Record<'overview' | 'move', StepLabels>> = {
  overview: { forward: 'plus', back: 'minus', 'turn-left': 'ccw', 'turn-right': 'cw' },
  move: { forward: 'up', back: 'down', 'turn-left': 'left', 'turn-right': 'right' },
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

/** Stage focus: the KEYS ACTIVE chip. */
const useStageFocus = (rootRef: React.RefObject<HTMLDivElement | null>) => {
  const [active, setActive] = React.useState(false);
  React.useEffect(() => {
    const stage = rootRef.current?.closest<HTMLElement>('[data-estate-stage]');
    if (!stage) return undefined;
    const sync = () => setActive(document.activeElement === stage);
    sync();
    stage.addEventListener('focus', sync);
    stage.addEventListener('blur', sync);
    return () => {
      stage.removeEventListener('focus', sync);
      stage.removeEventListener('blur', sync);
    };
  }, [rootRef]);
  return active;
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

/** A refused pointer lock ("WAIT, THEN CLICK CAPTURE") until the next lock or a mode change. */
const useLockRefusal = (mode: EstateViewMode, locked: boolean) => {
  const [refused, setRefused] = React.useState(false);
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
  React.useEffect(() => { setRefused(false); }, [mode]);
  React.useEffect(() => { if (locked) setRefused(false); }, [locked]);
  return refused;
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
  const keysActive = useStageFocus(rootRef);
  const fullscreen = useFullscreen(rootRef);
  const mode = view.location.mode;
  const lockRefused = useLockRefusal(mode, view.pointerLocked);
  const live = phase === 'live';
  const { features } = engine;

  // The help popover closed with focus inside it (its Close button, or Esc on
  // one of its controls): hand focus back to KEYS rather than to the page.
  const previousPopover = React.useRef(view.popover);
  React.useEffect(() => {
    const was = previousPopover.current;
    previousPopover.current = view.popover;
    if (was === 'help' && view.popover === null && (document.activeElement === null || document.activeElement === document.body)) {
      keysToggleRef.current?.focus({ preventScroll: true });
    }
  }, [view.popover]);

  /** A control pressed with the pointer hands the keys back to the stage; one pressed from the keyboard keeps focus. */
  const toStage = (event: React.MouseEvent) => {
    if (event.detail === 0) return;
    rootRef.current?.closest<HTMLElement>('[data-estate-stage]')?.focus({ preventScroll: true });
  };

  const modes: EstateViewMode[] = [];
  if (features.overview) modes.push('overview');
  if (features.walk) modes.push('walk');
  if (features.fly) modes.push('fly');

  const firstPerson = mode === 'fly' || mode === 'walk';
  const canCapture = firstPerson && (features.fly || features.walk);
  const selection = view.selection;
  const steps = STEP_LABELS[mode];
  const stepIcons = mode === 'overview' ? STEP_ICONS.overview : STEP_ICONS.move;
  const help = KEY_HELP[mode];

  let lockLine: string | null = null;
  if (firstPerson) {
    if (view.pointerLocked) lockLine = 'Mouse captured · Esc releases it';
    else if (lockRefused) lockLine = 'Wait, then click Capture';
    else if (view.pointerUnlockedAtMs !== null) lockLine = 'Mouse released: drag to look';
  }

  return (
    <div className="wb-estate-hud" ref={rootRef} data-phase={phase}>
      <p className="sr-only" role="status">{spoken}</p>

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
                onClick={() => engine.select(null)}
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
            {canCapture && (
              <button
                type="button"
                className="wb-estate-hud-btn"
                disabled={!live || view.pointerLocked}
                aria-label="Capture the mouse to look around (Esc releases it)"
                onClick={() => engine.capture()}
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
              <svg viewBox="0 0 24 24" focusable="false">
                <path className="wb-estate-north-arrow" d="M12 1.5 16.5 14 12 11.2 7.5 14Z" />
                <text x="12" y="22.5" textAnchor="middle">N</text>
              </svg>
            </span>
            <span className="wb-estate-chip wb-estate-chip-keys" data-on={keysActive ? '' : undefined}>
              {keysActive ? 'Keys active' : 'Click or Tab to control'}
            </span>
          </div>
          {view.popover === 'help' && help && (
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
          )}
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
        <p className="wb-estate-chip wb-estate-chip-quiet wb-estate-prompt">{PROMPT[mode]}</p>
      </div>

      {steps && (
        <div className="wb-estate-steps" role="group" aria-label={mode === 'overview' ? 'Zoom and orbit' : 'Move and turn'}>
          {(['forward', 'turn-left', 'back', 'turn-right'] as const).map((step) => (
            <button
              key={step}
              type="button"
              className={`wb-estate-hud-btn wb-estate-step-${step}`}
              disabled={!live}
              aria-label={steps[step]}
              title={steps[step]}
              onClick={() => engine.walkStep(step)}
            ><Icon name={stepIcons[step]} /></button>
          ))}
        </div>
      )}
    </div>
  );
}

export default EstateHud;
