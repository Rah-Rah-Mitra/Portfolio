import { describe, expect, it } from 'vitest';
import { desktopAppFromSearch, isDesktopAppId, workstationApps } from '../lib/workstation';

describe('workbench app registry', () => {
  it('exposes the complete eleven-application evidence map in recruiter order', () => {
    expect(workstationApps.map((app) => [app.id, app.label])).toEqual([
      ['home', 'Home / Dossier'],
      ['selected-work', 'Selected Work'],
      ['experience', 'Experience'],
      ['project-archive', 'Project Archive'],
      ['systems-lab', 'Systems Lab'],
      ['camera-lab', 'Camera Lab'],
      ['world-3d', 'Estate'],
      ['capabilities', 'Capabilities'],
      ['proof-vault', 'Proof Vault'],
      ['resumes-contact', 'Resumes & Contact'],
      ['resume-builder', 'Resume Builder'],
    ]);
    expect(new Set(workstationApps.map((app) => app.id)).size).toBe(11);
    expect(workstationApps.every((app) => app.fallbackAnchor.startsWith('#'))).toBe(true);
  });

  it('reads a valid ?app= route and lets ?mode=scan suppress it', () => {
    expect(desktopAppFromSearch('?app=camera-lab')).toBe('camera-lab');
    expect(desktopAppFromSearch('?app=home')).toBe('home');
    expect(desktopAppFromSearch('?app=unknown')).toBeNull();
    expect(desktopAppFromSearch('?mode=scan&app=camera-lab')).toBeNull();
    expect(isDesktopAppId('systems-lab')).toBe(true);
    expect(isDesktopAppId(null)).toBe(false);
  });
});
