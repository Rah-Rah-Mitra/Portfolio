import React, { useEffect, useRef, useState } from 'react';
import { useAppearance } from '../contexts/AppearanceContext';
import { ASCII_SOURCE_URL, buildAsciiGrid, renderAsciiFrame, type AsciiGrid } from '../lib/ascii/electricGaze';

interface AsciiBackgroundProps { active: boolean }

const FRAME_INTERVAL_MS = 1000 / 30;

const paintSourceCanvas = (source: CanvasImageSource, sourceWidth: number, sourceHeight: number, width: number, height: number): HTMLCanvasElement | null => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  ctx.drawImage(source, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  return canvas;
};

const AsciiBackground: React.FC<AsciiBackgroundProps> = ({ active }) => {
  const { preferences } = useAppearance();
  const ascii = preferences.ascii;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const gridRef = useRef<AsciiGrid | null>(null);
  const photoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef(0);
  const lastFrameAtRef = useRef(0);
  const startedAtRef = useRef(0);
  const [sourceState, setSourceState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [sourceRevision, setSourceRevision] = useState(0);

  useEffect(() => {
    const image = new Image();
    image.decoding = 'async';
    image.src = ASCII_SOURCE_URL;
    let cancelled = false;
    image.onload = () => {
      if (cancelled) return;
      imageRef.current = image;
      setSourceState('ready');
      setSourceRevision((value) => value + 1);
    };
    image.onerror = () => {
      if (!cancelled) setSourceState('failed');
    };
    return () => {
      cancelled = true;
      imageRef.current = null;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || sourceState !== 'ready') return undefined;

    const rebuild = () => {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const photoCanvas = paintSourceCanvas(image, image.naturalWidth, image.naturalHeight, width, height);
      photoCanvasRef.current = photoCanvas;
      const photoCtx = photoCanvas?.getContext('2d');
      if (!photoCanvas || !photoCtx) return;
      const pixels = photoCtx.getImageData(0, 0, photoCanvas.width, photoCanvas.height);
      gridRef.current = buildAsciiGrid(
        { data: pixels.data, width: pixels.width, height: pixels.height },
        width,
        height,
        ascii.cellSize,
      );
    };

    const handleResize = () => {
      // Resizing the canvas clears its bitmap; static modes (paused,
      // animation off, reduced motion) have no frame loop to repaint it.
      rebuild();
      drawOnce();
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ascii.cellSize, sourceRevision, sourceState]);

  const drawOnce = () => {
    const canvas = canvasRef.current;
    const grid = gridRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !grid || !ctx) return;
    const styles = getComputedStyle(document.documentElement);
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    renderAsciiFrame(ctx, grid, {
      width: canvas.width,
      height: canvas.height,
      timeSeconds: startedAtRef.current === 0 ? 0 : (performance.now() - startedAtRef.current) / 1000,
      preferences: ascii,
      surfaceColor: styles.getPropertyValue('--desktop-field').trim() || '#080b0f',
      sourceCanvas: photoCanvasRef.current,
      reducedMotion,
    });
  };

  useEffect(() => {
    if (sourceState !== 'ready') return undefined;
    if (startedAtRef.current === 0) startedAtRef.current = performance.now();
    if (!active || !ascii.animated) {
      cancelAnimationFrame(frameRef.current);
      drawOnce();
      return undefined;
    }
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reducedMotion) {
      drawOnce();
      return undefined;
    }
    const tick = (now: number) => {
      frameRef.current = requestAnimationFrame(tick);
      if (now - lastFrameAtRef.current < FRAME_INTERVAL_MS) return;
      lastFrameAtRef.current = now;
      drawOnce();
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ascii, sourceState, sourceRevision]);

  return (
    <div className="ascii-background" data-active={active} data-render-mode={ascii.renderMode} data-source-state={sourceState}>
      <canvas ref={canvasRef} aria-label="Animated ASCII rendering of the Electric Gaze reference photograph" />
      {sourceState === 'failed' && <span className="ascii-field-caption" role="status">ASCII source photo unavailable</span>}
      {sourceState !== 'failed' && <span className="ascii-field-caption" aria-hidden="true">ELECTRIC GAZE · {ascii.renderMode.toUpperCase()} · {ascii.cellSize}PX CELLS</span>}
    </div>
  );
};

export default AsciiBackground;
