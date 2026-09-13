import React from 'react';
import { MECHANISMS, MECHANISM_FRAME, type Io, type Mechanism, type St } from '../../lib/pgaMechanisms';
import { kit, type Kit, type Palette } from '../../lib/pgaDraw';
import { Corners } from './bits';

// Six mechanisms from the PGA library, each solved from constraints every frame.
// Hosting rules this file exists to enforce:
//  - kit()/reset() read devicePixelRatio, so everything canvas happens in an
//    effect. App.tsx is prerendered; the render pass stays window-free.
//  - one rAF for the whole bench, and only visible canvases are drawn
//    (IntersectionObserver), so six mechanisms cost one frame callback.
//  - prefers-reduced-motion gets a single static frame and no loop. Pointer-
//    driven redraws still happen, because those are user-initiated.
//  - a <canvas> contributes nothing to the accessibility tree, so each one is
//    role="img" with a label built from the mechanism's own words, and the same
//    words are rendered as real text beside it.
//
// Canvases are found by scanning the DOM rather than by ref callbacks: the
// workbench keeps all eleven windows mounted and re-renders them on open/close,
// which detaches and re-attaches every ref. A scan after each render (and a
// prune of disconnected nodes) survives that; a one-shot ref registry does not.

const { w: W, h: H } = MECHANISM_FRAME;

const readPalette = (): Palette => {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => (s.getPropertyValue(name) || '').trim() || fallback;
  return {
    ink: v('--color-text', '#1d1f20'),
    accent: v('--color-accent', '#5980a6'),
    ghost: v('--color-neutral-500', '#8b9096'),
    faint: v('--color-neutral-300', '#c2c6ca'),
    paper: v('--color-bg', '#f2f2f3'),
    // Not neutral-500: this is the caption colour, and CLAUDE.md pins
    // neutral-700 for the smallest annotation text. See lib/pgaDraw.ts.
    label: v('--color-neutral-700', '#5d5d60'),
  };
};

interface Rec {
  el: HTMLCanvasElement;
  g: Kit;
  io: Io;
  st: St;
  mech: Mechanism;
  visible: boolean;
  failed: boolean;
  detach: () => void;
}

const byId = new Map(MECHANISMS.map((m) => [m.id, m]));

export const MechanismBench: React.FC = () => {
  const rootRef = React.useRef<HTMLUListElement>(null);
  const scanRef = React.useRef<() => void>(() => {});

  React.useEffect(() => {
    const palette = readPalette();
    const live = new Map<string, Rec>();
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let running = false;
    let raf = 0;
    let last = 0;

    const render = (rec: Rec) => {
      if (rec.failed) return;
      rec.g.reset();
      try {
        rec.mech.draw(rec.g, rec.io, rec.st);
      } catch (error) {
        // One bad mechanism must not take the bench down with it.
        rec.failed = true;
        rec.el.hidden = true;
        console.warn('[mechanism]', rec.mech.id, error);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        const rec = live.get((entry.target as HTMLElement).dataset.mechId || '');
        if (rec && rec.el === entry.target) rec.visible = entry.isIntersecting;
      }),
      { rootMargin: '200px' },
    );

    const attach = (el: HTMLCanvasElement, mech: Mechanism): Rec => {
      const rec: Rec = {
        el,
        g: kit(el, W, H, palette),
        io: { u: 0, t: 0, dt: 1 / 60, mx: W / 2, my: H / 2, hover: false, down: false, traces: !motionQuery.matches },
        st: {},
        mech,
        visible: true,
        failed: false,
        detach: () => {},
      };
      // Pointer coordinates arrive in CSS pixels; mechanisms are authored in a
      // fixed 320x230 frame, so map back through the element's real size.
      const at = (event: PointerEvent) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        rec.io.mx = ((event.clientX - r.left) * W) / r.width;
        rec.io.my = ((event.clientY - r.top) * H) / r.height;
      };
      const drag = { u: 0, x: 0 };
      const onEnter = (e: PointerEvent) => { rec.io.hover = true; at(e); };
      const onLeave = () => { rec.io.hover = false; rec.io.down = false; };
      const onMove = (e: PointerEvent) => {
        at(e);
        if (rec.io.down && mech.d === 'crank') rec.io.u = drag.u + (rec.io.mx - drag.x) * 0.03;
        if (!running) render(rec);
      };
      const onDown = (e: PointerEvent) => {
        at(e);
        rec.io.down = true;
        drag.u = rec.io.u;
        drag.x = rec.io.mx;
        try { el.setPointerCapture(e.pointerId); } catch { /* capture is best-effort */ }
        e.preventDefault();
        if (!running) render(rec);
      };
      const onUp = () => { rec.io.down = false; };
      el.addEventListener('pointerenter', onEnter);
      el.addEventListener('pointerleave', onLeave);
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
      rec.detach = () => {
        observer.unobserve(el);
        el.removeEventListener('pointerenter', onEnter);
        el.removeEventListener('pointerleave', onLeave);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerdown', onDown);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onUp);
      };
      observer.observe(el);
      return rec;
    };

    const scan = () => {
      for (const [id, rec] of live) {
        if (rec.el.isConnected) continue;
        rec.detach();
        live.delete(id);
      }
      const root = rootRef.current;
      if (!root) return;
      for (const el of root.querySelectorAll<HTMLCanvasElement>('canvas[data-mech-id]')) {
        const id = el.dataset.mechId || '';
        const mech = byId.get(id);
        if (!mech || live.get(id)?.el === el) continue;
        live.get(id)?.detach();
        const rec = attach(el, mech);
        live.set(id, rec);
        if (!running) render(rec);
      }
    };
    scanRef.current = scan;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      let dt = (now - (last || now)) / 1000;
      last = now;
      if (!(dt > 0) || dt > 0.06) dt = 1 / 60;
      for (const rec of live.values()) {
        if (!rec.visible || rec.failed) continue;
        const { io, mech } = rec;
        io.dt = dt;
        io.t += dt;
        if (!io.down && mech.d === 'crank') io.u += dt * (mech.rate ?? 1);
        // An idle 'point' mechanism walks its own target so it reads as alive.
        if (mech.d === 'point' && !io.hover) {
          io.mx = 160 + 96 * Math.sin(io.t * 0.62);
          io.my = 108 + 58 * Math.sin(io.t * 0.97 + 1.2);
        }
        render(rec);
      }
    };

    const syncMotion = () => {
      const wanted = !motionQuery.matches;
      for (const rec of live.values()) rec.io.traces = wanted;
      if (wanted === running) return;
      running = wanted;
      if (running) {
        last = 0;
        raf = requestAnimationFrame(frame);
      } else {
        cancelAnimationFrame(raf);
        raf = 0;
        live.forEach(render);
      }
    };

    scan();
    syncMotion();
    motionQuery.addEventListener('change', syncMotion);

    return () => {
      scanRef.current = () => {};
      motionQuery.removeEventListener('change', syncMotion);
      cancelAnimationFrame(raf);
      live.forEach((rec) => rec.detach());
      live.clear();
      observer.disconnect();
    };
  }, []);

  // No dep array: the workbench re-renders every window on open/close, which can
  // replace these canvas nodes. Re-scan after each render so they get re-attached.
  React.useEffect(() => { scanRef.current(); });

  return (
    <figure className="blueprint wb-figure wb-mechbench">
      <Corners />
      <div className="wb-figure-head">
        <h3>Mechanism Bench — Planar PGA</h3>
        <span>6 OF 83 · LIVE</span>
      </div>
      <ul className="wb-mechs" ref={rootRef}>
        {MECHANISMS.map((mech) => (
          <li className="wb-mech" key={mech.id}>
            <div className="wb-mech-head">
              <span className="wb-mech-id">{mech.id}</span>
              <span className="wb-mech-fam">{mech.f}</span>
            </div>
            <canvas
              data-mech-id={mech.id}
              data-drive={mech.d}
              width={W}
              height={H}
              className="wb-mech-canvas"
              role="img"
              aria-label={`${mech.n}. ${mech.i}`}
            />
            <h4 className="wb-mech-name">{mech.n}</h4>
            <p className="wb-mech-pga">{mech.pga}</p>
            <p className="wb-mech-why">{mech.why}</p>
          </li>
        ))}
      </ul>
      <figcaption>
        FIG. 05c — One projective geometric algebra carries all six: points, lines, join, meet, and the sandwich
        <i> M p M̃ </i> doing every placement. Nothing is keyframed — each part is placed by a motor and its
        dependents are solved from constraints each frame. Drag a crank, or move the pointer over an arm.
      </figcaption>
    </figure>
  );
};
