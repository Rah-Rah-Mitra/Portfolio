import { describe, expect, it } from 'vitest';
import type { EstateViewMode } from '../lib/estate/frames';
import {
  HOLD_ACTIONS, HeldKeys, LOCK_RELEASE_GUARD_MS, STAGE_KEY_CODES, WALK_WHEEL_STEP, cancelsClimb, decideEscape,
  dragRole, inLockReleaseWindow, stageKey, wheelRole,
  type EstateInputState, type EstateKeyInput, type KeyTargetKind, type StageAction,
} from '../lib/estate/input';

// Plan §8.2 (the key table, key scope 1) and §8.3 (layered Esc, key scope 2,
// the pointer-lock guard). The DOM test checks the wiring with the real HUD;
// these rows are the rules it wires.

const MODES: EstateViewMode[] = ['overview', 'plan', 'walk', 'fly'];
const TARGETS: KeyTargetKind[] = ['stage', 'button', 'other'];
const IDLE: EstateInputState = { popoverOpen: false, transition: null, selection: false, pointerLocked: false, pointerUnlockedAtMs: null };

const key = (code: string, mode: EstateViewMode, extra: Partial<EstateKeyInput> = {}): EstateKeyInput =>
  ({ code, targetKind: 'stage', mode, state: IDLE, nowMs: 10_000, ...extra });
const action = (code: string, mode: EstateViewMode, extra: Partial<EstateKeyInput> = {}): StageAction | null =>
  stageKey(key(code, mode, extra)).action;
const esc = (mode: EstateViewMode, state: Partial<EstateInputState> = {}, extra: Partial<EstateKeyInput> = {}) =>
  decideEscape(key('Escape', mode, { ...extra, state: { ...IDLE, ...state } }));

describe('estate keys: the §8.2 table', () => {
  it('maps W/S and the arrows per mode', () => {
    expect(action('KeyW', 'overview')).toEqual({ kind: 'hold', hold: 'tilt-up' });
    expect(action('ArrowDown', 'overview')).toEqual({ kind: 'hold', hold: 'tilt-down' });
    expect(action('ArrowLeft', 'overview')).toEqual({ kind: 'hold', hold: 'rotate-left' });
    expect(action('ArrowUp', 'plan')).toEqual({ kind: 'cycle-room', step: -1 });
    expect(action('KeyS', 'plan')).toEqual({ kind: 'cycle-room', step: 1 });
    expect(action('ArrowRight', 'plan')).toEqual({ kind: 'hold', hold: 'rotate-right' });
    for (const mode of ['walk', 'fly'] as const) {
      expect(action('KeyW', mode)).toEqual({ kind: 'hold', hold: 'forward' });
      expect(action('ArrowUp', mode)).toEqual({ kind: 'hold', hold: 'forward' });
      expect(action('KeyS', mode)).toEqual({ kind: 'hold', hold: 'back' });
      expect(action('KeyA', mode)).toEqual({ kind: 'hold', hold: 'strafe-left' });
      expect(action('KeyD', mode)).toEqual({ kind: 'hold', hold: 'strafe-right' });
      expect(action('ArrowLeft', mode)).toEqual({ kind: 'hold', hold: 'turn-left' });
      expect(action('ShiftLeft', mode)).toEqual({ kind: 'hold', hold: 'boost' });
      expect(action('KeyL', mode)).toEqual({ kind: 'capture' });
    }
  });

  it('gives each mode its own extras, and the — cells nothing', () => {
    expect(action('KeyE', 'fly')).toEqual({ kind: 'hold', hold: 'up' });
    expect(action('Space', 'fly')).toEqual({ kind: 'hold', hold: 'up' });
    expect(action('KeyQ', 'fly')).toEqual({ kind: 'hold', hold: 'down' });
    expect(action('KeyC', 'fly')).toEqual({ kind: 'hold', hold: 'down' });
    expect(action('PageUp', 'walk')).toEqual({ kind: 'hold', hold: 'storey-up' });
    expect(action('PageDown', 'walk')).toEqual({ kind: 'hold', hold: 'storey-down' });
    expect(action('PageUp', 'plan')).toEqual({ kind: 'storey', step: 1 });
    expect(action('BracketLeft', 'plan')).toEqual({ kind: 'cut', step: -1 });
    expect(action('BracketRight', 'plan')).toEqual({ kind: 'cut', step: 1 });
    // The cut is a Plan-only uniform (§7.3): in Overview the brackets are not ours.
    expect(stageKey(key('BracketLeft', 'overview'))).toEqual({ preventDefault: false, action: null });
    expect(action('Home', 'overview')).toEqual({ kind: 'aerial' });
    expect(action('Home', 'walk')).toEqual({ kind: 'respawn' });
    // Home in Fly goes back to the aerial view, as the HUD's Home button does.
    expect(action('Home', 'fly')).toEqual({ kind: 'aerial' });
    for (const mode of ['overview', 'plan', 'walk'] as const) {
      expect(action('Enter', mode)).toEqual({ kind: 'activate' });
      expect(action('NumpadEnter', mode)).toEqual({ kind: 'activate' });
    }
    // '—' cells: no action.
    expect(action('Enter', 'fly')).toBeNull();
    expect(action('KeyQ', 'walk')).toBeNull();
    expect(action('BracketLeft', 'walk')).toBeNull();
    expect(action('KeyL', 'overview')).toBeNull();
    expect(action('ShiftLeft', 'overview')).toBeNull();
    expect(action('PageUp', 'overview')).toBeNull();
  });

  it('pans the overview from the keyboard and pitches Fly (additions to §8.2: every drag has a key, §8.7)', () => {
    expect(action('KeyA', 'overview')).toEqual({ kind: 'hold', hold: 'pan-left' });
    expect(action('KeyD', 'overview')).toEqual({ kind: 'hold', hold: 'pan-right' });
    // Shift turns the arrows (and W/S) into pans, as it turns a drag into one.
    const shift = { modifiers: { shift: true } };
    expect(action('ArrowUp', 'overview', shift)).toEqual({ kind: 'hold', hold: 'pan-ahead' });
    expect(action('KeyW', 'overview', shift)).toEqual({ kind: 'hold', hold: 'pan-ahead' });
    expect(action('ArrowDown', 'overview', shift)).toEqual({ kind: 'hold', hold: 'pan-back' });
    expect(action('ArrowLeft', 'overview', shift)).toEqual({ kind: 'hold', hold: 'pan-left' });
    expect(action('ArrowRight', 'overview', shift)).toEqual({ kind: 'hold', hold: 'pan-right' });
    // Unshifted they keep tilting and rotating; in Fly Shift stays the boost.
    expect(action('ArrowUp', 'overview')).toEqual({ kind: 'hold', hold: 'tilt-up' });
    expect(action('KeyW', 'fly', shift)).toEqual({ kind: 'hold', hold: 'forward' });
    expect(action('KeyR', 'fly')).toEqual({ kind: 'hold', hold: 'look-up' });
    expect(action('KeyF', 'fly')).toEqual({ kind: 'hold', hold: 'look-down' });
    expect(action('KeyR', 'overview')).toBeNull();
    // Shift chords are listed as their plain code.
    expect(STAGE_KEY_CODES.some((code) => code.includes('+'))).toBe(false);
    expect(STAGE_KEY_CODES).toContain('KeyR');
  });

  it('switches mode with 1 / 2 / 3 and announces with I, in every mode', () => {
    for (const mode of MODES) {
      if (mode !== 'overview') expect(action('Digit1', mode)).toEqual({ kind: 'mode', mode: 'overview' });
      if (mode !== 'walk') expect(action('Digit2', mode)).toEqual({ kind: 'mode', mode: 'walk' });
      if (mode !== 'fly') expect(action('Numpad3', mode)).toEqual({ kind: 'mode', mode: 'fly' });
      expect(action('KeyI', mode)).toEqual({ kind: 'announce' });
    }
    // The digit of the mode already on is handled but does nothing.
    expect(stageKey(key('Digit2', 'walk'))).toEqual({ preventDefault: true, action: null });
  });

  it('prevents the default of every key it handles, and of no key it passes', () => {
    for (const mode of MODES) {
      for (const code of STAGE_KEY_CODES) {
        const decision = stageKey(key(code, mode));
        if (decision.action !== null) expect(decision.preventDefault, `${mode} ${code}`).toBe(true);
      }
      expect(stageKey(key('KeyZ', mode)).preventDefault).toBe(false);
    }
  });

  it('swallows a scroll key a mode gives no job, so the sheet never slides under the stage', () => {
    expect(stageKey(key('Space', 'walk'))).toEqual({ preventDefault: true, action: null });
    expect(stageKey(key('Space', 'overview'))).toEqual({ preventDefault: true, action: null });
    expect(stageKey(key('PageDown', 'overview'))).toEqual({ preventDefault: true, action: null });
    expect(stageKey(key('PageUp', 'fly'))).toEqual({ preventDefault: true, action: null });
    for (const mode of MODES) expect(stageKey(key('End', mode)).preventDefault).toBe(true);
    // A key with no default and no job is simply passed.
    expect(stageKey(key('KeyQ', 'overview'))).toEqual({ preventDefault: false, action: null });
  });

  it('fires one-shots once per press, and lets holds and steps auto-repeat', () => {
    // Holding Enter must not fly to a building and then walk into it.
    expect(stageKey(key('Enter', 'overview', { repeat: true }))).toEqual({ preventDefault: true, action: null });
    expect(stageKey(key('KeyI', 'walk', { repeat: true }))).toEqual({ preventDefault: true, action: null });
    expect(stageKey(key('Digit3', 'walk', { repeat: true }))).toEqual({ preventDefault: true, action: null });
    expect(stageKey(key('KeyL', 'walk', { repeat: true })).action).toBeNull();
    expect(action('KeyW', 'walk', { repeat: true })).toEqual({ kind: 'hold', hold: 'forward' });
    expect(action('ArrowDown', 'plan', { repeat: true })).toEqual({ kind: 'cycle-room', step: 1 });
    expect(action('PageUp', 'plan', { repeat: true })).toEqual({ kind: 'storey', step: 1 });
    expect(action('BracketRight', 'plan', { repeat: true })).toEqual({ kind: 'cut', step: 1 });
  });

  it('returns shared frozen decisions, so a keydown allocates nothing', () => {
    const a = stageKey(key('KeyW', 'walk'));
    expect(stageKey(key('KeyW', 'walk'))).toBe(a);
    expect(stageKey(key('ArrowUp', 'fly')).action).toBe(stageKey(key('ArrowUp', 'walk')).action);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.action)).toBe(true);
    expect(stageKey(key('Tab', 'walk'))).toBe(stageKey(key('KeyZ', 'walk')));
  });

  it('cancels a stair climb on movement keys only', () => {
    for (const code of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight']) {
      expect(cancelsClimb(action(code, 'walk')), code).toBe(true);
    }
    for (const code of ['PageUp', 'PageDown', 'ShiftLeft', 'Enter', 'KeyI', 'Space']) {
      expect(cancelsClimb(action(code, 'walk')), code).toBe(false);
    }
  });
});

describe('estate keys: scope 1 (stage target only)', () => {
  it('never lets Enter or Space on a button reach a stage action', () => {
    for (const mode of MODES) {
      for (const target of ['button', 'other'] as const) {
        for (const code of ['Enter', 'NumpadEnter', 'Space', ...STAGE_KEY_CODES]) {
          // Not handled at all: no action and no preventDefault, so the button's
          // native activation (click on Enter, on Space keyup) still happens.
          expect(stageKey(key(code, mode, { targetKind: target })), `${target} ${mode} ${code}`)
            .toEqual({ preventDefault: false, action: null });
        }
      }
    }
  });

  it('never captures Tab, from any target, in any mode, shifted or not', () => {
    for (const mode of MODES) {
      for (const targetKind of TARGETS) {
        for (const shift of [false, true]) {
          expect(stageKey(key('Tab', mode, { targetKind, modifiers: { shift } }))).toEqual({ preventDefault: false, action: null });
        }
      }
      expect(decideEscape(key('Tab', mode, { state: { ...IDLE, popoverOpen: true } }))).toEqual({ consume: false, action: 'none' });
    }
  });

  it('leaves Escape to scope 2, so one press is never handled twice', () => {
    for (const mode of MODES) expect(stageKey(key('Escape', mode))).toEqual({ preventDefault: false, action: null });
  });

  it('passes Ctrl, Alt and Meta chords to the browser and keeps Shift', () => {
    for (const modifiers of [{ ctrl: true }, { alt: true }, { meta: true }, { ctrl: true, alt: true }]) {
      expect(stageKey(key('KeyW', 'walk', { modifiers }))).toEqual({ preventDefault: false, action: null });
      expect(stageKey(key('Digit1', 'walk', { modifiers }))).toEqual({ preventDefault: false, action: null });
      expect(stageKey(key('ArrowLeft', 'overview', { modifiers }))).toEqual({ preventDefault: false, action: null });
    }
    expect(action('KeyW', 'walk', { modifiers: { shift: true } })).toEqual({ kind: 'hold', hold: 'forward' });
  });

  it('matches physical keys by code, whatever the layout prints', () => {
    // AZERTY: the physical W A S D cluster is labelled Z Q S D but still sends
    // KeyW KeyA KeyS KeyD; its key labelled W sends KeyZ, which does nothing.
    expect(action('KeyW', 'walk')).toEqual({ kind: 'hold', hold: 'forward' });
    expect(action('KeyA', 'walk')).toEqual({ kind: 'hold', hold: 'strafe-left' });
    expect(action('KeyZ', 'walk')).toBeNull();
    // AZERTY's digit row needs Shift for digits; the code is Digit1 either way.
    expect(action('Digit1', 'fly', { modifiers: { shift: true } })).toEqual({ kind: 'mode', mode: 'overview' });
    // `key` is not part of the input at all; only names KeyboardEvent.code knows map.
    for (const code of ['w', 'W', 'ArrowUp ', '1', 'Esc', 'constructor', '__proto__', '']) {
      expect(action(code, 'walk'), JSON.stringify(code)).toBeNull();
    }
  });
});

describe('estate keys: layered Esc (scope 2)', () => {
  it('peels one layer per press, in order', () => {
    const everything: Partial<EstateInputState> = { popoverOpen: true, transition: 'climb', selection: true };
    expect(esc('walk', everything)).toEqual({ consume: true, action: 'close-popover' });
    expect(esc('walk', { ...everything, popoverOpen: false })).toEqual({ consume: true, action: 'cancel-transition' });
    expect(esc('walk', { selection: true })).toEqual({ consume: true, action: 'overview' });
    expect(esc('overview', { selection: true })).toEqual({ consume: true, action: 'clear-selection' });
    expect(esc('overview')).toEqual({ consume: false, action: 'none' });
  });

  it.each([
    ['overview', {}, false, 'none'],
    ['overview', { selection: true }, true, 'clear-selection'],
    ['overview', { popoverOpen: true }, true, 'close-popover'],
    ['plan', {}, true, 'exit-plan'],
    ['plan', { selection: true }, true, 'exit-plan'],
    ['plan', { popoverOpen: true }, true, 'close-popover'],
    ['walk', {}, true, 'overview'],
    ['walk', { transition: 'climb' }, true, 'cancel-transition'],
    ['walk', { transition: 'fade' }, true, 'cancel-transition'],
    ['walk', { popoverOpen: true, transition: 'fade' }, true, 'close-popover'],
    ['fly', {}, true, 'overview'],
    ['fly', { selection: true }, true, 'overview'],
  ] as const)('%s with %o → consume %s, %s', (mode, state, consume, act) => {
    expect(esc(mode, state)).toEqual({ consume, action: act });
  });

  it('gives a HUD or registry button the same answer as the stage: layers 1–4 consumed, otherwise passed', () => {
    const states: Array<Partial<EstateInputState>> = [
      {}, { selection: true }, { popoverOpen: true }, { transition: 'climb' }, { transition: 'fade', selection: true },
    ];
    for (const mode of MODES) {
      for (const state of states) {
        const onStage = esc(mode, state);
        for (const targetKind of TARGETS) expect(esc(mode, state, { targetKind }), `${targetKind} ${mode}`).toBe(onStage);
      }
    }
    // The only press that reaches the workbench (which minimises) is the bare Overview one.
    for (const targetKind of TARGETS) {
      expect(esc('overview', {}, { targetKind }).consume).toBe(false);
      expect(esc('walk', {}, { targetKind })).toEqual({ consume: true, action: 'overview' });
      expect(esc('overview', { popoverOpen: true }, { targetKind })).toEqual({ consume: true, action: 'close-popover' });
    }
  });

  it('leaves Plan and the selection in one press (§8.3 layer 4), so the next Esc minimises', () => {
    // The viewer applies exit-plan as: mode → overview, selection → none.
    expect(esc('plan', { selection: true })).toEqual({ consume: true, action: 'exit-plan' });
    expect(esc('overview', { selection: false })).toEqual({ consume: false, action: 'none' });
  });

  it('runs the e2e sequence: 3, Esc keeps the window, Esc again minimises', () => {
    expect(action('Digit3', 'overview')).toEqual({ kind: 'mode', mode: 'fly' });
    expect(esc('fly').consume).toBe(true);
    expect(esc('overview').consume).toBe(false);
  });

  it('swallows an auto-repeat, so holding Esc peels one layer and keeps the window', () => {
    expect(esc('walk', {}, { repeat: true })).toEqual({ consume: true, action: 'none' });
    expect(esc('overview', {}, { repeat: true })).toEqual({ consume: true, action: 'none' });
  });
});

describe('estate keys: the pointer-lock Escape guard', () => {
  const unlockedAt = 50_000;
  const after = (ms: number, mode: EstateViewMode = 'walk') =>
    esc(mode, { pointerUnlockedAtMs: unlockedAt }, { nowMs: unlockedAt + ms });

  it('ignores the Escape that released the lock, within 200 ms of the unlock', () => {
    expect(LOCK_RELEASE_GUARD_MS).toBe(200);
    for (const ms of [0, 1, 120, 199]) expect(after(ms), `+${ms} ms`).toEqual({ consume: true, action: 'none' });
    // Consumed, not passed: the workbench must not minimise on it either.
    expect(after(10, 'overview')).toEqual({ consume: true, action: 'none' });
  });

  it('acts on the next deliberate press', () => {
    expect(after(200)).toEqual({ consume: true, action: 'overview' });
    expect(after(450)).toEqual({ consume: true, action: 'overview' });
    expect(after(5_000, 'overview')).toEqual({ consume: false, action: 'none' });
  });

  it('measures either side of the unlock (event.timeStamp can read before the handler clock)', () => {
    expect(after(-30)).toEqual({ consume: true, action: 'none' });
    expect(after(-250)).toEqual({ consume: true, action: 'overview' });
    expect(inLockReleaseWindow(null, 0)).toBe(false);
    expect(inLockReleaseWindow(Number.NaN, 0)).toBe(false);
  });

  it('swallows an Escape that arrives while the lock is still held (it is the releasing key)', () => {
    for (const mode of MODES) {
      expect(esc(mode, { pointerLocked: true, popoverOpen: true })).toEqual({ consume: true, action: 'none' });
    }
  });
});

describe('estate keys: held keys', () => {
  it('holds an action until the last of its keys lets go', () => {
    const held = new HeldKeys();
    expect(held.press('KeyW', 'forward')).toBe(true);
    expect(held.press('KeyW', 'forward')).toBe(false); // auto-repeat
    expect(held.press('ArrowUp', 'forward')).toBe(true);
    expect(held.size).toBe(2);
    expect(held.release('KeyW')).toBe('forward');
    expect(held.has('forward')).toBe(true);
    expect(held.release('ArrowUp')).toBe('forward');
    expect(held.has('forward')).toBe(false);
    expect(held.release('ArrowUp')).toBeNull();
    expect(held.size).toBe(0);
  });

  it('reads opposing keys as an axis that cancels', () => {
    const held = new HeldKeys();
    expect(held.axis('back', 'forward')).toBe(0);
    held.press('KeyW', 'forward');
    expect(held.axis('back', 'forward')).toBe(1);
    held.press('KeyS', 'back');
    expect(held.axis('back', 'forward')).toBe(0);
    held.release('KeyW');
    expect(held.axis('back', 'forward')).toBe(-1);
  });

  it('releases everything at once on blur, window blur and visibilitychange', () => {
    const held = new HeldKeys();
    for (const [code, hold] of [['KeyW', 'forward'], ['KeyD', 'strafe-right'], ['ShiftLeft', 'boost'], ['PageUp', 'storey-up']] as const) {
      held.press(code, hold);
    }
    expect(held.releaseAll()).toBe(4);
    for (const hold of HOLD_ACTIONS) expect(held.has(hold)).toBe(false);
    expect(held.size).toBe(0);
    // A keyup that arrives after the blur finds nothing to release.
    expect(held.release('KeyW')).toBeNull();
    expect(held.releaseAll()).toBe(0);
  });

  it('moves a key to the action of its latest press without double counting', () => {
    const held = new HeldKeys();
    held.press('KeyW', 'forward');
    expect(held.press('KeyW', 'tilt-up')).toBe(true);
    expect(held.has('forward')).toBe(false);
    expect(held.has('tilt-up')).toBe(true);
    expect(held.release('KeyW')).toBe('tilt-up');
    expect(held.has('tilt-up')).toBe(false);
  });

  it('drives the stage listener end to end: keydown holds, keyup from anywhere releases', () => {
    const held = new HeldKeys();
    const down = (code: string, mode: EstateViewMode) => {
      const decided = stageKey(key(code, mode)).action;
      if (decided !== null && decided.kind === 'hold') held.press(code, decided.hold);
    };
    down('KeyW', 'walk');
    down('ShiftRight', 'walk');
    down('Enter', 'walk');
    expect(held.has('forward') && held.has('boost')).toBe(true);
    expect(held.size).toBe(2);
    held.release('ShiftRight');
    expect(held.has('boost')).toBe(false);
  });
});

describe('estate pointer and wheel roles', () => {
  it('maps drags per mode', () => {
    for (const mode of ['overview', 'plan'] as const) {
      expect(dragRole(mode, 0, false)).toBe('orbit');
      expect(dragRole(mode, 2, false)).toBe('pan');
      expect(dragRole(mode, 0, true)).toBe('pan');
    }
    for (const mode of ['walk', 'fly'] as const) {
      expect(dragRole(mode, 0, false)).toBe('look');
      expect(dragRole(mode, 2, false)).toBe('strafe');
      expect(dragRole(mode, 0, true)).toBe('strafe');
    }
    expect(dragRole('overview', 1, false)).toBeNull();
    expect(dragRole('walk', 3, false)).toBeNull();
  });

  it('maps the wheel (and a Ctrl+wheel pinch) per mode', () => {
    expect(wheelRole('overview')).toBe('zoom');
    expect(wheelRole('plan')).toBe('zoom');
    expect(wheelRole('walk')).toBe('step');
    expect(wheelRole('fly')).toBe('speed');
    expect(WALK_WHEEL_STEP).toBe(0.5);
  });
});
