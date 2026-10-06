import React from 'react';
import {
  chipText, LocationAnnouncer, siteChipLabel, siteShortName, siteSpokenName, type AnnounceResult,
} from '../../../../lib/estate/announce';
import type { EstateViewMode } from '../../../../lib/estate/frames';
import { ESTATE_SITE_STOREYS, ESTATE_STOREY_FFL, type EstateSiteId, type EstateStoreyTag } from '../../../../lib/estate/ids';
import { cutText, roomText } from '../../../../lib/estate/plan';
import { enterLabel } from '../../../../lib/estate/policy';
import type {
  EstateEngine, EstateEngineEvent, EstateHudProps, EstatePlanView, EstatePopover, EstateProgressEvent, EstateStatsEvent, EstateView,
  EstateWalkLevel, EstateWalkStep, EstateWalkView,
} from '../engineApi';

// The Estate viewer's HUD (plan §8.6, §8.7): drawn over the stage while an
// engine instance exists, in the lazy chunk beside the engine (estate/live/),
// reached only through estate/loadEngine.ts. engineApi.ts EstateHudProps is its
// whole input; it subscribes to the engine itself.
//
//   top left      location chip (no live role) · the selection, with its
//                 mirrored Fly to / Enter / Clear · in Walk, Exit · debug
//   top right     [OVERVIEW | WALK | FLY] (.wb-domainseg, the active one filled
//                 accent-700) · HOME (in Walk: START) · START AT BS1 · KEYS
//                 (help popover, next in tab order) · CAPTURE · FULLSCREEN on
//                 div#world · north arrow · KEYS ACTIVE
//   right         Walk's storey strip, 'RF +45.60 … L1 ±0.00', from the data:
//                 each button rides, climbs or both (setStorey); a storey no
//                 route reaches is disabled and says why. In Overview with a
//                 building selected, and in Plan, the same strip of that
//                 building's storeys opens Plan on the storey pressed (P6)
//   bottom left   Plan's picked room (with Walk in) and its cut (with ▼ ▲);
//                 what Walk offers here (the stair chip with ▲ ▼, the lift chip
//                 and its level panel), PREPARING WALKWAY… and STREAMING
//                 INTERIOR… while files are on their way, a refusal or failure
//                 notice, the pointer-lock state, STREAMING … with a 1 px
//                 accent-700 progress line, lean mode's Load full detail, the
//                 mode prompt
//   centre        a lift ride's caption over the engine's paper fade
//   bottom right  step buttons, for everyone: the DOM equivalent of every drag
//                 (§8.7). Overview: pan pad, zoom, orbit, tilt. Fly: move pad,
//                 climb and sink, strafe, look. Walk: 0.5 m steps and 15° turns,
//                 strafe, look
//   Walk, touch   the 96 px stick (.wb-estate-stick), shown on the stage's first
//                 touch or under (any-pointer: coarse); a drag elsewhere looks
//
// Rules it keeps: chips are opaque --paper-55 tags with a 1 px divider border
// and square corners, in survey-annotation language (no crosshair, minimap or
// score chrome); the smallest text is --color-neutral-700, and the one solid
// fill (the active mode) is accent-700 under white; every pointer action is a
// button with an accessible name (the stick is the one exception, and the step
// buttons do everything it does); one visually hidden role="status" node takes
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
// Load full detail, Capture once the mouse is held, a lift level once the ride
// starts, any control a mode change removes) hands focus on rather than to the
// page, or the next Esc would skip the window's layers and minimise it: from
// inside a popover to the control that opened it, else to the stage. The north
// arrow is turned by the engine itself (its [data-estate-north] dial, a
// composited transform), so orbiting re-renders nothing here. No colour is
// written in this file: index.css's .wb-estate-hud* rules hold them, all tokens.
//
// The root carries data-mode, data-transition and data-flight (what the view
// says), which the stylesheet and the end-to-end tests read.

const MODE_LABEL: Readonly<Record<EstateViewMode, string>> = { overview: 'Overview', walk: 'Walk', fly: 'Fly', plan: 'Plan' };

/** What the bottom-left prompt says per mode: survey annotation, pointer first (the keys are in KEYS and #estate-keys). */
const PROMPT: Readonly<Record<EstateViewMode, string>> = {
  overview: 'Drag orbit · Right-drag pan · Wheel zoom · Click select · Double-click fly to',
  fly: 'W A S D move · E / Space up · Q / C down · R / F look · Shift ×3 · Drag look · Wheel speed',
  walk: 'W A S D walk · Drag look · PgUp / PgDn stairs and lifts',
  plan: 'Click a room · ↑ ↓ rooms · Enter walk in · [ ] cut · PgUp / PgDn storey',
};

/** The same, once the stage has seen a finger. */
const TOUCH_PROMPT: Readonly<Record<EstateViewMode, string>> = {
  overview: 'Drag orbit · Two fingers pan and zoom · Tap select · Double-tap fly to',
  fly: 'Drag look · Two-finger drag strafe · Buttons move, climb and look',
  walk: 'Stick walk · Drag look · Buttons step and turn',
  plan: 'Tap a room · Double-tap walk in · Buttons cut, pan and zoom',
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
    ['Enter', 'Fly to the selected building; again, walk in'],
    ['Home', 'Aerial view'],
    ['1 · 2 · 3', 'Overview · Walk · Fly'],
    ['I', 'Say where you are'],
    ['Esc', 'Clear the selection, then minimise'],
  ],
  walk: [
    ['W S · ↑ ↓', 'Forward · back'],
    ['A D', 'Strafe'],
    ['← →', 'Turn'],
    ['Shift', 'Walk faster'],
    ['Drag', 'Look'],
    ['Right- or Shift-drag', 'Strafe'],
    ['Wheel', 'Half-metre steps'],
    ['PgUp PgDn', 'Stairs or lift up · down; hold to keep climbing'],
    ['Enter', 'Take the offered stair, or open the lift’s levels'],
    ['L', 'Capture the mouse'],
    ['Home', 'Back to the start'],
    ['1 · 2 · 3', 'Overview · Walk · Fly'],
    ['I', 'Say where you are'],
    ['Esc', 'Close the lift panel, stop a climb, then back to Overview'],
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
    ['1 · 2 · 3', 'Overview · Walk · Fly'],
    ['I', 'Say where you are'],
    ['Esc', 'Back to Overview'],
  ],
  plan: [
    ['Click · double-click', 'Pick a room · walk into it'],
    ['↑ ↓ · W S', 'Previous · next room'],
    ['Enter', 'Walk into the picked room'],
    ['PgUp PgDn', 'Storey up · down'],
    ['[ ]', 'Cut lower · higher'],
    ['Drag', 'Orbit'],
    ['Right- or Shift-drag', 'Pan'],
    ['Wheel or pinch', 'Zoom to the cursor'],
    ['← →', 'Rotate'],
    ['Home', 'Aerial view'],
    ['1 · 2 · 3', 'Overview · Walk (into the picked room) · Fly'],
    ['I', 'Say where you are'],
    ['Esc', 'Leave the plan and clear the selection'],
  ],
};

/**
 * The stage's accessible description (its aria-describedby, #estate-keys-desc):
 * short and per mode, read on every focus of the stage. The full list stays
 * under KEYS and in the side panel's #estate-keys.
 */
const KEY_SUMMARY: Readonly<Record<EstateViewMode, string>> = {
  overview: 'Arrow keys rotate and tilt; A and D, or Shift with the arrows, pan; Enter flies to the selected building, and again walks in; 2 walks, 3 flies; Esc steps back. The full list is under Keys.',
  fly: 'W A S D move; the arrows turn; R and F look up and down; E and C climb and sink; Home returns to the aerial view; Esc goes back to Overview. The full list is under Keys.',
  walk: 'W A S D walk and the arrows turn; Page Up and Page Down take the stairs or the lift; Enter takes the stair offered, or opens the lift’s levels; Home goes back to the start; Esc closes the lift panel, stops a climb, then goes back to Overview. The full list is under Keys.',
  plan: 'Up and down arrows cycle rooms; Enter walks into the picked room; Page Up and Page Down change storey; the square brackets lower and raise the cut; Esc leaves the plan. The full list is under Keys.',
};

/** The id the live stage's aria-describedby names (EstateWindow.tsx). */
export const ESTATE_KEYS_DESC_ID = 'estate-keys-desc';

/** How long a refusal or event notice ("No lift or stair reaches RF") stays up, ms. */
const NOTICE_MS = 5000;

/** One step button: what it does (its accessible name) and its icon. */
interface StepButton { step: EstateWalkStep; label: string; icon: string; area: string }

// Two clusters: a pad (the four arrows) and a block of pairs. Plan moves the
// camera as Overview does (its cut and storeys have their own chip and strip).
const ORBIT_STEPS: readonly StepButton[] = [
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
];
const STEPS: Readonly<Partial<Record<EstateViewMode, readonly StepButton[]>>> = {
  overview: ORBIT_STEPS,
  plan: ORBIT_STEPS,
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
  // ▲ ▼ half a metre, ◀ ▶ 15°; the pairs strafe half a metre and look 10°.
  walk: [
    { step: 'forward', label: 'Step forward', icon: 'up', area: 'pu' },
    { step: 'turn-left', label: 'Turn left', icon: 'left', area: 'pl' },
    { step: 'back', label: 'Step back', icon: 'down', area: 'pd' },
    { step: 'turn-right', label: 'Turn right', icon: 'right', area: 'pr' },
    { step: 'left', label: 'Step left', icon: 'arrowLeft', area: 'a1' },
    { step: 'right', label: 'Step right', icon: 'arrowRight', area: 'b1' },
    { step: 'look-up', label: 'Look up', icon: 'tiltUp', area: 'a2' },
    { step: 'look-down', label: 'Look down', icon: 'tiltDown', area: 'b2' },
  ],
};

const STEP_GROUP: Readonly<Partial<Record<EstateViewMode, string>>> = {
  overview: 'Pan, zoom, orbit and tilt', fly: 'Move, climb and look', walk: 'Step, turn and look', plan: 'Pan, zoom, orbit and tilt',
};

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

/** 'Enter Blk 509 · 0.2 MB' from the pack's sizes (policy.ts enterLabel), or plain 'Enter' before the pack is read. */
export const enterText = (engine: EstateEngine, site: EstateSiteId): string => {
  const files = engine.siteFiles(site);
  return files ? enterLabel({ ...files, name: siteShortName(site) }) : `Enter ${siteShortName(site)}`;
};

/** A storey's height above L1 as the strip prints it: '+45.60', '±0.00'. */
export const fflText = (ffl: number): string => (Math.abs(ffl) < 0.005 ? '±0.00' : `${ffl > 0 ? '+' : '−'}${Math.abs(ffl).toFixed(2)}`);

const ROUTE_TEXT: Readonly<Record<Exclude<EstateWalkLevel['route'], null | 'here'>, string>> = {
  lift: 'by lift',
  stairs: 'by the stairs',
  'lift+stairs': 'by lift, then the stairs',
};

/**
 * The view, kept current from `location` events, the announcer's text for the
 * live region, and the last refusal or event notice (shown NOTICE_MS). Going
 * live says nothing: the first view is taken as heard.
 */
const useEngineView = (engine: EstateEngine, debug: boolean) => {
  const [view, setView] = React.useState<EstateView>(() => engine.getView());
  const [spoken, setSpoken] = React.useState('');
  const [notice, setNotice] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<ProgressState | null>(null);
  const [stats, setStats] = React.useState<EstateStatsEvent | null>(null);
  // Said through the same announcer, without the notice chip: for what the HUD itself does (a panel opening).
  const sayRef = React.useRef<(text: string) => void>(() => {});

  React.useEffect(() => {
    const announcer = new LocationAnnouncer();
    const first = engine.getView();
    setView(first);
    announcer.reset(first.location);
    let timer: ReturnType<typeof setTimeout> | null = null;
    let noticeTimer: ReturnType<typeof setTimeout> | null = null;
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
          else if (event.text && event.quiet) speak(announcer.say(event.text, nowMs()));
          else if (event.text) {
            speak(announcer.say(event.text, nowMs()));
            // Said, and shown: a refusal ("No lift or stair reaches RF") is news to a sighted visitor too.
            setNotice(event.text);
            if (noticeTimer !== null) clearTimeout(noticeTimer);
            noticeTimer = setTimeout(() => { noticeTimer = null; if (alive) setNotice(null); }, NOTICE_MS);
          }
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
    sayRef.current = (text: string) => { if (alive) speak(announcer.say(text, nowMs())); };
    return () => {
      alive = false;
      off();
      sayRef.current = () => {};
      if (timer !== null) clearTimeout(timer);
      if (noticeTimer !== null) clearTimeout(noticeTimer);
    };
  }, [engine, debug]);

  const say = React.useCallback((text: string) => sayRef.current(text), []);

  return { view, spoken, notice, progress, stats, say };
};

const stageOf = (rootRef: React.RefObject<HTMLDivElement | null>) => rootRef.current?.closest<HTMLElement>('[data-estate-stage]') ?? null;

/** Stage focus (the KEYS ACTIVE chip), and whether the stage has seen a finger (touch wording, the stick). */
const useStageInput = (rootRef: React.RefObject<HTMLDivElement | null>) => {
  const [active, setActive] = React.useState(false);
  const [touch, setTouch] = React.useState(false);
  const [coarse, setCoarse] = React.useState(false);
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
    // A coarse pointer anywhere (a tablet with a mouse too) shows the stick from the start.
    const query = typeof window.matchMedia === 'function' ? window.matchMedia('(any-pointer: coarse)') : null;
    const syncCoarse = () => setCoarse(query?.matches === true);
    syncCoarse();
    query?.addEventListener?.('change', syncCoarse);
    return () => {
      stage.removeEventListener('focus', sync);
      stage.removeEventListener('blur', sync);
      stage.removeEventListener('pointerdown', onPointer, { capture: true });
      query?.removeEventListener?.('change', syncCoarse);
    };
  }, [rootRef]);
  return { active, touch, coarse };
};

/** Where focus goes when a control inside a popover dies: whatever opened it (a HUD toggle, or the stage). */
type PopoverOpener = (popover: EstatePopover) => HTMLElement | null;

/**
 * A control that held focus and then left the DOM or was disabled drops focus
 * to the page; this hands it on instead (preventScroll): to the popover's
 * opener when it was inside one (its Close, a lift level, or Esc on one of its
 * controls), else to the stage. Only while focus really is nowhere (body, or
 * still the dead control), so it never takes focus from anything the visitor
 * chose. Checked after every commit.
 */
const useFocusRescue = (rootRef: React.RefObject<HTMLDivElement | null>, openerOf: PopoverOpener) => {
  const lastRef = React.useRef<{ el: HTMLElement; popover: EstatePopover | null } | null>(null);
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const onFocusIn = (event: FocusEvent) => {
      const el = event.target as HTMLElement;
      const popover = (el.closest?.('[data-estate-popover]')?.getAttribute('data-estate-popover') ?? null) as EstatePopover | null;
      lastRef.current = { el, popover };
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
    const opener = last.popover ? openerOf(last.popover) : null;
    if (opener?.isConnected && !(opener as HTMLButtonElement).disabled) opener.focus({ preventScroll: true });
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
 * Walk's strip starts under the top-right controls however they wrap: at an
 * 881 px stage they take two rows, and a fixed top ran the strip under KEYS
 * ACTIVE. The lowest control of the row (KEYS' help popover, drawn on a line of
 * its own, left out) sets --estate-strip-top on the HUD, re-measured whenever
 * the row or the HUD resizes. No React state: a resize re-renders nothing.
 */
const useStripTop = (rootRef: React.RefObject<HTMLDivElement | null>, rowRef: React.RefObject<HTMLDivElement | null>) => {
  React.useLayoutEffect(() => {
    const root = rootRef.current;
    const row = rowRef.current;
    if (!root || !row) return undefined;
    const measure = () => {
      const top = root.getBoundingClientRect().top;
      let bottom = 0;
      for (let i = 0; i < row.children.length; i += 1) {
        const child = row.children[i];
        if (child.classList.contains('wb-estate-popover-slot')) continue;
        bottom = Math.max(bottom, child.getBoundingClientRect().bottom - top);
      }
      if (bottom > 0) root.style.setProperty('--estate-strip-top', `${Math.ceil(bottom + 8)}px`);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    observer.observe(root);
    return () => observer.disconnect();
  }, [rootRef, rowRef]);
};

/** Bring the storey underfoot into the strip's view (it opened scrolled to RF, L1 hidden, in a 26-storey block). Only the strip scrolls. */
const scrollCurrentIntoStrip = (strip: HTMLElement) => {
  const here = strip.querySelector<HTMLElement>('[aria-current]');
  if (!here) return;
  const pad = 6;
  const top = here.offsetTop;
  const bottom = top + here.offsetHeight;
  if (top - pad < strip.scrollTop) strip.scrollTop = Math.max(0, top - pad);
  else if (bottom + pad > strip.scrollTop + strip.clientHeight) strip.scrollTop = bottom + pad - strip.clientHeight;
};

/**
 * Walk's storey strip (§8.5, §8.6 right): every storey of the building
 * underfoot, top down, 'RF +45.60 … L1 ±0.00', from the data. A button takes
 * the route the engine planned (one ride, the stair line, or a ride to the
 * highest served level then the stairs); the storey underfoot is current and
 * disabled; a storey nothing reaches stays focusable but aria-disabled, its
 * name says why, and pressing it has the engine refuse and say why aloud and
 * on screen (a disabled button is skipped by Tab, and its title needs a hover:
 * a keyboard-only visitor could never learn the reason). The storey underfoot
 * is scrolled into the strip's view. PlanStrip below is Overview's and Plan's.
 */
const StoreyStrip: React.FC<{
  engine: EstateEngine; walk: EstateWalkView; live: boolean; onPress: (event: React.MouseEvent) => void;
}> = ({ engine, walk, live, onPress }) => {
  const stripRef = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    if (stripRef.current) scrollCurrentIntoStrip(stripRef.current);
  }, [walk.site, walk.storey, walk.levels]);
  // …and again whenever the strip itself resizes (its top is set from the
  // measured row after it mounts, which shortened it under a storey just
  // scrolled into view).
  const mounted = walk.site !== null && walk.levels.length > 0;
  React.useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => scrollCurrentIntoStrip(strip));
    observer.observe(strip);
    return () => observer.disconnect();
  }, [mounted]);
  if (walk.site === null || walk.levels.length === 0) return null;
  const levels = [...walk.levels].reverse();
  return (
    <div className="wb-estate-strip" ref={stripRef} role="group" aria-label={`Storeys of ${siteSpokenName(walk.site)}`} data-estate-scroll data-estate-strip="walk">
      {levels.map((level) => {
        const here = level.route === 'here';
        const unreachable = level.route === null;
        const text = `${level.tag} ${fflText(level.ffl)}`;
        const name = here ? `${text}, here` : unreachable ? `${text}, ${level.reason ?? 'no route'}` : `${text}, ${ROUTE_TEXT[level.route as Exclude<EstateWalkLevel['route'], null | 'here'>]}`;
        return (
          <button
            key={level.tag}
            type="button"
            className="wb-estate-strip-btn"
            disabled={!live || here}
            aria-disabled={live && unreachable ? 'true' : undefined}
            aria-current={here ? 'location' : undefined}
            aria-label={name}
            title={unreachable ? level.reason ?? undefined : undefined}
            data-route={level.route ?? 'none'}
            // Unreachable: the engine refuses, and says why (aloud and in the notice chip).
            onClick={(event) => { if (engine.setStorey(level.tag) && !unreachable) onPress(event); }}
          >
            <span className="wb-estate-strip-tag">{level.tag}</span>
            <span className="wb-estate-strip-ffl">{fflText(level.ffl)}</span>
          </button>
        );
      })}
    </div>
  );
};


/**
 * The storey strip in Overview (the selected building's) and in Plan (the
 * planned one's), P6 (§8.6 right: "Overview: opens Plan"): every storey from
 * ids.ts' table, top down, each opening Plan on that storey; in Plan the one
 * shown is current and disabled. Its storeys come from the same table the
 * engine's FFLs are pinned to (tests/estate-ids.test.ts), so it needs no pack.
 */
const PlanStrip: React.FC<{
  engine: EstateEngine; site: EstateSiteId; current: EstateStoreyTag | null; live: boolean; onPress: (event: React.MouseEvent) => void;
}> = ({ engine, site, current, live, onPress }) => {
  const stripRef = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    if (stripRef.current) scrollCurrentIntoStrip(stripRef.current);
  }, [site, current]);
  const tags = ESTATE_SITE_STOREYS[site];
  const ffl = ESTATE_STOREY_FFL[site];
  const order = tags.map((tag, i) => ({ tag, ffl: ffl[i] })).reverse();
  return (
    <div
      className="wb-estate-strip"
      ref={stripRef}
      role="group"
      aria-label={current ? `Storeys of ${siteSpokenName(site)} in plan` : `Plan a storey of ${siteSpokenName(site)}`}
      data-estate-scroll
      data-estate-strip="plan"
    >
      {order.map((level) => {
        const here = level.tag === current;
        const text = `${level.tag} ${fflText(level.ffl)}`;
        return (
          <button
            key={level.tag}
            type="button"
            className="wb-estate-strip-btn"
            disabled={!live || here}
            aria-current={here ? 'location' : undefined}
            aria-label={here ? `${text}, in plan` : `${text}, plan view`}
            data-estate-plan-storey={level.tag}
            onClick={(event) => { if (engine.planView(site, level.tag)) onPress(event); }}
          >
            <span className="wb-estate-strip-tag">{level.tag}</span>
            <span className="wb-estate-strip-ffl">{fflText(level.ffl)}</span>
          </button>
        );
      })}
    </div>
  );
};

/**
 * Plan's room list (P6, §8.1 "the side-panel room list"), drawn in the side
 * panel above BUILDINGS through the window's side slot, with the HUD's props:
 * every room of the storey, grouped by flat, each a toggle that picks it (the
 * pick's outline on the floor, as a click or the arrows would), and Walk in
 * beside the list for the picked one. It subscribes to the engine itself and
 * draws nothing outside Plan. A new plan scrolls the side panel to it, and the
 * picked row is kept in view inside the list's own scroller: only those two
 * scrollers move, never the page.
 */
export function EstatePlanRooms({ engine, phase }: EstateHudProps): React.ReactElement | null {
  const [plan, setPlan] = React.useState<EstatePlanView | null>(() => engine.getView().plan ?? null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const sectionRef = React.useRef<HTMLElement>(null);
  // A new plan (building or storey) brings the list into the side panel's view:
  // the panel was likely scrolled to the building rows that led here.
  const shown = plan ? `${plan.site} ${plan.storey}` : null;
  React.useLayoutEffect(() => {
    const section = sectionRef.current;
    const side = section?.closest<HTMLElement>('.wb-estate-side');
    if (!shown || !section || !side) return;
    const top = section.getBoundingClientRect().top - side.getBoundingClientRect().top + side.scrollTop;
    if (top < side.scrollTop || top + 96 > side.scrollTop + side.clientHeight) side.scrollTop = Math.max(0, top - 8);
  }, [shown]);
  React.useEffect(() => {
    setPlan(engine.getView().plan ?? null);
    return engine.subscribe((event) => {
      if (event.type === 'location') setPlan(event.plan ?? null);
    });
  }, [engine]);
  React.useLayoutEffect(() => {
    const list = listRef.current;
    const picked = list?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!list || !picked) return;
    const top = picked.offsetTop - list.offsetTop;
    if (top < list.scrollTop) list.scrollTop = Math.max(0, top - 4);
    else if (top + picked.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + picked.offsetHeight + 4 - list.clientHeight;
  }, [plan?.room, plan?.rooms]);
  if (!plan) return null;
  const live = phase === 'live';
  const groups: Array<{ flat: string | null; items: Array<{ index: number; label: string }> }> = [];
  plan.rooms.forEach((room, index) => {
    const last = groups[groups.length - 1];
    if (last && last.flat === room.flat) last.items.push({ index, label: room.label });
    else groups.push({ flat: room.flat, items: [{ index, label: room.label }] });
  });
  const picked = plan.room >= 0 ? plan.rooms[plan.room] : null;
  const where = `${siteSpokenName(plan.site)}, ${plan.storey}`;
  return (
    <section className="wb-estate-rooms" ref={sectionRef} aria-label={`Rooms of ${where}`} data-estate-rooms>
      <p className="wb-estate-head">{`ROOMS — ${siteChipLabel(plan.site)} · ${plan.storey}`}</p>
      {!plan.ready && <p className="wb-estate-state">Loading the rooms…</p>}
      {picked && (
        <button type="button" className="btn btn-secondary wb-estate-site-act" disabled={!live} data-estate-rooms-walkin onClick={() => engine.walkIn()}>
          {`Walk into ${roomText(picked)}`}
        </button>
      )}
      {plan.ready && (
        <div className="wb-estate-rooms-list" ref={listRef} data-estate-scroll>
          {groups.map((group) => (
            <div key={group.flat ?? 'common'} className="wb-estate-rooms-group" role="group" aria-label={group.flat ?? 'Common areas'}>
              <p className="wb-estate-rooms-flat" aria-hidden="true">{group.flat ?? 'Common areas'}</p>
              {group.items.map((item) => (
                <button
                  key={item.index}
                  type="button"
                  className="wb-estate-room"
                  disabled={!live}
                  aria-pressed={item.index === plan.room}
                  data-estate-room={item.index}
                  onClick={() => engine.pickRoom(item.index === plan.room ? null : item.index)}
                >{item.label}</button>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** The 96 px touch stick (§8.7): its deflection, −1…1 each way (x strafe, y forward), goes to setStick; letting go releases it. */
const STICK_RADIUS_PX = 34;
const Stick: React.FC<{ engine: EstateEngine; live: boolean }> = ({ engine, live }) => {
  const knobRef = React.useRef<HTMLSpanElement>(null);
  const pointer = React.useRef<number | null>(null);
  const centre = React.useRef({ x: 0, y: 0 });
  const place = (dx: number, dy: number) => {
    const knob = knobRef.current;
    if (knob) knob.style.transform = dx === 0 && dy === 0 ? '' : `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
  };
  const end = (event?: React.PointerEvent) => {
    if (event && pointer.current !== event.pointerId) return;
    if (pointer.current === null) return;
    pointer.current = null;
    place(0, 0);
    engine.setStick(0, 0);
  };
  const move = (event: React.PointerEvent) => {
    if (pointer.current !== event.pointerId) return;
    let dx = event.clientX - centre.current.x;
    let dy = event.clientY - centre.current.y;
    const length = Math.hypot(dx, dy);
    if (length > STICK_RADIUS_PX) { dx *= STICK_RADIUS_PX / length; dy *= STICK_RADIUS_PX / length; }
    place(dx, dy);
    // `|| 0`: never a negative zero.
    engine.setStick(dx / STICK_RADIUS_PX || 0, -dy / STICK_RADIUS_PX || 0);
  };
  // Leaving the HUD (a mode change, the phase) lets the stick go.
  React.useEffect(() => () => { if (pointer.current !== null) engine.setStick(0, 0); }, [engine]);
  return (
    <div
      className="wb-estate-stick"
      // Pointer-only by nature; the step buttons beside it are its keyboard and screen-reader equivalent.
      aria-hidden="true"
      data-estate-stick
      onPointerDown={(event) => {
        if (!live || pointer.current !== null) return;
        event.preventDefault();
        const box = event.currentTarget.getBoundingClientRect();
        centre.current = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
        pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        move(event);
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <span className="wb-estate-stick-knob" ref={knobRef} />
    </div>
  );
};

export function EstateHud({ engine, phase, fullDetail, debug }: EstateHudProps): React.ReactElement {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const keysToggleRef = React.useRef<HTMLButtonElement>(null);
  const liftToggleRef = React.useRef<HTMLButtonElement>(null);
  const liftPanelRef = React.useRef<HTMLDivElement>(null);
  const topRowRef = React.useRef<HTMLDivElement>(null);
  // Who opened the lift panel: its chip, or the stage (Enter in Walk). Focus goes back there.
  const liftOpenedFrom = React.useRef<'chip' | 'stage'>('chip');
  const openerOf = React.useCallback<PopoverOpener>((popover) => {
    if (popover === 'help') return keysToggleRef.current;
    return liftOpenedFrom.current === 'stage' ? stageOf(rootRef) : liftToggleRef.current;
  }, []);
  const popoverId = React.useId();
  const liftPanelId = React.useId();
  const { view, spoken, notice, progress, stats, say } = useEngineView(engine, debug);
  const { active: keysActive, touch, coarse } = useStageInput(rootRef);
  const fullscreen = useFullscreen(rootRef);
  const mode = view.location.mode;
  const lock = useLockNotes(mode, view.pointerLocked, view.pointerUnlockedAtMs);
  const live = phase === 'live';
  const { features } = engine;
  useFocusRescue(rootRef, openerOf);
  useStripTop(rootRef, topRowRef);

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
  if (features.plan) modes.push('plan');

  const walking = mode === 'walk';
  const walk = walking ? view.walk ?? null : null;
  const firstPerson = mode === 'fly' || walking;
  const canCapture = firstPerson && (features.fly || features.walk);
  const selection = view.selection;
  const steps = STEPS[mode];
  const help = KEY_HELP[mode];
  const interior = view.interior ?? null;
  // An arc or a ride is under way: Walk's offers wait for it.
  const busy = view.flight || view.transition !== null;
  const showStick = walking && features.walk && (touch || coarse);
  const strip = walk && walk.site !== null && walk.levels.length > 0 ? walk : null;
  const planned = mode === 'plan' ? view.plan ?? null : null;
  // Overview's strip (the selection's storeys, each opening Plan) and Plan's own.
  const planSite = features.plan ? (planned ? planned.site : mode === 'overview' ? selection : null) : null;
  const pickedRoom = planned && planned.room >= 0 ? planned.rooms[planned.room] ?? null : null;

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
      <div className="wb-estate-popover" id={popoverId} role="region" aria-label={`${MODE_LABEL[mode]} keys`} data-estate-scroll data-estate-popover="help">
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

  // The lift and its served levels (§8.5): the chip opens the panel; the
  // storey underfoot is listed but disabled. The panel closes with a ride, a
  // step away from the landing, Esc, or Close.
  const lift = walk && !busy ? walk.lift : null;
  const liftOpen = lift !== null && view.popover === 'lift';
  const liftPanel = liftOpen && lift ? (
    <div className="wb-estate-popover wb-estate-lift" ref={liftPanelRef} id={liftPanelId} role="region" aria-label={`${lift.name}, levels`} data-estate-scroll data-estate-popover="lift">
      <div className="wb-estate-popover-head">
        <span>{lift.text}</span>
        <button type="button" className="wb-estate-hud-btn" disabled={!live} onClick={() => engine.setPopover(null)}>Close</button>
      </div>
      <div className="wb-estate-lift-levels">
        {[...lift.served].reverse().map((level) => (
          <button
            key={level}
            type="button"
            className="wb-estate-hud-btn"
            data-estate-level={level}
            disabled={!live || level === lift.current}
            aria-current={level === lift.current ? 'location' : undefined}
            aria-label={level === lift.current ? `${level}, here` : `${lift.name} to ${level}`}
            onClick={(event) => { if (engine.takeLift(level)) toStage(event); }}
          >{level}</button>
        ))}
      </div>
    </div>
  ) : null;
  const stair = walk && !busy ? walk.stair : null;

  // Enter on the stage opens the lift panel (the engine's activate) and says
  // nothing else, so focus goes into it, onto the nearest level up (else down),
  // and the panel is said; Esc, Close or a ride hands focus back to the stage
  // (openerOf). Opened from its chip, focus stays put and returns to the chip.
  const wasLiftOpen = React.useRef(false);
  React.useLayoutEffect(() => {
    const opened = liftOpen && !wasLiftOpen.current;
    wasLiftOpen.current = liftOpen;
    if (!opened || !lift) return;
    const stage = stageOf(rootRef);
    if (!stage || document.activeElement !== stage) {
      liftOpenedFrom.current = 'chip';
      return;
    }
    liftOpenedFrom.current = 'stage';
    const here = lift.served.indexOf(lift.current);
    const next = lift.served[here + 1] ?? lift.served[here - 1];
    const panel = liftPanelRef.current;
    const target = (next ? panel?.querySelector<HTMLButtonElement>(`[data-estate-level="${next}"]`) : null)
      ?? panel?.querySelector<HTMLButtonElement>('[data-estate-level]:not(:disabled)');
    target?.focus({ preventScroll: true });
    say(`${lift.name}: choose a level`);
  });

  // Walking outdoors (after Start at BS1, or out on the ground): the selection's Enter stays on offer (§8.6, mirrored).
  // (Not during Enter's arc, when the walk has not begun: view.walk is null then.)
  const outdoors = walking && walk !== null && walk.site === null && !view.flight;
  const showSelection = selection !== null && mode !== 'plan' && (!walking || outdoors);

  return (
    <div
      className="wb-estate-hud"
      ref={rootRef}
      data-phase={phase}
      data-mode={mode}
      data-transition={view.transition ?? undefined}
      data-flight={view.flight ? '' : undefined}
      data-strip={strip || planSite ? '' : undefined}
      data-stick={showStick ? '' : undefined}
    >
      <p className="sr-only" role="status">{spoken}</p>
      <p id={ESTATE_KEYS_DESC_ID} hidden>{KEY_SUMMARY[mode]}</p>

      <div className="wb-estate-hud-top">
        <div className="wb-estate-hud-col">
          <p className="wb-estate-chip wb-estate-chip-loc" data-estate-location>{chipText(view.location)}</p>
          {walking && features.walk && (
            <button
              type="button"
              className="wb-estate-hud-btn"
              disabled={!live}
              data-estate-exit
              aria-label={walk?.site ? `Exit ${siteSpokenName(walk.site)} to the overview` : 'Exit to the overview'}
              onClick={(event) => { if (engine.setMode('overview')) toStage(event); }}
            >{walk?.site ? `Exit ${siteShortName(walk.site)}` : 'Exit'}</button>
          )}
          {showSelection && selection && (
            <div className="wb-estate-chip wb-estate-chip-sel">
              <span className="wb-estate-chip-key">Selected</span>
              <span>{siteChipLabel(selection)}</span>
              {features.flyTo && !walking && (
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
                  data-estate-enter={selection}
                  onClick={(event) => { if (engine.enter(selection)) toStage(event); }}
                >{enterText(engine, selection)}</button>
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
          <div className="wb-estate-hud-row" ref={topRowRef}>
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
            <button
              type="button"
              className="wb-estate-hud-btn"
              disabled={!live}
              // Each name leads with the visible word (WCAG 2.5.3, label in name).
              aria-label={walking ? 'Start: back to where this walk began' : 'Home: the aerial view'}
              onClick={(event) => { if (engine.home()) toStage(event); }}
            >{walking ? 'Start' : 'Home'}</button>
            {features.walk && !walking && (
              <button
                type="button"
                className="wb-estate-hud-btn"
                disabled={!live}
                aria-label="Start at BS1, the bus stop"
                onClick={(event) => { if (engine.walkFrom('BS1')) toStage(event); }}
              >Start at BS1</button>
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
                // The stage takes the keys first, so W A S D move while the mouse is held.
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

      {strip && <StoreyStrip engine={engine} walk={strip} live={live} onPress={toStage} />}
      {!strip && planSite && <PlanStrip engine={engine} site={planSite} current={planned?.storey ?? null} live={live} onPress={toStage} />}

      {walk?.ride && <p className="wb-estate-chip wb-estate-ride" data-estate-ride>{walk.ride}</p>}

      <div className="wb-estate-hud-bottom">
        {planned && (
          <div className="wb-estate-chip wb-estate-chip-sel" data-estate-plan-room>
            <span className="wb-estate-chip-key">Room</span>
            <span>{pickedRoom ? roomText(pickedRoom) : planned.ready ? 'Pick a room' : 'Loading rooms…'}</span>
            {pickedRoom && (
              <button
                type="button"
                className="wb-estate-hud-btn"
                disabled={!live}
                data-estate-walkin
                aria-label={`Walk into ${roomText(pickedRoom)}`}
                onClick={(event) => { if (engine.walkIn()) toStage(event); }}
              >Walk in</button>
            )}
          </div>
        )}
        {planned && (
          <div className="wb-estate-chip wb-estate-chip-sel" data-estate-cut>
            <span className="wb-estate-chip-key">Cut</span>
            <span>{cutText(planned.cut)}</span>
            <button type="button" className="wb-estate-hud-btn" disabled={!live} aria-label="Lower the cut" onClick={() => engine.setCut(-1)}>▼</button>
            <button type="button" className="wb-estate-hud-btn" disabled={!live} aria-label="Raise the cut" onClick={() => engine.setCut(1)}>▲</button>
          </div>
        )}
        {stair && (
          <div className="wb-estate-chip wb-estate-chip-sel wb-estate-chip-offer" data-estate-stair>
            <span>{stair.label}</span>
            {stair.up && (
              <button
                type="button"
                className="wb-estate-hud-btn"
                disabled={!live}
                aria-label={`Take ${stair.label.toLowerCase()} up to ${stair.up}`}
                onClick={(event) => { if (engine.takeStairs(1)) toStage(event); }}
              >{`▲ ${stair.up}`}</button>
            )}
            {stair.down && (
              <button
                type="button"
                className="wb-estate-hud-btn"
                disabled={!live}
                aria-label={`Take ${stair.label.toLowerCase()} down to ${stair.down}`}
                onClick={(event) => { if (engine.takeStairs(-1)) toStage(event); }}
              >{`▼ ${stair.down}`}</button>
            )}
          </div>
        )}
        {lift && (
          <button
            ref={liftToggleRef}
            type="button"
            className="wb-estate-hud-btn wb-estate-chip-offer"
            disabled={!live}
            data-estate-lift
            aria-label={`${lift.name}: choose a level`}
            aria-expanded={liftOpen}
            aria-controls={liftOpen ? liftPanelId : undefined}
            onClick={() => engine.setPopover(liftOpen ? null : 'lift')}
          >{lift.text}</button>
        )}
        {liftPanel}
        {walk?.preparing && <p className="wb-estate-chip wb-estate-chip-lock" data-estate-preparing>Preparing walkway…</p>}
        {interior?.state === 'streaming' && <p className="wb-estate-chip wb-estate-chip-lock" data-estate-interior="streaming">Streaming interior…</p>}
        {interior?.state === 'failed' && interior.reason && (
          <p className="wb-estate-chip wb-estate-chip-lock" data-estate-interior="failed">{interior.reason}</p>
        )}
        {notice && notice !== interior?.reason && <p className="wb-estate-chip wb-estate-chip-lock" data-estate-notice>{notice}</p>}
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

      {showStick && <Stick engine={engine} live={live} />}

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
