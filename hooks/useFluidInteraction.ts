import { RefObject, useEffect, useMemo, useRef } from 'react';
import { Theme } from '../contexts/ThemeContext';
import type { BodyRef } from '../contexts/PhysicsContext';
import { FluidRenderer } from '../physics/fluid/FluidRenderer';
import { FluidQuality, FluidSystem } from '../physics/fluid/FluidSystem';

interface UseFluidInteractionOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  bodiesRef: RefObject<Map<string, BodyRef>>;
  isActive: boolean;
  theme: Theme;
}

const FIXED_DT = 1 / 60;
const MAX_ACCUMULATOR_STEPS = 4;

const pickQualityTier = (): FluidQuality => {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;

  if (window.innerWidth >= 1600 && (memory === undefined || memory >= 8)) {
    return 'high';
  }

  if (window.innerWidth < 860 || (memory !== undefined && memory <= 4)) {
    return 'low';
  }

  return 'medium';
};

export const useFluidInteraction = ({
  canvasRef,
  bodiesRef,
  isActive,
  theme,
}: UseFluidInteractionOptions): void => {
  const systemRef = useRef<FluidSystem | null>(null);
  const rendererRef = useRef<FluidRenderer | null>(null);
  const qualityRef = useRef<FluidQuality>('medium');
  const frameRef = useRef<number | null>(null);
  const accumulatorRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);
  const pointerDownRef = useRef(false);

  const pointerStrength = useMemo(() => (isActive ? 980 : 0), [isActive]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      return;
    }

    const setCanvasSize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;

      const tier = pickQualityTier();
      qualityRef.current = tier;

      if (!systemRef.current) {
        systemRef.current = new FluidSystem(width, height, tier);
      } else {
        systemRef.current.setBounds(width, height);
        systemRef.current.setQuality(tier);
      }

      if (!rendererRef.current) {
        rendererRef.current = new FluidRenderer(ctx, width, height, theme);
      } else {
        rendererRef.current.setBounds(width, height);
      }
    };

    setCanvasSize();
    window.addEventListener('resize', setCanvasSize);

    return () => {
      window.removeEventListener('resize', setCanvasSize);
    };
  }, [canvasRef, theme]);

  useEffect(() => {
    const system = systemRef.current;
    const renderer = rendererRef.current;

    if (!system || !renderer) {
      return;
    }

    renderer.setTheme(theme);
  }, [theme]);

  useEffect(() => {
    const system = systemRef.current;
    if (!system) {
      return;
    }

    if (!isActive) {
      pointerDownRef.current = false;
      system.setPointer({ isDown: false, strength: 0 });
      return;
    }

    system.setPointer({ strength: pointerStrength, radius: 120 });
  }, [isActive, pointerStrength]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      pointerDownRef.current = true;
      systemRef.current?.setPointer({
        x: event.clientX,
        y: event.clientY,
        isDown: isActive,
        strength: pointerStrength,
      });
    };

    const onPointerMove = (event: PointerEvent) => {
      systemRef.current?.setPointer({
        x: event.clientX,
        y: event.clientY,
        isDown: isActive && pointerDownRef.current,
      });
    };

    const onPointerUp = () => {
      pointerDownRef.current = false;
      systemRef.current?.setPointer({ isDown: false });
    };

    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerUp, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [isActive, pointerStrength]);

  useEffect(() => {
    const animate = (time: number) => {
      const system = systemRef.current;
      const renderer = rendererRef.current;

      if (!system || !renderer) {
        frameRef.current = requestAnimationFrame(animate);
        return;
      }

      if (lastTimeRef.current === null) {
        lastTimeRef.current = time;
      }

      const elapsed = Math.min((time - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = time;
      accumulatorRef.current += elapsed;

      let steps = 0;
      while (accumulatorRef.current >= FIXED_DT && steps < MAX_ACCUMULATOR_STEPS) {
        const bodyRefs = Array.from(bodiesRef.current.values() as Iterable<BodyRef>);
        const repulsors = bodyRefs.map(({ body }) => {
          const width = body.bounds.max.x - body.bounds.min.x;
          const height = body.bounds.max.y - body.bounds.min.y;
          return {
            x: body.position.x,
            y: body.position.y,
            radius: Math.max(width, height) * 0.6,
          };
        });

        system.step(FIXED_DT, repulsors);
        accumulatorRef.current -= FIXED_DT;
        steps += 1;
      }

      renderer.render(system.getParticles(), system.getParticleRadius(), isActive);
      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
      frameRef.current = null;
      accumulatorRef.current = 0;
      lastTimeRef.current = null;
    };
  }, [bodiesRef, isActive]);
};
