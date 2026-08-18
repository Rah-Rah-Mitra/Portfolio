import type {
  DesktopAppDefinition,
  DesktopAppId,
  WindowBounds,
  WindowSnapState,
  WorkstationSessionState,
} from '../types';

export const workstationApps: readonly DesktopAppDefinition[] = [
  { id: 'home', label: 'Home / Dossier', shortLabel: 'Home', compactLabel: 'Home', description: 'Positioning, current proof, and primary actions.', kind: 'dossier', fallbackAnchor: '#home', iconAsset: '/workstation/icons/home.webp', loadStrategy: 'eager' },
  { id: 'selected-work', label: 'Selected Work', shortLabel: 'Work', compactLabel: 'Work', description: 'Five evidence-rich engineering systems.', kind: 'evidence', fallbackAnchor: '#work', iconAsset: '/workstation/icons/selected-work.webp', loadStrategy: 'eager' },
  { id: 'experience', label: 'Experience', shortLabel: 'Experience', compactLabel: 'Exp', description: 'Complete chronological professional record.', kind: 'evidence', fallbackAnchor: '#experience', iconAsset: '/workstation/icons/experience.webp', loadStrategy: 'eager' },
  { id: 'project-archive', label: 'Project Archive', shortLabel: 'Archive', compactLabel: 'Arc', description: 'All projects with search and domain filters.', kind: 'evidence', fallbackAnchor: '#all-work', iconAsset: '/workstation/icons/project-archive.webp', loadStrategy: 'eager' },
  { id: 'systems-lab', label: 'Systems Lab', shortLabel: 'Systems', compactLabel: 'Sys', description: 'Deterministic scheduling and spatial exhibits.', kind: 'lab', fallbackAnchor: '#systems-lab', iconAsset: '/workstation/icons/systems-lab.webp', loadStrategy: 'lazy' },
  { id: 'camera-lab', label: 'Camera Lab', shortLabel: 'Camera', compactLabel: 'Cam', description: 'Interactive camera geometry and optics.', kind: 'lab', fallbackAnchor: '#technical-lab', iconAsset: '/workstation/icons/camera-lab.webp', loadStrategy: 'lazy' },
  { id: 'world-3d', label: '3D World', shortLabel: '3D World', compactLabel: '3D', description: 'The shared optical test bench.', kind: 'world', fallbackAnchor: '#world', iconAsset: '/workstation/icons/world-3d.webp', loadStrategy: 'lazy' },
  { id: 'capabilities', label: 'Capabilities', shortLabel: 'Capabilities', compactLabel: 'Cap', description: 'Methods linked directly to supporting proof.', kind: 'evidence', fallbackAnchor: '#domains', iconAsset: '/workstation/icons/capabilities.webp', loadStrategy: 'eager' },
  { id: 'proof-vault', label: 'Proof Vault', shortLabel: 'Proof', compactLabel: 'Proof', description: 'Distinctions, credentials, and evidence links.', kind: 'proof', fallbackAnchor: '#proof', iconAsset: '/workstation/icons/proof-vault.webp', loadStrategy: 'eager' },
  { id: 'resumes-contact', label: 'Resumes & Contact', shortLabel: 'Resumes', compactLabel: 'CV', description: 'Role-targeted resumes and direct contact.', kind: 'proof', fallbackAnchor: '#resumes', iconAsset: '/workstation/icons/resumes-contact.webp', loadStrategy: 'eager' },
] as const;

const appIds = new Set<DesktopAppId>(workstationApps.map((app) => app.id));

export const isDesktopAppId = (value: string | null): value is DesktopAppId => Boolean(value && appIds.has(value as DesktopAppId));

export const createWorkstationState = (): WorkstationSessionState => ({
  activeAppId: 'home',
  minimizedAppIds: [],
  boundsByApp: {},
  snapByApp: {},
  controlOwner: 'document',
});

const appendUnique = (items: DesktopAppId[], item: DesktopAppId): DesktopAppId[] => (
  items.includes(item) ? items : [...items, item]
);

export const openDesktopApp = (state: WorkstationSessionState, appId: DesktopAppId): WorkstationSessionState => {
  if (state.activeAppId === appId) return state;
  const minimized = appendUnique(state.minimizedAppIds, state.activeAppId)
    .filter((id) => id !== appId && !(appId !== 'home' && id === 'home' && state.activeAppId === 'home'));
  return {
    ...state,
    activeAppId: appId,
    minimizedAppIds: appId === 'home' ? minimized.filter((id) => id !== 'home') : ['home', ...minimized.filter((id) => id !== 'home')],
    controlOwner: appId === 'home' ? 'document' : 'app',
  };
};

export const minimizeDesktopApp = (state: WorkstationSessionState, appId: DesktopAppId): WorkstationSessionState => {
  if (state.activeAppId !== appId || appId === 'home') return state;
  return {
    ...state,
    activeAppId: 'home',
    minimizedAppIds: appendUnique(state.minimizedAppIds.filter((id) => id !== 'home'), appId),
    controlOwner: 'document',
  };
};

export const desktopAppFromSearch = (search: string): DesktopAppId | null => {
  const params = new URLSearchParams(search);
  if (params.get('mode') === 'scan') return null;
  const app = params.get('app');
  return isDesktopAppId(app) ? app : null;
};

export const withDesktopApp = (rawUrl: string, appId: DesktopAppId): string => {
  const url = new URL(rawUrl);
  if (appId === 'home') url.searchParams.delete('app');
  else url.searchParams.set('app', appId);
  return url.toString();
};

export interface WorkstationViewport {
  width: number;
  height: number;
  taskbarHeight: number;
  topBarHeight?: number;
}

const MIN_WINDOW_WIDTH = 620;
const MIN_WINDOW_HEIGHT = 420;

const finiteOr = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, minimum: number, maximum: number) => Math.min(Math.max(value, minimum), maximum);

export const clampWindowBounds = (bounds: WindowBounds, viewport: WorkstationViewport): WindowBounds => {
  const usableWidth = Math.max(MIN_WINDOW_WIDTH, finiteOr(viewport.width, MIN_WINDOW_WIDTH));
  const top = Math.max(0, finiteOr(viewport.topBarHeight ?? 0, 0));
  const workspaceBottom = Math.max(top + MIN_WINDOW_HEIGHT, finiteOr(viewport.height - viewport.taskbarHeight, top + MIN_WINDOW_HEIGHT));
  const usableHeight = Math.max(MIN_WINDOW_HEIGHT, workspaceBottom - top);
  const width = clamp(finiteOr(bounds.width, MIN_WINDOW_WIDTH), MIN_WINDOW_WIDTH, usableWidth);
  const height = clamp(finiteOr(bounds.height, MIN_WINDOW_HEIGHT), MIN_WINDOW_HEIGHT, usableHeight);
  const x = clamp(finiteOr(bounds.x, 0), 0, usableWidth - width);
  const y = clamp(finiteOr(bounds.y, top), top, top + usableHeight - height);
  return { x, y, width, height };
};

export const resizeWindowBounds = (
  bounds: WindowBounds,
  deltaWidth: number,
  deltaHeight: number,
  viewport: WorkstationViewport,
): WindowBounds => {
  const current = clampWindowBounds(bounds, viewport);
  const top = Math.max(0, finiteOr(viewport.topBarHeight ?? 0, 0));
  const workspaceBottom = Math.max(top + MIN_WINDOW_HEIGHT, finiteOr(viewport.height - viewport.taskbarHeight, top + MIN_WINDOW_HEIGHT));
  return {
    ...current,
    width: clamp(current.width + finiteOr(deltaWidth, 0), MIN_WINDOW_WIDTH, viewport.width - current.x),
    height: clamp(current.height + finiteOr(deltaHeight, 0), MIN_WINDOW_HEIGHT, workspaceBottom - current.y),
  };
};

export const resolveSnapBounds = (
  snap: Exclude<WindowSnapState, 'floating'>,
  viewport: WorkstationViewport,
): WindowBounds => {
  const width = Math.max(0, viewport.width);
  const top = Math.max(0, finiteOr(viewport.topBarHeight ?? 0, 0));
  const height = Math.max(0, viewport.height - viewport.taskbarHeight - top);
  if (snap === 'maximized') return { x: 0, y: top, width, height };
  const half = width / 2;
  return { x: snap === 'right' ? half : 0, y: top, width: half, height };
};
