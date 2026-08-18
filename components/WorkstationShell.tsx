import React, { useEffect, useMemo, useRef } from 'react';
import type { DesktopAppId } from '../types';
import { workstationApps } from '../lib/workstation';
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
              <span>{app.shortLabel}</span>
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
  const { enabled, enhanced, state, minimizeApp, snapApp } = useWorkstation();
  const app = useMemo(() => workstationApps.find((candidate) => candidate.id === appId)!, [appId]);
  if (!enabled || !enhanced || state.activeAppId !== appId) return null;
  const bounds = state.boundsByApp[appId];
  const style = bounds && window.innerWidth >= 921 ? { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height } : undefined;
  const titleId = `workstation-window-${appId}-title`;
  return (
    <section className="workstation-window" role="dialog" aria-modal="false" aria-labelledby={titleId} data-app-id={appId} style={style}>
      <header className="workstation-titlebar">
        <div className="workstation-titlebar-grip" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        <div><span>{app.kind.toUpperCase()} MODULE</span><h2 id={titleId}>{app.label}</h2></div>
        <div className="workstation-window-controls">
          <button type="button" onClick={() => snapApp(appId, 'left')} aria-label={`Snap ${app.label} left`}>L</button>
          <button type="button" onClick={() => snapApp(appId, 'right')} aria-label={`Snap ${app.label} right`}>R</button>
          <button type="button" onClick={() => snapApp(appId, 'maximized')} aria-label={`Maximize ${app.label}`}>M</button>
          <button type="button" onClick={() => minimizeApp(appId)} aria-label={`Minimize ${app.label}`}>—</button>
        </div>
      </header>
      <div className="workstation-window-body">{children}</div>
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
  if (appId === 'home') return <div className="workstation-home-surface" data-app-id="home">{children}</div>;
  return <WorkstationAppFrame appId={appId}>{children}</WorkstationAppFrame>;
};
