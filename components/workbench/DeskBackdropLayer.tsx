import React, { Suspense, useEffect, useState } from 'react';
import { useExperienceMode, useOptionalExperienceMode } from '../../contexts/ExperienceModeContext';
import { motionHalted, onMotionChange } from '../../lib/motion';
import { isGpuClaimed, onGpuClaimChange } from '../../lib/gpuClaim';
import type { BackdropSettings } from '../../lib/backdropSettings';
import {
  FLUID_GRID, readBackdropPalette, resolveBackdropActivity,
  type BackdropActivity, type BackdropPalette,
} from '../../lib/desktopBackgroundPolicy';
import { resolveDrawingActivity } from '../../lib/drawings/policy';
import { watchDesk, type DeskSnapshot } from '../../lib/drawings/deskWatch';

// The desk-backdrop layer: the two FX desk backdrops — an N-body gravity field
// and fluid smoke — behind the desktop workbench. DeskBackdrop (main bundle)
// lazy-loads this chunk once a backdrop is on, and mounts it as the FIRST child
// of <main className="wb-desk"> (desktop surface only), so the shortcuts, plate
// and every window paint above it; the layer is pointer-events: none and both
// engines read the pointer off the desk passively, so a backdrop can never take
// a click or slow a drag.
//
// Each engine is a lazy chunk of its own (the N-body one also pulls its
// worker), loaded only when its FX toggle is first switched on. This layer and
// lib/desktopBackgroundPolicy stay out of the main bundle, which has no room
// for them (scripts/check-bundle.mjs).
//
// The layer is decorative (aria-hidden): the canvases depict nothing a reader
// needs. Its one caption says, in plain text, which model is running, how big,
// and whether it is live or held.
//
// The Estate drawing set (docs/portfolio/desk-drawing-set.md) lives here too, in
// two hosts of its own: .wb-drawing before the FX layer (its canvas, under the
// smoke) and .wb-drawing-text after it (its labels and sheet chip, over the smoke
// on an opaque ground). Its policy is its own (lib/drawings/policy.ts: it is the
// desk's default and mounts as a still on the light policies). The desk watcher
// runs here, so a desk with no room for a sheet never downloads the drawing.

const NBodyField = React.lazy(() => import('./NBodyField'));
const FluidField = React.lazy(() => import('./FluidField'));
const DrawingField = React.lazy(() => import('./drawing/DrawingField'));

// One engine failing (a driver bug, a chunk that will not load) drops that engine
// only; the others keep running. Toggling it off and on retries.
class EngineBoundary extends React.Component<{ name: string; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.warn(`[backdrop:${this.props.name}]`, error); }
  render() { return this.state.failed ? null : this.props.children; }
}

const STATE_WORD: Record<BackdropActivity['reason'], string> = {
  off: 'OFF',
  capability: 'HELD',
  hidden: 'HELD',
  'motion-halted': 'STILL FRAME',
  yielded: 'HELD · ESTATE',
  running: 'LIVE',
};

interface Environment {
  palette: BackdropPalette | null;
  halted: boolean;
  hidden: boolean;
  /** The Estate window holds the GPU (lib/gpuClaim.ts). */
  yielded: boolean;
}

const DeskBackdropLayer: React.FC<{ settings: BackdropSettings }> = ({ settings }) => {
  const { nbody, fluid } = settings;
  const { policy } = useExperienceMode();
  const resolved = useOptionalExperienceMode()?.resolved ?? true;
  // null until mounted: nothing here may read the DOM during render.
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [leases, setLeases] = useState({ nbody: false, fluid: false, drawing: false });
  const [canvasHost, setCanvasHost] = useState<HTMLDivElement | null>(null);
  const [textHost, setTextHost] = useState<HTMLDivElement | null>(null);
  const [snapshot, setSnapshot] = useState<DeskSnapshot | null>(null);
  const [bodies, setBodies] = useState<number | null>(null);
  const [fluidUnavailable, setFluidUnavailable] = useState(false);

  useEffect(() => {
    const palette = readBackdropPalette();
    const sync = () => setEnvironment({ palette, halted: motionHalted(), hidden: document.hidden, yielded: isGpuClaimed() });
    sync();
    const stopMotion = onMotionChange(sync);
    const stopClaims = onGpuClaimChange(sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      stopMotion();
      stopClaims();
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  const halted = environment?.halted ?? true;
  const hidden = environment?.hidden ?? false;
  const yielded = environment?.yielded ?? false;
  const nbodyActivity = resolveBackdropActivity({ enabled: nbody.enabled, allowHeavyAssets: policy.allowHeavyAssets, motionHalted: halted, documentHidden: hidden, yielded }, leases.nbody);
  const fluidActivity = resolveBackdropActivity({ enabled: fluid.enabled, allowHeavyAssets: policy.allowHeavyAssets, motionHalted: halted, documentHidden: hidden, yielded }, leases.fluid);
  // An engine keeps its lease (worker, WebGL context) from the first time it is
  // allowed until its toggle goes off. Adjusting state during render is React's
  // own pattern for "state derived from the previous render"; it settles in one pass.
  const fxRunning = nbodyActivity.running || (fluidActivity.running && !fluidUnavailable);
  const drawingActivity = resolveDrawingActivity({
    enabled: settings.drawing?.enabled === true, resolved, policy, motionHalted: halted, documentHidden: hidden, yielded, fx: fxRunning,
  }, leases.drawing);
  if (nbodyActivity.mount !== leases.nbody || fluidActivity.mount !== leases.fluid || drawingActivity.mount !== leases.drawing) {
    setLeases({ nbody: nbodyActivity.mount, fluid: fluidActivity.mount, drawing: drawingActivity.mount });
  }

  // The desk watcher, while the drawing is on: room for a sheet, and where.
  const watching = drawingActivity.mount && canvasHost !== null;
  useEffect(() => {
    if (!watching || !canvasHost) return undefined;
    const desk = canvasHost.closest<HTMLElement>('[data-desk]');
    if (!desk) return undefined;
    return watchDesk(desk, setSnapshot);
  }, [watching, canvasHost]);
  // The drawing's field loads the first time the desk has room, and stays.
  const [fieldLease, setFieldLease] = useState(false);
  if (!fieldLease && drawingActivity.mount && snapshot?.room) setFieldLease(true);
  if (fieldLease && !drawingActivity.mount) setFieldLease(false);

  const drawing = drawingActivity.mount ? (
    <div
      className="wb-drawing"
      aria-hidden="true"
      data-drawing-layer
      data-drawing-state={snapshot && !snapshot.room ? 'covered' : drawingActivity.state ?? undefined}
      ref={setCanvasHost}
    />
  ) : null;
  const drawingText = drawingActivity.mount ? <div className="wb-drawing-text" aria-hidden="true" ref={setTextHost} /> : null;
  const field = drawingActivity.mount && fieldLease && drawingActivity.scope && canvasHost && textHost ? (
    <EngineBoundary name="drawing">
      <Suspense fallback={null}>
        <DrawingField scope={drawingActivity.scope} snapshot={snapshot} fx={fxRunning} canvasHost={canvasHost} textHost={textHost} />
      </Suspense>
    </EngineBoundary>
  ) : null;

  const palette = environment?.palette;
  if (!palette || (!nbodyActivity.mount && !fluidActivity.mount)) return <>{drawing}{drawingText}{field}</>;

  // The worker reports the bodies it actually simulates; it steps down a tier
  // when a step's p95 passes 24 ms, and the caption says so ("1536 OF 2048").
  const requested = nbody.particleCount;
  const shown = bodies !== null && bodies <= requested ? bodies : requested;
  const grid = FLUID_GRID[fluid.quality];

  return (
    <>
    {drawing}
    <div className="wb-backdrop" aria-hidden="true" data-backdrop-layer>
      {/* One boundary per engine: while the second engine's chunk downloads, a
          shared boundary would hide the first (display: none) and its resize
          observer would see a 0×0 desk. */}
      {nbodyActivity.mount && (
        <Suspense fallback={null}>
          <NBodyField params={nbody} palette={palette} running={nbodyActivity.running} onBodies={setBodies} />
        </Suspense>
      )}
      {fluidActivity.mount && (
        <Suspense fallback={null}>
          <FluidField params={fluid} palette={palette} running={fluidActivity.running} onUnavailable={() => setFluidUnavailable(true)} />
        </Suspense>
      )}
      <p className="wb-backdrop-caption">
        {nbodyActivity.mount && (
          <span data-backdrop-state={nbodyActivity.reason}>
            FIELD · N-BODY · 2D LOG-FMM · {shown}{shown < requested ? ` OF ${requested}` : ''} BODIES · {STATE_WORD[nbodyActivity.reason]}
          </span>
        )}
        {fluidActivity.mount && (
          <span data-backdrop-state={fluidUnavailable ? 'unavailable' : fluidActivity.reason}>
            FIELD · FLUID · STABLE FLUIDS · {grid}² GRID · {fluidUnavailable ? 'NO WEBGL2 FLOAT TARGETS' : STATE_WORD[fluidActivity.reason]}
          </span>
        )}
      </p>
    </div>
    {drawingText}
    {field}
    </>
  );
};

export default DeskBackdropLayer;
