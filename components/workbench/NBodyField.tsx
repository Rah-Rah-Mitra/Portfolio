import React, { useEffect, useRef } from 'react';
import type { NBodyPreferences } from '../../types';
import type { BackdropPalette } from '../../lib/desktopBackgroundPolicy';
import { createWorkerConfig, toFieldPoint } from '../../lib/nbody/workerProtocol';
import { paintField, paintSprite, SPRITE_SIZE, type FieldInk } from '../../lib/nbody/paint';

// The N-body desk backdrop: a 2D gravitational field solved by the logarithmic
// FMM in workers/nbody.worker.ts. Lazy-loaded by DeskBackdrop, which owns the
// policy (when it mounts, when it runs); this file owns the worker.
//
// Physics never runs on the main thread. Where the canvas can be handed to the
// worker (transferControlToOffscreen) the worker paints too; otherwise it sends
// positions back and the main thread paints the same picture through
// lib/nbody/paint.ts at a capped body count.
//
// The canvas is created by the effect inside a plain host ref, not found by a
// DOM scan: it sits outside every window, as the desk's first child, so the
// workbench's per-window re-renders never detach it.

interface WorkerFrameMessage {
  type: 'frame' | 'ready' | 'protocol-error';
  buffer?: ArrayBuffer;
  bodyCount?: number;
  effectiveParticleCount?: number;
}

export interface NBodyFieldProps {
  params: NBodyPreferences;
  palette: BackdropPalette;
  /** Integrate and animate. False freezes the field on its last frame (or on a still first frame). */
  running: boolean;
  /** Bodies actually simulated — the worker steps down a tier when a step's p95 exceeds 24 ms. */
  onBodies?: (count: number) => void;
}

/** Main-thread bodies are drawn per frame on the UI thread, so the fallback starts at a tier it can afford. */
const FALLBACK_BODIES = 768;

const devicePixels = () => Math.min(window.devicePixelRatio || 1, 2);

const NBodyField: React.FC<NBodyFieldProps> = ({ params, palette, running, onBodies }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  // Posts one step (dt > 0) or one redraw (dt === 0); false if the buffer is out.
  const requestRef = useRef<(dt: number) => boolean>(() => false);
  const runningRef = useRef(running);
  runningRef.current = running;
  // Clamped to the protocol's bounds: an out-of-range step is rejected by the worker.
  const trailPersistence = Math.min(90, Math.max(0, params.trailPersistence));
  const inkRef = useRef<FieldInk>({ ...palette, trailPersistence });
  inkRef.current = { ...palette, trailPersistence };
  const onBodiesRef = useRef(onBodies);
  onBodiesRef.current = onBodies;
  const pointerAttractionRef = useRef(params.pointerAttraction);
  pointerAttractionRef.current = params.pointerAttraction;

  // Only what defines the initial condition re-runs the effect below, on a
  // fresh canvas and a fresh worker: the scene, the body count and the seed.
  // Every other setting is posted to the running worker as a 'configure', so
  // dragging Gravity or Time scale tunes the field instead of restarting it.
  // trailPersistence and the palette are per-step values and are in neither.
  const configKey = [params.preset, params.particleCount, params.seed].join('|');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    // Every run of this effect (a re-key, or StrictMode's dev double-run) gets a
    // canvas of its own: control can be transferred to a worker only once.
    const canvas = document.createElement('canvas');
    canvas.className = 'wb-backdrop-canvas';
    canvas.dataset.backdrop = 'nbody';
    host.appendChild(canvas);
    const teardown = ((): (() => void) | undefined => {
      const desk = (canvas.closest('[data-desk]') as HTMLElement | null) ?? canvas.parentElement;
      const worker = new Worker(new URL('../../workers/nbody.worker.ts', import.meta.url), { type: 'module', name: 'desk-nbody-fmm' });
      workerRef.current = worker;
      const canTransfer = typeof canvas.transferControlToOffscreen === 'function';
      const effectiveParticleCount = canTransfer ? params.particleCount : Math.min(FALLBACK_BODIES, params.particleCount);
      let buffer: ArrayBuffer | null = new ArrayBuffer(effectiveParticleCount * 2 * Float32Array.BYTES_PER_ELEMENT);
      let ready = false;
      let redrawPending = false;
      let reported = 0;
      const size = { width: canvas.clientWidth, height: canvas.clientHeight };
      const report = (count: number) => {
        if (count === reported) return;
        reported = count;
        onBodiesRef.current?.(count);
      };

      // Fallback painter state (main thread only).
      let sprite: HTMLCanvasElement | null = null;
      let spriteKey = '';
      const paintHere = (positions: Float32Array, count: number) => {
        const context = canvas.getContext('2d');
        if (!context) return;
        const ink = inkRef.current;
        const dpr = devicePixels();
        const width = Math.max(1, Math.round(size.width * dpr));
        const height = Math.max(1, Math.round(size.height * dpr));
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        const key = `${ink.accent}:${ink.accentDeep}`;
        if (!sprite || spriteKey !== key) {
          sprite = document.createElement('canvas');
          sprite.width = SPRITE_SIZE;
          sprite.height = SPRITE_SIZE;
          const spriteContext = sprite.getContext('2d');
          if (spriteContext) paintSprite(spriteContext, ink.accent, ink.accentDeep);
          spriteKey = key;
        }
        paintField(context, { positions, count, width, height, dpr, sprite }, ink);
      };

      const request = (dt: number) => {
        if (!ready || !buffer) {
          if (dt === 0) redrawPending = true;
          return false;
        }
        const ink = inkRef.current;
        worker.postMessage({
          type: 'step', dt, buffer,
          width: size.width, height: size.height, dpr: devicePixels(),
          trailPersistence: ink.trailPersistence, accent: ink.accent, accentDeep: ink.accentDeep,
        }, [buffer]);
        buffer = null;
        return true;
      };
      requestRef.current = request;

      const handleMessage = (event: MessageEvent<WorkerFrameMessage>) => {
        const message = event.data;
        if (message.type === 'ready') {
          ready = true;
          report(message.effectiveParticleCount ?? effectiveParticleCount);
          // A field that mounts halted still shows its initial condition.
          if (!runningRef.current || redrawPending) { redrawPending = false; request(0); }
          return;
        }
        if (message.type === 'protocol-error') {
          if (message.buffer) buffer = message.buffer;
          return;
        }
        if (message.type !== 'frame' || !message.buffer) return;
        buffer = message.buffer;
        if (message.effectiveParticleCount) report(message.effectiveParticleCount);
        if (!canTransfer && message.bodyCount) paintHere(new Float32Array(message.buffer), message.bodyCount);
        if (redrawPending && !runningRef.current) { redrawPending = false; request(0); }
      };
      worker.addEventListener('message', handleMessage);

      const config = createWorkerConfig({
        particleCount: params.particleCount,
        effectiveParticleCount,
        preset: params.preset,
        seed: params.seed,
        timeScale: params.timeScale,
        gravity: params.gravity,
        softening: params.softening,
        expansionOrder: params.expansionOrder,
        leafCapacity: params.leafCapacity,
        pointerAttraction: params.pointerAttraction,
        showTree: params.showTree,
      });
      if (canTransfer) {
        const offscreen = canvas.transferControlToOffscreen();
        worker.postMessage({ type: 'initialize', config, canvas: offscreen, width: size.width, height: size.height, dpr: devicePixels() }, [offscreen]);
      } else worker.postMessage({ type: 'initialize', config });

      // Size to the desk. A frozen field repaints once at its new size; a running
      // one picks the size up on its next step.
      // Read lazily on the first pointer event and dropped on any resize.
      let deskRect: DOMRect | null = null;
      const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(([entry]) => {
        // A host hidden with display: none (a Suspense boundary showing its
        // fallback) reports 0×0; keep the last size rather than repaint at 1 px.
        if (!entry || entry.contentRect.width === 0 || entry.contentRect.height === 0) return;
        size.width = entry.contentRect.width;
        size.height = entry.contentRect.height;
        deskRect = null;
        if (!runningRef.current) request(0);
      });
      resizeObserver?.observe(canvas);

      // The pointer is read off the desk, passively: the backdrop itself is
      // pointer-events: none, and nothing here may slow a window drag or eat a click.
      // The listeners stay attached whatever "Pointer pulls bodies" says, so that
      // checkbox is a live setting too; the worker also gates on it.
      const pointer = (event: PointerEvent) => {
        if (!pointerAttractionRef.current) return;
        if (!deskRect) deskRect = desk?.getBoundingClientRect() ?? null;
        if (!deskRect) return;
        const point = toFieldPoint(event.clientX - deskRect.left, event.clientY - deskRect.top, deskRect.width, deskRect.height);
        worker.postMessage({ type: 'pointer', x: point.x, y: point.y, active: true });
      };
      const leave = () => worker.postMessage({ type: 'pointer', x: 0, y: 0, active: false });
      const refreshRect = () => { deskRect = null; };
      if (desk) {
        desk.addEventListener('pointermove', pointer, { passive: true });
        desk.addEventListener('pointerleave', leave, { passive: true });
        window.addEventListener('resize', refreshRect, { passive: true });
      }

      return () => {
        resizeObserver?.disconnect();
        desk?.removeEventListener('pointermove', pointer);
        desk?.removeEventListener('pointerleave', leave);
        window.removeEventListener('resize', refreshRect);
        worker.removeEventListener('message', handleMessage);
        worker.terminate();
        workerRef.current = null;
        requestRef.current = () => false;
      };
    })();
    return () => {
      teardown?.();
      canvas.remove();
    };
    // configKey names every param this effect reads; the live ones it reads
    // only to seed initialize, and the effect below keeps them current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey]);

  // Live settings reach the running worker in place. Declared after the effect
  // above, so on a re-key the replacement worker has its initialize first.
  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;
    worker.postMessage({
      type: 'configure',
      timeScale: params.timeScale,
      gravity: params.gravity,
      softening: params.softening,
      expansionOrder: params.expansionOrder,
      leafCapacity: params.leafCapacity,
      pointerAttraction: params.pointerAttraction,
      showTree: params.showTree,
    });
    if (!params.pointerAttraction) worker.postMessage({ type: 'pointer', x: 0, y: 0, active: false });
    // A frozen field repaints once, so a quadtree switched on while motion is
    // paused shows up (the redraw waits for the buffer if a frame is in flight).
    if (!runningRef.current) requestRef.current(0);
  }, [params.timeScale, params.gravity, params.softening, params.expansionOrder, params.leafCapacity, params.pointerAttraction, params.showTree]);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return undefined;
    worker.postMessage({ type: 'pause', paused: !running });
    if (!running) return undefined;
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      const elapsed = last ? Math.min(0.05, (now - last) / 1000) : 1 / 30;
      last = now;
      requestRef.current(elapsed);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // configKey re-binds this loop to the replacement worker created above;
    // without it the new worker would receive initialize but never step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, configKey]);

  return <div ref={hostRef} className="wb-backdrop-host" />;
};

export default NBodyField;
