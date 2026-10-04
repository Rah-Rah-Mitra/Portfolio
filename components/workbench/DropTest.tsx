import React from 'react';
import { coreCompetencies } from '../../portfolioData';
import { loadMatter } from '../../lib/physicsRuntime';
import { motionHalted, onMotionChange } from '../../lib/motion';
import { dispatchPortfolioWorldEvent } from '../../lib/worldEvents';
import {
  DROP_FRAME, FLOOR_Y, G, HOLD_STEPS, IDLE_READOUT, SMASH_DEFAULTS, SMASH_LIMITS, STEP_MS,
  STRIKE_CENTRE, WELL_CENTRE, WELL_DEFAULTS, WELL_LIMITS, buildLayout, isMoving, poseTransform,
  smashPeakDv, smashPeakSpeed, wellPeakG,
  type DropMode, type DropParams, type DropReadout, type Vec,
} from '../../lib/dropTest';
import type { DropRig } from '../../lib/dropRig';
import { Corners } from './bits';

// Drop test — FIG. 05e. The old Smash / Gravity word physics, contained: a
// bounded rig of six stacks, one per competency and built from its own tools,
// that the pointer strikes or pulls. lib/dropTest.ts decides every outcome;
// this file only maps the DOM onto it. Host rules, the ones MechanismBench keeps:
//  - render is window-free and draws the home stacks, so the prerender is a
//    meaningful static figure. matter-js loads only when the rig scrolls into
//    view or is first struck (lib/physicsRuntime.ts), never in the main bundle.
//  - one rAF stepping the engine at a fixed 1/60 s, stopped whenever every
//    block sleeps, the rig is offscreen, or motion is halted. Halted, an action
//    resolves to rest at once and only the end state is drawn: the result of
//    the test without the motion. Reset is then instant.
//  - blocks are SVG <g>s placed in rig units through the viewBox, and the
//    pointer is mapped back through getScreenCTM(), so a dragged, swinging,
//    rig-transformed window still lands a strike where it was aimed.
//  - nodes are found by DOM scan after every render, not by one-shot refs, so a
//    re-render that replaces a node cannot leave a listener on a detached one.
//  - the stage is aria-hidden; the same words are a real list for assistive
//    tech, and every pointer action has a button.

const LAYOUT = buildLayout(coreCompetencies);
const STACKS = LAYOUT.columns.map((column) => ({
  ...column,
  stack: LAYOUT.blocks.filter((block) => block.column === column.id).map((block) => block.label),
}));
const TOTAL = LAYOUT.blocks.length;
const { w: W, h: H } = DROP_FRAME;
/** DROP_TEST_STRUCK feeds the sound cue; a burst of clicks is one event. */
const STRUCK_GAP_MS = 600;

// Static drawing, built once: a 40 u (40 cm) grid over the bay, and the
// ground-hatch below the floor line.
const GRID_PATH = [
  ...Array.from({ length: W / 40 - 1 }, (_, i) => `M${40 * (i + 1)} 0V${FLOOR_Y}`),
  ...Array.from({ length: FLOOR_Y / 40 - 1 }, (_, i) => `M0 ${40 * (i + 1)}H${W}`),
].join('');
const HATCH_PATH = Array.from({ length: W / 8 }, (_, i) => `M${8 * i} ${FLOOR_Y + 8}L${8 * i + 8} ${FLOOR_Y}`).join('');

type Api = { strikeCentre: () => void; pullCentre: () => void; reset: () => void; release: () => void };

const sameReadout = (a: DropReadout, b: DropReadout) => (
  a.phase === b.phase && a.moving === b.moving && a.displaced === b.displaced
  && a.peakImpulse === b.peakImpulse && a.elapsed === b.elapsed && a.settle === b.settle
);

const formatImpulse = (value: number | null) => (value === null ? '—' : `${Math.round(value)} N·s`);

const formatSettle = (readout: DropReadout) => {
  if (readout.settle !== null) return `${readout.settle.toFixed(2)} s`;
  if (readout.elapsed !== null) return `${readout.elapsed.toFixed(1)} s…`;
  return '—';
};

const statusLine = (readout: DropReadout) => {
  switch (readout.phase) {
    case 'held': return 'Gravity well on: world gravity is off and every block is pulled toward the well.';
    case 'restoring': return 'Restacking the blocks.';
    case 'rest': return readout.settle === null ? '' : (
      `At rest after ${readout.settle.toFixed(2)} s: ${readout.displaced} of ${readout.total} blocks off their stacks, `
      + `peak impulse ${formatImpulse(readout.peakImpulse)}.`
    );
    default: return '';
  }
};

export const DropTest: React.FC = () => {
  const [mode, setMode] = React.useState<DropMode>('smash');
  const [smash, setSmash] = React.useState<DropParams>(SMASH_DEFAULTS);
  const [well, setWell] = React.useState<DropParams>(WELL_DEFAULTS);
  const [readout, setReadout] = React.useState<DropReadout>(() => IDLE_READOUT(TOTAL));
  const rootRef = React.useRef<HTMLElement>(null);
  const scanRef = React.useRef<() => void>(() => {});
  const apiRef = React.useRef<Api | null>(null);
  const paramsRef = React.useRef({ mode, smash, well });

  React.useEffect(() => { paramsRef.current = { mode, smash, well }; });

  React.useEffect(() => {
    let disposed = false;
    let rig: DropRig | null = null;
    let loading = false;
    const queue: Array<(r: DropRig) => void> = [];
    let stage: SVGSVGElement | null = null;
    let controls: HTMLElement | null = null;
    const blockEls = new Map<number, SVGGElement>();
    let hoverRing: SVGCircleElement | null = null;
    let wellRing: SVGGElement | null = null;
    let flashRing: SVGCircleElement | null = null;
    let visible = typeof IntersectionObserver === 'undefined';
    let running = false;
    let raf = 0;
    let last = 0;
    let acc = 0;
    let frames = 0;
    let holding: number | null = null;
    let lastStruck = -Infinity;

    const publish = () => {
      if (!rig) return;
      const next = rig.readout();
      setReadout((prev) => (sameReadout(prev, next) ? prev : next));
    };

    const paint = () => {
      if (!rig) return;
      rig.bodies.forEach((body, i) => {
        const el = blockEls.get(i);
        if (!el) return;
        el.setAttribute('transform', poseTransform(body.position.x, body.position.y, body.angle));
        el.toggleAttribute('data-moving', isMoving(body));
      });
      const at = rig.wellPoint;
      stage?.toggleAttribute('data-zero-g', !!at);
      if (wellRing) {
        wellRing.toggleAttribute('data-show', !!at);
        if (at) wellRing.setAttribute('transform', `translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})`);
      }
    };

    // — loop ——————————————————————————————————————————————————————————————
    const frame = (now: number) => {
      raf = 0;
      if (!rig || !running) return;
      // Fixed steps from an accumulator: the frame rate decides how many steps
      // are shown per frame, never what the steps compute.
      acc += last ? Math.min(100, now - last) : 0;
      last = now;
      let n = 0;
      while (acc >= STEP_MS && n < 4) {
        rig.step();
        acc -= STEP_MS;
        n += 1;
      }
      if (n === 4) acc = Math.min(acc, STEP_MS); // a stall is dropped, not replayed in a burst
      paint();
      frames += 1;
      if (rig.idle) {
        running = false;
        publish();
        return;
      }
      if (frames % 6 === 0) publish();
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (!rig || running || rig.idle || !visible || motionHalted()) return;
      running = true;
      last = 0;
      acc = 0;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    // — engine ————————————————————————————————————————————————————————————
    const load = () => {
      if (rig || loading) return;
      loading = true;
      // The rig class rides in with matter-js: neither is in the entry chunk.
      Promise.all([loadMatter(), import('../../lib/dropRig')]).then(([M, { DropRig }]) => {
        if (disposed) return;
        const ready = new DropRig(M, LAYOUT.blocks);
        rig = ready;
        queue.splice(0).forEach((fn) => fn(ready));
      }).catch((error: unknown) => {
        // The figure stays a correct static drawing; a later action retries.
        loading = false;
        queue.length = 0;
        console.warn('[drop-test] physics engine failed to load', error);
      });
    };
    const withRig = (fn: (r: DropRig) => void) => {
      if (rig) fn(rig);
      else {
        queue.push(fn);
        load();
      }
    };
    const afterAction = (r: DropRig) => {
      if (motionHalted()) r.settle();
      paint();
      publish();
      start();
    };

    const announce = (kind: DropMode, bodies: number) => {
      const now = performance.now();
      if (!bodies || now - lastStruck < STRUCK_GAP_MS) return;
      lastStruck = now;
      dispatchPortfolioWorldEvent({ type: 'DROP_TEST_STRUCK', mode: kind, bodies });
    };
    const flash = (at: Vec, radius: number) => {
      const el = flashRing;
      if (!el || motionHalted() || typeof el.animate !== 'function') return;
      el.setAttribute('cx', at.x.toFixed(1));
      el.setAttribute('cy', at.y.toFixed(1));
      el.setAttribute('r', String(radius));
      el.animate(
        [{ opacity: 0.9, transform: 'scale(0.3)' }, { opacity: 0, transform: 'scale(1)' }],
        { duration: 420, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
      );
    };

    const strike = (at: Vec) => withRig((r) => {
      const { smash: p } = paramsRef.current;
      flash(at, p.radius);
      announce('smash', r.strike(at, smashPeakDv(p.intensity), p.radius));
      afterAction(r);
    });
    const pull = (at: Vec, steps: number | null) => withRig((r) => {
      const { well: p } = paramsRef.current;
      announce('gravity', r.hold(at, wellPeakG(p.intensity) * G, p.radius, steps));
      afterAction(r);
    });
    // Queued like any action, so a press and release that both land before
    // matter-js arrives still replay in order.
    const release = () => withRig((r) => {
      r.release();
      afterAction(r);
    });
    const reset = () => {
      if (!rig) return; // nothing has moved yet
      rig.restore(motionHalted());
      afterAction(rig);
    };

    // — pointer ———————————————————————————————————————————————————————————
    const toRig = (event: PointerEvent): Vec | null => {
      if (!stage) return null;
      const ctm = stage.getScreenCTM?.();
      if (ctm && typeof DOMPoint === 'function') {
        const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
        return { x: p.x, y: p.y };
      }
      const box = stage.getBoundingClientRect();
      if (!box.width || !box.height) return null;
      return { x: ((event.clientX - box.left) * W) / box.width, y: ((event.clientY - box.top) * H) / box.height };
    };
    const showHover = (at: Vec | null) => {
      if (!hoverRing) return;
      hoverRing.toggleAttribute('data-show', !!at);
      if (at) {
        hoverRing.setAttribute('cx', at.x.toFixed(1));
        hoverRing.setAttribute('cy', at.y.toFixed(1));
      }
    };
    const onDown = (event: PointerEvent) => {
      // The hoisted card swings on any pointerdown; under a strike that would
      // swing the target out from under the pointer.
      event.stopPropagation();
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const at = toRig(event);
      if (!at) return;
      event.preventDefault();
      showHover(at);
      if (paramsRef.current.mode === 'smash') {
        strike(at);
        return;
      }
      holding = event.pointerId;
      try { stage?.setPointerCapture(event.pointerId); } catch { /* capture is best-effort */ }
      pull(at, null);
    };
    const onMove = (event: PointerEvent) => {
      const at = toRig(event);
      if (!at) return;
      showHover(at);
      if (holding !== event.pointerId || !rig || motionHalted()) return;
      rig.move(at);
      if (!running) paint();
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') showHover(null);
      if (holding !== event.pointerId) return;
      holding = null;
      release();
    };
    const onLeave = () => { if (holding === null) showHover(null); };
    const stopSwing = (event: Event) => event.stopPropagation();

    const attachStage = (el: SVGSVGElement) => {
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
      el.addEventListener('lostpointercapture', onUp);
      el.addEventListener('pointerleave', onLeave);
    };
    const detachStage = (el: SVGSVGElement) => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('lostpointercapture', onUp);
      el.removeEventListener('pointerleave', onLeave);
    };

    // Labels are sized from an estimate of Barlow Condensed; if the face
    // actually rendered is wider, squeeze that label into its block.
    const fit = () => {
      blockEls.forEach((el, i) => {
        const text = el.querySelector('text');
        if (!text || typeof text.getComputedTextLength !== 'function') return;
        text.removeAttribute('textLength');
        text.removeAttribute('lengthAdjust');
        const room = LAYOUT.blocks[i].w - 8;
        if (text.getComputedTextLength() > room) {
          text.setAttribute('textLength', String(room));
          text.setAttribute('lengthAdjust', 'spacingAndGlyphs');
        }
      });
    };

    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.target === stage) visible = entry.isIntersecting;
      if (!visible) {
        stop();
        return;
      }
      load();
      fit();
      start();
    }, { rootMargin: '200px' });

    const scan = () => {
      const root = rootRef.current;
      if (!root) return;
      const nextStage = root.querySelector<SVGSVGElement>('svg[data-drop-stage]');
      if (nextStage !== stage) {
        if (stage) {
          detachStage(stage);
          observer?.unobserve(stage);
        }
        stage = nextStage;
        if (stage) {
          attachStage(stage);
          // Without an observer there is no telling whether the rig is seen,
          // so the engine waits for the first action instead.
          observer?.observe(stage);
        }
      }
      const nextControls = root.querySelector<HTMLElement>('[data-drop-controls]');
      if (nextControls !== controls) {
        controls?.removeEventListener('pointerdown', stopSwing);
        controls = nextControls;
        controls?.addEventListener('pointerdown', stopSwing);
      }
      let replaced = false;
      root.querySelectorAll<SVGGElement>('g[data-block]').forEach((el) => {
        const index = Number(el.dataset.block);
        if (blockEls.get(index) === el) return;
        blockEls.set(index, el);
        replaced = true;
      });
      hoverRing = root.querySelector<SVGCircleElement>('[data-drop-ring="hover"]');
      wellRing = root.querySelector<SVGGElement>('[data-drop-ring="well"]');
      flashRing = root.querySelector<SVGCircleElement>('[data-drop-ring="flash"]');
      if (replaced) {
        paint();
        if (visible) fit();
      }
    };
    scanRef.current = scan;

    const syncMotion = () => {
      if (!motionHalted()) {
        start();
        return;
      }
      stop();
      if (rig && !rig.idle) {
        rig.settle();
        paint();
        publish();
      }
    };

    apiRef.current = {
      strikeCentre: () => strike(STRIKE_CENTRE),
      pullCentre: () => pull(WELL_CENTRE, HOLD_STEPS),
      reset,
      release: () => { if (rig) release(); },
    };

    scan();
    const stopMotionSync = onMotionChange(syncMotion);
    document.fonts?.ready.then(() => { if (!disposed && visible) fit(); }).catch(() => {});

    return () => {
      disposed = true;
      stop();
      stopMotionSync();
      observer?.disconnect();
      if (stage) detachStage(stage);
      controls?.removeEventListener('pointerdown', stopSwing);
      apiRef.current = null;
      scanRef.current = () => {};
      rig?.dispose();
      rig = null;
    };
  }, []);

  // No dep array: re-scan after every render, so a render that replaces one of
  // these nodes re-attaches it. (FieldWorkbench memoizes window bodies, so these
  // are the bench's own renders.) Each <output> below is aria-hidden: the
  // slider's aria-valuetext already speaks the value, and an <output> is a live
  // region that would announce it twice (as in CameraLab).
  React.useEffect(() => { scanRef.current(); });

  const params = mode === 'smash' ? smash : well;
  const limits = mode === 'smash' ? SMASH_LIMITS : WELL_LIMITS;
  const setParams = mode === 'smash' ? setSmash : setWell;
  const intensityLabel = mode === 'smash' ? 'Peak Δv' : 'Peak pull';
  const intensityValue = mode === 'smash'
    ? `${smashPeakSpeed(params.intensity).toFixed(1)} m/s`
    : `${wellPeakG(params.intensity).toFixed(1)} g`;
  const radiusLabel = mode === 'smash' ? 'Blast radius' : 'Core radius';
  const radiusValue = `${(params.radius / 100).toFixed(2)} m`;

  const chooseMode = (next: DropMode) => {
    if (next === mode) return;
    apiRef.current?.release();
    setMode(next);
  };

  return (
    <figure className="blueprint wb-figure wb-drop" id="drop-test" ref={rootRef}>
      <Corners />
      <div className="wb-figure-head">
        <h3>Drop Test — Competency Stacks</h3>
        <span>{TOTAL} BODIES · 60 HZ FIXED STEP</span>
      </div>

      <div className="wb-drop-controls" data-drop-controls>
        <div className="wb-drop-modes" role="group" aria-label="Load case">
          <button
            type="button"
            className={`btn ${mode === 'smash' ? 'btn-primary' : 'btn-secondary'}`}
            aria-pressed={mode === 'smash'}
            onClick={() => chooseMode('smash')}
          >
            Smash
          </button>
          <button
            type="button"
            className={`btn ${mode === 'gravity' ? 'btn-primary' : 'btn-secondary'}`}
            aria-pressed={mode === 'gravity'}
            onClick={() => chooseMode('gravity')}
          >
            Gravity well
          </button>
        </div>
        <label className="wb-drop-range">
          <span>{intensityLabel}<output aria-hidden="true">{intensityValue}</output></span>
          <input
            type="range"
            min={limits.intensity[0]}
            max={limits.intensity[1]}
            step={5}
            value={params.intensity}
            aria-label={intensityLabel}
            aria-valuetext={intensityValue}
            onChange={(event) => {
              const intensity = Number(event.target.value);
              setParams((current) => ({ ...current, intensity }));
            }}
          />
        </label>
        <label className="wb-drop-range">
          <span>{radiusLabel}<output aria-hidden="true">{radiusValue}</output></span>
          <input
            type="range"
            min={limits.radius[0]}
            max={limits.radius[1]}
            step={mode === 'smash' ? 10 : 5}
            value={params.radius}
            aria-label={radiusLabel}
            aria-valuetext={radiusValue}
            onChange={(event) => {
              const radius = Number(event.target.value);
              setParams((current) => ({ ...current, radius }));
            }}
          />
        </label>
        <div className="wb-drop-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => (mode === 'smash' ? apiRef.current?.strikeCentre() : apiRef.current?.pullCentre())}
          >
            {mode === 'smash' ? 'Strike centre' : 'Pull to centre'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => apiRef.current?.reset()}>
            Reset stack
          </button>
        </div>
      </div>

      <p className="wb-drop-hint">
        {mode === 'smash'
          ? 'Click inside the rig to strike. The dashed ring is the blast radius.'
          : 'Press and hold inside the rig: gravity switches off and every block falls toward the pointer. Let go and it comes back.'}
      </p>

      <svg
        data-drop-stage
        data-mode={mode}
        className="wb-drop-stage"
        viewBox={`0 0 ${W} ${H}`}
        aria-hidden="true"
        focusable="false"
      >
        <path className="wb-drop-grid" d={GRID_PATH} />
        <rect className="wb-drop-bay" x={0} y={0} width={W} height={FLOOR_Y} />
        <path className="wb-drop-hatch" d={HATCH_PATH} />
        <line className="wb-drop-floor" x1={0} y1={FLOOR_Y} x2={W} y2={FLOOR_Y} />

        <g className="wb-drop-note">
          <path className="wb-drop-dim" d="M12 10V20M12 15H112M112 10V20" />
          <text x={118} y={18}>1 m</text>
          <path className="wb-drop-dim" d={`M${W - 12} 8V24M${W - 15} 20L${W - 12} 24L${W - 9} 20`} />
          <text className="wb-drop-g" x={W - 20} y={18} textAnchor="end">g = 9.81 m/s²</text>
          <text className="wb-drop-g0" x={W - 20} y={18} textAnchor="end">g = 0 · well held</text>
        </g>

        {LAYOUT.columns.map((column) => (
          <g key={column.id} className="wb-drop-col">
            <path className="wb-drop-dim" d={`M${column.x} ${FLOOR_Y + 8}V${FLOOR_Y + 14}`} />
            <text x={column.x} y={FLOOR_Y + 27} textAnchor="middle">{column.short}</text>
          </g>
        ))}

        {LAYOUT.blocks.map((block, index) => (
          <g
            key={block.id}
            data-block={index}
            className="wb-drop-block"
            transform={poseTransform(block.home.x, block.home.y)}
          >
            <rect x={-block.w / 2} y={-block.h / 2} width={block.w} height={block.h} />
            <text y={0.5} textAnchor="middle" dominantBaseline="central">{block.label}</text>
          </g>
        ))}

        <circle className="wb-drop-ring" data-drop-ring="hover" r={params.radius} />
        <g className="wb-drop-well" data-drop-ring="well">
          <circle r={well.radius} />
          <path d="M-7 0H7M0 -7V7" />
        </g>
        <circle className="wb-drop-flash" data-drop-ring="flash" />
      </svg>

      <ul className="sr-only">
        {STACKS.map((column) => (
          <li key={column.id}>{column.title}, bottom to top: {column.stack.join(', ')}</li>
        ))}
      </ul>

      <dl className="wb-drop-readouts">
        <div><dt>In motion</dt><dd>{readout.moving} / {readout.total}</dd></div>
        <div><dt>Displaced</dt><dd>{readout.displaced} / {readout.total}</dd></div>
        <div><dt>Peak impulse</dt><dd>{formatImpulse(readout.peakImpulse)}</dd></div>
        <div><dt>Settle time</dt><dd>{formatSettle(readout)}</dd></div>
      </dl>
      <p className="wb-drop-status" role="status">{statusLine(readout)}</p>

      <figcaption>
        FIG. 05e — The Smash and Gravity physics, contained. Six stacks, one per competency and built from its own
        tools, widest block at the bottom. Smash is a radial impulse falling off linearly to the blast radius, acting
        at each block&rsquo;s nearest face and reflected off the rigid floor; the gravity well switches g off and pulls
        with a Plummer-softened inverse square. matter-js at a fixed 1/60 s step, so the same strike always lands the
        same way. 1 u = 1 cm; blocks are 22 cm timber sections at 500 kg/m³.
      </figcaption>
    </figure>
  );
};

export default DropTest;
