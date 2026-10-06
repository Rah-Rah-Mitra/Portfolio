import type { EstateViewMode } from './frames';

// Keyboard and pointer rules for the Estate window (plan §8.2, §8.3). Pure: the
// listeners classify the event, ask here, and act on the answer, so the rules
// are pinned in node and the DOM test only has to check the wiring.
//
// Two key scopes:
//  1. stageKey: movement and commands, only when the event target IS the stage.
//     A focused HUD or registry button keeps its native Enter and Space, and Tab
//     always moves focus, whatever the target.
//  2. decideEscape: a native keydown listener on the window's section sees Esc
//     from any target inside it (stage, HUD, registry, titlebar) and peels one
//     layer per press. It calls stopPropagation only when the key is consumed,
//     so FieldWorkbench's own Esc handler, which minimises the focused window,
//     sees exactly the presses that pass. stageKey never handles Escape, or the
//     stage listener and the section listener would both act on one press.
//
// Keys match on KeyboardEvent.code, the physical key, never on `key`: W A S D
// are the same four keys on QWERTY, AZERTY (labelled Z Q S D) and Dvorak, and
// the digit row picks a mode even where its digits need Shift.
//
// The listener's side of the contract:
//  - targetKind is 'stage' when event.target is the stage element; 'button' for
//    any control with its own keyboard behaviour (button, a, summary, input,
//    select, textarea, [role=button]); 'other' for anything else in the section;
//  - nowMs and the pointer-unlock time must come from one clock (performance.now
//    or event.timeStamp, which share the time origin);
//  - every handled key gets preventDefault; a consumed Esc also stopPropagation.

export type KeyTargetKind = 'stage' | 'button' | 'other';

/** KeyboardEvent's shiftKey, ctrlKey, altKey and metaKey; an absent flag reads as up. */
export interface KeyModifiers { shift?: boolean; ctrl?: boolean; alt?: boolean; meta?: boolean }

/** What the Esc layers need from the viewer. */
export interface EstateInputState {
  /** A popover is open (lift panel, help). */
  popoverOpen: boolean;
  /** A stair climb or a lift fade is running. Fly-to and Enter arcs are not layers. */
  transition: 'climb' | 'fade' | null;
  /** A building is selected (registry row or click). */
  selection: boolean;
  /** document.pointerLockElement is the stage right now. */
  pointerLocked: boolean;
  /** When the last pointerlockchange to unlocked fired, on nowMs' clock; null if never. */
  pointerUnlockedAtMs: number | null;
}

/** One keydown, as the listeners see it. Each decision reads only the fields it names. */
export interface EstateKeyInput {
  /** KeyboardEvent.code: 'KeyW', 'ArrowUp', 'Digit1', 'Escape'. */
  code: string;
  targetKind: KeyTargetKind;
  modifiers?: KeyModifiers;
  /** KeyboardEvent.repeat: an auto-repeat of a key already down. */
  repeat?: boolean;
  mode: EstateViewMode;
  state: EstateInputState;
  nowMs: number;
}

export type StageKeyInput = Pick<EstateKeyInput, 'code' | 'targetKind' | 'modifiers' | 'repeat' | 'mode'>;
export type EscapeKeyInput = Pick<EstateKeyInput, 'code' | 'targetKind' | 'repeat' | 'mode' | 'state' | 'nowMs'>;

// ---- stage keys (scope 1) -----------------------------------------------------------

/**
 * Continuous actions: on from keydown to keyup (or a release-all), tracked by
 * HeldKeys. tilt and rotate are Overview's (rotate also Plan's); turn is Walk's
 * 90°/s and Fly's; up and down are Fly's; storey-up/-down is Walk's PgUp/PgDn,
 * which takes the offered stair or lift and, for stairs, keeps climbing storey
 * by storey while held; boost is Shift (Walk 1.6 → 4.0 m/s, Fly ×3).
 */
export const HOLD_ACTIONS = [
  'forward', 'back', 'strafe-left', 'strafe-right', 'turn-left', 'turn-right', 'up', 'down',
  'tilt-up', 'tilt-down', 'rotate-left', 'rotate-right', 'storey-up', 'storey-down', 'boost',
] as const;
export type HoldAction = (typeof HOLD_ACTIONS)[number];

/** The modes 1 / 2 / 3 select. Plan is entered from the storey strip or the registry. */
export type KeyMode = 'overview' | 'walk' | 'fly';
export type Step = -1 | 1;

export type StageAction =
  | { readonly kind: 'hold'; readonly hold: HoldAction }
  | { readonly kind: 'mode'; readonly mode: KeyMode }
  /** Plan: previous (↑, W) or next (↓, S) room; the name goes to the live region. */
  | { readonly kind: 'cycle-room'; readonly step: Step }
  /** Plan: PgUp / PgDn, one storey. */
  | { readonly kind: 'storey'; readonly step: Step }
  /** Plan only (the cut, uPlanCut, exists only there, §7.3): `[` lowers it, `]` raises it. */
  | { readonly kind: 'cut'; readonly step: Step }
  /** Enter. Overview: fly to, then enter, the selected building; Plan: walk into the picked room; Walk: use the offered lift or stair. */
  | { readonly kind: 'activate' }
  /** Home in Overview and Plan: the aerial view. */
  | { readonly kind: 'aerial' }
  /** Home in Walk: back to the spawn. */
  | { readonly kind: 'respawn' }
  /** L in Walk and Fly: request pointer lock (opt-in, C16). */
  | { readonly kind: 'capture' }
  /** I: speak the full location (announce.ts' full()). */
  | { readonly kind: 'announce' };

export interface KeyDecision {
  /** Call preventDefault. True for every handled key. */
  readonly preventDefault: boolean;
  /** What to do, or null: not ours (pass), or ours with nothing to do (swallowed). */
  readonly action: StageAction | null;
}

// Every decision is a frozen constant, so a keydown allocates nothing and the
// same input always returns the same object.
const decision = (preventDefault: boolean, action: StageAction | null): KeyDecision =>
  Object.freeze({ preventDefault, action: action && Object.freeze(action) });

/** Not ours: the browser's default (and native button activation) runs. */
const PASS = decision(false, null);
/** Ours, but nothing to do: an inert scroll key, a repeat of a one-shot, the mode already on. */
const SWALLOW = decision(true, null);

// One-shot commands ignore auto-repeat: holding Enter must not fly to a
// building and then walk into it, and holding I must not flood the live
// region. Steps (rooms, storeys in Plan, the cut) repeat like list navigation.
interface Entry { readonly decision: KeyDecision; readonly once: boolean }
const hold = (h: HoldAction): Entry => ({ decision: decision(true, { kind: 'hold', hold: h }), once: false });
const step = (kind: 'cycle-room' | 'storey' | 'cut', s: Step): Entry => ({ decision: decision(true, { kind, step: s }), once: false });
const once = (action: StageAction): Entry => ({ decision: decision(true, action), once: true });

const ACTIVATE = once({ kind: 'activate' });
const CAPTURE = once({ kind: 'capture' });

const EVERY_MODE: Array<[string, Entry]> = [
  ['Digit1', once({ kind: 'mode', mode: 'overview' })], ['Numpad1', once({ kind: 'mode', mode: 'overview' })],
  ['Digit2', once({ kind: 'mode', mode: 'walk' })], ['Numpad2', once({ kind: 'mode', mode: 'walk' })],
  ['Digit3', once({ kind: 'mode', mode: 'fly' })], ['Numpad3', once({ kind: 'mode', mode: 'fly' })],
  ['KeyI', once({ kind: 'announce' })],
];
const CUT: Array<[string, Entry]> = [['BracketLeft', step('cut', -1)], ['BracketRight', step('cut', 1)]];
const ENTER: Array<[string, Entry]> = [['Enter', ACTIVATE], ['NumpadEnter', ACTIVATE]];
const ROTATE: Array<[string, Entry]> = [['ArrowLeft', hold('rotate-left')], ['ArrowRight', hold('rotate-right')]];
const AERIAL = once({ kind: 'aerial' });
// Walk and Fly share their ground moves: W/S and ↑/↓ forward and back, A/D strafe, ←/→ turn.
const GROUND: Array<[string, Entry]> = [
  ['KeyW', hold('forward')], ['ArrowUp', hold('forward')], ['KeyS', hold('back')], ['ArrowDown', hold('back')],
  ['KeyA', hold('strafe-left')], ['KeyD', hold('strafe-right')],
  ['ArrowLeft', hold('turn-left')], ['ArrowRight', hold('turn-right')],
  ['ShiftLeft', hold('boost')], ['ShiftRight', hold('boost')],
  ['KeyL', CAPTURE],
];

// Map, not an object literal: a code such as 'constructor' must miss, not hit the prototype.
const table = (...groups: Array<Array<[string, Entry]>>): ReadonlyMap<string, Entry> => new Map(groups.flat());

// Plan §8.2, column by column. A code missing from a mode is that mode's '—'.
// The table's "Overview / Plan" column lists `[` / `]`, but the cut they move is
// a Plan-only uniform (§7.3), so in Overview they are not ours and pass.
const TABLES: Readonly<Record<EstateViewMode, ReadonlyMap<string, Entry>>> = {
  overview: table(EVERY_MODE, ENTER, ROTATE, [
    ['KeyW', hold('tilt-up')], ['ArrowUp', hold('tilt-up')], ['KeyS', hold('tilt-down')], ['ArrowDown', hold('tilt-down')],
    ['Home', AERIAL],
  ]),
  plan: table(EVERY_MODE, CUT, ENTER, ROTATE, [
    ['KeyW', step('cycle-room', -1)], ['ArrowUp', step('cycle-room', -1)],
    ['KeyS', step('cycle-room', 1)], ['ArrowDown', step('cycle-room', 1)],
    ['PageUp', step('storey', 1)], ['PageDown', step('storey', -1)],
    ['Home', AERIAL],
  ]),
  walk: table(EVERY_MODE, GROUND, ENTER, [
    ['PageUp', hold('storey-up')], ['PageDown', hold('storey-down')],
    ['Home', once({ kind: 'respawn' })],
  ]),
  // Q and C down, E and Space up: the table's "Q/E, Space/C → down/up" read by
  // the common fly convention (Space rises, C crouches). Read pairwise, the
  // table would make Space down and C up; Rahul confirms which, and #estate-keys
  // states it.
  fly: table(EVERY_MODE, GROUND, [
    ['KeyQ', hold('down')], ['KeyC', hold('down')], ['KeyE', hold('up')], ['Space', hold('up')],
  ]),
};

// Keys whose default scrolls the window body. On a focused stage that is never
// what the visitor meant (the sheet would slide the stage out from under the
// pointer), so where a mode gives one no job it is swallowed, not passed.
const SCROLL_KEYS: ReadonlySet<string> = new Set([
  'Space', 'PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

/** Every code some mode handles, for tests and the #estate-keys list. */
export const STAGE_KEY_CODES: readonly string[] = Object.freeze(
  [...new Set(Object.values(TABLES).flatMap((t) => [...t.keys()]))].sort(),
);

/**
 * Scope 1. A non-stage target, Tab, Escape and any Ctrl / Alt / Meta chord pass
 * untouched (browser and OS shortcuts keep working; Shift is Walk's and Fly's
 * boost and leaves the digit row usable on AZERTY). Otherwise the mode's table
 * decides; an unmapped scroll key is swallowed; a repeat of a one-shot, or the
 * digit of the mode already on, is swallowed.
 */
export const stageKey = (input: StageKeyInput): KeyDecision => {
  if (input.targetKind !== 'stage') return PASS;
  const { code } = input;
  if (code === 'Tab' || code === 'Escape') return PASS;
  const mods = input.modifiers;
  if (mods !== undefined && (mods.ctrl === true || mods.alt === true || mods.meta === true)) return PASS;
  const entry = TABLES[input.mode].get(code);
  if (entry === undefined) return SCROLL_KEYS.has(code) ? SWALLOW : PASS;
  const { action } = entry.decision;
  if (action !== null && action.kind === 'mode' && action.mode === input.mode) return SWALLOW;
  if (input.repeat === true && entry.once) return SWALLOW;
  return entry.decision;
};

const MOVEMENT: ReadonlySet<HoldAction> = new Set<HoldAction>([
  'forward', 'back', 'strafe-left', 'strafe-right', 'turn-left', 'turn-right', 'up', 'down',
]);

/** "Any movement key, drag or Esc cancels" a stair climb (§8.5); PgUp/PgDn and Shift do not. */
export const cancelsClimb = (action: StageAction | null): boolean =>
  action !== null && action.kind === 'hold' && MOVEMENT.has(action.hold);

// ---- held keys --------------------------------------------------------------------------

const HOLD_INDEX = Object.freeze(Object.fromEntries(HOLD_ACTIONS.map((h, i) => [h, i]))) as Readonly<Record<HoldAction, number>>;

/**
 * Which hold actions are down, per physical key. W and ↑ both hold forward, so
 * an action stays on until the last of its keys lets go. A key keeps the action
 * it had at keydown; the viewer calls releaseAll() on stage blur, window blur,
 * `visibilitychange` and every mode change, so nothing held in Walk carries
 * into Overview as a tilt, and a keyup lost to another target cannot leave the
 * walker running. Per-frame reads (has, axis) are array lookups.
 */
export class HeldKeys {
  private readonly byCode = new Map<string, number>();
  private readonly counts = new Uint8Array(HOLD_ACTIONS.length);

  /** keydown of a hold. True when the key was not already holding this action (false for auto-repeat). */
  press(code: string, action: HoldAction): boolean {
    const index = HOLD_INDEX[action];
    const previous = this.byCode.get(code);
    if (previous === index) return false;
    if (previous !== undefined) this.counts[previous] -= 1;
    this.byCode.set(code, index);
    this.counts[index] += 1;
    return true;
  }

  /** keyup, from any target and with any modifiers. The action the key held, or null. */
  release(code: string): HoldAction | null {
    const index = this.byCode.get(code);
    if (index === undefined) return null;
    this.byCode.delete(code);
    this.counts[index] -= 1;
    return HOLD_ACTIONS[index];
  }

  /** Lets every key go. Returns how many were down, so the caller knows whether to invalidate. */
  releaseAll(): number {
    const released = this.byCode.size;
    this.byCode.clear();
    this.counts.fill(0);
    return released;
  }

  has(action: HoldAction): boolean {
    return this.counts[HOLD_INDEX[action]] > 0;
  }

  /** −1, 0 or +1: both or neither held is 0, so opposing keys cancel. */
  axis(negative: HoldAction, positive: HoldAction): -1 | 0 | 1 {
    const n = this.counts[HOLD_INDEX[negative]] > 0;
    const p = this.counts[HOLD_INDEX[positive]] > 0;
    return n === p ? 0 : p ? 1 : -1;
  }

  /** Keys down. Non-zero keeps the frame loop running (§7.8). */
  get size(): number {
    return this.byCode.size;
  }
}

// ---- pointer and wheel ------------------------------------------------------------------

export type DragRole = 'orbit' | 'pan' | 'look' | 'strafe';

/**
 * The drag rows of §8.2. button is PointerEvent.button: 0 primary, 2 secondary;
 * a Shift-drag with the primary button is the secondary role. Any other button → null.
 */
export const dragRole = (mode: EstateViewMode, button: number, shift: boolean): DragRole | null => {
  if (button !== 0 && button !== 2) return null;
  const secondary = button === 2 || shift;
  if (mode === 'overview' || mode === 'plan') return secondary ? 'pan' : 'orbit';
  return secondary ? 'strafe' : 'look';
};

export type WheelRole = 'zoom' | 'step' | 'speed';

/**
 * The wheel row. The stage's wheel listener is non-passive and always calls
 * preventDefault, Ctrl+wheel included: a trackpad pinch arrives as Ctrl+wheel,
 * and passing it would zoom the page. A pinch plays the same role as the wheel.
 */
export const wheelRole = (mode: EstateViewMode): WheelRole =>
  mode === 'walk' ? 'step' : mode === 'fly' ? 'speed' : 'zoom';

/** Walk's wheel step, m per notch, forward or back. */
export const WALK_WHEEL_STEP = 0.5;

// ---- Escape (scope 2) ---------------------------------------------------------------------

/**
 * One layer per press (§8.3):
 *  1. close-popover      a popover is open (lift panel, help);
 *  2. cancel-transition  a climb or fade is running: cancel it and land at the nearest end;
 *  3. overview           Walk or Fly → Overview (from Walk, the 1.0 s reverse arc);
 *  4. exit-plan          Plan → Overview, and the selected building is cleared
 *                        with it: one layer, as §8.3 reads ("In Plan, or with a
 *                        building selected → clear it"), so the next Esc minimises;
 *     clear-selection    Overview with a building selected;
 *  5. none, passed       nothing left: the workbench minimises the window.
 * 'none' with consume true is a swallowed press: the key that released pointer
 * lock, or an auto-repeat.
 */
export type EscapeAction = 'close-popover' | 'cancel-transition' | 'overview' | 'exit-plan' | 'clear-selection' | 'none';

export interface EscapeDecision {
  /** preventDefault and stopPropagation: the workbench must not see this press. */
  readonly consume: boolean;
  readonly action: EscapeAction;
}

const escape = (consume: boolean, action: EscapeAction): EscapeDecision => Object.freeze({ consume, action });
const ESC_PASS = escape(false, 'none');
const ESC_SWALLOW = escape(true, 'none');
const ESC_POPOVER = escape(true, 'close-popover');
const ESC_TRANSITION = escape(true, 'cancel-transition');
const ESC_OVERVIEW = escape(true, 'overview');
const ESC_EXIT_PLAN = escape(true, 'exit-plan');
const ESC_CLEAR = escape(true, 'clear-selection');

/**
 * A browser may deliver the Escape that released pointer lock as a keydown
 * too: Firefox can do it after pointerlockchange, so a press this close to the
 * unlock is that key and is swallowed. Measured either side of the unlock,
 * because a keydown's timeStamp is taken at input and can read a few ms before
 * the change handler's clock.
 */
export const LOCK_RELEASE_GUARD_MS = 200;

export const inLockReleaseWindow = (unlockedAtMs: number | null, nowMs: number): boolean =>
  unlockedAtMs !== null && Math.abs(nowMs - unlockedAtMs) < LOCK_RELEASE_GUARD_MS;

/**
 * Scope 2. The same answer from every target in the section: an Esc on a HUD or
 * registry button peels the same layers as one on the stage. While the lock is
 * still held the press is the releasing key itself (it can arrive before
 * pointerlockchange), so it is swallowed too: that Esc never leaves Walk, and
 * never minimises the window. An auto-repeat is swallowed, so holding Esc peels
 * one layer, not all five and the window with them.
 */
export const decideEscape = (input: EscapeKeyInput): EscapeDecision => {
  if (input.code !== 'Escape') return ESC_PASS;
  const { state } = input;
  if (state.pointerLocked || inLockReleaseWindow(state.pointerUnlockedAtMs, input.nowMs)) return ESC_SWALLOW;
  if (input.repeat === true) return ESC_SWALLOW;
  if (state.popoverOpen) return ESC_POPOVER;
  if (state.transition !== null) return ESC_TRANSITION;
  if (input.mode === 'walk' || input.mode === 'fly') return ESC_OVERVIEW;
  if (input.mode === 'plan') return ESC_EXIT_PLAN;
  return state.selection ? ESC_CLEAR : ESC_PASS;
};
