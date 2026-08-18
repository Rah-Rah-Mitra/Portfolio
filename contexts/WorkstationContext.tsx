import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { DesktopAppId, WindowBounds, WindowSnapState, WorkstationSessionState } from '../types';
import {
  createWorkstationState,
  desktopAppFromSearch,
  minimizeDesktopApp as reduceMinimizeDesktopApp,
  openDesktopApp as reduceOpenDesktopApp,
  resolveSnapBounds,
  withDesktopApp,
} from '../lib/workstation';

const SESSION_KEY = 'portfolio-workstation-session-v1';

interface WorkstationContextValue {
  enabled: boolean;
  enhanced: boolean;
  state: WorkstationSessionState;
  openApp: (appId: DesktopAppId, source?: 'rail' | 'link' | 'ai' | 'history') => void;
  minimizeApp: (appId: DesktopAppId) => void;
  snapApp: (appId: DesktopAppId, snap: Exclude<WindowSnapState, 'floating'>) => void;
  moveApp: (appId: DesktopAppId, bounds: WindowBounds) => void;
}

const WorkstationContext = createContext<WorkstationContextValue | null>(null);

const safeStoredState = (): WorkstationSessionState => {
  if (typeof window === 'undefined') return createWorkstationState();
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as Partial<WorkstationSessionState> | null;
    if (!parsed || typeof parsed !== 'object') return createWorkstationState();
    const baseline = createWorkstationState();
    return {
      ...baseline,
      minimizedAppIds: Array.isArray(parsed.minimizedAppIds) ? parsed.minimizedAppIds : [],
      boundsByApp: parsed.boundsByApp && typeof parsed.boundsByApp === 'object' ? parsed.boundsByApp : {},
      snapByApp: parsed.snapByApp && typeof parsed.snapByApp === 'object' ? parsed.snapByApp : {},
    };
  } catch {
    return createWorkstationState();
  }
};

export const useWorkstation = () => {
  const value = useContext(WorkstationContext);
  if (!value) throw new Error('useWorkstation must be used within WorkstationProvider');
  return value;
};

export const useOptionalWorkstation = () => useContext(WorkstationContext);

export const WorkstationProvider: React.FC<{
  enabled: boolean;
  children: React.ReactNode;
}> = ({ enabled, children }) => {
  const [state, setState] = useState<WorkstationSessionState>(createWorkstationState);
  const [enhanced, setEnhanced] = useState(false);

  useEffect(() => {
    setEnhanced(true);
    if (!enabled) {
      setState(createWorkstationState());
      return undefined;
    }
    const stored = safeStoredState();
    const routedApp = desktopAppFromSearch(window.location.search);
    setState(routedApp ? reduceOpenDesktopApp(stored, routedApp) : stored);
    const synchronizeHistory = () => {
      const appId = desktopAppFromSearch(window.location.search) ?? 'home';
      setState((current) => reduceOpenDesktopApp(current, appId));
    };
    window.addEventListener('popstate', synchronizeHistory);
    return () => window.removeEventListener('popstate', synchronizeHistory);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !enhanced) return;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  }, [enabled, enhanced, state]);

  const openApp = useCallback((appId: DesktopAppId, source: 'rail' | 'link' | 'ai' | 'history' = 'link') => {
    if (!enabled) return;
    setState((current) => reduceOpenDesktopApp(current, appId));
    if (source !== 'history') {
      window.history.pushState({ ...window.history.state, workstationApp: appId }, '', withDesktopApp(window.location.href, appId));
    }
    window.dispatchEvent(new CustomEvent('portfolio:workstation-event', { detail: { type: 'APP_OPENED', appId, source } }));
  }, [enabled]);

  const minimizeApp = useCallback((appId: DesktopAppId) => {
    if (!enabled) return;
    setState((current) => reduceMinimizeDesktopApp(current, appId));
    window.history.pushState({ ...window.history.state, workstationApp: 'home' }, '', withDesktopApp(window.location.href, 'home'));
    window.dispatchEvent(new CustomEvent('portfolio:workstation-event', { detail: { type: 'APP_MINIMIZED', appId } }));
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('portfolio:workstation-focus', { detail: { appId } })), 0);
  }, [enabled]);

  const snapApp = useCallback((appId: DesktopAppId, snap: Exclude<WindowSnapState, 'floating'>) => {
    if (!enabled) return;
    const bounds = resolveSnapBounds(snap, { width: window.innerWidth, height: window.innerHeight, taskbarHeight: 76 });
    setState((current) => ({
      ...current,
      boundsByApp: { ...current.boundsByApp, [appId]: bounds },
      snapByApp: { ...current.snapByApp, [appId]: snap },
    }));
  }, [enabled]);

  const moveApp = useCallback((appId: DesktopAppId, bounds: WindowBounds) => {
    if (!enabled) return;
    setState((current) => ({
      ...current,
      boundsByApp: { ...current.boundsByApp, [appId]: bounds },
      snapByApp: { ...current.snapByApp, [appId]: 'floating' },
    }));
  }, [enabled]);

  useEffect(() => {
    if (!enabled || state.activeAppId === 'home') return undefined;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') minimizeApp(state.activeAppId);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [enabled, minimizeApp, state.activeAppId]);

  const value = useMemo<WorkstationContextValue>(() => ({ enabled, enhanced, state, openApp, minimizeApp, snapApp, moveApp }), [enabled, enhanced, state, openApp, minimizeApp, snapApp, moveApp]);
  return <WorkstationContext.Provider value={value}>{children}</WorkstationContext.Provider>;
};
