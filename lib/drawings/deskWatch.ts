import { occupancy, sheetRegions, type Box, type Region } from './occupancy';

// Watching the desk for room to draw (docs/portfolio/desk-drawing-set.md §5
// "Lifecycle"). Runs in the desk-backdrop layer's chunk, before the drawing is
// downloaded: a desk with no free region never loads it. Browser-only, called
// from effects. One ResizeObserver on the desk, one MutationObserver per window
// section (its `style`: opening, closing and dragging all write it; the hoist's
// motion is on an inner element and never does), a resolution query, and a 250 ms
// debounce, so a drag costs one read when it stops.

export interface DeskSnapshot {
  w: number;
  h: number;
  obstacles: Box[];
  /** A window is open: the drawing reads behind it rather than playing its film. */
  windowsOpen: boolean;
  /** The free regions a sheet fits (11 × 8 squares or more), largest first. */
  regions: Region[];
  /** A sheet fits somewhere: `regions` is not empty. */
  room: boolean;
  /** Where the Estate window's poster picture was last seen (its cover-fit 4:3 rectangle), desk px. */
  poster: Box | null;
  dpr: number;
}

const local = (desk: DOMRect, r: DOMRect): Box => ({ x: r.left - desk.left, y: r.top - desk.top, w: r.width, h: r.height });

/** The 4:3 rectangle a poster fills when it covers `box` (object-fit: cover; project.ts coverFrame, restated so this chunk stays small). */
const cover43 = (box: Box): Box => (box.w / box.h > 4 / 3
  ? { x: box.x, y: box.y + (box.h - (box.w * 3) / 4) / 2, w: box.w, h: (box.w * 3) / 4 }
  : { x: box.x + (box.w - (box.h * 4) / 3) / 2, y: box.y, w: (box.h * 4) / 3, h: box.h });

/** One extra line of the title plate's value column: the sheet caption adds one. */
const PLATE_RESERVE = 13;

export const readDesk = (desk: HTMLElement, lastPoster: Box | null): DeskSnapshot => {
  const box = desk.getBoundingClientRect();
  const w = desk.clientWidth;
  const h = desk.clientHeight;
  const obstacles: Box[] = [];
  let windowsOpen = false;
  let poster = lastPoster;
  for (const win of desk.querySelectorAll<HTMLElement>(':scope > section[data-win]')) {
    if (win.style.display === 'none' || win.getClientRects().length === 0) continue;
    windowsOpen = true;
    obstacles.push({ x: win.offsetLeft, y: win.offsetTop, w: win.offsetWidth, h: win.offsetHeight });
    if (win.dataset.win === 'world-3d') {
      const phase = win.querySelector<HTMLElement>('#world')?.dataset.estatePhase;
      const img = win.querySelector<HTMLElement>('[data-estate-stage] img');
      if (img && phase && ['poster', 'consent', 'loading'].includes(phase)) {
        const r = img.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          poster = cover43(local(box, r));
        }
      }
    }
  }
  for (const selector of ['.wb-shortcuts', '.wb-hint', '.wb-backdrop-caption']) {
    const el = desk.querySelector<HTMLElement>(`:scope > ${selector}, :scope > * > ${selector}`);
    if (el && el.getClientRects().length) obstacles.push(local(box, el.getBoundingClientRect()));
  }
  const plate = desk.querySelector<HTMLElement>(':scope > .wb-plate');
  if (plate && plate.getClientRects().length) {
    const r = local(box, plate.getBoundingClientRect());
    obstacles.push({ x: r.x, y: r.y - PLATE_RESERVE, w: r.w, h: r.h + PLATE_RESERVE });
  }
  for (const dock of document.querySelectorAll<HTMLElement>('.ask-dock, .effects-dock')) {
    if (dock.getClientRects().length) obstacles.push(local(box, dock.getBoundingClientRect()));
  }
  const regions = sheetRegions(occupancy(w, h, obstacles));
  return {
    w, h, obstacles, windowsOpen, regions,
    room: regions.length > 0,
    poster,
    dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
  };
};

/**
 * Calls `onChange` with a fresh snapshot now and after every change to the desk,
 * its windows or the resolution, debounced. Returns the stop function.
 */
export const watchDesk = (desk: HTMLElement, onChange: (snapshot: DeskSnapshot) => void, debounceMs = 250): (() => void) => {
  let poster: Box | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const read = () => {
    timer = null;
    if (stopped) return;
    const snapshot = readDesk(desk, poster);
    poster = snapshot.poster;
    onChange(snapshot);
  };
  const schedule = () => {
    if (stopped) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(read, debounceMs);
  };
  const observers: { disconnect(): void }[] = [];
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver((entries) => {
      const r = entries[entries.length - 1]?.contentRect;
      if (r && (r.width === 0 || r.height === 0)) return;
      schedule();
    });
    ro.observe(desk);
    observers.push(ro);
  }
  if (typeof MutationObserver === 'function') {
    for (const win of desk.querySelectorAll(':scope > section[data-win]')) {
      const mo = new MutationObserver(schedule);
      mo.observe(win, { attributes: true, attributeFilter: ['style'] });
      observers.push(mo);
    }
    // The Estate window's phase decides whether its poster is still on show.
    const world = desk.querySelector('#world');
    if (world) {
      const mo = new MutationObserver(schedule);
      mo.observe(world, { attributes: true, attributeFilter: ['data-estate-phase'] });
      observers.push(mo);
    }
  }
  let media: MediaQueryList | null = null;
  const onMedia = () => {
    schedule();
    media?.removeEventListener('change', onMedia);
    media = typeof window.matchMedia === 'function' ? window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`) : null;
    media?.addEventListener('change', onMedia);
  };
  if (typeof window.matchMedia === 'function') {
    media = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    media.addEventListener('change', onMedia);
  }
  read();
  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    for (const o of observers) o.disconnect();
    media?.removeEventListener('change', onMedia);
  };
};
