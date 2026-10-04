import type { DesktopAppDefinition, DesktopAppId } from '../types';

// The eleven-window registry. Ids and anchors are a contract: the AI assistant,
// server/pageAgent.mjs, lib/workbench.ts and the deep links all key on them.
export const workstationApps: readonly DesktopAppDefinition[] = [
  { id: 'home', label: 'Home / Dossier', shortLabel: 'Home', kind: 'dossier', fallbackAnchor: '#home' },
  { id: 'selected-work', label: 'Selected Work', shortLabel: 'Work', kind: 'evidence', fallbackAnchor: '#work' },
  { id: 'experience', label: 'Experience', shortLabel: 'Experience', kind: 'evidence', fallbackAnchor: '#experience' },
  { id: 'project-archive', label: 'Project Archive', shortLabel: 'Archive', kind: 'evidence', fallbackAnchor: '#all-work' },
  { id: 'systems-lab', label: 'Systems Lab', shortLabel: 'Systems', kind: 'lab', fallbackAnchor: '#systems-lab' },
  { id: 'camera-lab', label: 'Camera Lab', shortLabel: 'Camera', kind: 'lab', fallbackAnchor: '#technical-lab' },
  { id: 'world-3d', label: '3D World', shortLabel: '3D World', kind: 'world', fallbackAnchor: '#world' },
  { id: 'capabilities', label: 'Capabilities', shortLabel: 'Capabilities', kind: 'evidence', fallbackAnchor: '#domains' },
  { id: 'proof-vault', label: 'Proof Vault', shortLabel: 'Proof', kind: 'proof', fallbackAnchor: '#proof' },
  { id: 'resumes-contact', label: 'Resumes & Contact', shortLabel: 'Resumes', kind: 'proof', fallbackAnchor: '#resumes' },
  { id: 'resume-builder', label: 'Resume Builder', shortLabel: 'Builder', kind: 'proof', fallbackAnchor: '#resume-builder' },
] as const;

const appIds = new Set<DesktopAppId>(workstationApps.map((app) => app.id));

export const isDesktopAppId = (value: string | null): value is DesktopAppId => Boolean(value && appIds.has(value as DesktopAppId));

export const desktopAppFromSearch = (search: string): DesktopAppId | null => {
  const params = new URLSearchParams(search);
  if (params.get('mode') === 'scan') return null;
  const app = params.get('app');
  return isDesktopAppId(app) ? app : null;
};
