import { describe, expect, it } from 'vitest';
import {
  createWorkstationState,
  clampWindowBounds,
  desktopAppFromSearch,
  minimizeDesktopApp,
  openDesktopApp,
  resolveSnapBounds,
  resizeWindowBounds,
  workstationApps,
  withDesktopApp,
} from '../lib/workstation';

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

  it('opens one tool at a time and remembers prior modules as minimized', () => {
    const initial = createWorkstationState();
    const camera = openDesktopApp(initial, 'camera-lab');
    expect(camera.activeAppId).toBe('camera-lab');
    expect(camera.minimizedAppIds).toEqual(['home']);
    expect(camera.controlOwner).toBe('app');

    const systems = openDesktopApp(camera, 'systems-lab');
    expect(systems.activeAppId).toBe('systems-lab');
    expect(systems.minimizedAppIds).toEqual(['home', 'camera-lab']);

    const restoredHome = minimizeDesktopApp(systems, 'systems-lab');
    expect(restoredHome.activeAppId).toBe('home');
    expect(restoredHome.minimizedAppIds).toEqual(['camera-lab', 'systems-lab']);
    expect(restoredHome.controlOwner).toBe('document');
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

  it('resolves predictable half-screen and maximized bounds inside the usable desktop', () => {
    const viewport = { width: 1440, height: 1000, taskbarHeight: 96, topBarHeight: 76 };
    expect(resolveSnapBounds('left', viewport)).toEqual({ x: 0, y: 76, width: 720, height: 828 });
    expect(resolveSnapBounds('right', viewport)).toEqual({ x: 720, y: 76, width: 720, height: 828 });
    expect(resolveSnapBounds('maximized', viewport)).toEqual({ x: 0, y: 76, width: 1440, height: 828 });
  });

  it('clamps floating moves and resizes between the menu bar and application rail', () => {
    const viewport = { width: 1440, height: 1000, taskbarHeight: 96, topBarHeight: 76 };
    expect(clampWindowBounds({ x: 1400, y: 900, width: 800, height: 600 }, viewport)).toEqual({ x: 640, y: 304, width: 800, height: 600 });
    expect(clampWindowBounds({ x: 40, y: 0, width: 800, height: 600 }, viewport).y).toBe(76);
    expect(resizeWindowBounds({ x: 80, y: 76, width: 760, height: 520 }, -500, -400, viewport)).toEqual({ x: 80, y: 76, width: 620, height: 420 });
    expect(resizeWindowBounds({ x: 80, y: 76, width: 760, height: 520 }, 2000, 2000, viewport)).toEqual({ x: 80, y: 76, width: 1360, height: 828 });
  });
});
