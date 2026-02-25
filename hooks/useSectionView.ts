import { useEffect, useRef } from 'react';
import { track, themeToProfile } from '../lib/analytics';
import type { Theme } from '../contexts/ThemeContext';

/**
 * Fires a `section_viewed` PostHog event exactly once per mount
 * when ≥ 40% of the section is visible in the viewport.
 *
 * Uses a single shared IntersectionObserver instance (via module-level
 * singleton) so all sections share one observer rather than N separate ones.
 */

type ObserverCallback = (entry: IntersectionObserverEntry) => void;

// Module-level singleton — one IO handles all section registrations
let sharedObserver: IntersectionObserver | null = null;
const callbackMap = new WeakMap<Element, ObserverCallback>();

function getSharedObserver(): IntersectionObserver {
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const cb = callbackMap.get(entry.target);
            if (cb) cb(entry);
          }
        });
      },
      { threshold: 0.4 },
    );
  }
  return sharedObserver;
}

export function useSectionView(
  sectionName: string,
  theme: Theme,
  elementRef: { current: HTMLElement | null },
): void {
  const hasFired = useRef(false);

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    // Reset on theme change so we re-fire when the user switches profiles
    hasFired.current = false;

    const observer = getSharedObserver();

    const callback: ObserverCallback = () => {
      if (hasFired.current) return;
      hasFired.current = true;
      track('section_viewed', {
        section: sectionName,
        profile: themeToProfile(theme),
      });
      observer.unobserve(el);
      callbackMap.delete(el);
    };

    callbackMap.set(el, callback);
    observer.observe(el);

    return () => {
      observer.unobserve(el);
      callbackMap.delete(el);
    };
  // Re-register when theme changes so section views are tracked per profile
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionName, theme]);
}
