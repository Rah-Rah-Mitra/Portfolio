import { RefObject, useEffect } from 'react';

const focusableSelector = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

export const useFocusTrap = <T extends HTMLElement>(
  active: boolean,
  containerRef: RefObject<T | null>,
  fallbackSelector?: string,
  suppressRestoreRef?: RefObject<boolean>,
) => {
  useEffect(() => {
    if (!active) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;
    const returnTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const initialFocusTimer = window.setTimeout(() => {
      const focusables = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));
      (focusables[0] ?? container).focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const current = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));
      if (!current.length) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = current[0];
      const last = current[current.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(initialFocusTimer);
      container.removeEventListener('keydown', handleKeyDown);
      if (suppressRestoreRef?.current) {
        suppressRestoreRef.current = false;
        return;
      }
      window.setTimeout(() => {
        const connectedReturnTarget = returnTarget && returnTarget !== document.body && returnTarget.isConnected
          ? returnTarget
          : null;
        const fallbackTarget = fallbackSelector
          ? Array.from(document.querySelectorAll<HTMLElement>(fallbackSelector))
            .find((element) => !element.hasAttribute('disabled') && element.getClientRects().length > 0) ?? null
          : null;
        (connectedReturnTarget ?? fallbackTarget)?.focus({ preventScroll: true });
      }, 0);
    };
  }, [active, containerRef, fallbackSelector, suppressRestoreRef]);
};
