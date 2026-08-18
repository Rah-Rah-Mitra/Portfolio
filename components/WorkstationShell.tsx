import React, { useEffect, useMemo, useRef } from 'react';
import type { DesktopAppId } from '../types';
import { workstationApps } from '../lib/workstation';
import { clampWindowBounds, resizeWindowBounds } from '../lib/workstation';
import { useWorkstation } from '../contexts/WorkstationContext';

export const WorkstationRail: React.FC = () => {
  const { enabled, enhanced, state, openApp } = useWorkstation();
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
          const active = state.activeAppId === app.id;
          const minimized = state.minimizedAppIds.includes(app.id);
          return (
            <button
              key={app.id}
              ref={(node) => { if (node) moduleRefs.current.set(app.id, node); else moduleRefs.current.delete(app.id); }}
              type="button"
              className="workstation-module"
              aria-label={`Open ${app.label}`}
              aria-pressed={active}
              data-app-id={app.id}
              data-state={active ? 'active' : minimized ? 'minimized' : 'idle'}
              onClick={() => openApp(app.id, 'rail')}
            >
              <span className="workstation-module-socket" aria-hidden="true"><img src={app.iconAsset} alt="" width="48" height="48" /></span>
              <span className="workstation-module-label">{app.shortLabel}</span>
              <small className="workstation-module-compact" aria-hidden="true">{app.compactLabel}</small>
              <i className="workstation-status-lamp" aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <div className="workstation-rail-readout" aria-live="polite">
        <span>ACTIVE BAY</span><strong>{workstationApps.find((app) => app.id === state.activeAppId)?.shortLabel}</strong>
      </div>
    </nav>
  );
};

export const WorkstationAppFrame: React.FC<{
  appId: Exclude<DesktopAppId, 'home'>;
  children: React.ReactNode;
}> = ({ appId, children }) => {
  const { enabled, enhanced, state, minimizeApp, snapApp, moveApp } = useWorkstation();
  const app = useMemo(() => workstationApps.find((candidate) => candidate.id === appId)!, [appId]);
  const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 800 : window.innerHeight;
  const viewport = { width: viewportWidth, height: viewportHeight, taskbarHeight: 96, topBarHeight: 76 };
  const workAreaHeight = viewportHeight - viewport.taskbarHeight - viewport.topBarHeight;
  const bounds = state.boundsByApp[appId] ?? clampWindowBounds({
    x: Math.max(24, (viewportWidth - 1120) / 2),
    y: viewport.topBarHeight + 16,
    width: Math.min(1120, viewportWidth - 48),
    height: Math.min(780, workAreaHeight - 32),
  }, viewport);
  const style = viewportWidth >= 921 ? { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height } : undefined;
  const pointerAction = useRef<null | { kind: 'move' | 'resize'; pointerId: number; x: number; y: number; bounds: typeof bounds }>(null);

  useEffect(() => {
    if (!enabled || !enhanced || state.activeAppId !== appId || typeof window === 'undefined') return undefined;
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
      window.removeEventListener('pointermove', update);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [appId, enabled, enhanced, moveApp, state.activeAppId, viewport.height, viewport.taskbarHeight, viewport.width]);

  const startPointerAction = (kind: 'move' | 'resize', event: React.PointerEvent<HTMLButtonElement>) => {
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
  if (!enabled || !enhanced || state.activeAppId !== appId) return null;
  const titleId = `workstation-window-${appId}-title`;
  return (
    <section className="workstation-window" role="dialog" aria-modal="false" aria-labelledby={titleId} data-app-id={appId} style={style}>
      <header className="workstation-titlebar">
        <button type="button" className="workstation-titlebar-grip" aria-label={`Move ${app.label} window`} onPointerDown={(event) => startPointerAction('move', event)} onKeyDown={moveFromKeyboard}><i /><i /><i /><i /><i /></button>
        <div><span>{app.kind.toUpperCase()} MODULE</span><h2 id={titleId}>{app.label}</h2></div>
        <div className="workstation-window-controls">
          <button type="button" onClick={() => snapApp(appId, 'left')} aria-label={`Snap ${app.label} left`}>L</button>
          <button type="button" onClick={() => snapApp(appId, 'right')} aria-label={`Snap ${app.label} right`}>R</button>
          <button type="button" onClick={() => snapApp(appId, 'maximized')} aria-label={`Maximize ${app.label}`}>M</button>
          <button type="button" onClick={() => minimizeApp(appId)} aria-label={`Minimize ${app.label}`}>—</button>
        </div>
      </header>
      <div className="workstation-window-body">{children}</div>
      <button type="button" className="workstation-resize-handle" aria-label={`Resize ${app.label} window`} onPointerDown={(event) => startPointerAction('resize', event)} onKeyDown={resizeFromKeyboard}><span aria-hidden="true" /></button>
      <footer className="workstation-window-status"><span>LOCAL / DETERMINISTIC</span><span>ESC TO MINIMIZE</span></footer>
    </section>
  );
};

export const WorkstationAppSurface: React.FC<{
  appId: DesktopAppId;
  children: React.ReactNode;
}> = ({ appId, children }) => {
  const { enabled, enhanced, state } = useWorkstation();
  if (!enabled || !enhanced) {
    return <div className="workstation-static-surface" data-app-id={appId}>{children}</div>;
  }
  if (state.activeAppId !== appId) return null;
  if (appId === 'home') return (
    <section className="workstation-home-surface" data-app-id="home" data-window-state="maximized" aria-label="Home / Dossier application">
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
