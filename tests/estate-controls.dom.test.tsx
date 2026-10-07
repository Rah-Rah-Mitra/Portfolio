import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PerspectiveCamera, Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ESTATE_SITE_IDS, type EstateSiteId } from '../lib/estate/ids';
import type {
  EstateEngine, EstateEngineEvent, EstateEngineFeatures, EstateHudProps, EstatePlanView, EstateView,
} from '../components/workbench/estate/engineApi';
import { createControls, NORTH_PROPERTY } from '../components/workbench/estate/engine/controls';
import type { EstateCore } from '../components/workbench/estate/engine/core';
import type { ViewAccess } from '../components/workbench/estate/engine/navigation';
import { StaticRig, type CameraRig } from '../components/workbench/estate/engine/rig';
import { EstateHud, EstatePlanRooms } from '../components/workbench/estate/live/EstateHud';
import { ESTATE_SETTINGS_DEFAULTS, settingsFrom } from '../lib/estate/settings';

// The Estate viewer's controls and HUD in a DOM (plan §8.2, §8.3, §8.6, §8.7):
//  - the controls against a stand-in render core (a real three camera, the
//    real camera-controls on a real canvas element, no WebGL): key scope 1,
//    the wheel, picking by click and double-click, fly-to and its cut under
//    halted motion, Fly, the Esc layer it owns, pointer lock, idle, teardown;
//  - the real HUD against a stand-in engine: the chip, the live region and its
//    rules, the controls it offers by feature, focus, and the popover layer.
// The numbers behind them are tests/estate-controls.test.ts.

const INITIAL_VIEW: EstateView = Object.freeze({
  location: { site: null, storey: null, unit: null, room: null, mode: 'overview' },
  selection: null, transition: null, flight: false, popover: null, popoverOpen: false,
  moving: false, pointerLocked: false, pointerUnlockedAtMs: null, lean: false,
}) as EstateView;

/** 14 square blocks, 20 m on a side and 30 m tall, on a 4 × 4 grid 80 m apart. */
const SITES = ESTATE_SITE_IDS.map((id, i) => {
  const at: [number, number] = [60 + (i % 4) * 80, 60 + Math.floor(i / 4) * 80];
  return {
    id,
    at,
    footprint: [[-10, -10], [10, -10], [10, 10], [-10, 10]] as Array<[number, number]>,
    roofTop: 30,
    radius: 22,
    bounds: [[at[0] - 10, at[1] - 10, 0], [at[0] + 10, at[1] + 10, 30]] as [[number, number, number], [number, number, number]],
  };
});

const RECT = { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) };

interface Harness {
  host: HTMLElement;
  canvas: HTMLCanvasElement;
  camera: PerspectiveCamera;
  core: EstateCore;
  rig: () => CameraRig;
  view: () => EstateView;
  views: EstateView[];
  announce: ReturnType<typeof vi.fn>;
  setHalted: (on: boolean) => void;
  nav: ReturnType<typeof createControls>;
  /** Run rig frames at 60 Hz, advancing the clock. */
  frames: (n: number) => boolean;
}

let clock = 0;

const harness = (): Harness => {
  const host = document.createElement('figure');
  host.tabIndex = 0;
  host.setAttribute('data-estate-stage', '');
  document.body.appendChild(host);
  const canvas = document.createElement('canvas');
  canvas.setAttribute('data-estate-canvas', '');
  host.appendChild(canvas);
  canvas.getBoundingClientRect = () => RECT as DOMRect;
  host.getBoundingClientRect = () => RECT as DOMRect;
  const camera = new PerspectiveCamera(45, 800 / 600, 1, 2000);
  const poster = { position: [500, 400, 100] as [number, number, number], target: [200, 0, -200] as [number, number, number], fovDeg: 45 };
  const staticRig = new StaticRig(camera);
  staticRig.setPose(poster.position, poster.target, 45);
  staticRig.update();
  camera.updateMatrixWorld();
  let rig: CameraRig = staticRig;
  let halted = false;
  const core = {
    options: { host, motionHalted: () => halted, resume: undefined },
    pack: { estate: { extent: [0, 0, 400, 400] }, sites: SITES },
    camera,
    staticRig,
    isReady: true,
    isFrozen: false,
    isDisposed: false,
    invalidate: vi.fn(),
    setFocus: vi.fn(),
    setRig: vi.fn((next: CameraRig) => { rig = next; }),
    posterPose: () => poster,
  } as unknown as EstateCore;
  let view: EstateView = INITIAL_VIEW;
  const views: EstateView[] = [];
  const announce = vi.fn();
  const access: ViewAccess = {
    get: () => view,
    set: (patch) => {
      const location = patch.location ? { ...view.location, ...patch.location } : view.location;
      const popover = patch.popover !== undefined ? patch.popover : view.popover;
      const next = { ...view, ...patch, location, popover, popoverOpen: popover !== null } as EstateView;
      if (JSON.stringify(next) === JSON.stringify(view)) return false;
      view = next;
      views.push(next);
      return true;
    },
    announce,
  };
  const nav = createControls(core, access);
  const frames = (n: number) => {
    let moving = false;
    for (let i = 0; i < n; i += 1) {
      clock += 1000 / 60;
      moving = rig.update(1 / 60);
      camera.updateMatrixWorld();
    }
    return moving;
  };
  return {
    host, canvas, camera, core, rig: () => rig, view: () => view, views, announce, nav, frames,
    setHalted: (on) => { halted = on; },
  };
};

/** Where a building's middle lands on the 800 × 600 canvas. */
const screenOf = (camera: PerspectiveCamera, site: EstateSiteId) => {
  const s = SITES[ESTATE_SITE_IDS.indexOf(site)];
  const v = new Vector3(s.at[0], 15, -s.at[1]).project(camera);
  return { x: ((v.x + 1) / 2) * 800, y: ((1 - v.y) / 2) * 600 };
};

const key = (target: Element, code: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

const press = (target: Element, x: number, y: number, t: number, id = 1) => {
  target.dispatchEvent(new PointerEvent('pointerdown', { pointerId: id, isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
  window.dispatchEvent(new PointerEvent('pointerup', { pointerId: id, isPrimary: true, button: 0, clientX: x, clientY: y, bubbles: true }));
  void t;
};

beforeEach(() => {
  clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('the controls, before the first frame', () => {
  it('do nothing and listen to nothing', () => {
    const h = harness();
    expect(h.nav.flyTo?.('BLK_509')).toBe(false);
    expect(h.nav.setMode?.('fly')).toBe(false);
    expect(h.nav.home?.()).toBe(false);
    expect(key(h.host, 'KeyW').defaultPrevented).toBe(false);
    expect(h.core.setRig).not.toHaveBeenCalled();
    h.nav.dispose?.();
  });
});

describe('the controls, live', () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
    h.nav.ready?.();
  });
  afterEach(() => h.nav.dispose?.());

  it('take the camera over from the poster pose without moving it, and rest', () => {
    expect(h.core.setRig).toHaveBeenCalledTimes(1);
    expect(h.rig().mode).toBe('overview');
    const before = h.camera.position.clone();
    h.frames(3);
    expect(h.camera.position.distanceTo(before)).toBeLessThan(1e-6);
    expect(h.frames(1)).toBe(false);
    expect(h.rig().busy).toBe(false);
    expect(h.view().location).toMatchObject({ mode: 'overview', site: null });
    // The north arrow's angle is on the stage for the HUD.
    expect(h.host.style.getPropertyValue(NORTH_PROPERTY)).toMatch(/rad$/);
  });

  it('take keys only on the stage itself (scope 1), preventDefault what they handle, and release them on blur', () => {
    h.frames(3);
    const button = document.createElement('button');
    h.host.appendChild(button);
    expect(key(button, 'KeyW').defaultPrevented).toBe(false);
    expect(h.frames(1)).toBe(false);
    expect(key(h.host, 'Tab').defaultPrevented).toBe(false);
    expect(key(h.host, 'Escape').defaultPrevented).toBe(false);
    expect(key(h.host, 'KeyW', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(key(h.host, 'KeyW').defaultPrevented).toBe(true);
    expect(h.frames(2)).toBe(true); // tilting while held
    h.host.dispatchEvent(new FocusEvent('blur'));
    h.frames(30);
    expect(h.frames(1)).toBe(false);
    // An unmapped scroll key is swallowed, an unmapped letter passes.
    expect(key(h.host, 'PageDown').defaultPrevented).toBe(true);
    expect(key(h.host, 'KeyZ').defaultPrevented).toBe(false);
  });

  it('switch to Fly on 3, fly on W, and back to Overview on the Esc layer, keeping the pose', () => {
    h.setHalted(true);
    key(h.host, 'Digit3');
    expect(h.view().location.mode).toBe('fly');
    expect(h.rig().mode).toBe('fly');
    h.frames(1);
    expect(h.camera.fov).toBe(60);
    const start = h.camera.position.clone();
    key(h.host, 'KeyW');
    h.frames(30);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    const moved = h.camera.position.distanceTo(start);
    expect(moved).toBeGreaterThan(5);
    expect(h.frames(1)).toBe(false); // halted: stops dead
    expect(h.nav.capture?.()).toBe(false); // no requestPointerLock in jsdom
    expect(h.nav.escape?.('overview')).toBe(true);
    expect(h.view().location.mode).toBe('overview');
    expect(h.camera.fov).toBe(45);
    const at = h.camera.position.clone();
    h.frames(2);
    expect(h.camera.position.distanceTo(at)).toBeLessThan(1e-6);
    expect(h.nav.escape?.('overview')).toBe(false);
    expect(h.nav.escape?.('cancel-transition')).toBe(false);
  });

  it('fly to a building over 1.2 s, landing with its name; a cut while motion is halted', () => {
    expect(h.nav.flyTo?.('BLK_509')).toBe(true);
    expect(h.core.setFocus).toHaveBeenCalledWith('BLK_509');
    expect(h.view()).toMatchObject({ selection: 'BLK_509', flight: true });
    expect(h.rig().busy).toBe(true);
    h.frames(30);
    expect(h.view().flight).toBe(true);
    expect(h.view().location.site).toBeNull(); // not mid-flight
    h.frames(50);
    expect(h.view()).toMatchObject({ flight: false, location: { site: 'BLK_509' } });
    const target = h.rig().getTarget(new Vector3());
    expect(target.x).toBeCloseTo(SITES[8].at[0], 6);
    expect(target.z).toBeCloseTo(-SITES[8].at[1], 6);

    h.setHalted(true);
    const before = h.views.length;
    expect(h.nav.flyTo?.('NC_514')).toBe(true);
    // One location for the whole command, landed: no flight at all.
    expect(h.views.length).toBe(before + 1);
    expect(h.view()).toMatchObject({ selection: 'NC_514', flight: false, location: { site: 'NC_514' } });
  });

  it('let a drag-free wheel or a key take over from a flight where it is', () => {
    h.nav.flyTo?.('BLK_501');
    h.frames(10);
    const wheel = new WheelEvent('wheel', { deltaY: -100, clientX: 400, clientY: 300, bubbles: true, cancelable: true });
    h.canvas.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(h.view().flight).toBe(false);
  });

  it('dolly to the cursor on the wheel (always preventDefault), but leave a HUD panel that scrolls alone', () => {
    const distance = () => h.camera.position.distanceTo(h.rig().getTarget(new Vector3()));
    const d0 = distance();
    const wheel = new WheelEvent('wheel', { deltaY: -300, clientX: 400, clientY: 300, bubbles: true, cancelable: true });
    h.canvas.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    h.frames(120);
    expect(distance()).toBeLessThan(d0 * 0.8);
    const pinch = new WheelEvent('wheel', { deltaY: 40, ctrlKey: true, clientX: 400, clientY: 300, bubbles: true, cancelable: true });
    h.canvas.dispatchEvent(pinch);
    expect(pinch.defaultPrevented).toBe(true);
    expect(h.camera.fov).toBe(45); // a pinch dollies; it never zooms the lens
    const panel = document.createElement('div');
    panel.setAttribute('data-estate-scroll', '');
    h.host.appendChild(panel);
    const inPanel = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
    panel.dispatchEvent(inPanel);
    expect(inPanel.defaultPrevented).toBe(false);
  });

  it('select by click, clear on the ground, fly to on a double-click', () => {
    h.setHalted(true);
    h.nav.home?.(); // the whole estate in view
    h.frames(2);
    const p = screenOf(h.camera, 'BLK_506');
    press(h.canvas, p.x, p.y, 0);
    expect(h.view().selection).toBe('BLK_506');
    // Far corner: open ground.
    clock += 1000;
    press(h.canvas, 4, 596, 0);
    expect(h.view().selection).toBeNull();
    clock += 1000;
    const q = screenOf(h.camera, 'BLK_507');
    press(h.canvas, q.x, q.y, 0);
    press(h.canvas, q.x, q.y, 0);
    expect(h.view()).toMatchObject({ selection: 'BLK_507', location: { site: 'BLK_507' } });
    // A press released off the canvas decides nothing.
    clock += 1000;
    h.canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, isPrimary: true, button: 0, clientX: 799, clientY: 10, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, isPrimary: true, button: 0, clientX: 802, clientY: 10, bubbles: true }));
    expect(h.view().selection).toBe('BLK_507');
  });

  it('go Home to the poster pose, and step buttons zoom and orbit', () => {
    h.setHalted(true);
    h.nav.flyTo?.('BLK_501');
    expect(h.nav.home?.()).toBe(true);
    h.frames(1);
    expect(h.camera.position.x).toBeCloseTo(500, 3);
    expect(h.camera.position.y).toBeCloseTo(400, 3);
    const distance = () => h.camera.position.distanceTo(h.rig().getTarget(new Vector3()));
    const d0 = distance();
    expect(h.nav.walkStep?.('forward')).toBe(true);
    h.frames(1);
    expect(distance()).toBeCloseTo(d0 * 0.8, 3);
    expect(h.nav.walkStep?.('turn-left')).toBe(true);
    h.frames(1);
    expect(h.frames(1)).toBe(false);
  });

  it('track pointer lock for the Esc guard, and release it when leaving Fly', () => {
    h.setHalted(true);
    key(h.host, 'Digit3');
    const request = vi.fn(() => Promise.resolve());
    (h.canvas as unknown as { requestPointerLock: typeof request }).requestPointerLock = request;
    const exit = vi.fn();
    document.exitPointerLock = exit;
    let locked: Element | null = null;
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked });
    try {
      expect(key(h.host, 'KeyL').defaultPrevented).toBe(true);
      expect(request).toHaveBeenCalledTimes(1);
      locked = h.canvas;
      document.dispatchEvent(new Event('pointerlockchange'));
      expect(h.view().pointerLocked).toBe(true);
      expect(h.nav.capture?.()).toBe(false); // already held
      clock = 5000;
      locked = null;
      document.dispatchEvent(new Event('pointerlockchange'));
      expect(h.view()).toMatchObject({ pointerLocked: false, pointerUnlockedAtMs: 5000 });
      locked = h.canvas;
      document.dispatchEvent(new Event('pointerlockchange'));
      h.nav.setMode?.('overview');
      expect(exit).toHaveBeenCalled();
    } finally {
      delete (document as { pointerLockElement?: unknown }).pointerLockElement;
    }
  });

  it('pan the overview on A/D and Shift+arrows, pitch Fly on R/F, and go Home from Fly on the Home key', () => {
    h.setHalted(true);
    h.frames(2);
    const target = () => h.rig().getTarget(new Vector3());
    const t0 = target();
    key(h.host, 'KeyD');
    h.frames(10);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }));
    expect(target().distanceTo(t0)).toBeGreaterThan(5); // the target slid sideways
    expect(target().y).toBeCloseTo(t0.y, 6); // across the ground
    const t1 = target();
    key(h.host, 'ArrowUp', { shiftKey: true });
    h.frames(10);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp' }));
    expect(target().distanceTo(t1)).toBeGreaterThan(5);
    expect(h.frames(1)).toBe(false);
    key(h.host, 'Digit3');
    const pitch = () => h.camera.getWorldDirection(new Vector3()).y;
    const p0 = pitch();
    key(h.host, 'KeyF');
    h.frames(20);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' }));
    expect(pitch()).toBeLessThan(p0 - 0.1); // looked down
    expect(key(h.host, 'Home').defaultPrevented).toBe(true);
    expect(h.view().location.mode).toBe('overview');
    h.frames(1);
    expect(h.camera.position.x).toBeCloseTo(500, 3);
  });

  it('step buttons pan and tilt in Overview, and climb, strafe and look in Fly (every drag has a button)', () => {
    h.setHalted(true);
    h.frames(2);
    const target = () => h.rig().getTarget(new Vector3());
    const t0 = target();
    expect(h.nav.walkStep?.('right')).toBe(true);
    h.frames(1);
    expect(target().distanceTo(t0)).toBeGreaterThan(1);
    const t1 = target();
    expect(h.nav.walkStep?.('up')).toBe(true);
    h.frames(1);
    expect(target().distanceTo(t1)).toBeGreaterThan(1);
    const polar = () => Math.acos(new Vector3().subVectors(h.camera.position, target()).normalize().y);
    const a0 = polar();
    expect(h.nav.walkStep?.('look-up')).toBe(true);
    h.frames(1);
    expect(polar()).toBeGreaterThan(a0); // towards the horizon
    h.nav.setMode?.('fly');
    h.frames(1);
    const y0 = h.camera.position.y;
    expect(h.nav.walkStep?.('up')).toBe(true);
    h.frames(1);
    expect(h.camera.position.y).toBeGreaterThan(y0);
    const x0 = h.camera.position.clone();
    expect(h.nav.walkStep?.('left')).toBe(true);
    h.frames(1);
    expect(h.camera.position.distanceTo(x0)).toBeGreaterThan(0.5);
    const d0 = h.camera.getWorldDirection(new Vector3()).y;
    expect(h.nav.walkStep?.('look-down')).toBe(true);
    h.frames(1);
    expect(h.camera.getWorldDirection(new Vector3()).y).toBeLessThan(d0);
  });

  it('turn the north arrow’s own dial while moving, and write the stage property only at rest', () => {
    const arrow = document.createElement('span');
    arrow.setAttribute('data-estate-north', '');
    h.host.appendChild(arrow);
    h.frames(3);
    const rested = h.host.style.getPropertyValue(NORTH_PROPERTY);
    key(h.host, 'ArrowRight');
    h.frames(10);
    // Mid-orbit the stage's inherited property has not moved; the arrow has.
    expect(h.host.style.getPropertyValue(NORTH_PROPERTY)).toBe(rested);
    expect(arrow.style.transform).toMatch(/^rotate\(-?[\d.]+rad\)$/);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight' }));
    h.frames(30);
    expect(h.frames(1)).toBe(false);
    expect(h.host.style.getPropertyValue(NORTH_PROPERTY)).not.toBe(rested);
    expect(h.host.style.getPropertyValue(NORTH_PROPERTY)).toBe(arrow.style.transform.replace(/^rotate\((.*)\)$/, '$1'));
  });

  it('show the speed after a wheel in Fly', () => {
    key(h.host, 'Digit3');
    h.canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, deltaMode: 1, bubbles: true, cancelable: true }));
    expect(h.view().flySpeed).toBeGreaterThan(1);
  });

  it('freeze lands a flight at its end and drops held keys; dispose takes every listener off', () => {
    key(h.host, 'KeyW');
    h.nav.flyTo?.('BLK_512');
    h.nav.freeze?.();
    expect(h.view()).toMatchObject({ flight: false, location: { site: 'BLK_512' } });
    h.frames(40);
    expect(h.frames(1)).toBe(false);
    h.nav.dispose?.();
    h.nav.dispose?.();
    expect(key(h.host, 'KeyW').defaultPrevented).toBe(false);
    const wheel = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
    h.canvas.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);
    expect(h.host.style.getPropertyValue(NORTH_PROPERTY)).toBe('');
  });
});

describe('the controls, in Plan (P6)', () => {
  // Blk 509's stand-in has three storeys (L1 0, L2 3.6, RF 6.4) and two rooms on
  // L2; its nav file is in, its walk grid is not (walking in is refused).
  const B509 = ESTATE_SITE_IDS.indexOf('BLK_509');
  const TABLE = { tags: ['L1', 'L2', 'RF'], ffl: [0, 3.6, 6.4], typical: [false, true, false] };
  const sq = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as Array<[number, number]>;
  const navRoom = (name: string, label: string, flat: string | null, poly: Array<[number, number]>) => ({
    name, label, flat, z: 0, h: 2.6, ext: false, poly, area: 16, box: [poly[0][0], poly[0][1], poly[2][0], poly[2][1]],
  });
  const NAV = {
    site: 'BLK_509',
    storeys: TABLE.tags.map((tag, i) => ({ tag, ffl: TABLE.ffl[i], geom: TABLE.typical[i] ? 'typical' : 'special' })),
    rooms: [[], [navRoom('#02-101 LD', 'Living / Dining', '#02-101', sq(-8, -8, 0, 0)), navRoom('L2-CORR', 'Common corridor', null, sq(0, -8, 8, 0))], []],
    doors: [[], [], []], lifts: [], stairs: [], spawns: [], roomHeight: 2.6,
  };
  let h: Harness;
  let setPlan: ReturnType<typeof vi.fn>;
  let navReady = true;
  beforeEach(() => {
    h = harness();
    setPlan = vi.fn();
    navReady = true;
    Object.assign(h.core, {
      setPlan,
      interiors: {
        table: (i: number) => (i >= 0 ? TABLE : null),
        entry: (i: number, out: { state: string; reason: string | null }) => { out.state = i === B509 ? 'ready' : 'absent'; out.reason = i === B509 ? null : 'No interior.'; return out; },
        nav: (i: number) => (i === B509 && navReady ? NAV : null),
        walk: () => null,
        ground: () => null,
        indexOf: (site: EstateSiteId) => ESTATE_SITE_IDS.indexOf(site),
        floorQuery: (_x: number, _y: number, _z: number, out: { kind: string }) => { out.kind = 'none'; return out; },
        setStoreyHint: () => undefined,
      },
    });
    h.nav.ready?.();
  });
  afterEach(() => h.nav.dispose?.());

  it('opens a storey of the building: Plan mode, the cut at 1.2 m, its rooms listed, the building selected; a cut while halted', () => {
    h.setHalted(true);
    expect(h.nav.planView?.('BLK_509', 'L02' as never)).toBe(true);
    expect(h.rig().mode).toBe('plan');
    expect(setPlan).toHaveBeenLastCalledWith(B509, 1, 1.2);
    expect(h.core.setFocus).toHaveBeenLastCalledWith('BLK_509');
    const view = h.view();
    expect(view.location).toMatchObject({ mode: 'plan', site: 'BLK_509', storey: 'L2', unit: null, room: null });
    expect(view.selection).toBe('BLK_509');
    expect(view.plan).toMatchObject({ site: 'BLK_509', storey: 'L2', cut: 1.2, ready: true, room: -1 });
    expect(view.plan!.rooms.map((r) => r.name)).toEqual(['#02-101 LD', 'L2-CORR']);
    expect(view.flight).toBe(false); // halted: a cut
    // Looking down at 55° above the horizon, at the storey's floor.
    h.frames(1);
    const target = h.rig().getTarget(new Vector3());
    expect(target.y).toBeCloseTo(3.6, 6);
    const d = h.camera.position.clone().sub(target);
    expect(Math.atan2(Math.hypot(d.x, d.z), d.y)).toBeCloseTo((35 * Math.PI) / 180, 3);
    // A storey it does not have, or a building without an interior, is refused.
    expect(h.nav.planView?.('BLK_509', 'L9')).toBe(false);
    expect(h.nav.planView?.('BLK_501', 'L2')).toBe(false);
    expect(h.announce).toHaveBeenLastCalledWith(false, 'No interior.');
  });

  it('cycles rooms on ↑ ↓ (said, not shown), steps the cut on [ ], changes storey on PgUp / PgDn', () => {
    h.setHalted(true);
    h.nav.planView?.('BLK_509', 'L2');
    expect(key(h.host, 'ArrowDown').defaultPrevented).toBe(true);
    expect(h.view().plan?.room).toBe(0);
    expect(h.announce).toHaveBeenLastCalledWith(false, 'Unit 02-101, Living / Dining, 1 of 2', true);
    key(h.host, 'KeyS');
    expect(h.view().plan?.room).toBe(1);
    expect(h.announce).toHaveBeenLastCalledWith(false, 'Common corridor, 2 of 2', true);
    key(h.host, 'ArrowDown');
    expect(h.view().plan?.room).toBe(0); // wraps
    key(h.host, 'ArrowUp');
    expect(h.view().plan?.room).toBe(1);
    // The cut, within its limits.
    key(h.host, 'BracketRight');
    expect(setPlan).toHaveBeenLastCalledWith(B509, 1, 1.5);
    expect(h.view().plan?.cut).toBe(1.5);
    expect(h.announce).toHaveBeenLastCalledWith(false, 'Cut 1.5 metres above the floor', true);
    key(h.host, 'BracketLeft');
    key(h.host, 'BracketLeft');
    expect(h.view().plan?.cut).toBe(0.9);
    // PgUp: RF, the pick cleared, the cut kept, the target up one storey.
    key(h.host, 'PageUp');
    expect(h.view().plan).toMatchObject({ storey: 'RF', room: -1, cut: 0.9, rooms: [] });
    expect(setPlan).toHaveBeenLastCalledWith(B509, 2, 0.9);
    expect(h.rig().getTarget(new Vector3()).y).toBeCloseTo(6.4, 6);
    expect(key(h.host, 'PageUp').defaultPrevented).toBe(true); // nothing above the roof
    expect(h.view().plan?.storey).toBe('RF');
    expect(h.nav.setStorey?.('l1' as never)).toBe(true);
    expect(h.view().plan?.storey).toBe('L1');
  });

  it('picks a room from the list or clears it, and refuses to walk in until the walkway map is in', () => {
    h.setHalted(true);
    h.nav.planView?.('BLK_509', 'L2');
    expect(h.nav.pickRoom?.(1)).toBe(true);
    expect(h.view().plan?.room).toBe(1);
    expect(h.nav.pickRoom?.(1)).toBe(false);
    expect(h.nav.pickRoom?.(7)).toBe(false);
    expect(h.nav.pickRoom?.(null)).toBe(true);
    expect(h.view().plan?.room).toBe(-1);
    // Enter with no pick, then with one before the grid is here.
    key(h.host, 'Enter');
    expect(h.announce).toHaveBeenLastCalledWith(false, 'Pick a room to walk into.');
    h.nav.pickRoom?.(0);
    key(h.host, 'Enter');
    expect(h.announce).toHaveBeenLastCalledWith(false, 'Its walkway map is still loading.');
    expect(h.rig().mode).toBe('plan');
  });

  it('lists the rooms once the nav file arrives', () => {
    navReady = false;
    h.setHalted(true);
    h.nav.planView?.('BLK_509', 'L2');
    expect(h.view().plan).toMatchObject({ ready: false, rooms: [] });
    expect(h.nav.walkIn?.()).toBe(false);
    expect(h.announce).toHaveBeenLastCalledWith(false, 'Its rooms are still loading.');
    navReady = true;
    h.frames(1);
    expect(h.view().plan?.ready).toBe(true);
    expect(h.view().plan?.rooms).toHaveLength(2);
  });

  it('leaves on the Esc layer with the selection cleared (so the next Esc minimises), the cut off; Fly and Home leave it too', () => {
    h.setHalted(true);
    h.nav.planView?.('BLK_509', 'L2');
    const pose = h.camera.position.clone();
    expect(h.nav.escape?.('exit-plan')).toBe(true);
    expect(h.rig().mode).toBe('overview');
    expect(setPlan).toHaveBeenLastCalledWith(null);
    expect(h.view()).toMatchObject({ selection: null, plan: null });
    expect(h.view().location).toMatchObject({ mode: 'overview', storey: null });
    expect(h.camera.position.distanceTo(pose)).toBeLessThan(1e-6); // where it was
    expect(h.nav.escape?.('exit-plan')).toBe(false);
    // setMode('plan') plans the selection on its first typical storey.
    h.nav.flyTo?.('BLK_509');
    expect(h.nav.setMode?.('plan')).toBe(true);
    expect(h.view().plan?.storey).toBe('L2');
    expect(h.nav.setMode?.('fly')).toBe(true);
    expect(h.view().plan).toBeNull();
    expect(setPlan).toHaveBeenLastCalledWith(null);
    h.nav.setMode?.('overview');
    h.nav.setMode?.('plan');
    expect(h.nav.home?.()).toBe(true);
    expect(h.rig().mode).toBe('overview');
    expect(h.view().plan).toBeNull();
  });

  it('frames a room picked by ↑ ↓ or the list (closer only, tilt and heading kept); a click on the floor leaves the view alone', () => {
    h.setHalted(true);
    h.nav.planView?.('BLK_509', 'L2');
    h.frames(1);
    const site = SITES[B509];
    const orbitNow = () => {
      const target = h.rig().getTarget(new Vector3());
      const d = h.camera.position.clone().sub(target);
      return { target, distance: d.length(), polar: Math.atan2(Math.hypot(d.x, d.z), d.y), azimuth: Math.atan2(d.x, d.z) };
    };
    const opening = orbitNow();
    key(h.host, 'ArrowDown'); // the living room, (−8, −8)…(0, 0) on L2
    h.frames(1);
    const framed = orbitNow();
    expect(framed.target.x).toBeCloseTo(site.at[0] - 4, 6);
    expect(framed.target.y).toBeCloseTo(3.6, 6);
    expect(framed.target.z).toBeCloseTo(-(site.at[1] - 4), 6);
    expect(framed.distance).toBeLessThanOrEqual(opening.distance + 1e-6);
    expect(framed.polar).toBeCloseTo(opening.polar, 6);
    expect(framed.azimuth).toBeCloseTo(opening.azimuth, 6);
    // The handle's pick (the list's) frames too.
    expect(h.nav.pickRoom?.(1, false, true)).toBe(true);
    h.frames(1);
    expect(orbitNow().target.x).toBeCloseTo(site.at[0] + 4, 6);
    // A click on the living room's floor picks it where it is.
    const v = new Vector3(site.at[0] - 4, 3.6, -(site.at[1] - 4)).project(h.camera);
    const at = orbitNow();
    press(h.canvas, ((v.x + 1) / 2) * 800, ((1 - v.y) / 2) * 600, 0);
    h.frames(1);
    expect(h.view().plan?.room).toBe(0);
    expect(orbitNow().target.distanceTo(at.target)).toBeLessThan(1e-6);
    expect(orbitNow().distance).toBeCloseTo(at.distance, 6);
  });

  it('picks the room under a click on the floor', () => {
    h.setHalted(true);
    h.nav.planView?.('BLK_509', 'L2');
    h.frames(1);
    // Where the living room's middle (block-local −4, −4 on L2's floor) lands on the canvas.
    const site = SITES[B509];
    const v = new Vector3(site.at[0] - 4, 3.6, -(site.at[1] - 4)).project(h.camera);
    const x = ((v.x + 1) / 2) * 800;
    const y = ((1 - v.y) / 2) * 600;
    press(h.canvas, x, y, 0);
    expect(h.view().plan?.room).toBe(0);
    expect(h.announce).toHaveBeenLastCalledWith(false, 'Unit 02-101, Living / Dining, 1 of 2', true);
  });
});

describe('the controls, an L-shaped building', () => {
  // A wide L (arms 10 m deep) whose box centre lies 30 m from its outline, in
  // the courtyard, like BLK 510 and 511: the framing's target is off the building.
  const L: Array<[number, number]> = [[-40, -40], [40, -40], [40, -30], [-30, -30], [-30, 40], [-40, 40]];
  let saved: (typeof SITES)[number];
  let h: Harness;
  beforeEach(() => {
    saved = { ...SITES[13], footprint: SITES[13].footprint.slice(), bounds: SITES[13].bounds };
    const at = SITES[13].at;
    Object.assign(SITES[13], { footprint: L, radius: 58, bounds: [[at[0] - 40, at[1] - 40, 0], [at[0] + 40, at[1] + 40, 30]] });
    h = harness();
    h.nav.ready?.();
  });
  afterEach(() => {
    h.nav.dispose?.();
    Object.assign(SITES[13], saved);
  });

  it('names the building a flight landed on while the target stays there, and lets go once it moves', () => {
    h.setHalted(true);
    expect(h.nav.flyTo?.('NC_514')).toBe(true);
    expect(h.view().location.site).toBe('NC_514');
    h.frames(5);
    expect(h.view().location.site).toBe('NC_514');
    // Slow flight too: landing names it, and a settling frame does not undo it.
    h.setHalted(false);
    h.nav.home?.();
    h.frames(120);
    h.nav.flyTo?.('NC_514');
    h.frames(120);
    expect(h.view()).toMatchObject({ flight: false, location: { site: 'NC_514' } });
    // Moved away (Home, over the estate's middle): no longer named.
    h.setHalted(true);
    h.nav.home?.();
    h.frames(5);
    expect(h.view().location.site).toBeNull();
  });
});

// ---- the HUD -----------------------------------------------------------------------------

type Listener = (event: EstateEngineEvent) => void;
/** An event as the engine's emitter takes it: every member of the union, without its token. */
type Untokened<E> = E extends unknown ? Omit<E, 'token'> : never;
type HudEvent = Untokened<EstateEngineEvent>;

const FEATURES: EstateEngineFeatures = { overview: true, fly: true, flyTo: true, walk: false, enter: false, interiors: false, plan: false };

const fakeEngine = (features: EstateEngineFeatures = FEATURES) => {
  let view: EstateView = INITIAL_VIEW;
  const listeners = new Set<Listener>();
  const engine = {
    token: 1,
    features,
    getView: () => view,
    subscribe: (listener: Listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    setMode: vi.fn(() => true),
    flyTo: vi.fn(() => true),
    enter: vi.fn(() => false),
    select: vi.fn(() => true),
    home: vi.fn(() => true),
    setPopover: vi.fn(() => true),
    capture: vi.fn(() => true),
    walkStep: vi.fn(() => true),
    planView: vi.fn(() => true),
    pickRoom: vi.fn(() => true),
    walkIn: vi.fn(() => true),
    setCut: vi.fn(() => true),
    siteFiles: vi.fn(() => null),
    setSettings: vi.fn(() => true),
  } as unknown as EstateEngine;
  const emit = (event: HudEvent) => act(() => {
    for (const listener of listeners) listener({ ...event, token: 1 } as EstateEngineEvent);
  });
  const setView = (patch: Partial<EstateView>) => {
    view = { ...view, ...patch, popoverOpen: (patch.popover ?? view.popover) !== null } as EstateView;
    emit({ type: 'location', ...view });
  };
  return { engine, emit, setView, listeners };
};

const Stage: React.FC<{ hud: EstateHudProps }> = ({ hud }) => (
  <div id="world">
    <figure data-estate-stage tabIndex={0} aria-label="stage">
      <EstateHud {...hud} />
    </figure>
  </div>
);

describe('the HUD', () => {
  it('shows where the camera is without a live role, and speaks only what the announcer allows', () => {
    const { engine, setView, emit } = fakeEngine();
    render(<Stage hud={{ engine, phase: 'live', fullDetail: null, debug: false }} />);
    const chip = document.querySelector('[data-estate-location]')!;
    const status = screen.getByRole('status');
    expect(chip.textContent).toBe('SAMPLE TOWN N5 · OVERVIEW');
    expect(chip.getAttribute('role')).toBeNull();
    expect(status.textContent).toBe(''); // going live says nothing
    clock = 2000;
    setView({ location: { ...INITIAL_VIEW.location, site: 'BLK_509' }, selection: 'BLK_509' });
    expect(chip.textContent).toBe('BLK 509 · OVERVIEW');
    expect(status.textContent).toBe('Blk 509');
    clock = 4000;
    emit({ type: 'announce', full: true, text: null });
    expect(status.textContent).toBe('Blk 509, overview mode');
  });

  it('offers the modes in the build, Home, Keys and the step buttons, all named; Walk stays out until P5', () => {
    const { engine } = fakeEngine();
    render(<Stage hud={{ engine, phase: 'live', fullDetail: null, debug: false }} />);
    const group = screen.getByRole('group', { name: 'Camera mode' });
    const modes = [...group.querySelectorAll('button')].map((b) => b.textContent);
    expect(modes).toEqual(['Overview', 'Fly']);
    expect(screen.getByRole('button', { name: 'Overview' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Fly' }));
    expect(engine.setMode).toHaveBeenCalledWith('fly');
    fireEvent.click(screen.getByRole('button', { name: 'Home: the aerial view' }));
    expect(engine.home).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(engine.walkStep).toHaveBeenCalledWith('forward');
    expect(screen.queryByRole('button', { name: /Capture/ })).toBeNull(); // Overview: no lock
    for (const button of document.querySelectorAll('button')) {
      expect((button.getAttribute('aria-label') ?? button.textContent ?? '').trim(), button.outerHTML).not.toBe('');
    }
  });

  it('mirrors Fly to and Clear for the selection, and hands focus to the stage after a pointer click', () => {
    const { engine, setView } = fakeEngine();
    render(<Stage hud={{ engine, phase: 'live', fullDetail: null, debug: false }} />);
    expect(screen.queryByRole('button', { name: /Fly to/ })).toBeNull();
    setView({ selection: 'MSCP_513' });
    fireEvent.click(screen.getByRole('button', { name: 'Fly to Multi-storey car park 513' }), { detail: 1 });
    expect(engine.flyTo).toHaveBeenCalledWith('MSCP_513');
    expect(document.activeElement).toBe(document.querySelector('[data-estate-stage]'));
    // From the keyboard (detail 0) focus stays on the control.
    const clear = screen.getByRole('button', { name: 'Clear the selection' });
    clear.focus();
    fireEvent.click(screen.getByRole('button', { name: 'Fly to Multi-storey car park 513' }), { detail: 0 });
    expect(document.activeElement).toBe(clear);
    fireEvent.click(clear);
    expect(engine.select).toHaveBeenCalledWith(null);
  });

  it('reads KEYS ACTIVE only while the stage itself has focus', () => {
    const { engine } = fakeEngine();
    render(<Stage hud={{ engine, phase: 'live', fullDetail: null, debug: false }} />);
    const chip = document.querySelector('.wb-estate-chip-keys')!;
    expect(chip.textContent).toBe('Click or Tab to control');
    act(() => { (document.querySelector('[data-estate-stage]') as HTMLElement).focus(); });
    expect(chip.textContent).toBe('Keys active');
    act(() => { screen.getByRole('button', { name: 'Keys' }).focus(); });
    expect(chip.textContent).toBe('Click or Tab to control');
  });

  it('opens the keys popover from KEYS, and hands focus back when it closes under it', () => {
    const { engine, setView } = fakeEngine();
    render(<Stage hud={{ engine, phase: 'live', fullDetail: null, debug: false }} />);
    const toggle = screen.getByRole('button', { name: 'Keys' });
    fireEvent.click(toggle);
    expect(engine.setPopover).toHaveBeenCalledWith('help');
    setView({ popover: 'help' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const region = screen.getByRole('region', { name: 'Overview keys' });
    expect(region.textContent).toContain('Fly to the selected building');
    expect(region.hasAttribute('data-estate-scroll')).toBe(true);
    const close = screen.getByRole('button', { name: 'Close' });
    close.focus();
    fireEvent.click(close);
    expect(engine.setPopover).toHaveBeenLastCalledWith(null);
    setView({ popover: null });
    expect(screen.queryByRole('region')).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });

  it('in Fly offers CAPTURE and says when the mouse is held, released or refused', () => {
    const { engine, setView } = fakeEngine();
    render(<Stage hud={{ engine, phase: 'live', fullDetail: null, debug: false }} />);
    setView({ location: { ...INITIAL_VIEW.location, mode: 'fly' } });
    expect(screen.getByRole('button', { name: 'Fly forward' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Capture the mouse/ }));
    expect(engine.capture).toHaveBeenCalled();
    act(() => { document.dispatchEvent(new Event('pointerlockerror')); });
    expect(screen.getByText('Wait, then click Capture')).toBeTruthy();
    setView({ pointerLocked: true });
    expect(screen.getByText('Mouse captured · Esc releases it')).toBeTruthy();
    setView({ pointerLocked: false, pointerUnlockedAtMs: 10 });
    expect(screen.getByText('Mouse released: drag to look')).toBeTruthy();
  });

  it('shows the streaming line while detail downloads, the debug row, and lean mode’s offer', () => {
    const { engine, emit } = fakeEngine();
    const onLoad = vi.fn();
    render(<Stage hud={{ engine, phase: 'live', fullDetail: { label: 'Load full detail · +1.2 MB', onLoad }, debug: true }} />);
    emit({ type: 'progress', stage: 'streaming', loadedBytes: 50, totalBytes: 200, pending: 2, label: 'STREAMING BLK 509 FAÇADE' });
    expect(screen.getByText('STREAMING BLK 509 FAÇADE')).toBeTruthy();
    expect((document.querySelector('.wb-estate-hud-progress > span') as HTMLElement).style.width).toBe('25%');
    emit({ type: 'progress', stage: 'streaming', loadedBytes: 200, totalBytes: 200, pending: 0, label: null });
    expect(document.querySelector('.wb-estate-streaming')).toBeNull();
    emit({ type: 'stats', draws: 56, tris: 582841, programs: 6, frameMs: 2, tier: 'high', pixelRatio: 1, band: null, gpuBytes: 34 * 1024 * 1024, droppedPct: 1.25, cpuP95Ms: 3.4 });
    expect(document.querySelector('[data-estate-debug]')?.textContent).toBe('Dropped 1.3% · CPU p95 3.4 ms · 56 draws · 582,841 tris · 34.0 MB · 6 programs · high ×1');
    fireEvent.click(screen.getByRole('button', { name: 'Load full detail · +1.2 MB' }));
    expect(onLoad).toHaveBeenCalled();
  });

  it('keeps the KEYS chip one width whichever label it shows, so a press never reflows the row under the pointer', () => {
    const { engine } = fakeEngine();
    render(<Stage hud={{ engine, phase: 'live', fullDetail: null, debug: false }} />);
    const chip = document.querySelector<HTMLElement>('.wb-estate-chip-keys')!;
    // The other label is drawn invisibly in the same cell (index.css ::after).
    expect(chip.getAttribute('data-sizer')).toBe('Keys active');
    act(() => { (document.querySelector('[data-estate-stage]') as HTMLElement).focus(); });
    expect(chip.textContent).toBe('Keys active');
    expect(chip.getAttribute('data-sizer')).toBe('Click or Tab to control');
  });

  it('hands focus to the stage when the focused control goes: Clear, a lean offer taken, Capture', () => {
    const { engine, setView } = fakeEngine();
    const onLoad = vi.fn();
    const { rerender } = render(<Stage hud={{ engine, phase: 'live', fullDetail: { label: 'Load full detail · +1.0 MB', onLoad }, debug: false }} />);
    const stage = document.querySelector<HTMLElement>('[data-estate-stage]')!;
    setView({ selection: 'BLK_509' });
    const clear = screen.getByRole('button', { name: 'Clear the selection' });
    clear.focus();
    fireEvent.click(clear, { detail: 0 }); // from the keyboard too
    expect(document.activeElement).toBe(stage);
    // The lean offer leaves once taken, with focus on it.
    const offer = screen.getByRole('button', { name: 'Load full detail · +1.0 MB' });
    offer.focus();
    fireEvent.click(offer);
    rerender(<Stage hud={{ engine, phase: 'live', fullDetail: null, debug: false }} />);
    expect(document.activeElement).toBe(stage);
    // Capture gives the stage the keys first, then asks for the lock.
    setView({ location: { ...INITIAL_VIEW.location, mode: 'fly' } });
    const capture = screen.getByRole('button', { name: /Capture the mouse/ });
    capture.focus();
    vi.mocked(engine.capture).mockImplementation(() => {
      expect(document.activeElement).toBe(stage);
      return true;
    });
    fireEvent.click(capture);
    expect(engine.capture).toHaveBeenCalled();
    // Esc back to Overview removes Capture under focus: the stage again.
    capture.focus();
    setView({ location: { ...INITIAL_VIEW.location, mode: 'overview' } });
    expect(document.activeElement).toBe(stage);
  });

  it('describes the stage with a short key summary per mode, and draws the KEYS chip and prompt only while live', () => {
    const { engine, setView } = fakeEngine();
    const { rerender } = render(<Stage hud={{ engine, phase: 'live', fullDetail: null, debug: false }} />);
    const desc = document.getElementById('estate-keys-desc')!;
    expect(desc.hidden).toBe(true); // in the tree for aria-describedby, never drawn
    expect(desc.textContent).toMatch(/^Arrow keys rotate and tilt; A and D, or Shift with the arrows, pan;/);
    setView({ location: { ...INITIAL_VIEW.location, mode: 'fly' } });
    expect(desc.textContent).toMatch(/R and F look up and down/);
    expect(document.querySelector('.wb-estate-prompt')).not.toBeNull();
    rerender(<Stage hud={{ engine, phase: 'lost', fullDetail: null, debug: false }} />);
    expect(document.querySelector('.wb-estate-chip-keys')).toBeNull();
    expect(document.querySelector('.wb-estate-prompt')).toBeNull();
  });

  it('words the prompt for touch once a finger has been on the stage, and shows Fly’s speed', () => {
    const { engine, setView } = fakeEngine();
    render(<Stage hud={{ engine, phase: 'live', fullDetail: null, debug: false }} />);
    const stage = document.querySelector<HTMLElement>('[data-estate-stage]')!;
    expect(document.querySelector('.wb-estate-prompt')?.textContent).toMatch(/^Drag orbit · Right-drag pan/);
    act(() => { stage.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true })); });
    expect(document.querySelector('.wb-estate-prompt')?.textContent).toBe('Drag orbit · Two fingers pan and zoom · Tap select · Double-tap fly to');
    expect(document.querySelector('.wb-estate-chip-keys')?.textContent).toBe('Tap or Tab to control');
    setView({ location: { ...INITIAL_VIEW.location, mode: 'fly' }, flySpeed: 1.3225 });
    expect(document.querySelector('.wb-estate-prompt')?.textContent).toMatch(/^Speed ×1\.32 · /);
  });

  it('puts the KEYS popover next in tab order, right after KEYS', () => {
    const { engine, setView } = fakeEngine();
    render(<Stage hud={{ engine, phase: 'live', fullDetail: null, debug: false }} />);
    setView({ popover: 'help', location: { ...INITIAL_VIEW.location, mode: 'fly' } });
    const buttons = [...document.querySelectorAll('.wb-estate-hud-row button')].map((b) => b.textContent);
    expect(buttons.indexOf('Close')).toBe(buttons.indexOf('Keys') + 1);
    expect(buttons.indexOf('Capture')).toBeGreaterThan(buttons.indexOf('Close'));
  });

  it('opens SETTINGS from its toggle in every mode: named controls, values with units, changes sent as sanitised patches', () => {
    const { engine, setView, listeners } = fakeEngine();
    render(<Stage hud={{ engine, phase: 'live', fullDetail: null, debug: false }} />);
    const toggle = screen.getByRole('button', { name: 'Settings' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(engine.setPopover).toHaveBeenCalledWith('settings');
    // The engine's view has no settings yet: the panel shows the defaults.
    setView({ popover: 'settings' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const region = screen.getByRole('region', { name: 'Viewer settings' });
    expect(toggle.getAttribute('aria-controls')).toBe(region.id);
    expect(region.hasAttribute('data-estate-scroll')).toBe(true);
    const walk = screen.getByRole('slider', { name: 'Walk speed' });
    expect(walk.getAttribute('aria-valuetext')).toBe('1.6 metres per second, 4 with Shift');
    expect(screen.getByRole('slider', { name: 'Field of view' }).getAttribute('aria-valuetext')).toMatch(/^60 degrees vertical, \d+ degrees horizontal$/);
    expect(screen.getByRole('slider', { name: 'Fly speed' }).getAttribute('aria-valuetext')).toBe('1 times the usual flying speed');
    expect(screen.getByRole('slider', { name: 'Look sensitivity' }).getAttribute('aria-valuetext')).toBe('1 times');
    for (const name of ['Invert vertical look', 'Edge lines', 'Toon shading', 'Reduce camera motion', 'Performance readout']) {
      expect(screen.getByRole('button', { name }).getAttribute('aria-pressed'), name).toBe(name === 'Edge lines' ? 'true' : 'false');
    }
    for (const control of region.querySelectorAll('button, input')) {
      const label = control.id ? region.querySelector(`label[for="${control.id}"]`)?.textContent : null;
      const named = control.getAttribute('aria-label') || control.textContent || label || '';
      expect(named.trim(), control.outerHTML).not.toBe('');
    }
    // A slider moves by stops; a switch flips; the detail level is one of five.
    fireEvent.change(walk, { target: { value: '10' } });
    expect(engine.setSettings).toHaveBeenLastCalledWith({ walkSpeed: 2.5 });
    fireEvent.change(screen.getByRole('slider', { name: 'Field of view' }), { target: { value: '75' } });
    expect(engine.setSettings).toHaveBeenLastCalledWith({ fovDeg: 75 });
    fireEvent.click(screen.getByRole('button', { name: 'Toon shading' }));
    expect(engine.setSettings).toHaveBeenLastCalledWith({ toon: true });
    fireEvent.click(screen.getByRole('button', { name: 'Low' }));
    expect(engine.setSettings).toHaveBeenLastCalledWith({ detail: 'low' });
    fireEvent.click(screen.getByRole('button', { name: 'Restore defaults' }));
    expect(engine.setSettings).toHaveBeenLastCalledWith(ESTATE_SETTINGS_DEFAULTS);
    // The engine's answer is what the panel shows.
    setView({ settings: settingsFrom({ walkSpeed: 2.5, toon: true, detail: 'low' }) });
    expect(screen.getByRole('slider', { name: 'Walk speed' }).getAttribute('aria-valuetext')).toBe('2.5 metres per second, 6.25 with Shift');
    // What is shown is what is said, at every stop (1.25 once read "1.3").
    setView({ settings: settingsFrom({ walkSpeed: 1.25, toon: true, detail: 'low' }) });
    expect(document.querySelector('.wb-estate-settings output')?.textContent).toBe('1.25 m/s');
    setView({ settings: settingsFrom({ walkSpeed: 2.5, toon: true, detail: 'low' }) });
    expect(screen.getByRole('button', { name: 'Toon shading' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Low' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Auto' }).getAttribute('aria-pressed')).toBe('false');
    // Nothing was sent while rendering, and the HUD still listens once.
    expect(engine.setSettings).toHaveBeenCalledTimes(5);
    expect(listeners.size).toBe(1);
    // In Fly too.
    setView({ location: { ...INITIAL_VIEW.location, mode: 'fly' } });
    expect(screen.getByRole('region', { name: 'Viewer settings' })).toBeTruthy();
  });

  it('puts SETTINGS next in tab order after its toggle, keeps KEYS’ order, and hands focus back when it closes under it', () => {
    const { engine, setView } = fakeEngine();
    render(<Stage hud={{ engine, phase: 'live', fullDetail: null, debug: false }} />);
    setView({ popover: 'settings', location: { ...INITIAL_VIEW.location, mode: 'fly' } });
    const buttons = [...document.querySelectorAll('.wb-estate-hud-row button')].map((b) => b.textContent);
    expect(buttons.indexOf('Close')).toBe(buttons.indexOf('Settings') + 1);
    expect(buttons.indexOf('Settings')).toBeGreaterThan(buttons.indexOf('Keys'));
    expect(buttons.indexOf('Capture')).toBeGreaterThan(buttons.indexOf('Restore defaults'));
    const toggle = screen.getByRole('button', { name: 'Settings' });
    const toon = screen.getByRole('button', { name: 'Toon shading' });
    toon.focus();
    setView({ popover: null }); // Esc on the switch: the engine closes the layer
    expect(screen.queryByRole('region', { name: 'Viewer settings' })).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });

  it('shows the frame-stats row when the Performance readout is on, without the debug flag', () => {
    const { engine, setView, emit, listeners } = fakeEngine();
    render(<Stage hud={{ engine, phase: 'live', fullDetail: null, debug: false }} />);
    const stats = { type: 'stats', draws: 30, tris: 250000, programs: 6, frameMs: 2, tier: 'low', pixelRatio: 1, band: null, gpuBytes: 20 * 1024 * 1024 } as const;
    emit(stats);
    expect(document.querySelector('[data-estate-debug]')).toBeNull();
    setView({ settings: settingsFrom({ stats: true }) });
    emit(stats);
    expect(document.querySelector('[data-estate-debug]')?.textContent).toMatch(/30 draws · 250,000 tris · 20\.0 MB · 6 programs · low ×1$/);
    setView({ settings: settingsFrom({ stats: false }) });
    expect(document.querySelector('[data-estate-debug]')).toBeNull();
    expect(listeners.size).toBe(1);
    // The viewer's Reduce camera motion stills the HUD's own transitions.
    expect(document.querySelector('.wb-estate-hud')?.hasAttribute('data-reduce-motion')).toBe(false);
    setView({ settings: settingsFrom({ reduceMotion: true }) });
    expect(document.querySelector('.wb-estate-hud')?.hasAttribute('data-reduce-motion')).toBe(true);
  });

  it('takes the released-mouse line down after a few seconds', () => {
    vi.useFakeTimers();
    try {
      const { engine, setView } = fakeEngine();
      render(<Stage hud={{ engine, phase: 'live', fullDetail: null, debug: false }} />);
      setView({ location: { ...INITIAL_VIEW.location, mode: 'fly' }, pointerUnlockedAtMs: 10 });
      expect(screen.getByText('Mouse released: drag to look')).toBeTruthy();
      act(() => { vi.advanceTimersByTime(4100); });
      expect(screen.queryByText('Mouse released: drag to look')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('disables every control outside the live phase, and unsubscribes on unmount', () => {
    const { engine, listeners, setView } = fakeEngine();
    const { unmount } = render(<Stage hud={{ engine, phase: 'frozen', fullDetail: null, debug: false }} />);
    for (const button of document.querySelectorAll('.wb-estate-hud button')) expect((button as HTMLButtonElement).disabled).toBe(true);
    // The settings panel too, every switch and slider in it.
    setView({ popover: 'settings' });
    expect(document.querySelectorAll('.wb-estate-settings input').length).toBe(4);
    for (const control of document.querySelectorAll('.wb-estate-hud button, .wb-estate-hud input')) {
      expect((control as HTMLButtonElement | HTMLInputElement).disabled, control.outerHTML).toBe(true);
    }
    expect(listeners.size).toBe(1);
    unmount();
    expect(listeners.size).toBe(0);
  });
});

describe('the HUD in Plan (P6)', () => {
  const PLAN_FEATURES: EstateEngineFeatures = { ...FEATURES, walk: true, enter: true, interiors: true, plan: true };
  const ROOMS = Object.freeze([
    { name: '#05-101 LD', label: 'Living / Dining', flat: '#05-101' },
    { name: '#05-101 BED', label: 'Bedroom', flat: '#05-101' },
    { name: 'L5-CORR', label: 'Common corridor', flat: null },
  ]);
  const plan = (patch: Partial<EstatePlanView> = {}): EstatePlanView => ({ site: 'BLK_509', storey: 'L5', cut: 1.2, rooms: ROOMS, ready: true, room: -1, ...patch });
  const FAILED_ROOMS = 'Blk 509 cannot be entered: its rooms, stairs and lifts did not download. Reload the page to try again.';
  const inPlan = (patch: Partial<EstatePlanView> = {}): Partial<EstateView> => ({
    location: { site: 'BLK_509', storey: 'L5', unit: null, room: null, mode: 'plan' }, selection: 'BLK_509', plan: plan(patch),
  });

  it('offers Plan among the modes, and in Overview a strip of the selection’s storeys, each opening Plan there', () => {
    const { engine, setView } = fakeEngine(PLAN_FEATURES);
    render(<Stage hud={{ engine, phase: 'live', fullDetail: null, debug: false }} />);
    const modes = [...screen.getByRole('group', { name: 'Camera mode' }).querySelectorAll('button')].map((b) => b.textContent);
    expect(modes).toEqual(['Overview', 'Walk', 'Fly', 'Plan']);
    expect(document.querySelector('[data-estate-strip]')).toBeNull(); // nothing selected
    setView({ selection: 'BLK_509', location: { ...INITIAL_VIEW.location, site: 'BLK_509' } });
    const strip = screen.getByRole('group', { name: 'Plan a storey of Blk 509' });
    expect(strip.getAttribute('data-estate-strip')).toBe('plan');
    const names = [...strip.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'));
    // RF on top, L1 at the foot: 17 storeys from ids.ts' table.
    expect(names).toHaveLength(17);
    expect(names[0]).toBe('RF +45.60, plan view');
    expect(names[16]).toBe('L1 ±0.00, plan view');
    fireEvent.click(screen.getByRole('button', { name: 'L5 +12.00, plan view' }), { detail: 1 });
    expect(engine.planView).toHaveBeenCalledWith('BLK_509', 'L5');
    expect(document.activeElement).toBe(document.querySelector('[data-estate-stage]'));
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }));
    expect(engine.setMode).toHaveBeenCalledWith('plan');
  });

  it('in Plan shows the storey current on its strip, the room chip with Walk in, the cut with its buttons, and Overview’s steps', () => {
    const { engine, setView } = fakeEngine(PLAN_FEATURES);
    render(<Stage hud={{ engine, phase: 'live', fullDetail: null, debug: false }} />);
    setView(inPlan());
    expect(document.querySelector('[data-estate-location]')!.textContent).toBe('BLK 509 · L5 · PLAN');
    expect(screen.getByRole('group', { name: 'Storeys of Blk 509 in plan' })).toBeTruthy();
    const here = screen.getByRole('button', { name: 'L5 +12.00, in plan' }) as HTMLButtonElement;
    expect(here.disabled).toBe(true);
    expect(here.getAttribute('aria-current')).toBe('location');
    fireEvent.click(screen.getByRole('button', { name: 'L6 +14.80, plan view' }));
    expect(engine.planView).toHaveBeenCalledWith('BLK_509', 'L6');
    // No selection chip in Plan (its Clear would leave a plan of nothing).
    expect(screen.queryByRole('button', { name: 'Clear the selection' })).toBeNull();
    const room = document.querySelector('[data-estate-plan-room]')!;
    expect(room.textContent).toBe('RoomPick a room');
    expect(screen.queryByRole('button', { name: /^Walk into/ })).toBeNull();
    setView(inPlan({ room: 0 }));
    expect(room.textContent).toBe('Room#05-101 · Living / DiningWalk in');
    fireEvent.click(screen.getByRole('button', { name: 'Walk into #05-101 · Living / Dining' }));
    expect(engine.walkIn).toHaveBeenCalled();
    expect(document.querySelector('[data-estate-cut]')!.textContent).toContain('+1.20 M');
    fireEvent.click(screen.getByRole('button', { name: 'Raise the cut' }));
    expect(engine.setCut).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: 'Lower the cut' }));
    expect(engine.setCut).toHaveBeenCalledWith(-1);
    expect(screen.getByRole('group', { name: 'Pan, zoom, orbit and tilt' })).toBeTruthy();
    expect(document.getElementById('estate-keys-desc')!.textContent).toMatch(/^Up and down arrows cycle rooms; Enter walks into the picked room/);
    for (const button of document.querySelectorAll('button')) {
      expect((button.getAttribute('aria-label') ?? button.textContent ?? '').trim(), button.outerHTML).not.toBe('');
    }
    setView(inPlan({ ready: false, rooms: [] }));
    expect(room.textContent).toBe('RoomLoading rooms…');
    // Its nav file failed for good: the chip says so instead of loading for ever.
    setView({ interior: { site: 'BLK_509', state: 'failed', storey: 'L5', band: null, reason: FAILED_ROOMS } });
    expect(room.textContent).toBe('RoomRooms unavailable');
    // Another building's failure is not this plan's.
    setView({ interior: { site: 'BLK_510', state: 'failed', storey: null, band: null, reason: FAILED_ROOMS } });
    expect(room.textContent).toBe('RoomLoading rooms…');
  });

  it('says a pick or a cut without a notice chip, and shows a refusal', () => {
    const { engine, setView, emit } = fakeEngine(PLAN_FEATURES);
    render(<Stage hud={{ engine, phase: 'live', fullDetail: null, debug: false }} />);
    setView(inPlan());
    clock = 5000;
    emit({ type: 'announce', full: false, text: 'Unit 05-101, Living / Dining, 1 of 3', quiet: true });
    expect(screen.getByRole('status').textContent).toBe('Unit 05-101, Living / Dining, 1 of 3');
    expect(document.querySelector('[data-estate-notice]')).toBeNull();
    clock = 7000;
    emit({ type: 'announce', full: false, text: 'Its walkway map is still loading.' });
    expect(document.querySelector('[data-estate-notice]')!.textContent).toBe('Its walkway map is still loading.');
  });

  it('lists the storey’s rooms in the side panel, by flat, picking and walking in from there; nothing outside Plan', () => {
    const { engine, setView, listeners } = fakeEngine(PLAN_FEATURES);
    const { container, unmount } = render(<aside className="wb-estate-side"><EstatePlanRooms engine={engine} phase="live" fullDetail={null} debug={false} /></aside>);
    expect(container.querySelector('[data-estate-rooms]')).toBeNull();
    setView(inPlan());
    const section = screen.getByRole('region', { name: 'Rooms of Blk 509, L5' });
    expect(section.querySelector('.wb-estate-head')!.textContent).toBe('ROOMS — BLK 509 · L5');
    const groups = [...section.querySelectorAll('[role="group"]')].map((g) => [g.getAttribute('aria-label'), [...g.querySelectorAll('button')].map((b) => b.textContent)]);
    expect(groups).toEqual([['#05-101', ['Living / Dining', 'Bedroom']], ['Common areas', ['Common corridor']]]);
    fireEvent.click(screen.getByRole('button', { name: 'Bedroom' }));
    expect(engine.pickRoom).toHaveBeenCalledWith(1);
    setView(inPlan({ room: 1 }));
    expect(screen.getByRole('button', { name: 'Bedroom' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Bedroom' }));
    expect(engine.pickRoom).toHaveBeenLastCalledWith(null); // a second press clears it
    fireEvent.click(screen.getByRole('button', { name: 'Walk into #05-101 · Bedroom' }));
    expect(engine.walkIn).toHaveBeenCalled();
    // Until the nav file is in, the list waits; failed for good, it says why.
    setView(inPlan({ ready: false, rooms: [] }));
    expect(section.querySelector('.wb-estate-state')!.textContent).toBe('Loading rooms…');
    setView({ interior: { site: 'BLK_509', state: 'failed', storey: 'L5', band: null, reason: FAILED_ROOMS } });
    expect(screen.getByRole('region', { name: 'Rooms of Blk 509, L5' }).querySelector('.wb-estate-state')!.textContent).toBe(FAILED_ROOMS);
    setView({ interior: null });
    setView({ plan: null, location: { ...INITIAL_VIEW.location } });
    expect(container.querySelector('[data-estate-rooms]')).toBeNull();
    unmount();
    expect(listeners.size).toBe(0);
  });
});
