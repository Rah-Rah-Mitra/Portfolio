import React, { useEffect, useRef, useState } from 'react';
import { useAppearance } from '../contexts/AppearanceContext';
import { createWorkerConfig } from '../lib/nbody/workerProtocol';

interface NBodyBackgroundProps { active: boolean }

interface WorkerFrameMessage {
  type: 'frame' | 'ready' | 'protocol-error';
  buffer?: ArrayBuffer;
  bodyCount?: number;
  effectiveParticleCount?: number;
  metrics?: { elapsed: number; p95: number; metrics: { treeDepth: number; m2lInteractions: number; directInteractions: number } };
}

const drawFallback = (canvas: HTMLCanvasElement, positions: Float32Array, count: number, trail: number, accent: string, surface: string, darkSurface: boolean) => {
  const context = canvas.getContext('2d');
  if (!context) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  context.globalCompositeOperation = 'source-over';
  context.globalAlpha = Math.max(0.06, 1 - trail / 100);
  context.fillStyle = surface;
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = 'lighter';
  context.globalAlpha = darkSurface ? .82 : .72;
  context.fillStyle = accent;
  const scale = Math.min(width, height) * 0.48;
  for (let body = 0; body < count; body += 1) {
    const x = width * 0.5 + positions[body * 2]! * scale;
    const y = height * 0.5 - positions[body * 2 + 1]! * scale;
    context.fillRect(x, y, dpr > 1 ? 1.5 : 1, dpr > 1 ? 1.5 : 1);
  }
};

const NBodyBackground: React.FC<NBodyBackgroundProps> = ({ active }) => {
  const { preferences, resolvedScheme } = useAppearance();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const readyRef = useRef(false);
  const inFlightRef = useRef(false);
  const bufferRef = useRef<ArrayBuffer | null>(null);
  const frameRef = useRef(0);
  const lastTickRef = useRef(0);
  const offscreenRef = useRef(false);
  const manualRetryRef = useRef(false);
  const [retryRevision, setRetryRevision] = useState(0);
  const [effectiveCount, setEffectiveCount] = useState(preferences.nbody.particleCount);

  // A canvas can hand control to a worker only once, so each configuration
  // change remounts a fresh canvas (keyed below) before transferring again.
  const configKey = [
    preferences.nbody.preset, preferences.nbody.particleCount, preferences.nbody.timeScale,
    preferences.nbody.gravity, preferences.nbody.softening, preferences.nbody.expansionOrder,
    preferences.nbody.leafCapacity, preferences.nbody.pointerAttraction, preferences.nbody.seed,
    preferences.nbody.showTree, retryRevision,
  ].join('|');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    offscreenRef.current = false;
    const worker = new Worker(new URL('../workers/nbody.worker.ts', import.meta.url), { type: 'module', name: 'optical-nbody-fmm' });
    workerRef.current = worker;
    const canTransfer = 'transferControlToOffscreen' in canvas && typeof canvas.transferControlToOffscreen === 'function';
    const effectiveParticleCount = canTransfer || manualRetryRef.current ? preferences.nbody.particleCount : Math.min(768, preferences.nbody.particleCount);
    manualRetryRef.current = false;
    setEffectiveCount(effectiveParticleCount);
    bufferRef.current = new ArrayBuffer(effectiveParticleCount * 2 * Float32Array.BYTES_PER_ELEMENT);
    const config = createWorkerConfig({
      particleCount: preferences.nbody.particleCount,
      effectiveParticleCount,
      preset: preferences.nbody.preset,
      seed: preferences.nbody.seed,
      timeScale: preferences.nbody.timeScale,
      gravity: preferences.nbody.gravity,
      softening: preferences.nbody.softening,
      expansionOrder: preferences.nbody.expansionOrder,
      leafCapacity: preferences.nbody.leafCapacity,
      pointerAttraction: preferences.nbody.pointerAttraction,
      showTree: preferences.nbody.showTree,
    });
    const handleMessage = (event: MessageEvent<WorkerFrameMessage>) => {
      const message = event.data;
      if (message.type === 'ready') {
        readyRef.current = true;
        setEffectiveCount(message.effectiveParticleCount ?? effectiveParticleCount);
        return;
      }
      if (message.type !== 'frame' || !message.buffer) return;
      inFlightRef.current = false;
      bufferRef.current = message.buffer;
      setEffectiveCount(message.effectiveParticleCount ?? effectiveParticleCount);
      if (!offscreenRef.current) {
        const styles = getComputedStyle(document.documentElement);
        drawFallback(canvas, new Float32Array(message.buffer), message.bodyCount ?? 0, preferences.nbody.trailPersistence, styles.getPropertyValue('--field-teal').trim() || '#63d7ca', styles.getPropertyValue('--desktop-field').trim() || '#080b0f', document.documentElement.dataset.colorScheme !== 'light');
      }
      if (message.metrics) window.dispatchEvent(new CustomEvent('portfolio:nbody-metrics', { detail: { ...message.metrics, effectiveParticleCount: message.effectiveParticleCount ?? effectiveParticleCount } }));
    };
    worker.addEventListener('message', handleMessage);
    if (canTransfer) {
      const offscreen = canvas.transferControlToOffscreen();
      offscreenRef.current = true;
      worker.postMessage({ type: 'initialize', config, canvas: offscreen, width: canvas.clientWidth, height: canvas.clientHeight, dpr: Math.min(window.devicePixelRatio || 1, 2) }, [offscreen]);
    } else worker.postMessage({ type: 'initialize', config });
    return () => {
      cancelAnimationFrame(frameRef.current);
      worker.removeEventListener('message', handleMessage);
      worker.terminate();
      workerRef.current = null;
      readyRef.current = false;
      inFlightRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey]);

  useEffect(() => {
    const retry = () => {
      manualRetryRef.current = true;
      setRetryRevision((value) => value + 1);
    };
    window.addEventListener('portfolio:nbody-retry', retry);
    return () => window.removeEventListener('portfolio:nbody-retry', retry);
  }, []);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return undefined;
    worker.postMessage({ type: 'pause', paused: !active });
    if (!active) {
      cancelAnimationFrame(frameRef.current);
      return undefined;
    }
    const tick = (now: number) => {
      const elapsed = lastTickRef.current ? Math.min(0.05, (now - lastTickRef.current) / 1000) : 1 / 30;
      lastTickRef.current = now;
      const buffer = bufferRef.current;
      if (readyRef.current && !inFlightRef.current && buffer) {
        bufferRef.current = null;
        inFlightRef.current = true;
        const canvas = canvasRef.current;
        const styles = getComputedStyle(document.documentElement);
        worker.postMessage({
          type: 'step', dt: elapsed, buffer,
          width: canvas?.clientWidth ?? 0, height: canvas?.clientHeight ?? 0,
          dpr: Math.min(window.devicePixelRatio || 1, 2),
          trailPersistence: preferences.nbody.trailPersistence,
          accent: styles.getPropertyValue('--field-teal').trim() || '#63d7ca',
          surface: styles.getPropertyValue('--desktop-field').trim() || '#080b0f',
          darkSurface: resolvedScheme === 'dark',
        }, [buffer]);
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
    // configKey re-binds this loop to the replacement worker created above;
    // without it the new worker would receive initialize but never step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, configKey, preferences.nbody.trailPersistence, resolvedScheme]);

  const pointer = (event: React.PointerEvent<HTMLCanvasElement>, activePointer: boolean) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1;
    const y = 1 - ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 2;
    workerRef.current?.postMessage({ type: 'pointer', x, y, active: activePointer });
  };

  return (
    <div className="nbody-background" data-active={active} data-effective-count={effectiveCount}>
      <canvas key={configKey} ref={canvasRef} aria-label="Animated two-dimensional gravitational N-body field" onPointerMove={(event) => pointer(event, true)} onPointerLeave={(event) => pointer(event, false)} />
      <button type="button" className="nbody-reset" onClick={() => workerRef.current?.postMessage({ type: 'reset', seed: preferences.nbody.seed })}>Reset N-body field</button>
      <span className="nbody-field-caption" aria-hidden="true">2D LOG-FMM · {effectiveCount} BODIES</span>
    </div>
  );
};

export default NBodyBackground;
