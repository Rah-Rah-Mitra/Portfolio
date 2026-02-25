import { useRef, useCallback, useEffect } from 'react';

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * GPU-accelerated CSS 3D tilt effect driven by mouse position.
 * Uses passive event listeners and requestAnimationFrame for smooth 60fps performance.
 * Automatically disabled when the user has prefers-reduced-motion set.
 */
export function useCardTilt(intensity = 12) {
  const cardRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const latestMouseEvent = useRef<{ x: number; y: number } | null>(null);

  const applyTilt = useCallback(() => {
    const card = cardRef.current;
    const pos = latestMouseEvent.current;
    if (!card || !pos) return;

    const rect = card.getBoundingClientRect();
    // Normalize to -0.5 → 0.5
    const x = (pos.x - rect.left) / rect.width - 0.5;
    const y = (pos.y - rect.top) / rect.height - 0.5;

    card.style.transform = `perspective(900px) rotateY(${x * intensity}deg) rotateX(${-y * intensity}deg) translateZ(10px) scale3d(1.02, 1.02, 1.02)`;
    rafRef.current = null;
  }, [intensity]);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (prefersReducedMotion()) return;
    latestMouseEvent.current = { x: e.clientX, y: e.clientY };
    // Batch DOM writes into a single rAF per frame
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(applyTilt);
    }
  }, [applyTilt]);

  const onMouseLeave = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    latestMouseEvent.current = null;
    const card = cardRef.current;
    if (!card) return;
    card.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) translateZ(0) scale3d(1,1,1)';
    card.style.transition = 'transform 0.5s cubic-bezier(0.23, 1, 0.32, 1)';
  }, []);

  const onMouseEnter = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    // Remove slow transition while actively tilting
    card.style.transition = 'transform 0.08s linear';
  }, []);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    // Promote to its own GPU compositor layer
    card.style.willChange = 'transform';
    card.style.backfaceVisibility = 'hidden';

    card.addEventListener('mousemove', onMouseMove, { passive: true });
    card.addEventListener('mouseleave', onMouseLeave, { passive: true });
    card.addEventListener('mouseenter', onMouseEnter, { passive: true });

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      card.removeEventListener('mousemove', onMouseMove);
      card.removeEventListener('mouseleave', onMouseLeave);
      card.removeEventListener('mouseenter', onMouseEnter);
      card.style.willChange = 'auto';
    };
  }, [onMouseMove, onMouseLeave, onMouseEnter]);

  return cardRef;
}
