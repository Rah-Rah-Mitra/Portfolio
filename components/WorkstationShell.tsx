import React, { useEffect, useMemo, useRef } from 'react';
import type { DesktopAppId, DesktopToolAppId } from '../types';
import { resizeWindowBounds, resolveCascadeBounds, workstationApps } from '../lib/workstation';
import { useWorkstation } from '../contexts/WorkstationContext';
import AppearanceViewMenu from './AppearanceViewMenu';

export const WorkstationRail: React.FC = () => {
  const { enabled, enhanced, state, openApp, showDesktop } = useWorkstation();
  const moduleRefs = useRef(new Map<DesktopAppId, HTMLButtonElement>());

  useEffect(() => {
    const restoreFocus = (event: Event) => {
      const appId = (event as CustomEvent<{ appId: DesktopAppId }>).detail.appId;
      moduleRefs.current.get(appId)?.focus();
    };
    window.addEventListener('portfolio:workstation-focus', restoreFocus);
    return () => window.removeEventListener('portfolio:workstation-focus', restoreFocus);
  }, []);

  if (!enabled || !enhanced) return null;
  return (
    <nav className="workstation-rail" aria-label="Workstation applications">
      <div className="workstation-rail-track" aria-hidden="true"><span /><i /><span /></div>
      <div className="workstation-modules">
        {workstationApps.map((app) => {
          const focused = state.focusedAppId === app.id;
          const minimized = app.id !== 'home' && state.minimizedAppIds.includes(app.id);
          const open = app.id !== 'home' && state.openAppIds.includes(app.id);
          const status = focused ? 'focused' : minimized ? 'minimized' : open ? 'open-background' : 'idle';
          const statusLabel = focused ? 'Focused' : minimized ? 'Minimized' : open ? 'Open in background' : 'Closed';
          return (
            <button
              key={app.id}
              ref={(node) => { if (node) moduleRefs.current.set(app.id, node); else moduleRefs.current.delete(app.id); }}
              type="button"
              className="workstation-module"
              aria-label={`Open ${app.label}`}
              aria-pressed={focused}
              data-app-id={app.id}
              data-state={status}
              onClick={() => app.id === 'home' ? showDesktop('rail') : openApp(app.id, 'rail')}
            >
              <span className="workstation-module-socket" aria-hidden="true"><img src={app.iconAsset} alt="" width="48" height="48" /></span>
              <span className="workstation-module-label">{app.shortLabel}</span>
              <small className="workstation-module-compact" aria-hidden="true">{app.compactLabel}</small>
              <span className="sr-only">Status: {statusLabel}</span>
              <i className="workstation-status-lamp" aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <div className="workstation-rail-readout" aria-live="polite">
        <span>FOCUSED BAY</span><strong>{workstationApps.find((app) => app.id === state.focusedAppId)?.shortLabel}</strong>
      </div>
    </nav>
  );
};

export const WorkstationAppFrame: React.FC<{ appId: DesktopToolAppId; children: React.ReactNode }> = ({ appId, children }) => {
  const { enabled, enhanced, isCompact, state, focusApp, minimizeApp, closeApp, snapApp, moveApp } = useWorkstation();
  const app = useMemo(() => workstationApps.find((candidate) => candidate.id === appId)!, [appId]);
  const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 800 : window.innerHeight;
  const viewport = { width: viewportWidth, height: viewportHeight, taskbarHeight: 96, topBarHeight: 76 };
  const open = state.openAppIds.includes(appId);
  const minimized = state.minimizedAppIds.includes(appId);
  const focused = state.focusedAppId === appId;
  const heavy = appId === 'systems-lab' || appId === 'camera-lab' || appId === 'world-3d';
  const hidden = !open || minimized || (isCompact && !focused);
  const bounds = state.boundsByApp[appId] ?? resolveCascadeBounds(state.openAppIds.indexOf(appId), viewport);
  const stackIndex = Math.max(0, state.windowStack.indexOf(appId));
  const style = viewportWidth >= 921
    ? { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height, zIndex: 60 + stackIndex }
    : undefined;
  const pointerAction = useRef<null | { kind: 'move' | 'resize'; pointerId: number; x: number; y: number; bounds: typeof bounds }>(null);
  const restoreBounds = useRef(bounds);

  useEffect(() => {
    if (!enabled || !enhanced || hidden || typeof window === 'undefined') return undefined;
    const update = (event: PointerEvent) => {
      const action = pointerAction.current;
      if (!action || event.pointerId !== action.pointerId) return;
      const deltaX = event.clientX - action.x;
      const deltaY = event.clientY - action.y;
      moveApp(appId, action.kind === 'move'
        ? { ...action.bounds, x: action.bounds.x + deltaX, y: action.bounds.y + deltaY }
        : resizeWindowBounds(action.bounds, deltaX, deltaY, viewport));
    };
    const finish = (event: PointerEvent) => {
      if (pointerAction.current?.pointerId === event.pointerId) pointerAction.current = null;
    };
    window.addEventListener('pointermove', update);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      pointerAction.current = null;
      window.removeEventListener('pointermove', update);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [appId, enabled, enhanced, hidden, moveApp, viewport.height, viewport.taskbarHeight, viewport.width]);

  const startPointerAction = (kind: 'move' | 'resize', event: React.PointerEvent<HTMLButtonElement>) => {
    focusApp(appId);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointerAction.current = { kind, pointerId: event.pointerId, x: event.clientX, y: event.clientY, bounds };
  };

  const moveFromKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 48 : 16;
    const offsets: Partial<Record<string, [number, number]>> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    moveApp(appId, { ...bounds, x: bounds.x + offset[0], y: bounds.y + offset[1] });
  };

  const resizeFromKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 64 : 16;
    const offsets: Partial<Record<string, [number, number]>> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    moveApp(appId, resizeWindowBounds(bounds, offset[0], offset[1], viewport));
  };

  const titleId = `workstation-window-${appId}-title`;
  const toggleMaximize = () => {
    if (state.snapByApp[appId] === 'maximized') moveApp(appId, restoreBounds.current);
    else {
      restoreBounds.current = bounds;
      snapApp(appId, 'maximized');
    }
  };
  return (
    <section
      className="workstation-window"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-app-id={appId}
      data-window-state={focused ? 'focused' : open ? 'open-background' : 'closed'}
      hidden={hidden}
      style={style}
      onPointerDownCapture={() => { if (!focused) focusApp(appId); }}
    >
      <header className="workstation-titlebar" data-testid={`workstation-titlebar-${appId}`} onDoubleClick={(event) => { if (!(event.target as HTMLElement).closest('button')) toggleMaximize(); }}>
        <div className="workstation-traffic-controls">
          <button type="button" className="traffic-close" onClick={() => closeApp(appId)} aria-label={`Close ${app.label}`}><span aria-hidden="true">×</span></button>
          <button type="button" className="traffic-minimize" onClick={() => minimizeApp(appId)} aria-label={`Minimize ${app.label}`}><span aria-hidden="true">−</span></button>
          <button type="button" className="traffic-maximize" onClick={toggleMaximize} aria-label={`${state.snapByApp[appId] === 'maximized' ? 'Restore' : 'Maximize'} ${app.label}`}><span aria-hidden="true">+</span></button>
        </div>
        <button type="button" className="workstation-titlebar-grip" aria-label={`Move ${app.label} window`} onPointerDown={(event) => startPointerAction('move', event)} onKeyDown={moveFromKeyboard}><i /><i /><i /><i /><i /></button>
        <div><span>{app.kind.toUpperCase()} MODULE</span><h2 id={titleId}>{app.label}</h2></div>
        <div className="workstation-window-controls">
          <button type="button" onClick={() => snapApp(appId, 'left')} aria-label={`Snap ${app.label} left`}>L</button>
          <button type="button" onClick={() => snapApp(appId, 'right')} aria-label={`Snap ${app.label} right`}>R</button>
          <AppearanceViewMenu compact />
        </div>
      </header>
      <div className="workstation-window-body">{children}</div>
      <button type="button" className="workstation-resize-handle" aria-label={`Resize ${app.label} window`} onPointerDown={(event) => startPointerAction('resize', event)} onKeyDown={resizeFromKeyboard}><span aria-hidden="true" /></button>
      <footer className="workstation-window-status"><span>{focused ? 'FOCUSED / LOCAL' : heavy ? 'SUSPENDED / POSTER' : 'OPEN / BACKGROUND'}</span><span>ESC TO MINIMIZE</span></footer>
    </section>
  );
};

export const WorkstationAppSurface: React.FC<{ appId: DesktopAppId; children: React.ReactNode }> = ({ appId, children }) => {
  const { enabled, enhanced } = useWorkstation();
  if (!enabled || !enhanced) return <div className="workstation-static-surface" data-app-id={appId}>{children}</div>;
  if (appId === 'home') return (
    <section className="workstation-home-surface" data-app-id="home" data-desktop-field data-window-state="maximized" aria-label="Home / Dossier application">
      <div className="workstation-dossier-bar">
        <div><span>PORTFOLIO WORKSTATION</span><strong>HOME / DOSSIER</strong></div>
        <dl>
          <div><dt>SESSION</dt><dd>RECRUITER EVIDENCE</dd></div>
          <div><dt>STATE</dt><dd>AVAILABLE · SINGAPORE</dd></div>
        </dl>
        <span>MAXIMIZED</span>
      </div>
      {children}
    </section>
  );
  return <WorkstationAppFrame appId={appId}>{children}</WorkstationAppFrame>;
};
