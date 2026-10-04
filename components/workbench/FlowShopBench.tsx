import React from 'react';
import { AppIcon, Corners } from './bits';
import {
  START_ORDER,
  TEACHING_INSTANCE,
  analyze,
  evaluate,
  explain,
  makespanOf,
  moveJob,
  orderLabel,
  ordersSooner,
  sameOrder,
  type Schedule,
} from '../../lib/permutationFlowShop';
import { dispatchPortfolioWorldEvent } from '../../lib/worldEvents';

// FIG. 05d — a seeded F3 | prmu | Cmax teaching model with synthetic data. It
// is unrelated to FIG. 05a (the Abbott work) and must never borrow its words,
// colours or layout. The whole lesson is one identity from lib/permutationFlowShop:
// Cmax = M3's fixed work + M3's waiting, so a better order is less waiting.
//
// Hosting rules this file keeps:
//  - Drag uses NATIVE listeners bound by a stable callback ref on the <ol>.
//    FieldWorkbench nudges a hoisted card from a native pointerdown on
//    .wb-root, and React 19 listens at the root container, which sits ABOVE
//    .wb-root — so a React stopPropagation would land too late to stop the
//    swing. The native handler stops tile pointerdowns at the <ol> instead.
//    A side effect, on purpose: React's onPointerDown never fires in the strip.
//  - Pointer capture goes on the <ol>, not the tile, because React moves the
//    tile's <li> mid-drag and moving a captured node can drop the capture.
//    Focus and `picked` are set in pointerdown, since under capture the click
//    lands on the <ol> and Safari never focuses a button on click anyway.
//  - Gantt ops render in a stable (job, machine) order, never by position, so
//    React only rewrites their transforms and the CSS transition can run.
//  - No rAF, no JS animation: two CSS transitions and one fade, all switched
//    off in index.css under prefers-reduced-motion and the FX motion pause —
//    the same pair motionHalted() reads, so lib/motion is not needed here.
//  - EARLIER / LATER is the single-pointer alternative to dragging that
//    WCAG 2.5.7 asks for; arrow keys, Home and End move the focused tile.
//  - The render pass is integer maths over module constants (prerender-safe),
//    with fixed ids: there is one desktop instance and FieldIndex renders no
//    window bodies. No useId — its « » characters break url(#…).

const INST = TEACHING_INSTANCE;
const ANALYSIS = analyze(INST);
const JOB = INST.jobs;
const N = JOB.length;
const M = INST.machines.length;
const LAST = INST.machines[M - 1];
const OPT = ANALYSIS.optimum.makespan;
const TOTAL = ANALYSIS.optimum.total;
const WORST = ANALYSIS.optimum.worst;
const BOUND = ANALYSIS.bound;
const HIST = ANALYSIS.optimum.histogram;

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const word = (n: number) => WORDS[n] ?? String(n);
const list = (items: readonly (string | number)[]) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

type MethodId = 'johnson-cds' | 'neh' | 'exhaustive' | 'start';
type Cause = { kind: 'move'; job: number } | { kind: 'method'; id: Exclude<MethodId, 'start'> } | { kind: 'start' };

interface Method {
  id: MethodId;
  /** Visible on the button (uppercased by .btn). */
  name: string;
  /** As spoken: "Apply NEH order …", "NEH order … — makespan 43". */
  spoken: string;
  order: readonly number[];
  makespan: number;
  guarantee: string;
}

const { cds, neh, optimum, dominance } = ANALYSIS;
const [cdsFold1, cdsFold2] = cds.folds;

const METHODS: Method[] = [
  {
    id: 'johnson-cds',
    name: 'Johnson · CDS',
    spoken: 'Johnson · CDS',
    order: cds.order,
    makespan: cds.makespan,
    guarantee:
      "Johnson's rule (1954) is exact for two machines. CDS (Campbell, Dudek & Smith, 1970) folds three into two — " +
      `M1 | M3, then M1+M2 | M2+M3 — and keeps the better; ${
        cdsFold1.makespan === cdsFold2.makespan
          ? `both give ${cds.makespan} here`
          : `they give ${cdsFold1.makespan} and ${cdsFold2.makespan} here`
      }. The second fold is guaranteed exact when M2's longest step is no longer than M1's or M3's shortest; ` +
      `here it is ${dominance.maxM2} against ${dominance.minM1} and ${dominance.minM3}, so ${
        dominance.holds ? 'it is exact' : 'no guarantee'
      }.`,
  },
  {
    id: 'neh',
    name: 'NEH',
    spoken: 'NEH',
    order: neh.order,
    makespan: neh.makespan,
    guarantee:
      `Nawaz, Enscore & Ham (1983) take jobs by total work, largest first (${orderLabel(INST, neh.priority)}), ` +
      'and slot each where the partial schedule stays shortest. The standard construction heuristic — no guarantee.',
  },
  {
    id: 'exhaustive',
    name: 'Exhaustive',
    spoken: 'Exhaustive',
    order: optimum.order,
    makespan: OPT,
    guarantee:
      `All ${TOTAL} orders scored; ${optimum.optimalCount === 1 ? 'exactly one reaches' : `${optimum.optimalCount} reach`} ${OPT}. ` +
      `With three machines some optimal schedule always keeps one shared order, so no schedule beats ${OPT}. ` +
      // 20! — the one number on the card that is not computed here.
      'Twenty jobs would have 2.4 × 10¹⁸ orders — which is why the rules above exist.',
  },
  {
    id: 'start',
    name: 'Start order',
    spoken: 'start',
    order: START_ORDER,
    makespan: ANALYSIS.start.makespan,
    guarantee: 'The order the jobs were generated in.',
  },
];
const METHOD_BY_ID = Object.fromEntries(METHODS.map((m) => [m.id, m])) as Record<MethodId, Method>;

// Chart geometry, in viewBox units: one time unit is UNIT wide from X0.
const VIEW_W = 720;
const VIEW_H = 214;
const X0 = 70;
const UNIT = 10;
const AXIS_END = Math.ceil(WORST / 10) * 10;
const BAR_Y = [22, 54, 86];
const BAR_H = 20;
const AXIS_Y = 118;
const HIST_BASE = 194;
const HIST_H = 46;
const MAX_BIN = Math.max(...HIST.map((bin) => bin.count));
const TICKS = Array.from({ length: AXIS_END / 5 + 1 }, (_, i) => i * 5);
const x = (t: number) => X0 + UNIT * t;

// Drag: jsdom (and a strip of one) measures no pitch, so fall back to a tile width.
const FALLBACK_PITCH = 100;
const DRAG_THRESHOLD = 4;

interface Drag {
  pointerId: number;
  job: number;
  tile: HTMLElement;
  startX: number;
  startIndex: number;
  startOrder: number[];
  current: number[];
  pitch: number;
  active: boolean;
}

const settle = (drag: Drag) => {
  drag.tile.style.transform = '';
  delete drag.tile.dataset.dragging;
};

interface ChartProps {
  schedule: Schedule;
  headline: string;
  traced: number;
  onTrace: (job: number | null) => void;
}

const ScheduleChart: React.FC<ChartProps> = ({ schedule, headline, traced, onTrace }) => {
  const C = schedule.makespan;
  const key = schedule.order.join('');
  const ops = [...schedule.ops].sort((a, b) => a.job - b.job || a.machine - b.machine);

  // The critical staircase: under each critical op, dropping a row at each
  // handover. Consecutive critical ops are back-to-back, so it never breaks.
  const crit = schedule.criticalPath.map(({ position, machine }) => schedule.ops[position * M + machine]);
  let path = '';
  crit.forEach((op, i) => {
    const y = BAR_Y[op.machine] + 23;
    if (i === 0) path += `M${x(op.start)} ${y}`;
    else if (op.machine !== crit[i - 1].machine) path += `V${y}`;
    path += `H${x(op.end)}`;
  });

  return (
    <svg
      className="wb-fs-svg"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-labelledby="fs-chart-title"
      aria-describedby="fs-chart-desc"
    >
      <title id="fs-chart-title">{`Gantt chart of job order ${orderLabel(INST, schedule.order)}`}</title>
      <desc id="fs-chart-desc">{headline}</desc>
      <defs>
        <pattern id="fs-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line className="wb-fs-hatchline" x2="0" y2="5" />
        </pattern>
      </defs>

      {INST.machines.map((name, k) => (
        <React.Fragment key={name}>
          <text className="wb-fs-strong" x={0} y={BAR_Y[k] + 14}>{name}</text>
          <text x={24} y={BAR_Y[k] + 14}>{`${ANALYSIS.loads[k]} work`}</text>
          <rect
            className="wb-fs-track"
            x={X0}
            y={BAR_Y[k] - 2}
            width={AXIS_END * UNIT}
            height={BAR_H + 4}
            data-busiest={k === ANALYSIS.busiest || undefined}
          />
        </React.Fragment>
      ))}

      <g key={`w${key}`} className="wb-fs-overlay">
        {schedule.machines.map((line, k) => {
          const regions = [...(line.leadIn > 0 ? [{ start: 0, length: line.leadIn }] : []), ...line.gaps];
          return (
            <React.Fragment key={k}>
              {regions.map((region) => {
                const mid = x(region.start + region.length / 2);
                return (
                  <React.Fragment key={region.start}>
                    <rect
                      className="wb-fs-wait"
                      x={x(region.start)}
                      y={BAR_Y[k]}
                      width={region.length * UNIT}
                      height={BAR_H}
                      fill="url(#fs-hatch)"
                    />
                    {region.length >= 3 && (
                      <>
                        <rect className="wb-fs-waitlabel-bg" x={mid - 8} y={BAR_Y[k] + 4.5} width={16} height={11} />
                        <text x={mid} y={BAR_Y[k] + 13.5} textAnchor="middle">{region.length}</text>
                      </>
                    )}
                  </React.Fragment>
                );
              })}
              {line.tail >= 4 && <text x={x(C - line.tail) + 4} y={BAR_Y[k] + 14}>done</text>}
            </React.Fragment>
          );
        })}
      </g>

      {ops.map((op) => {
        const w = (op.end - op.start) * UNIT;
        return (
          <g
            key={`${op.job}-${op.machine}`}
            className="wb-fs-op"
            data-critical={op.critical || undefined}
            data-traced={op.job === traced || undefined}
            style={{ transform: `translate(${x(op.start)}px, ${BAR_Y[op.machine]}px)` }}
            onPointerEnter={() => onTrace(op.job)}
            onPointerLeave={() => onTrace(null)}
          >
            <rect width={w} height={BAR_H} />
            <text x={w / 2} y={14.5} textAnchor="middle">{JOB[op.job]}</text>
          </g>
        );
      })}

      <g key={`c${key}`} className="wb-fs-overlay">
        <path className="wb-fs-crit" d={path} />
      </g>

      <line className="wb-fs-bound" x1={x(BOUND.value)} x2={x(BOUND.value)} y1={16} y2={HIST_BASE} />
      <text x={x(BOUND.value) - 3} y={206} textAnchor="end">{`BOUND ${BOUND.value}`}</text>

      <g className="wb-fs-cmax" style={{ transform: `translateX(${x(C)}px)` }}>
        <line x1={0} x2={0} y1={16} y2={HIST_BASE} />
        <text className="wb-fs-strong" y={11} textAnchor="middle">{`MAKESPAN ${C}`}</text>
      </g>

      <line className="wb-fs-axis" x1={X0} x2={x(AXIS_END)} y1={AXIS_Y} y2={AXIS_Y} />
      {TICKS.map((t) => (
        <line key={t} className="wb-fs-axis" x1={x(t)} x2={x(t)} y1={AXIS_Y} y2={AXIS_Y + (t % 10 ? 3 : 5)} />
      ))}
      {TICKS.filter((t) => t % 10 === 0).map((t) => (
        <text key={t} x={x(t)} y={132} textAnchor="middle">{t}</text>
      ))}

      {/* Every order, on the same time axis as the Gantt above it. */}
      {HIST.map((bin) => {
        const h = bin.count ? Math.round(Math.max(1.5, (HIST_H * bin.count) / MAX_BIN) * 100) / 100 : 0;
        return (
          <rect
            key={bin.makespan}
            className="wb-fs-bin"
            x={x(bin.makespan) - 4}
            y={HIST_BASE - h}
            width={8}
            height={h}
            data-current={bin.makespan === C || undefined}
            data-best={bin.makespan === OPT || undefined}
          />
        );
      })}
      <text x={x(OPT) + 3} y={206}>
        {`BEST ${OPT} · ${optimum.optimalCount} ORDER${optimum.optimalCount === 1 ? '' : 'S'}`}
      </text>
      <text x={x(WORST)} y={206} textAnchor="middle">{`WORST ${WORST}`}</text>
      <text className="wb-fs-strong" x={X0} y={164}>{`ALL ${TOTAL} ORDERS, BY MAKESPAN`}</text>
      <text x={X0} y={178}>Each bar counts the orders that finish at that time.</text>
      <text x={X0} y={192}>Dark bar: your order. The makespan line runs through it.</text>
    </svg>
  );
};

const LEDE =
  `${word(N).replace(/^./, (c) => c.toUpperCase())} jobs visit ${INST.machines.join(', then ')}, and every machine takes ` +
  `them in the order you set. The schedule ends when ${LAST} finishes, and ${LAST}'s work is fixed — so the order only ` +
  `decides how long ${LAST} stands waiting.`;

const [LO, HI] = INST.ranges[0];
const CAPTION =
  `FIG. 05d — A teaching model, not plant data, and unrelated to FIG. 05a. Permutation flow shop F${M} | prmu | Cmax: ` +
  `${word(N)} synthetic jobs, one shared order on every machine, all jobs ready at 0, unlimited buffers, no setups. ` +
  `Times ${LO}–${HI} from Taillard's (1993) benchmark generator, seed ${INST.seed} — picked because every method lands ` +
  `on a different makespan. Dashed line: ${INST.machines[BOUND.machine]} cannot start before the quickest job clears ` +
  `${list(INST.machines.slice(0, BOUND.machine))} (${JOB[BOUND.headJob]}: ${INST.p[BOUND.headJob].slice(0, BOUND.machine).join(' + ')}), ` +
  `then has ${BOUND.load} units of work, so no order finishes before ${BOUND.value}.`;

const Swatch: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg className="wb-fs-swatch" width="14" height="10" viewBox="0 0 14 10" aria-hidden="true">{children}</svg>
);

export const FlowShopBench: React.FC = () => {
  const [order, setOrder] = React.useState<number[]>(() => [...START_ORDER]);
  const [picked, setPicked] = React.useState(0);
  const [trace, setTrace] = React.useState<number | null>(null);
  const [change, setChange] = React.useState('');
  const orderRef = React.useRef<number[]>(order);
  const stripRef = React.useRef<HTMLOListElement | null>(null);
  const dragRef = React.useRef<Drag | null>(null);
  const refocusRef = React.useRef<number | null>(null);

  const schedule = React.useMemo(() => evaluate(INST, order), [order]);
  const story = React.useMemo(() => explain(ANALYSIS, schedule), [schedule]);

  // During a drag the order is only previewed: one event per drop, from commit.
  const preview = React.useCallback((next: number[]) => setOrder(next), []);

  const commit = React.useCallback((prev: readonly number[], next: readonly number[], cause: Cause) => {
    if (sameOrder(prev, next)) return;
    const settled = [...next];
    orderRef.current = settled;
    setOrder(settled);
    const before = makespanOf(INST, prev);
    const after = makespanOf(INST, settled);
    if (cause.kind === 'move') {
      const delta = after - before;
      const shift = delta < 0 ? `${-delta} lower` : delta > 0 ? `${delta} higher` : 'unchanged';
      setChange(
        `Job ${JOB[cause.job]} moved to position ${settled.indexOf(cause.job) + 1} of ${N} — makespan ${after}, ${shift}` +
          (after === OPT ? ' — the best possible.' : '.'),
      );
      dispatchPortfolioWorldEvent({
        type: 'JOB_REORDERED',
        oldMakespan: before,
        newMakespan: after,
        makespanDelta: delta,
        order: settled.map((j) => JOB[j]),
      });
      if (before > OPT && after === OPT) {
        dispatchPortfolioWorldEvent({ type: 'SCHEDULE_SOLVED', method: 'visitor', makespan: after, optimal: true });
      }
    } else if (cause.kind === 'method') {
      setChange(
        `${METHOD_BY_ID[cause.id].spoken} order ${orderLabel(INST, settled)} — makespan ${after}, ` +
          `${after === OPT ? 'the best possible' : `${after - OPT} above the best`}.`,
      );
      dispatchPortfolioWorldEvent({ type: 'SCHEDULE_SOLVED', method: cause.id, makespan: after, optimal: after === OPT });
    } else {
      setChange(`Back to the start order ${JOB[0]}–${JOB[N - 1]} — makespan ${after}.`);
      dispatchPortfolioWorldEvent({ type: 'LAB_RESET', sceneId: 'systems-in-motion' });
    }
  }, []);

  React.useLayoutEffect(() => {
    orderRef.current = order;
  }, [order]);

  // React's restoreSelection normally re-focuses a keyed tile it moved; this
  // is the insurance for a browser that drops focus on the move anyway.
  React.useLayoutEffect(() => {
    const job = refocusRef.current;
    if (job === null) return;
    refocusRef.current = null;
    const tile = stripRef.current?.querySelector<HTMLElement>(`[data-fs-job="${JOB[job]}"]`);
    if (tile && document.activeElement !== tile) tile.focus({ preventScroll: true });
  }, [order]);

  const cancelDrag = React.useCallback((): boolean => {
    const drag = dragRef.current;
    if (!drag) return false;
    dragRef.current = null;
    settle(drag);
    try { stripRef.current?.releasePointerCapture?.(drag.pointerId); } catch { /* capture is best-effort */ }
    if (!sameOrder(drag.current, drag.startOrder)) preview([...drag.startOrder]);
    return true;
  }, [preview]);

  // Stable (its deps never change), so it binds once per <ol> node and
  // re-binds only when React replaces the node. Returns a React 19 cleanup.
  const bindStrip = React.useCallback((node: HTMLOListElement | null) => {
    stripRef.current = node;
    if (!node) return undefined;

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const tile = (event.target as Element | null)?.closest?.<HTMLElement>('[data-fs-job]');
      if (!tile || !node.contains(tile)) return;
      event.stopPropagation(); // no hoist swing under a drag; never preventDefault (focus, scroll)
      if (dragRef.current) return; // a second pointer while one is dragging
      const job = JOB.indexOf(tile.dataset.fsJob ?? '');
      if (job < 0) return;
      tile.focus({ preventScroll: true });
      setPicked(job);
      const startOrder = orderRef.current;
      const tiles = node.querySelectorAll<HTMLElement>('[data-fs-job]');
      const pitch = tiles.length > 1 ? tiles[1].getBoundingClientRect().left - tiles[0].getBoundingClientRect().left : 0;
      dragRef.current = {
        pointerId: event.pointerId,
        job,
        tile,
        startX: event.clientX,
        startIndex: startOrder.indexOf(job),
        startOrder,
        current: startOrder,
        pitch: pitch > 0 ? pitch : FALLBACK_PITCH,
        active: false,
      };
      try { node.setPointerCapture?.(event.pointerId); } catch { /* capture is best-effort */ }
    };

    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.startX;
      if (!drag.active) {
        if (Math.abs(dx) < DRAG_THRESHOLD) return;
        drag.active = true;
        drag.tile.dataset.dragging = '';
      }
      const target = Math.min(N - 1, Math.max(0, drag.startIndex + Math.round(dx / drag.pitch)));
      const next = moveJob(drag.startOrder, drag.startIndex, target);
      if (!sameOrder(next, drag.current)) {
        drag.current = next;
        preview(next);
      }
      // The tile's <li> now sits in the target column; offset it back under the pointer.
      drag.tile.style.transform = `translateX(${dx - (target - drag.startIndex) * drag.pitch}px)`;
    };

    const onUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      settle(drag);
      if (drag.tile.isConnected && document.activeElement !== drag.tile) drag.tile.focus({ preventScroll: true });
      commit(drag.startOrder, drag.current, { kind: 'move', job: drag.job });
    };

    // A browser pan (touch-action: pan-y) or a lost capture reverts, silently.
    // After a normal pointerup the state is already gone, so this is a no-op.
    const onCancel = (event: PointerEvent) => {
      if (dragRef.current?.pointerId === event.pointerId) cancelDrag();
    };

    node.addEventListener('pointerdown', onDown);
    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerup', onUp);
    node.addEventListener('pointercancel', onCancel);
    node.addEventListener('lostpointercapture', onCancel);
    return () => {
      node.removeEventListener('pointerdown', onDown);
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerup', onUp);
      node.removeEventListener('pointercancel', onCancel);
      node.removeEventListener('lostpointercapture', onCancel);
      cancelDrag();
      if (stripRef.current === node) stripRef.current = null;
    };
  }, [cancelDrag, commit, preview]);

  const onTileKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') {
      // Only mid-drag: otherwise Escape belongs to FieldWorkbench (close window).
      if (!cancelDrag()) return;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const job = JOB.indexOf(event.currentTarget.dataset.fsJob ?? '');
    const current = orderRef.current;
    const from = current.indexOf(job);
    const to =
      event.key === 'ArrowLeft' ? from - 1
      : event.key === 'ArrowRight' ? from + 1
      : event.key === 'Home' ? 0
      : event.key === 'End' ? N - 1
      : null;
    if (to === null) return; // Up/Down stay with the sheet's scroll
    event.preventDefault();
    if (job < 0 || dragRef.current || to < 0 || to >= N || to === from) return;
    setPicked(job);
    refocusRef.current = job;
    commit(current, moveJob(current, from, to), { kind: 'move', job });
  };

  const nudge = (step: -1 | 1) => {
    const current = orderRef.current;
    const from = current.indexOf(picked);
    const to = from + step;
    if (from < 0 || to < 0 || to >= N) return;
    // Reaching an end disables the button just pressed, which would drop focus
    // to <body>; hand it to the moved tile instead (the layout effect above).
    if (to === 0 || to === N - 1) refocusRef.current = picked;
    commit(current, moveJob(current, from, to), { kind: 'move', job: picked });
  };

  const C = schedule.makespan;
  const lastLine = schedule.machines[M - 1];
  const pickedAt = order.indexOf(picked);

  return (
    <figure id="flow-shop" className="blueprint wb-figure wb-fs" aria-labelledby="fs-title">
      <Corners />
      <div className="wb-figure-head">
        <h3 id="fs-title">Sequencing Bench — Why Order Matters</h3>
        <span>TEACHING MODEL · SYNTHETIC DATA</span>
      </div>
      <p className="wb-fs-lede">{LEDE}</p>

      <div className="wb-fs-striphead" aria-hidden="true">
        <span>RUNS FIRST</span>
        <span>RUNS LAST</span>
      </div>
      <ol className="wb-fs-jobs" aria-label="Job order, first to last" ref={bindStrip}>
        {order.map((job, i) => (
          <li key={job}>
            <button
              type="button"
              className="wb-fs-job"
              data-fs-job={JOB[job]}
              data-picked={job === picked || undefined}
              aria-keyshortcuts="ArrowLeft ArrowRight Home End"
              aria-describedby="fs-hint"
              aria-label={`Job ${JOB[job]}: ${list(INST.p[job])} units on ${list(INST.machines)}. Position ${i + 1} of ${N}.`}
              onKeyDown={onTileKey}
              onFocus={() => setPicked(job)}
              onPointerEnter={() => setTrace(job)}
              onPointerLeave={() => setTrace(null)}
            >
              <span className="wb-fs-job-id">{JOB[job]}</span>
              <span className="wb-fs-job-p" aria-hidden="true">{INST.p[job].join('·')}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="wb-fs-moves">
        <button
          type="button"
          className="btn btn-secondary"
          aria-label={`Move job ${JOB[picked]} earlier`}
          disabled={pickedAt <= 0}
          onClick={() => nudge(-1)}
        >
          <AppIcon path="m15 18-6-6 6-6" size={14} />
          Earlier
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          aria-label={`Move job ${JOB[picked]} later`}
          disabled={pickedAt >= N - 1}
          onClick={() => nudge(1)}
        >
          Later
          <AppIcon path="m9 18 6-6-6-6" size={14} />
        </button>
        <p id="fs-hint" className="wb-fs-hint">
          Drag a job sideways, or select it and press ← → (Home, End) or use Earlier / Later.
        </p>
      </div>
      <p className="wb-fs-change" role="status">{change}</p>

      <div className="wb-fs-chart">
        <ScheduleChart schedule={schedule} headline={story.headline} traced={trace ?? picked} onTrace={setTrace} />
      </div>

      <table className="sr-only">
        <caption>
          {`Schedule for order ${orderLabel(INST, order)}, makespan ${C}. Start–finish per machine; * marks the critical path.`}
        </caption>
        <thead>
          <tr>
            <th scope="col">Position · job</th>
            {INST.machines.map((name) => <th key={name} scope="col">{name}</th>)}
          </tr>
        </thead>
        <tbody>
          {order.map((job, i) => (
            <tr key={job}>
              <th scope="row">{`${i + 1} · ${JOB[job]}`}</th>
              {INST.machines.map((name, k) => {
                const op = schedule.ops[i * M + k];
                return <td key={name}>{`${op.start}–${op.end}${op.critical ? ' *' : ''}`}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="wb-metrics wb-fs-metrics">
        <div><span>MAKESPAN</span><strong>{C}</strong></div>
        <div><span>{`ABOVE THE BEST (${OPT})`}</span><strong>{C === OPT ? '0' : `+${C - OPT}`}</strong></div>
        <div><span>{`${LAST} WAITING`}</span><strong>{lastLine.waiting}</strong></div>
        <div><span>ORDERS FINISHING SOONER</span><strong>{`${ordersSooner(optimum, C)}/${TOTAL}`}</strong></div>
      </div>

      <div className="wb-fs-why">
        <p className="wb-fs-why-head">{story.headline}</p>
        <p className="wb-fs-why-detail">{story.detail}</p>
      </div>

      <div className="wb-fs-ledger" role="group" aria-label="Classic sequencing rules">
        {METHODS.map((method) => {
          const active = sameOrder(method.order, order);
          const label = orderLabel(INST, method.order);
          return (
            <div className="wb-fs-row" key={method.id}>
              <button
                type="button"
                className={`btn ${active ? 'btn-primary' : 'btn-secondary'} wb-fs-method`}
                aria-pressed={active}
                aria-label={`Apply ${method.spoken} order ${label}, makespan ${method.makespan}`}
                onClick={() =>
                  commit(orderRef.current, method.order, method.id === 'start' ? { kind: 'start' } : { kind: 'method', id: method.id })}
              >
                <span className="wb-fs-method-name">{method.name}</span>
                <strong>{method.makespan}</strong>
                <span className="wb-fs-method-order">{label}</span>
              </button>
              <p className="wb-fs-guarantee">{method.guarantee}</p>
            </div>
          );
        })}
      </div>

      <ul className="wb-fs-legend">
        <li>
          <Swatch><rect className="wb-fs-wait" x="0.5" y="0.5" width="13" height="9" fill="url(#fs-hatch)" /></Swatch>
          Waiting — machine idle with work still to come
        </li>
        <li>
          <Swatch>
            <rect className="wb-fs-sw-crit" x="0.75" y="0.75" width="12.5" height="5.5" />
            <line className="wb-fs-crit" x1="1" x2="13" y1="8.5" y2="8.5" />
          </Swatch>
          Critical path — an unbroken chain of work from 0 to the finish; any delay on it delays the finish one-for-one
        </li>
        <li>
          <Swatch><line className="wb-fs-bound" x1="0" x2="14" y1="5" y2="5" /></Swatch>
          Dashed — lower bound, no order can finish sooner
        </li>
        <li>
          <Swatch><rect className="wb-fs-track" x="0.5" y="0.5" width="13" height="9" data-busiest /></Swatch>
          {`Tinted row — busiest machine (${INST.machines[ANALYSIS.busiest]}, ${ANALYSIS.loads[ANALYSIS.busiest]} units)`}
        </li>
      </ul>

      <figcaption>{CAPTION}</figcaption>
    </figure>
  );
};

export default FlowShopBench;
