import type {
  DesktopAppDefinition,
  DesktopAppId,
  DesktopToolAppId,
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
const toolAppIds = new Set<DesktopToolAppId>(workstationApps.filter((app) => app.id !== 'home').map((app) => app.id as DesktopToolAppId));
const snapStates = new Set<WindowSnapState>(['floating', 'left', 'right', 'maximized']);

export const isDesktopAppId = (value: string | null): value is DesktopAppId => Boolean(value && appIds.has(value as DesktopAppId));
export const isDesktopToolAppId = (value: unknown): value is DesktopToolAppId => typeof value === 'string' && toolAppIds.has(value as DesktopToolAppId);

export const createWorkstationState = (): WorkstationSessionState => ({
  focusedAppId: 'home',
  openAppIds: [],
  minimizedAppIds: [],
  windowStack: [],
  boundsByApp: {},
  snapByApp: {},
  controlOwner: 'document',
});

const appendUnique = <T>(items: T[], item: T): T[] => (
  items.includes(item) ? items : [...items, item]
);

const isWindowBounds = (value: unknown): value is WindowBounds => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WindowBounds>;
  return [candidate.x, candidate.y, candidate.width, candidate.height].every((entry) => typeof entry === 'number' && Number.isFinite(entry))
    && (candidate.width ?? 0) > 0
    && (candidate.height ?? 0) > 0;
};

const parseRecord = (raw: string | null): Record<string, unknown> | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
};

const uniqueToolList = (value: unknown): DesktopToolAppId[] | null => {
  if (!Array.isArray(value) || !value.every(isDesktopToolAppId)) return null;
  return new Set(value).size === value.length ? value : null;
};

const validBoundsRecord = (value: unknown, strict: boolean): Partial<Record<DesktopToolAppId, WindowBounds>> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Partial<Record<DesktopToolAppId, WindowBounds>> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isDesktopToolAppId(key) || !isWindowBounds(entry)) {
      if (strict) return null;
      continue;
    }
    result[key] = entry;
  }
  return result;
};

const validSnapRecord = (value: unknown, strict: boolean): Partial<Record<DesktopToolAppId, WindowSnapState>> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Partial<Record<DesktopToolAppId, WindowSnapState>> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isDesktopToolAppId(key) || typeof entry !== 'string' || !snapStates.has(entry as WindowSnapState)) {
      if (strict) return null;
      continue;
    }
    result[key] = entry as WindowSnapState;
  }
  return result;
};

export const parseWorkstationSession = (v2Raw: string | null, v1Raw: string | null): WorkstationSessionState => {
  const baseline = createWorkstationState();
  const v2 = parseRecord(v2Raw);
  if (v2) {
    const openAppIds = uniqueToolList(v2.openAppIds);
    const minimizedAppIds = uniqueToolList(v2.minimizedAppIds);
    const windowStack = uniqueToolList(v2.windowStack);
    const boundsByApp = validBoundsRecord(v2.boundsByApp, true);
    const snapByApp = validSnapRecord(v2.snapByApp, true);
    const focusedAppId = v2.focusedAppId;
    const validFocused = focusedAppId === 'home' || isDesktopToolAppId(focusedAppId);
    const validCollections = openAppIds && minimizedAppIds && windowStack
      && minimizedAppIds.every((id) => openAppIds.includes(id))
      && windowStack.length === openAppIds.length
      && windowStack.every((id) => openAppIds.includes(id));
    const validFocusedState = focusedAppId === 'home'
      || (isDesktopToolAppId(focusedAppId) && Boolean(openAppIds?.includes(focusedAppId)) && !minimizedAppIds?.includes(focusedAppId));
    if (validFocused && validCollections && validFocusedState && boundsByApp && snapByApp) {
      return {
        focusedAppId,
        openAppIds,
        minimizedAppIds,
        windowStack,
        boundsByApp,
        snapByApp,
        controlOwner: focusedAppId === 'home' ? 'document' : 'app',
      };
    }
    return baseline;
  }

  const v1 = parseRecord(v1Raw);
  if (!v1) return baseline;
  return {
    ...baseline,
    boundsByApp: validBoundsRecord(v1.boundsByApp, false) ?? {},
    snapByApp: validSnapRecord(v1.snapByApp, false) ?? {},
  };
};

const raiseWindow = (stack: DesktopToolAppId[], appId: DesktopToolAppId): DesktopToolAppId[] => (
  [...stack.filter((id) => id !== appId), appId]
);

const nextVisibleTool = (
  state: WorkstationSessionState,
  minimizedAppIds: DesktopToolAppId[],
): DesktopToolAppId | null => (
  [...state.windowStack].reverse().find((id) => state.openAppIds.includes(id) && !minimizedAppIds.includes(id)) ?? null
);

export const openDesktopApp = (
  state: WorkstationSessionState,
  appId: DesktopAppId,
  initialBounds?: WindowBounds,
): WorkstationSessionState => {
  if (appId === 'home') return showWorkstationDesktop(state);
  const isOpen = state.openAppIds.includes(appId);
  const boundsByApp = !isOpen && initialBounds
    ? { ...state.boundsByApp, [appId]: initialBounds }
    : state.boundsByApp;
  return {
    ...state,
    focusedAppId: appId,
    openAppIds: appendUnique(state.openAppIds, appId),
    minimizedAppIds: state.minimizedAppIds.filter((id) => id !== appId),
    windowStack: raiseWindow(state.windowStack, appId),
    boundsByApp,
    controlOwner: 'app',
  };
};

export const focusDesktopApp = (state: WorkstationSessionState, appId: DesktopToolAppId): WorkstationSessionState => {
  if (!state.openAppIds.includes(appId) || state.minimizedAppIds.includes(appId)) return state;
  return {
    ...state,
    focusedAppId: appId,
    windowStack: raiseWindow(state.windowStack, appId),
    controlOwner: 'app',
  };
};

export const minimizeDesktopApp = (state: WorkstationSessionState, appId: DesktopToolAppId): WorkstationSessionState => {
  if (!state.openAppIds.includes(appId) || state.minimizedAppIds.includes(appId)) return state;
  const minimizedAppIds = appendUnique(state.minimizedAppIds, appId);
  const focusedAppId = nextVisibleTool(state, minimizedAppIds) ?? 'home';
  return {
    ...state,
    focusedAppId,
    minimizedAppIds,
    controlOwner: focusedAppId === 'home' ? 'document' : 'app',
  };
};

export const closeDesktopApp = (state: WorkstationSessionState, appId: DesktopToolAppId): WorkstationSessionState => {
  if (!state.openAppIds.includes(appId)) return state;
  const openAppIds = state.openAppIds.filter((id) => id !== appId);
  const minimizedAppIds = state.minimizedAppIds.filter((id) => id !== appId);
  const windowStack = state.windowStack.filter((id) => id !== appId);
  const focusedAppId = [...windowStack].reverse().find((id) => !minimizedAppIds.includes(id)) ?? 'home';
  return {
    ...state,
    focusedAppId,
    openAppIds,
    minimizedAppIds,
    windowStack,
    controlOwner: focusedAppId === 'home' ? 'document' : 'app',
  };
};

export const showWorkstationDesktop = (state: WorkstationSessionState): WorkstationSessionState => ({
  ...state,
  focusedAppId: 'home',
  minimizedAppIds: [...state.openAppIds],
  controlOwner: 'document',
});

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

export const resolveCascadeBounds = (index: number, viewport: WorkstationViewport): WindowBounds => {
  const width = Math.round(clamp(
    Math.min(finiteOr(viewport.width, MIN_WINDOW_WIDTH) - 48, finiteOr(viewport.width, MIN_WINDOW_WIDTH) * 0.72),
    Math.min(720, Math.max(0, finiteOr(viewport.width, MIN_WINDOW_WIDTH) - 48)),
    Math.min(980, Math.max(0, finiteOr(viewport.width, MIN_WINDOW_WIDTH) - 48)),
  ));
  const top = Math.max(0, finiteOr(viewport.topBarHeight ?? 0, 0));
  const workAreaHeight = Math.max(0, finiteOr(viewport.height - viewport.taskbarHeight, top) - top);
  const height = Math.round(clamp(
    Math.min(workAreaHeight - 32, workAreaHeight * 0.82),
    Math.min(520, Math.max(0, workAreaHeight - 32)),
    Math.min(720, Math.max(0, workAreaHeight - 32)),
  ));
  const maxX = Math.max(36, finiteOr(viewport.width, 0) - width);
  const maxY = Math.max(top + 28, top + workAreaHeight - height);
  const horizontalSlots = Math.floor((maxX - 36) / 36) + 1;
  const verticalSlots = Math.floor((maxY - (top + 28)) / 28) + 1;
  const slots = Math.max(1, Math.min(6, horizontalSlots, verticalSlots));
  const safeIndex = Math.max(0, Math.floor(finiteOr(index, 0)));
  const slot = safeIndex % slots;
  const cycle = Math.floor(safeIndex / slots);
  const x = 36 + slot * 36 + cycle * 12;
  const y = top + 28 + slot * 28 + cycle * 10;
  return clampWindowBounds({ x, y, width, height }, viewport);
};

export const reconcileWindowBounds = (
  state: WorkstationSessionState,
  viewport: WorkstationViewport,
): WorkstationSessionState => {
  const boundsByApp = { ...state.boundsByApp };
  state.openAppIds.forEach((appId, index) => {
    const snap = state.snapByApp[appId];
    const current = boundsByApp[appId];
    if (snap && snap !== 'floating') boundsByApp[appId] = resolveSnapBounds(snap, viewport);
    else if (current) boundsByApp[appId] = clampWindowBounds(current, viewport);
    else if (!snap) boundsByApp[appId] = resolveCascadeBounds(index, viewport);
  });
  return { ...state, boundsByApp };
};

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
