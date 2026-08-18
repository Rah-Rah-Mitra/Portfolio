import { describe, expect, it } from 'vitest';
import {
  clampWindowBounds,
  closeDesktopApp,
  createWorkstationState,
  desktopAppFromSearch,
  focusDesktopApp,
  minimizeDesktopApp,
  openDesktopApp,
  parseWorkstationSession,
  reconcileWindowBounds,
  resolveCascadeBounds,
  resolveSnapBounds,
  resizeWindowBounds,
  showWorkstationDesktop,
  workstationApps,
  withDesktopApp,
} from '../lib/workstation';
import type { WorkstationEvent } from '../types';

const viewport = { width: 1440, height: 1000, taskbarHeight: 96, topBarHeight: 76 };

describe('retro optical workstation contract', () => {
  it('exposes the complete ten-application evidence map in recruiter order', () => {
    expect(workstationApps.map((app) => [app.id, app.label])).toEqual([
      ['home', 'Home / Dossier'],
      ['selected-work', 'Selected Work'],
      ['experience', 'Experience'],
      ['project-archive', 'Project Archive'],
      ['systems-lab', 'Systems Lab'],
      ['camera-lab', 'Camera Lab'],
      ['world-3d', '3D World'],
      ['capabilities', 'Capabilities'],
      ['proof-vault', 'Proof Vault'],
      ['resumes-contact', 'Resumes & Contact'],
    ]);
    expect(new Set(workstationApps.map((app) => app.id)).size).toBe(10);
    expect(workstationApps.every((app) => app.fallbackAnchor.startsWith('#'))).toBe(true);
    expect(workstationApps.map((app) => app.compactLabel)).toEqual([
      'Home', 'Work', 'Exp', 'Arc', 'Sys', 'Cam', '3D', 'Cap', 'Proof', 'CV',
    ]);
  });

  it('creates a home-focused session with no tool windows', () => {
    expect(createWorkstationState()).toEqual({
      focusedAppId: 'home',
      openAppIds: [],
      minimizedAppIds: [],
      windowStack: [],
      boundsByApp: {},
      snapByApp: {},
      controlOwner: 'document',
    });
  });

  it('opens one instance, restores it, and raises it to the top of the stack', () => {
    const initialBounds = { x: 90, y: 120, width: 760, height: 540 };
    const opened = openDesktopApp(createWorkstationState(), 'camera-lab', initialBounds);
    expect(opened).toEqual({
      focusedAppId: 'camera-lab',
      openAppIds: ['camera-lab'],
      minimizedAppIds: [],
      windowStack: ['camera-lab'],
      boundsByApp: { 'camera-lab': initialBounds },
      snapByApp: {},
      controlOwner: 'app',
    });

    const systems = openDesktopApp(opened, 'systems-lab', { x: 120, y: 140, width: 780, height: 560 });
    expect(systems.openAppIds).toEqual(['camera-lab', 'systems-lab']);
    expect(systems.minimizedAppIds).toEqual([]);
    expect(systems.windowStack).toEqual(['camera-lab', 'systems-lab']);
    expect(systems.focusedAppId).toBe('systems-lab');

    const raised = focusDesktopApp(systems, 'camera-lab');
    expect(raised.focusedAppId).toBe('camera-lab');
    expect(raised.windowStack).toEqual(['systems-lab', 'camera-lab']);

    const reopened = openDesktopApp(raised, 'camera-lab', { x: 1, y: 2, width: 3, height: 4 });
    expect(reopened).toEqual(raised);
  });

  it('minimizes a tool and focuses the next visible top window, then home', () => {
    const camera = openDesktopApp(createWorkstationState(), 'camera-lab', { x: 90, y: 120, width: 760, height: 540 });
    const systems = openDesktopApp(camera, 'systems-lab', { x: 120, y: 140, width: 780, height: 560 });
    const minimizedSystems = minimizeDesktopApp(systems, 'systems-lab');
    expect(minimizedSystems.focusedAppId).toBe('camera-lab');
    expect(minimizedSystems.openAppIds).toEqual(['camera-lab', 'systems-lab']);
    expect(minimizedSystems.minimizedAppIds).toEqual(['systems-lab']);
    expect(minimizedSystems.windowStack).toEqual(['camera-lab', 'systems-lab']);

    const minimizedCamera = minimizeDesktopApp(minimizedSystems, 'camera-lab');
    expect(minimizedCamera.focusedAppId).toBe('home');
    expect(minimizedCamera.minimizedAppIds).toEqual(['systems-lab', 'camera-lab']);
    expect(minimizedCamera.windowStack).toEqual(['camera-lab', 'systems-lab']);
    expect(minimizedCamera.controlOwner).toBe('document');
  });

  it('closes one tool instance and focuses the next visible window without discarding its geometry', () => {
    const camera = openDesktopApp(createWorkstationState(), 'camera-lab', { x: 90, y: 120, width: 760, height: 540 });
    const systems = openDesktopApp(camera, 'systems-lab', { x: 120, y: 140, width: 780, height: 560 });
    const closed = closeDesktopApp(systems, 'systems-lab');
    expect(closed.focusedAppId).toBe('camera-lab');
    expect(closed.openAppIds).toEqual(['camera-lab']);
    expect(closed.windowStack).toEqual(['camera-lab']);
    expect(closed.minimizedAppIds).toEqual([]);
    expect(closed.boundsByApp['systems-lab']).toEqual(systems.boundsByApp['systems-lab']);

    const home = closeDesktopApp(closed, 'camera-lab');
    expect(home.focusedAppId).toBe('home');
    expect(home.openAppIds).toEqual([]);
    expect(home.controlOwner).toBe('document');
  });

  it('restores a minimized tool through open and delegates home to the desktop view', () => {
    const camera = openDesktopApp(createWorkstationState(), 'camera-lab', { x: 90, y: 120, width: 760, height: 540 });
    const home = showWorkstationDesktop(camera);
    expect(home.focusedAppId).toBe('home');
    expect(home.openAppIds).toEqual(['camera-lab']);
    expect(home.minimizedAppIds).toEqual(['camera-lab']);
    expect(home.windowStack).toEqual(['camera-lab']);

    const restored = openDesktopApp(home, 'camera-lab');
    expect(restored.focusedAppId).toBe('camera-lab');
    expect(restored.minimizedAppIds).toEqual([]);
    expect(restored.windowStack).toEqual(['camera-lab']);
    expect(restored.boundsByApp['camera-lab']).toEqual(camera.boundsByApp['camera-lab']);
    expect(openDesktopApp(restored, 'home')).toEqual(showWorkstationDesktop(restored));
  });

  it('serializes valid app routes while preserving unrelated state and hashes', () => {
    expect(desktopAppFromSearch('?app=camera-lab')).toBe('camera-lab');
    expect(desktopAppFromSearch('?app=unknown')).toBeNull();
    expect(desktopAppFromSearch('?mode=scan&app=camera-lab')).toBeNull();
    expect(withDesktopApp('https://rahul-mitra.com/?ref=nus#project-churp', 'camera-lab')).toBe(
      'https://rahul-mitra.com/?ref=nus&app=camera-lab#project-churp',
    );
    expect(withDesktopApp('https://rahul-mitra.com/?ref=nus&app=camera-lab#project-churp', 'home')).toBe(
      'https://rahul-mitra.com/?ref=nus#project-churp',
    );
  });

  it('resolves a literal cascade from the work area and cycles after six slots', () => {
    expect(resolveCascadeBounds(0, viewport)).toEqual({ x: 36, y: 104, width: 980, height: 679 });
    expect(resolveCascadeBounds(4, viewport)).toEqual({ x: 180, y: 216, width: 980, height: 679 });
    expect(resolveCascadeBounds(5, viewport)).toEqual({ x: 48, y: 114, width: 980, height: 679 });
    expect(resolveCascadeBounds(20, viewport)).toEqual({ x: 84, y: 144, width: 980, height: 679 });
  });

  it('reconciles snapped windows and clamps floating windows without changing snap state', () => {
    const state = openDesktopApp(createWorkstationState(), 'camera-lab', { x: 1400, y: 900, width: 800, height: 600 });
    const snapped = {
      ...state,
      snapByApp: { 'camera-lab': 'right' as const },
      boundsByApp: { 'camera-lab': { x: 1, y: 2, width: 3, height: 4 } },
    };
    expect(reconcileWindowBounds(snapped, viewport).boundsByApp['camera-lab']).toEqual({ x: 720, y: 76, width: 720, height: 828 });

    const floating = {
      ...state,
      snapByApp: { 'camera-lab': 'floating' as const },
    };
    expect(reconcileWindowBounds(floating, viewport).boundsByApp['camera-lab']).toEqual({ x: 640, y: 304, width: 800, height: 600 });
  });

  it('keeps existing snap, clamp, and resize behavior inside the usable desktop', () => {
    expect(resolveSnapBounds('left', viewport)).toEqual({ x: 0, y: 76, width: 720, height: 828 });
    expect(resolveSnapBounds('right', viewport)).toEqual({ x: 720, y: 76, width: 720, height: 828 });
    expect(resolveSnapBounds('maximized', viewport)).toEqual({ x: 0, y: 76, width: 1440, height: 828 });
    expect(clampWindowBounds({ x: 1400, y: 900, width: 800, height: 600 }, viewport)).toEqual({ x: 640, y: 304, width: 800, height: 600 });
    expect(clampWindowBounds({ x: 40, y: 0, width: 800, height: 600 }, viewport).y).toBe(76);
    expect(resizeWindowBounds({ x: 80, y: 76, width: 760, height: 520 }, -500, -400, viewport)).toEqual({ x: 80, y: 76, width: 620, height: 420 });
    expect(resizeWindowBounds({ x: 80, y: 76, width: 760, height: 520 }, 2000, 2000, viewport)).toEqual({ x: 80, y: 76, width: 1360, height: 828 });
  });

  it('accepts focused and desktop-shown analytics events', () => {
    const focused: WorkstationEvent = { type: 'APP_FOCUSED', appId: 'camera-lab' };
    const shown: WorkstationEvent = { type: 'DESKTOP_SHOWN' };
    expect(focused).toEqual({ type: 'APP_FOCUSED', appId: 'camera-lab' });
    expect(shown).toEqual({ type: 'DESKTOP_SHOWN' });
  });

  it('validates v2 sessions and rejects duplicate or unknown tool records', () => {
    const valid = openDesktopApp(createWorkstationState(), 'camera-lab', { x: 40, y: 100, width: 760, height: 560 });
    expect(parseWorkstationSession(JSON.stringify(valid), null)).toEqual(valid);
    expect(parseWorkstationSession(JSON.stringify({ ...valid, windowStack: ['camera-lab', 'camera-lab'] }), null)).toEqual(createWorkstationState());
    expect(parseWorkstationSession(JSON.stringify({ ...valid, openAppIds: ['home'] }), null)).toEqual(createWorkstationState());
    expect(parseWorkstationSession(JSON.stringify({ ...valid, boundsByApp: { 'camera-lab': { x: Infinity, y: 2, width: 3, height: 4 } } }), null)).toEqual(createWorkstationState());
  });

  it('migrates only valid v1 geometry and begins with no open tools', () => {
    const migrated = parseWorkstationSession(null, JSON.stringify({
      activeAppId: 'camera-lab',
      minimizedAppIds: ['systems-lab'],
      boundsByApp: { 'camera-lab': { x: 48, y: 92, width: 820, height: 600 }, home: { x: 0, y: 0, width: 1, height: 1 } },
      snapByApp: { 'camera-lab': 'right', 'systems-lab': 'unknown' },
    }));
    expect(migrated).toEqual({
      ...createWorkstationState(),
      boundsByApp: { 'camera-lab': { x: 48, y: 92, width: 820, height: 600 } },
      snapByApp: { 'camera-lab': 'right' },
    });
  });
});
