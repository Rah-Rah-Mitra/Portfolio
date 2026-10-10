import React, { useLayoutEffect, useRef, useState } from 'react';
import type { FilmTarget, NavState } from './drawingFilm';

// The sheet traverse (docs/portfolio/desk-drawing-set.md §4 "The sheet traverse"):
// the drawing's own way through its sheets, riding as the top row of the sheet
// chip. The chip stands in the free region the film draws in, so no window ever
// covers it. A ticked rail with a station per sheet of the building, FieldIndex's
// trolley standing over the one on show, ‹ › for the previous and next sheet and
// « » for the previous and next building. The film decides every jump
// (drawingFilm.ts goTo); this only asks. The trolley moves by a CSS transition that
// the motion rule switches off, so nothing here requests a frame. The icons'
// strokes are index.css's, AppIcon's metrics at 14 px: the main bundle exports
// nothing more for this chunk.

export interface SheetTraverseProps {
  /** Null while the film is parked: the toolbar goes, the status line and the host stay. */
  nav: NavState | null;
  film: { goTo(target: FilmTarget): void; prefetch(): void } | null;
  /** The traverse's host (focusable, tabIndex −1): focus waits there while the toolbar is gone. */
  host: HTMLElement;
}

/** Below this the chip is too narrow for « » beside the rail's seven slots. */
const WIDE = 290;

/**
 * A station's name: its sheet's title up to the first ' · ', less the storey count,
 * in sentence case ('03 TYPICAL PLAN L2–L20 (×19) · FFL …' → '03 Typical plan L2–L20').
 * Words of three letters or more are words; L1, L2–L20 and NE are tags and keep their case.
 * The first word keeps its capital unless `capital` is past it.
 */
export const stationName = (title: string, capital = 3): string => title.replace(/ \(×\d+\)/, '').split(' · ')[0]
  .replace(/\b([A-Z])([A-Z]{2,})\b/g, (_, first: string, rest: string, at: number) => (at > capital ? first.toLowerCase() : first) + rest.toLowerCase());

/** What the status line says once a jump lands: 'Sheet 04 of 07, Blk 501 roof plan'. */
export const landedText = (nav: NavState): string => {
  const { title } = nav.sheets[nav.current];
  return `Sheet ${title.slice(0, 2)} of 0${nav.sheets.length}, ${nav.name.replace('BLK', 'Blk')} ${stationName(title, -1).slice(3)}`;
};

export const SheetTraverse: React.FC<SheetTraverseProps> = ({ nav, film, host }) => {
  const bar = useRef<HTMLDivElement>(null);
  /** The control holding the toolbar's one Tab stop while focus is inside it (its data-k); the sheet on show otherwise. */
  const [stop, setStop] = useState<string | null>(null);
  /** The control focus was last on inside the toolbar, until the visitor takes focus elsewhere. */
  const last = useRef<HTMLElement | null>(null);
  /** The building whose previous building was last asked for. */
  const warmed = useRef('');

  // A control that held focus and left the DOM (a station of a building with more
  // sheets, « » on a chip grown narrow, the whole toolbar on a park) drops focus to
  // the page. This hands it on instead, as the Estate HUD's useFocusRescue does, and
  // only while focus really is nowhere: a station to the sheet on show, « » to ‹ ›,
  // the toolbar to its host, and back to the toolbar's stop when it returns.
  useLayoutEffect(() => {
    const gone = last.current;
    const active = document.activeElement;
    if (gone && !gone.isConnected) {
      last.current = null;
      if (active && active !== document.body) return;
      const to = bar.current?.querySelector<HTMLElement>(gone.matches('.wb-drawing-nav-stn') ? '[aria-current]' : `[data-k="${gone.dataset.k!.replace('building', 'sheet')}"]`);
      if (to) to.focus({ preventScroll: true });
      else {
        // Back from the park, the stop is the sheet on show then, not the control that went.
        setStop(null);
        host.focus({ preventScroll: true });
      }
    } else if (active === host && bar.current) bar.current.querySelector<HTMLElement>('[tabindex="0"]')?.focus({ preventScroll: true });
  });

  const status = <p className="sr-only" role="status">{nav?.jump ? landedText(nav) : ''}</p>;
  // The status line keeps its place (the second child) with or without the toolbar, so it is one live region throughout.
  if (!nav || !film) return <>{null}{status}</>;

  const wide = nav.chip.w >= WIDE;
  const keys = [...nav.sheets.map((s) => `${s.no}`), 'Previous sheet', 'Next sheet', ...(wide ? ['Previous building', 'Next building'] : [])];
  const tab = stop !== null && keys.includes(stop) ? stop : `${nav.sheets[nav.current].no}`;

  // The previous building's sheets load once a visitor reaches for the traverse, once a building (the film loads each building once).
  const warm = () => {
    if (warmed.current === nav.hero) return;
    warmed.current = nav.hero;
    film.prefetch();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    // A modified key belongs to the browser or the screen reader (Alt+← is Back).
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const list = [...bar.current!.querySelectorAll('button')];
    const n = list.length;
    const i = list.indexOf(event.target as HTMLButtonElement);
    const j = { ArrowRight: (i + 1) % n, ArrowLeft: (i + n - 1) % n, Home: 0, End: n - 1 }[event.key];
    if (i < 0 || j === undefined) return;
    event.preventDefault();
    list[j].focus();
  };

  /** Its place in the roving tab order, which every control of the toolbar takes in turn. */
  const item = (k: string) => ({ type: 'button' as const, 'data-k': k, tabIndex: k === tab ? 0 : -1 });
  const arrow = (label: string, path: string, target: FilmTarget) => (
    <button {...item(label)} className="wb-drawing-nav-btn ph-no-rageclick" aria-label={label} onClick={() => film.goTo(target)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg>
    </button>
  );

  return (
    <>
      <div
        ref={bar}
        role="toolbar"
        aria-label="Drawing sheets"
        data-drawing-nav=""
        className="wb-drawing-nav-bar"
        style={{ left: nav.chip.x, top: nav.chip.y, width: nav.chip.w }}
        onKeyDown={onKeyDown}
        onPointerEnter={warm}
        onFocus={(event) => {
          warm();
          last.current = event.target as HTMLElement;
          setStop(last.current.dataset.k ?? null);
        }}
        onBlur={(event) => {
          if (bar.current!.contains(event.relatedTarget)) return;
          setStop(null);
          // Taken elsewhere by the visitor (the control is still here): nothing to rescue later.
          if (event.target.isConnected) last.current = null;
        }}
      >
        {/* « » are ‹ › doubled. */}
        {wide && arrow('Previous building', 'm12 18-6-6 6-6m6 12-6-6 6-6', { building: -1 })}
        {arrow('Previous sheet', 'm15 18-6-6 6-6', { step: -1 })}
        <div className="wb-drawing-nav-rail" style={{ '--n': nav.sheets.length, '--at': nav.current } as React.CSSProperties}>
          {/* Keyed by building: a new building's trolley stands at its station rather than running back along the rail. */}
          <svg key={nav.hero} className="wb-drawing-nav-car" width="26" height="13" viewBox="0 0 26 13" aria-hidden="true">
            <path d="M2 6.5h22M6 6.5V3h14v3.5M7.2 9a2.3 2.3 0 1 0 4.6 0 2.3 2.3 0 1 0-4.6 0m7 0a2.3 2.3 0 1 0 4.6 0 2.3 2.3 0 1 0-4.6 0" />
          </svg>
          {nav.sheets.map((sheet, i) => {
            // The sheet on show is drawn, whatever a jump could do (the welcome's aerial in a plans-only cycle).
            const off = !sheet.available && i !== nav.current;
            return (
              <button
                key={sheet.no}
                {...item(`${sheet.no}`)}
                className="wb-drawing-nav-stn"
                aria-label={stationName(sheet.title) + (off ? `, ${sheet.reason}` : '')}
                aria-current={i === nav.current ? 'step' : undefined}
                aria-disabled={off || undefined}
                onClick={() => sheet.available && film.goTo({ sheet: i })}
              >
                {sheet.title.slice(0, 2)}
              </button>
            );
          })}
        </div>
        {arrow('Next sheet', 'm9 18 6-6-6-6', { step: 1 })}
        {wide && arrow('Next building', 'm6 18 6-6-6-6m6 12 6-6-6-6', { building: 1 })}
      </div>
      {status}
    </>
  );
};

export default SheetTraverse;
