import { useEffect, useRef } from 'react';
import { track } from '../lib/analytics';

const MILESTONES = [25, 50, 75, 90] as const;

export function useScrollDepth(): void {
  const fired = useRef<Set<number>>(new Set());

  useEffect(() => {
    fired.current.clear();

    const handleScroll = () => {
      const root = document.documentElement;
      const scrollable = root.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;

      const depth = Math.min(100, Math.round((window.scrollY / scrollable) * 100));
      MILESTONES.forEach((milestone) => {
        if (depth >= milestone && !fired.current.has(milestone)) {
          fired.current.add(milestone);
          track('scroll_depth_reached', {
            depth: milestone,
            surface: 'continuous_field_test',
          });
        }
      });
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
}
