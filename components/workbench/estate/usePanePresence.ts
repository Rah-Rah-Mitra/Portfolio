import React from 'react';
import { motionHalted, onMotionChange } from '../../../lib/motion';

// Where the Estate window stands on the desk, for the load policy (plan §7.1,
// §9.3): open, focused, on screen, the page hidden, motion halted. Effects
// only, and nothing here is read during render — App is prerendered, and the
// first client render must match it, so every field starts at its prerender
// value and changes only once an observer reports.
//
// What it watches, and what it deliberately does not:
//  - a MutationObserver on the window's own section (closest
//    'section[data-win="world-3d"]'), on `style` (FieldWorkbench opens and
//    closes a window by its inline display) and `data-focused`;
//  - an IntersectionObserver on the stage, so a window dragged off the desk
//    freezes. Without one (jsdom), the stage counts as on screen;
//  - visibilitychange and onMotionChange (lib/motion.ts).
//  - NOT the WORKBENCH_WINDOW world event: CLAUDE.md reserves it for the sound
//    cues. Opening and closing are read off the section itself.
//
// DESK closes every window in one commit. That is read off the same mutation:
// when this window closes and no other section on the desk is still open, the
// close counts as DESK. Closing the last open window by hand reads the same and
// is the same picture — an empty desk — so it releases at once too.
//
// The section and the stage are found by DOM scan in a no-deps effect (the
// MechanismBench rule), so a re-render that replaces either is picked up.

export interface PanePresence {
  /** The section is displayed (FieldWorkbench's inline display is not 'none'). */
  open: boolean;
  /** The section carries data-focused. */
  focused: boolean;
  /** The stage intersects the viewport. */
  onscreen: boolean;
  /** document.hidden. */
  hidden: boolean;
  /** motionHalted(). */
  halted: boolean;
  /** Closed together with every other window: DESK, or the last one closing. */
  closedByDesk: boolean;
}

/** The prerender's answer, and the first client render's. */
export const PRERENDER_PRESENCE: PanePresence = Object.freeze({
  open: false,
  focused: false,
  onscreen: true,
  hidden: false,
  halted: false,
  closedByDesk: false,
});

export const ESTATE_SECTION = 'section[data-win="world-3d"]';
export const ESTATE_STAGE = '[data-estate-stage]';

const same = (a: PanePresence, b: PanePresence) => a.open === b.open && a.focused === b.focused && a.onscreen === b.onscreen
  && a.hidden === b.hidden && a.halted === b.halted && a.closedByDesk === b.closedByDesk;

const displayed = (section: HTMLElement) => section.style.display !== 'none';

/** Every window section beside this one is closed too. False when there is no desk to look at. */
const deskEmpty = (section: HTMLElement) => {
  const desk = section.parentElement;
  if (!desk) return false;
  const windows = desk.querySelectorAll<HTMLElement>(':scope > section[data-win]');
  if (windows.length < 2) return false;
  return Array.from(windows).every((win) => !displayed(win));
};

/**
 * Presence of the Estate window that `rootRef` sits in. Outside a workbench
 * section (a bare mount) the window counts as open and focused.
 */
export const usePanePresence = (rootRef: React.RefObject<HTMLElement | null>): PanePresence => {
  const [presence, setPresence] = React.useState<PanePresence>(PRERENDER_PRESENCE);
  const sectionRef = React.useRef<HTMLElement | null>(null);
  const stageRef = React.useRef<Element | null>(null);
  const resyncRef = React.useRef<() => void>(() => {});
  const observeRef = React.useRef<() => void>(() => {});

  // One set of listeners for the component's life; resync reads whatever the
  // scan below last found.
  React.useEffect(() => {
    let onscreen = true;
    let closedByDesk = false;
    let wasOpen: boolean | null = null;
    const sync = () => {
      const section = sectionRef.current;
      const open = section ? displayed(section) : true;
      if (wasOpen === true && !open) closedByDesk = section ? deskEmpty(section) : false;
      if (open) closedByDesk = false;
      wasOpen = open;
      const next: PanePresence = {
        open,
        focused: section ? section.hasAttribute('data-focused') : true,
        onscreen,
        hidden: document.hidden,
        halted: motionHalted(),
        closedByDesk,
      };
      setPresence((prev) => (same(prev, next) ? prev : next));
    };
    resyncRef.current = sync;

    const sections = new MutationObserver(sync);
    const intersections = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.target === stageRef.current) onscreen = entry.isIntersecting;
      sync();
    });
    const observe = () => {
      const root = rootRef.current;
      const section = root?.closest<HTMLElement>(ESTATE_SECTION) ?? null;
      if (section !== sectionRef.current) {
        sections.disconnect();
        sectionRef.current = section;
        if (section) sections.observe(section, { attributes: true, attributeFilter: ['style', 'data-focused'] });
      }
      const stage = root?.querySelector(ESTATE_STAGE) ?? null;
      if (stage !== stageRef.current) {
        if (stageRef.current) intersections?.unobserve(stageRef.current);
        stageRef.current = stage;
        onscreen = true;
        if (stage) intersections?.observe(stage);
      }
    };
    observeRef.current = observe;
    observe();
    sync();

    const stopMotion = onMotionChange(sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      stopMotion();
      document.removeEventListener('visibilitychange', sync);
      sections.disconnect();
      intersections?.disconnect();
      sectionRef.current = null;
      stageRef.current = null;
      observeRef.current = () => {};
      resyncRef.current = () => {};
    };
  }, [rootRef]);

  // After every render: pick up a replaced section or stage (the scan rule).
  React.useEffect(() => {
    const before = [sectionRef.current, stageRef.current];
    observeRef.current();
    if (before[0] !== sectionRef.current || before[1] !== stageRef.current) resyncRef.current();
  });

  return presence;
};
