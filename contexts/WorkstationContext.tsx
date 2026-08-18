import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { DesktopAppId, DesktopToolAppId, WindowBounds, WindowSnapState, WorkstationSessionState } from '../types';
import {
  clampWindowBounds,
  closeDesktopApp as reduceCloseDesktopApp,
  createWorkstationState,
  desktopAppFromSearch,
  focusDesktopApp as reduceFocusDesktopApp,
  minimizeDesktopApp as reduceMinimizeDesktopApp,
  openDesktopApp as reduceOpenDesktopApp,
  parseWorkstationSession,
  reconcileWindowBounds,
  resolveCascadeBounds,
  resolveSnapBounds,
  showWorkstationDesktop as reduceShowWorkstationDesktop,
  withDesktopApp,
} from '../lib/workstation';

const SESSION_KEY = 'portfolio-workstation-session-v2';
const LEGACY_SESSION_KEY = 'portfolio-workstation-session-v1';
const COMPACT_QUERY = '(max-width: 920px)';

type NavigationSource = 'rail' | 'link' | 'ai' | 'history';

interface WorkstationContextValue {
  enabled: boolean;
  enhanced: boolean;
  isCompact: boolean;
  state: WorkstationSessionState;
  openApp: (appId: DesktopAppId, source?: NavigationSource) => void;
  focusApp: (appId: DesktopToolAppId, historyMode?: 'replace' | 'push') => void;
  minimizeApp: (appId: DesktopAppId) => void;
  closeApp: (appId: DesktopAppId) => void;
  showDesktop: (source?: NavigationSource) => void;
  snapApp: (appId: DesktopToolAppId, snap: Exclude<WindowSnapState, 'floating'>) => void;
  moveApp: (appId: DesktopToolAppId, bounds: WindowBounds) => void;
}

const WorkstationContext = createContext<WorkstationContextValue | null>(null);

const currentViewport = () => ({
  width: window.innerWidth,
  height: window.innerHeight,
  taskbarHeight: 96,
  topBarHeight: 76,
});

const safeStoredState = (): WorkstationSessionState => {
  if (typeof window === 'undefined') return createWorkstationState();
  return parseWorkstationSession(sessionStorage.getItem(SESSION_KEY), sessionStorage.getItem(LEGACY_SESSION_KEY));
};

export const useWorkstation = () => {
  const value = useContext(WorkstationContext);
  if (!value) throw new Error('useWorkstation must be used within WorkstationProvider');
  return value;
};

export const useOptionalWorkstation = () => useContext(WorkstationContext);

export const WorkstationProvider: React.FC<{ enabled: boolean; children: React.ReactNode }> = ({ enabled, children }) => {
  const [state, setState] = useState<WorkstationSessionState>(createWorkstationState);
  const stateRef = useRef(state);
  const [enhanced, setEnhanced] = useState(false);
  const [isCompact, setIsCompact] = useState(false);

  const commitState = useCallback((next: WorkstationSessionState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const writeRoute = useCallback((appId: DesktopAppId, mode: 'push' | 'replace') => {
    const url = withDesktopApp(window.location.href, appId);
    const nextHistory = { ...window.history.state, workstationApp: appId };
    if (mode === 'push') window.history.pushState(nextHistory, '', url);
    else window.history.replaceState(nextHistory, '', url);
  }, []);

  useEffect(() => {
    setEnhanced(true);
    if (!enabled) {
      commitState(createWorkstationState());
      return undefined;
    }
    const stored = safeStoredState();
    const routedApp = desktopAppFromSearch(window.location.search) ?? 'home';
    const hydrated = routedApp === 'home'
      ? reduceShowWorkstationDesktop(stored)
      : reduceOpenDesktopApp(stored, routedApp, stored.boundsByApp[routedApp] ?? resolveCascadeBounds(stored.openAppIds.length, currentViewport()));
    commitState(hydrated);
    const synchronizeHistory = () => {
      const appId = desktopAppFromSearch(window.location.search) ?? 'home';
      const current = stateRef.current;
      commitState(appId === 'home'
        ? reduceShowWorkstationDesktop(current)
        : reduceOpenDesktopApp(current, appId, current.boundsByApp[appId] ?? resolveCascadeBounds(current.openAppIds.length, currentViewport())));
    };
    window.addEventListener('popstate', synchronizeHistory);
    return () => window.removeEventListener('popstate', synchronizeHistory);
  }, [commitState, enabled]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(COMPACT_QUERY);
    const update = () => setIsCompact(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    if (enabled && enhanced) sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  }, [enabled, enhanced, state]);

  useEffect(() => {
    const root = document.documentElement;
    if (enabled && enhanced) root.dataset.workstation = 'enabled';
    else delete root.dataset.workstation;
    if (enabled && enhanced && state.focusedAppId !== 'home') root.dataset.workstationActive = state.focusedAppId;
    else delete root.dataset.workstationActive;
    return () => {
      delete root.dataset.workstation;
      delete root.dataset.workstationActive;
    };
  }, [enabled, enhanced, state.focusedAppId]);

  const showDesktop = useCallback((source: NavigationSource = 'link') => {
    if (!enabled) return;
    const current = stateRef.current;
    commitState(reduceShowWorkstationDesktop(current));
    if (source !== 'history' && current.focusedAppId !== 'home') writeRoute('home', 'push');
    window.dispatchEvent(new CustomEvent('portfolio:workstation-event', { detail: { type: 'DESKTOP_SHOWN' } }));
  }, [commitState, enabled, writeRoute]);

  const openApp = useCallback((appId: DesktopAppId, source: NavigationSource = 'link') => {
    if (!enabled) return;
    if (appId === 'home') {
      showDesktop(source);
      return;
    }
    const current = stateRef.current;
    const initialBounds = current.boundsByApp[appId] ?? resolveCascadeBounds(current.openAppIds.length, currentViewport());
    const next = reduceOpenDesktopApp(current, appId, initialBounds);
    commitState(next);
    if (source !== 'history' && current.focusedAppId !== appId) writeRoute(appId, 'push');
    window.dispatchEvent(new CustomEvent('portfolio:workstation-event', { detail: { type: 'APP_OPENED', appId, source } }));
  }, [commitState, enabled, showDesktop, writeRoute]);

  const focusApp = useCallback((appId: DesktopToolAppId, historyMode: 'replace' | 'push' = 'replace') => {
    if (!enabled) return;
    const current = stateRef.current;
    const next = reduceFocusDesktopApp(current, appId);
    if (next === current) return;
    commitState(next);
    writeRoute(appId, historyMode);
    window.dispatchEvent(new CustomEvent('portfolio:workstation-event', { detail: { type: 'APP_FOCUSED', appId } }));
  }, [commitState, enabled, writeRoute]);

  const minimizeApp = useCallback((appId: DesktopAppId) => {
    if (!enabled || appId === 'home') return;
    const current = stateRef.current;
    const next = reduceMinimizeDesktopApp(current, appId);
    if (next === current) return;
    commitState(next);
    if (current.focusedAppId === appId) writeRoute(next.focusedAppId, 'push');
    window.dispatchEvent(new CustomEvent('portfolio:workstation-event', { detail: { type: 'APP_MINIMIZED', appId } }));
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('portfolio:workstation-focus', { detail: { appId } })), 0);
  }, [commitState, enabled, writeRoute]);

  const closeApp = useCallback((appId: DesktopAppId) => {
    if (!enabled || appId === 'home') return;
    const current = stateRef.current;
    const next = reduceCloseDesktopApp(current, appId);
    if (next === current) return;
    commitState(next);
    if (current.focusedAppId === appId) writeRoute(next.focusedAppId, 'push');
    window.dispatchEvent(new CustomEvent('portfolio:workstation-event', { detail: { type: 'APP_CLOSED', appId } }));
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('portfolio:workstation-focus', { detail: { appId } })), 0);
  }, [commitState, enabled, writeRoute]);

  const snapApp = useCallback((appId: DesktopToolAppId, snap: Exclude<WindowSnapState, 'floating'>) => {
    if (!enabled) return;
    const focused = reduceFocusDesktopApp(stateRef.current, appId);
    commitState({
      ...focused,
      boundsByApp: { ...focused.boundsByApp, [appId]: resolveSnapBounds(snap, currentViewport()) },
      snapByApp: { ...focused.snapByApp, [appId]: snap },
    });
    writeRoute(appId, 'replace');
  }, [commitState, enabled, writeRoute]);

  const moveApp = useCallback((appId: DesktopToolAppId, bounds: WindowBounds) => {
    if (!enabled) return;
    const focused = reduceFocusDesktopApp(stateRef.current, appId);
    commitState({
      ...focused,
      boundsByApp: { ...focused.boundsByApp, [appId]: clampWindowBounds(bounds, currentViewport()) },
      snapByApp: { ...focused.snapByApp, [appId]: 'floating' },
    });
    writeRoute(appId, 'replace');
  }, [commitState, enabled, writeRoute]);

  useEffect(() => {
    if (!enabled) return undefined;
    const reconcile = () => {
      if (window.innerWidth < 921) return;
      commitState(reconcileWindowBounds(stateRef.current, currentViewport()));
    };
    window.addEventListener('resize', reconcile);
    window.addEventListener('orientationchange', reconcile);
    return () => {
      window.removeEventListener('resize', reconcile);
      window.removeEventListener('orientationchange', reconcile);
    };
  }, [commitState, enabled]);

  useEffect(() => {
    if (!enabled || state.focusedAppId === 'home') return undefined;
    const focusedAppId = state.focusedAppId;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector(`[data-app-id="${focusedAppId}"] [data-control-owner="visitor"]`)) return;
      minimizeApp(focusedAppId);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [enabled, minimizeApp, state.focusedAppId]);

  const value = useMemo<WorkstationContextValue>(() => ({
    enabled, enhanced, isCompact, state, openApp, focusApp, minimizeApp, closeApp, showDesktop, snapApp, moveApp,
  }), [closeApp, enabled, enhanced, focusApp, isCompact, minimizeApp, moveApp, openApp, showDesktop, snapApp, state]);

  return <WorkstationContext.Provider value={value}>{children}</WorkstationContext.Provider>;
};
