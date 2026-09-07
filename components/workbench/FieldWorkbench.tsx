import React from 'react';
import type { DesktopAppId } from '../../types';
import { appForAnchor, workbenchApps, WORKBENCH_OPEN_EVENT, type WorkbenchOpenDetail } from '../../lib/workbench';
import { isDesktopAppId } from '../../lib/workstation';
import { routePath, spring } from '../../lib/rig';
import { SITE_CONFIG } from '../../siteConfig';
import { AppIcon } from './bits';
import { WINDOW_BODIES } from './WorkbenchWindows';
import { track } from '../../lib/analytics';

type Bounds = [number, number, number, number];

const DEFAULT_BOUNDS: Record<DesktopAppId, Bounds> = {
  'home': [150, 48, 900, 620],
  'selected-work': [420, 96, 900, 620],
  'experience': [230, 80, 880, 600],
  'project-archive': [280, 60, 940, 640],
  'systems-lab': [300, 88, 860, 610],
  'camera-lab': [330, 100, 840, 590],
  'world-3d': [360, 110, 820, 540],
  'capabilities': [250, 70, 900, 620],
  'proof-vault': [290, 90, 880, 600],
  'resumes-contact': [320, 80, 880, 600],
  'resume-builder': [200, 54, 1000, 660],
};

const WINDOW_FOOTERS: Record<DesktopAppId, [string, string]> = {
  'home': ['SHEET WIN-01 · RM FIELD WORKBENCH', 'COUNTERWEIGHT = SCROLL DEPTH'],
  'selected-work': ['SHEET WIN-02 · CARDS RIDE THE HOIST', 'SCROLL TO RAISE'],
  'experience': ['SHEET WIN-03', 'FULL RECORD — NO GAPS'],
  'project-archive': ['SHEET WIN-04 · REGISTRY', 'TYPE TO FILTER'],
  'systems-lab': ['SHEET WIN-05 · DETERMINISTIC', 'SEED-STABLE EXHIBITS'],
  'camera-lab': ['SHEET WIN-06 · K = [fx 0 cx / 0 fy cy / 0 0 1]', 'DRAG THE SLIDER'],
  'world-3d': ['SHEET WIN-07 · #WORLD', 'RENDERS ON DEMAND ONLY'],
  'capabilities': ['SHEET WIN-08', 'EVERY METHOD CITES EVIDENCE'],
  'proof-vault': ['SHEET WIN-09 · EVERY CLAIM LINKS OUT', 'EVIDENCE-FIRST'],
  'resumes-contact': ['SHEET WIN-10 · HANDOFF', 'DOCX + PDF PER EDITION'],
  'resume-builder': ['SHEET WIN-11 · COMPOSE TO ORDER', 'SELECTED EVIDENCE ONLY'],
};

const INITIAL_OPEN: Record<DesktopAppId, boolean> = {
  'home': true, 'selected-work': true, 'experience': false, 'project-archive': false,
  'systems-lab': false, 'camera-lab': false, 'world-3d': false, 'capabilities': false,
  'proof-vault': false, 'resumes-contact': false, 'resume-builder': false,
};

interface ScrollState { el: HTMLElement | null; st: number; prev: number; vel: number; max: number }
interface HoistState { el: HTMLElement; y: number; v: number; a: number; av: number }

// All mutable physics/window-manager state, outside React.
interface Engine {
  bounds: Record<DesktopAppId, Bounds>;
  maxed: Partial<Record<DesktopAppId, Bounds | null>>;
  rigDone: Partial<Record<DesktopAppId, boolean>>;
  rigGeo: Partial<Record<DesktopAppId, { W: number; H: number; sx: number; mx: number }>>;
  scroll: Partial<Record<DesktopAppId, ScrollState>>;
  wt: Partial<Record<DesktopAppId, { y: number; v: number }>>;
  rot: Partial<Record<DesktopAppId, number>>;
  hoists: HoistState[];
  focused: DesktopAppId | null;
  z: number;
  dragCtx: { id: DesktopAppId; el: HTMLElement; pid: number; sx: number; sy: number; x: number; y: number; lx?: number } | null;
  dragVel: number;
  motion: boolean;
}

const CABLE_SAG = 10;

const FieldWorkbench: React.FC = () => {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState<Record<DesktopAppId, boolean>>(INITIAL_OPEN);
  const [focused, setFocused] = React.useState<DesktopAppId | null>('home');
  const engineRef = React.useRef<Engine>({
    bounds: { ...DEFAULT_BOUNDS }, maxed: {}, rigDone: {}, rigGeo: {}, scroll: {}, wt: {}, rot: {},
    hoists: [], focused: 'home', z: 60, dragCtx: null, dragVel: 0, motion: true,
  });

  const winEl = (id: DesktopAppId) => rootRef.current?.querySelector<HTMLElement>(`[data-win="${id}"]`) ?? null;
  const deskEl = () => rootRef.current?.querySelector<HTMLElement>('[data-desk]') ?? null;

  const applyBounds = React.useCallback((id: DesktopAppId) => {
    const el = winEl(id);
    const desk = deskEl();
    if (!el || !desk) return;
    const engine = engineRef.current;
    const [x, y, w, h] = engine.bounds[id];
    const mw = Math.max(320, desk.clientWidth - 24);
    const mh = Math.max(240, desk.clientHeight - 24);
    const width = Math.min(w, mw);
    const height = Math.min(h, mh);
    el.style.left = `${Math.max(0, Math.min(x, mw - width))}px`;
    el.style.top = `${Math.max(0, Math.min(y, mh - height))}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
  }, []);

  const cacheHoists = React.useCallback((id: DesktopAppId) => {
    const el = winEl(id);
    if (!el) return;
    engineRef.current.hoists = Array.from(el.querySelectorAll<HTMLElement>('[data-hoist]'))
      .map((hoist) => ({ el: hoist, y: 30, v: 0, a: 0, av: 0 }));
  }, []);

  const layoutRig = React.useCallback((id: DesktopAppId) => {
    const el = winEl(id);
    if (!el || el.style.display === 'none') return;
    const beam = el.querySelector<SVGSVGElement>(`[data-rig="${id}"]`);
    const rail = el.querySelector<SVGSVGElement>(`[data-rail="${id}"]`);
    if (!beam || !rail) return;
    const W = beam.clientWidth || beam.parentElement?.clientWidth || 600;
    const H = rail.clientHeight || 300;
    const ink = 'color-mix(in srgb, #1d1f20 42%, transparent)';
    beam.innerHTML = `
      <path d="M10 6 v18 M4 12 h12" stroke="${ink}" stroke-width="1" fill="none"></path>
      <path data-cable d="" stroke="#5980a6" stroke-width="1.3" fill="none"></path>
      <g data-sheave2><circle r="5.5" fill="none" stroke="#416180" stroke-width="1.1"></circle><g data-spokes2><path d="M-5.5 0H5.5M0 -5.5V5.5" stroke="#416180" stroke-width="0.9"></path></g><circle r="1.3" fill="#416180"></circle></g>
      <g data-sheave><circle r="8.5" fill="none" stroke="#416180" stroke-width="1.3"></circle><g data-spokes><path d="M-8.5 0H8.5M0 -8.5V8.5" stroke="#416180" stroke-width="1"></path></g><circle r="1.8" fill="#416180"></circle></g>
      <path data-drop d="" stroke="#5980a6" stroke-width="1.3" fill="none"></path>`;
    let ticks = '';
    for (let i = 0; i <= 10; i++) {
      const y = 8 + ((H - 46) * i) / 10;
      ticks += `M6 ${y.toFixed(1)} h${i % 5 === 0 ? 9 : 5} `;
    }
    rail.innerHTML = `
      <path d="M6 6 V${H - 8}" stroke="${ink}" stroke-width="1" fill="none"></path>
      <path d="${ticks}" stroke="${ink}" stroke-width="1" fill="none"></path>
      <g data-weight><path d="M0 -13 V-6" stroke="#416180" stroke-width="1.2"></path><rect x="-6.5" y="-6" width="13" height="24" fill="#5980a6" stroke="#2c455d" stroke-width="1"></rect><path d="M-6.5 0 L6.5 6 M-6.5 8 L6.5 14" stroke="#2c455d" stroke-width="0.8"></path></g>`;
    const sx = W - 16;
    const mx = Math.max(60, W * 0.52);
    beam.querySelector('[data-sheave]')?.setAttribute('transform', `translate(${sx},15)`);
    beam.querySelector('[data-sheave2]')?.setAttribute('transform', `translate(${mx.toFixed(1)},22)`);
    const engine = engineRef.current;
    engine.rigGeo[id] = { W, H, sx, mx };
    engine.rigDone[id] = true;
    cacheHoists(id);
  }, [cacheHoists]);

  const focusWin = React.useCallback((id: DesktopAppId) => {
    const engine = engineRef.current;
    engine.focused = id;
    setFocused(id);
    const el = winEl(id);
    if (el) el.style.zIndex = String(++engine.z);
    if (!engine.rigDone[id]) requestAnimationFrame(() => layoutRig(id));
    else cacheHoists(id);
  }, [cacheHoists, layoutRig]);

  const openApp = React.useCallback((id: DesktopAppId, targetId?: string) => {
    setOpen((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
    requestAnimationFrame(() => {
      applyBounds(id);
      layoutRig(id);
      focusWin(id);
      if (targetId) {
        requestAnimationFrame(() => {
          document.getElementById(targetId)?.scrollIntoView({ behavior: engineRef.current.motion ? 'smooth' : 'auto', block: 'nearest' });
        });
      }
    });
  }, [applyBounds, focusWin, layoutRig]);

  const closeApp = React.useCallback((id: DesktopAppId) => {
    const engine = engineRef.current;
    engine.rigDone[id] = false;
    setOpen((prev) => {
      const next = { ...prev, [id]: false };
      const fallback = (Object.keys(next) as DesktopAppId[]).find((key) => next[key]) ?? null;
      engine.focused = fallback;
      setFocused(fallback);
      if (fallback) requestAnimationFrame(() => focusWin(fallback));
      return next;
    });
  }, [focusWin]);

  const showDesk = React.useCallback(() => {
    const engine = engineRef.current;
    engine.rigDone = {};
    engine.focused = null;
    setFocused(null);
    setOpen((prev) => {
      const next = { ...prev };
      (Object.keys(next) as DesktopAppId[]).forEach((key) => { next[key] = false; });
      return next;
    });
  }, []);

  const maximizeApp = React.useCallback((id: DesktopAppId) => {
    const engine = engineRef.current;
    const desk = deskEl();
    if (!desk) return;
    if (!engine.maxed[id]) {
      engine.maxed[id] = [...engine.bounds[id]] as Bounds;
      engine.bounds[id] = [8, 8, desk.clientWidth - 16, desk.clientHeight - 16];
    } else {
      engine.bounds[id] = engine.maxed[id] as Bounds;
      engine.maxed[id] = null;
    }
    applyBounds(id);
    engine.rigDone[id] = false;
    requestAnimationFrame(() => layoutRig(id));
    focusWin(id);
  }, [applyBounds, focusWin, layoutRig]);

  // Window drag, hoist nudge, escape-to-minimize, clock, resize, reduced motion.
  React.useEffect(() => {
    const engine = engineRef.current;
    const root = rootRef.current;
    if (!root) return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotion = () => { engine.motion = !motionQuery.matches; };
    syncMotion();
    motionQuery.addEventListener('change', syncMotion);

    const onMove = (event: PointerEvent) => {
      const drag = engine.dragCtx;
      if (!drag || event.pointerId !== drag.pid) return;
      engine.dragVel = event.clientX - (drag.lx ?? event.clientX);
      drag.lx = event.clientX;
      const nx = Math.max(0, drag.x + event.clientX - drag.sx);
      const ny = Math.max(0, drag.y + event.clientY - drag.sy);
      drag.el.style.left = `${nx}px`;
      drag.el.style.top = `${ny}px`;
      engine.bounds[drag.id][0] = nx;
      engine.bounds[drag.id][1] = ny;
    };
    const onUp = (event: PointerEvent) => {
      if (engine.dragCtx && event.pointerId === engine.dragCtx.pid) engine.dragCtx = null;
    };
    const onDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      const hoist = target?.closest?.('[data-hoist]') as HTMLElement | null;
      if (!hoist) return;
      const entry = engine.hoists.find((item) => item.el === hoist);
      if (!entry) return;
      const rect = hoist.getBoundingClientRect();
      entry.av += (event.clientX - rect.left - rect.width / 2 > 0 ? -1 : 1) * 24;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !engine.focused) return;
      if (document.querySelector('.panel-backdrop')) return; // AI/FX overlay owns Escape
      closeApp(engine.focused);
    };
    const onResize = () => {
      (Object.keys(engine.bounds) as DesktopAppId[]).forEach((id) => {
        const el = winEl(id);
        if (el && el.style.display !== 'none') {
          applyBounds(id);
          engine.rigDone[id] = false;
        }
      });
      if (engine.focused) requestAnimationFrame(() => layoutRig(engine.focused as DesktopAppId));
    };

    root.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);

    const clock = window.setInterval(() => {
      const el = root.querySelector('[data-clock]');
      if (el) el.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
    }, 1000);

    return () => {
      motionQuery.removeEventListener('change', syncMotion);
      root.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      window.clearInterval(clock);
    };
  }, [applyBounds, closeApp, layoutRig]);

  // Assistant bridge + hash navigation + deep links.
  React.useEffect(() => {
    const onOpenEvent = (event: Event) => {
      const detail = (event as CustomEvent<WorkbenchOpenDetail>).detail;
      if (!detail?.appId || !isDesktopAppId(detail.appId)) return;
      if (detail.action === 'minimize') closeApp(detail.appId);
      else openApp(detail.appId, detail.targetId);
    };
    const onHash = () => {
      const anchor = window.location.hash;
      if (!anchor) return;
      const appId = appForAnchor(anchor);
      const id = anchor.slice(1);
      if (appId) openApp(appId, id !== 'home' ? id : undefined);
    };
    window.addEventListener(WORKBENCH_OPEN_EVENT, onOpenEvent);
    window.addEventListener('hashchange', onHash);

    const params = new URLSearchParams(window.location.search);
    const requested = params.get('app');
    if (requested && isDesktopAppId(requested)) openApp(requested);
    else if (window.location.hash) onHash();

    return () => {
      window.removeEventListener(WORKBENCH_OPEN_EVENT, onOpenEvent);
      window.removeEventListener('hashchange', onHash);
    };
  }, [openApp, closeApp]);

  // Initial layout + physics loop.
  React.useEffect(() => {
    const engine = engineRef.current;
    requestAnimationFrame(() => {
      (['home', 'selected-work'] as DesktopAppId[]).forEach((id) => {
        applyBounds(id);
        layoutRig(id);
      });
      focusWin('home');
    });

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      engine.dragVel = (engine.dragVel || 0) * (engine.dragCtx ? 0.6 : 0.84);
      const id = engine.focused;
      if (!id) return;
      const el = winEl(id);
      if (!el || el.style.display === 'none') return;
      const geo = engine.rigGeo[id];
      if (!geo) return;
      const motion = engine.motion;
      const scrollState = engine.scroll[id] ?? { el: null, st: 0, prev: 0, vel: 0, max: 1 };
      const dv = (scrollState.st ?? 0) - (scrollState.prev ?? 0);
      scrollState.prev = scrollState.st ?? 0;
      scrollState.vel = (scrollState.vel || 0) * 0.86 + dv * 0.14;
      const progress = scrollState.max > 0 ? Math.min(1, Math.max(0, (scrollState.st || 0) / scrollState.max)) : 0;
      const beam = el.querySelector<SVGSVGElement>(`[data-rig="${id}"]`);
      const rail = el.querySelector<SVGSVGElement>(`[data-rail="${id}"]`);
      if (!beam || !rail) return;
      engine.rot[id] = (engine.rot[id] || 0) + dv * 0.7;
      beam.querySelector('[data-spokes]')?.setAttribute('transform', `rotate(${((engine.rot[id] as number) % 360).toFixed(1)})`);
      beam.querySelector('[data-spokes2]')?.setAttribute('transform', `rotate(${((-(engine.rot[id] as number) * 0.8) % 360).toFixed(1)})`);
      const sag = Math.max(1.5, CABLE_SAG - Math.min(CABLE_SAG - 1.5, Math.abs(scrollState.vel) * 0.4));
      beam.querySelector('[data-cable]')?.setAttribute('d', routePath([[16, 12], [geo.mx ?? geo.sx * 0.6, 22], [geo.sx, 6.5]], motion ? sag * 0.6 : 1.5));
      const weight = engine.wt[id] = engine.wt[id] ?? { y: 8, v: 0 };
      const railLen = geo.H - 46;
      const target = 8 + progress * railLen;
      if (motion) {
        const [ny, nv] = spring(weight.y, weight.v, target, 68, 7.2, 1 / 60);
        weight.y = ny; weight.v = nv;
      } else {
        weight.y = target; weight.v = 0;
      }
      rail.querySelector('[data-weight]')?.setAttribute('transform', `translate(12,${(weight.y + 14).toFixed(1)})`);
      beam.querySelector('[data-drop]')?.setAttribute('d', `M${geo.sx + 8.5} 15 H${geo.W + 12}`);
      const readout = el.querySelector(`[data-ro="${id}"]`);
      if (readout) readout.textContent = `HOIST ${String(Math.round(progress * 100)).padStart(3, '0')}%`;
      const scroller = scrollState.el;
      if (scroller && engine.hoists.length) {
        const viewBottom = scroller.getBoundingClientRect().bottom;
        for (const hoist of engine.hoists) {
          if (!hoist.el.isConnected) continue;
          const rect = hoist.el.getBoundingClientRect();
          const t = Math.min(1, Math.max(0, (viewBottom - (rect.top - hoist.y)) / 130));
          const ty = (1 - t) * 30;
          if (motion) {
            const [ny, nv] = spring(hoist.y, hoist.v, ty, 110, 11, 1 / 60);
            hoist.y = ny; hoist.v = nv;
            const swingTarget = Math.max(-6.5, Math.min(6.5, -(scrollState.vel * 0.14 + (engine.dragVel || 0) * 0.45)));
            const [na, nav] = spring(hoist.a, hoist.av, swingTarget, 52, 4.6, 1 / 60);
            hoist.a = Math.max(-9, Math.min(9, na)); hoist.av = nav;
          } else {
            hoist.y = ty; hoist.a = 0;
          }
          hoist.el.style.transform = `translateY(${hoist.y.toFixed(2)}px) rotate(${hoist.a.toFixed(2)}deg)`;
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [applyBounds, focusWin, layoutRig]);

  const onScroll = (id: DesktopAppId) => (event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const engine = engineRef.current;
    const state = engine.scroll[id] ?? { el, st: el.scrollTop, prev: el.scrollTop, vel: 0, max: 1 };
    state.el = el;
    state.st = el.scrollTop;
    state.max = el.scrollHeight - el.clientHeight;
    engine.scroll[id] = state;
  };

  const dragStart = (id: DesktopAppId) => (event: React.PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    const el = winEl(id);
    if (!el) return;
    focusWin(id);
    engineRef.current.dragCtx = {
      id, el, pid: event.pointerId, sx: event.clientX, sy: event.clientY,
      x: parseFloat(el.style.left) || 0, y: parseFloat(el.style.top) || 0,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const launch = (id: DesktopAppId, source: 'rail' | 'desktop') => {
    track('nav_link_clicked', { destination: `${source}:${id}` });
    openApp(id);
  };

  return (
    <div className="wb-root" ref={rootRef}>
      <header className="wb-header">
        <div className="wb-brand">
          <span className="wb-brand-name">RM · FIELD WORKBENCH</span>
          <span className="wb-brand-sub">DRAWING SET — PORTFOLIO OF {SITE_CONFIG.name.toUpperCase()}</span>
        </div>
        <div className="wb-status">
          <span>REV {SITE_CONFIG.resumeEdition}</span>
          <span className="wb-vr" aria-hidden="true" />
          <span>SINGAPORE · 1.29°N 103.85°E</span>
          <span className="wb-vr" aria-hidden="true" />
          <span data-clock>00:00:00</span>
          <span className="wb-status-dot" aria-hidden="true" />
        </div>
      </header>
      <div className="wb-frame">
        <nav className="wb-rail" aria-label="Tool rail">
          <div className="wb-rail-label">TOOL RAIL</div>
          {workbenchApps.map((app) => (
            <button
              key={app.id}
              type="button"
              data-active={focused === app.id || undefined}
              onClick={() => launch(app.id, 'rail')}
              aria-label={`Open ${app.label}`}
            >
              <AppIcon path={app.icon} />
              <span className="wb-rail-name">{app.shortLabel}</span>
              <span className="wb-rail-lamp" data-lit={focused === app.id ? 'focus' : open[app.id] ? 'open' : undefined} aria-hidden="true" />
            </button>
          ))}
          <button type="button" className="wb-rail-desk" onClick={showDesk}>DESK</button>
        </nav>
        <main className="wb-desk" data-desk>
          <ul className="wb-shortcuts" aria-label="Desktop shortcuts">
            {workbenchApps.map((app) => (
              <li key={app.id}>
                <button type="button" onClick={() => launch(app.id, 'desktop')} aria-label={`Open ${app.label}`}>
                  <AppIcon path={app.icon} size={24} />
                  <span>{app.shortLabel}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="wb-hint">SELECT A MODULE · WINDOWS DRAG BY THEIR TITLE BAR · SCROLL A SHEET TO WORK ITS RIG · ESC MINIMIZES</p>
          <div className="blueprint wb-plate" aria-hidden="true">
            <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
            <div className="wb-plate-grid">
              <div className="wb-plate-key">TITLE</div><div className="wb-plate-val wb-plate-title">PORTFOLIO FIELD WORKBENCH</div>
              <div className="wb-plate-key">DRAWN BY</div><div className="wb-plate-val">RAHUL MITRA — RM</div>
              <div className="wb-plate-key">SHEET</div><div className="wb-plate-val">01 OF 01 · SCALE 1:1 · REV {SITE_CONFIG.resumeEdition}</div>
            </div>
          </div>
          {workbenchApps.map((app) => {
            const Body = WINDOW_BODIES[app.id];
            const [footLeft, footRight] = WINDOW_FOOTERS[app.id];
            return (
              <section
                key={app.id}
                data-win={app.id}
                data-focused={focused === app.id || undefined}
                className={`blueprint wb-win wb-win-${app.id}`}
                style={{ display: open[app.id] ? 'flex' : 'none' }}
                role="dialog"
                aria-label={app.label}
              >
                <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
                <header className="wb-titlebar" onPointerDown={dragStart(app.id)}>
                  <div className="wb-controls">
                    <button type="button" aria-label={`Close ${app.label}`} onClick={() => closeApp(app.id)}>×</button>
                    <button type="button" aria-label={`Minimize ${app.label}`} onClick={() => closeApp(app.id)}>–</button>
                    <button type="button" aria-label={`Maximize ${app.label}`} onClick={() => maximizeApp(app.id)}>+</button>
                  </div>
                  <div className="wb-titlebar-id">
                    <span className="wb-win-kind">{app.kind} · {app.win}</span>
                    <h2 className="wb-win-title">{app.label}</h2>
                  </div>
                  <span className="wb-ro" data-ro={app.id}>HOIST 000%</span>
                </header>
                <div className="wb-rig"><svg data-rig={app.id} /></div>
                <div className="wb-body">
                  <div className="wb-scroll" data-scroll={app.id} onScroll={onScroll(app.id)} tabIndex={0} role="region" aria-label={`${app.label} sheet`}>
                    <Body />
                  </div>
                  <div className="wb-railgutter"><svg data-rail={app.id} /></div>
                </div>
                <footer className="wb-foot">
                  <span>{footLeft}</span>
                  <span>{footRight}</span>
                </footer>
              </section>
            );
          })}
        </main>
      </div>
    </div>
  );
};

export default FieldWorkbench;
