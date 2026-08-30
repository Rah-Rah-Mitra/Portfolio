import React from 'react';
import type { DesktopAppId } from '../../types';
import { archiveRows, CONTACT, featuredCards, generalResume, WORKBENCH_OPEN_EVENT, type WorkbenchOpenDetail } from '../../lib/workbench';
import { allProjects, coreCompetencies, experienceRecords, resumeProfiles, unifiedPortfolioData } from '../../portfolioData';
import { SITE_CONFIG } from '../../siteConfig';
import { clamp, pathSampler, routePath, spring, type PathSampler } from '../../lib/rig';
import { Corners } from './bits';
import { track } from '../../lib/analytics';

const KINDS = ['ALL', 'PROJECTS', 'EXPERIENCE', 'METHODS', 'PROOF', 'RESUMES'] as const;
type Kind = (typeof KINDS)[number];

interface IndexRow {
  id: string;
  kind: Exclude<Kind, 'ALL'>;
  date: string;
  title: string;
  sub: string;
  detail: string;
  tags: string[];
  link?: { label: string; href: string; download?: boolean };
}

const projectById = new Map(allProjects.map((project) => [project.id, project]));

const INDEX_ROWS: IndexRow[] = [
  ...archiveRows.map((row): IndexRow => ({
    id: `project:${row.id}`,
    kind: 'PROJECTS',
    date: row.date,
    title: row.title,
    sub: `${row.category} · ${row.domain}`,
    detail: projectById.get(row.id)?.description ?? row.category,
    tags: projectById.get(row.id)?.tags.slice(0, 3) ?? [],
    link: row.href ? { label: 'OPEN REPO ↗', href: row.href } : undefined,
  })),
  ...experienceRecords.map((record): IndexRow => ({
    id: `experience:${record.id}`,
    kind: 'EXPERIENCE',
    date: record.dateLabel.split(/[–—-]/)[0]?.trim() ?? record.dateLabel,
    title: record.organization,
    sub: record.role,
    detail: record.scope,
    tags: record.tags.slice(0, 3),
  })),
  ...coreCompetencies.map((cluster, index): IndexRow => ({
    id: `method:${cluster.id}`,
    kind: 'METHODS',
    date: String(index + 1).padStart(2, '0'),
    title: cluster.title,
    sub: cluster.tools.slice(0, 4).join(' · '),
    detail: `${cluster.summary} Proof — ${cluster.proof.join(' · ')}.`,
    tags: cluster.tools.slice(0, 3),
  })),
  ...unifiedPortfolioData.achievements.map((achievement, index): IndexRow => ({
    id: `proof:${index}-${achievement.id}`,
    kind: 'PROOF',
    date: achievement.date,
    title: achievement.title,
    sub: achievement.category ?? 'Distinction',
    detail: achievement.description,
    tags: achievement.tags?.slice(0, 3) ?? [],
    link: achievement.proofUrl ? { label: `${(achievement.proofLabel ?? 'View proof').toUpperCase()} ↗`, href: achievement.proofUrl } : undefined,
  })),
  ...resumeProfiles.map((profile): IndexRow => ({
    id: `resume:${profile.id}`,
    kind: 'RESUMES',
    date: 'PDF·DOCX',
    title: profile.role,
    sub: profile.keywords.slice(0, 4).join(' · '),
    detail: `${profile.headline} Edition REV ${SITE_CONFIG.resumeEdition}, generated from the same registry.`,
    tags: profile.keywords.slice(0, 3),
    link: { label: 'DOWNLOAD PDF', href: profile.pdfUrl },
  })),
];

const GROUP_ORDER: Array<Exclude<Kind, 'ALL'>> = ['PROJECTS', 'EXPERIENCE', 'METHODS', 'PROOF', 'RESUMES'];

const APP_TO_KIND: Partial<Record<DesktopAppId, Kind>> = {
  'home': 'ALL',
  'selected-work': 'PROJECTS',
  'project-archive': 'PROJECTS',
  'systems-lab': 'PROJECTS',
  'camera-lab': 'PROJECTS',
  'world-3d': 'PROJECTS',
  'experience': 'EXPERIENCE',
  'capabilities': 'METHODS',
  'proof-vault': 'PROOF',
  'resumes-contact': 'RESUMES',
};

interface Rig {
  sc: { el: HTMLElement | null; st: number; prev: number; vel: number; max: number };
  wt: { y: number; v: number };
  rot: number;
  hrot: number;
  rail: { sl: number; prev: number; vel: number };
  hoists: Array<{ el: HTMLElement; car: HTMLElement; track: HTMLElement | null; trolley: SVGElement | null; y: number; v: number; x: number; xv: number; dir: number }>;
  swingers: Array<{ el: HTMLElement; a: number; v: number }>;
  boards: Array<{ el: HTMLElement; x: number; a: number; v: number }>;
  dropG: Element[];
  tvRow: HTMLElement | null;
  tvS: PathSampler | null;
  tvW: number;
  tvTop: number;
  tvTry: number;
  cS: PathSampler | null;
  motion: boolean;
}

const FieldIndex: React.FC = () => {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [query, setQuery] = React.useState('');
  const [kind, setKind] = React.useState<Kind>('ALL');
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const rigRef = React.useRef<Rig>({
    sc: { el: null, st: 0, prev: 0, vel: 0, max: 1 }, wt: { y: 0, v: 0 }, rot: 0, hrot: 0,
    rail: { sl: 0, prev: 0, vel: 0 }, hoists: [], swingers: [], boards: [], dropG: [],
    tvRow: null, tvS: null, tvW: 0, tvTop: 0, tvTry: 0, cS: null, motion: true,
  });
  const rowRefs = React.useRef(new Map<string, HTMLElement>());

  const q = query.trim().toLowerCase();
  const hits = INDEX_ROWS.filter((row) =>
    (kind === 'ALL' || row.kind === kind) &&
    (!q || `${row.title} ${row.sub} ${row.detail} ${row.tags.join(' ')}`.toLowerCase().includes(q)));
  const groups = GROUP_ORDER
    .map((label) => ({ label, rows: hits.filter((row) => row.kind === label) }))
    .filter((group) => group.rows.length > 0);
  const showHero = !q && kind === 'ALL';

  const cacheRig = React.useCallback(() => {
    const rig = rigRef.current;
    const root = rootRef.current;
    if (!root) return;
    const scroller = root.querySelector<HTMLElement>('[data-scroll]');
    if (scroller) {
      rig.sc.el = scroller;
      rig.sc.st = scroller.scrollTop;
      rig.sc.max = scroller.scrollHeight - scroller.clientHeight;
    }
    rig.hoists = scroller
      ? Array.from(scroller.querySelectorAll<HTMLElement>('[data-hoistrow]')).map((el, index) => ({
        el,
        car: el.querySelector<HTMLElement>('[data-car]') ?? el,
        track: el.querySelector<HTMLElement>('[data-track]'),
        trolley: el.querySelector<SVGElement>('[data-trolley]'),
        y: 12, v: 0, x: 62, xv: 0, dir: index % 2 === 0 ? 1 : -1,
      }))
      : [];
    rig.swingers = scroller
      ? Array.from(scroller.querySelectorAll<HTMLElement>('[data-swing]')).map((el) => ({ el, a: 0, v: 100 }))
      : [];
  }, []);

  const layoutTraverse = React.useCallback(() => {
    const rig = rigRef.current;
    const root = rootRef.current;
    const svg = root?.querySelector<SVGSVGElement>('[data-tvline]');
    const row = root?.querySelector<HTMLElement>('[data-tvscroll]');
    if (!svg || !row) { rig.boards = []; rig.tvRow = null; rig.tvS = null; return; }
    const W = svg.clientWidth;
    if (!W) { rig.boards = []; return; }
    const ink = 'color-mix(in srgb, #1d1f20 38%, transparent)';
    const mx = W * 0.44;
    const sheave = (x: number, y: number, r: number, tag: string) =>
      `<g ${tag} transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><circle r="${r}" fill="none" stroke="#416180" stroke-width="1.1"></circle><g data-spokes><path d="M-${r} 0H${r}M0 -${r}V${r}" stroke="#416180" stroke-width="0.85"></path></g><circle r="1.3" fill="#416180"></circle></g>`;
    svg.innerHTML = `
      <path d="M4 4 H${(W - 4).toFixed(1)}" stroke="${ink}" stroke-width="1" fill="none"></path>
      <path d="M12 4 V10 M${mx.toFixed(1)} 4 V21 M${(W - 12).toFixed(1)} 4 V7" stroke="${ink}" stroke-width="1" fill="none"></path>
      <path data-tvcable d="${routePath([[12, 16], [mx, 28], [W - 12, 13]], 7)}" stroke="#5980a6" stroke-width="1.2" fill="none"></path>
      ${sheave(12, 16, 6, 'data-tvs1')}${sheave(mx, 28, 7, 'data-tvs2')}${sheave(W - 12, 13, 6, 'data-tvs3')}
      <g>${Array.from({ length: 8 }, (_, i) => `<g data-drop-i="${i}" style="display:none"><path d="" stroke="#5980a6" stroke-width="1" fill="none"></path><g data-runner><rect x="-4.5" y="-3.5" width="9" height="7" fill="none" stroke="#416180" stroke-width="1"></rect><circle r="1.2" fill="#416180"></circle></g></g>`).join('')}</g>`;
    rig.tvW = W;
    rig.tvTop = 52 + 16;
    rig.tvRow = row;
    const cable = svg.querySelector<SVGPathElement>('[data-tvcable]');
    rig.tvS = cable ? pathSampler(cable) : null;
    rig.dropG = Array.from(svg.querySelectorAll('[data-drop-i]'));
    rig.boards = Array.from(row.querySelectorAll<HTMLElement>('[data-board]')).map((el) => ({ el, x: el.offsetLeft + el.offsetWidth / 2, a: 0, v: 0 }));
  }, []);

  const layoutCrane = React.useCallback(() => {
    const rig = rigRef.current;
    const svg = rootRef.current?.querySelector<SVGSVGElement>('[data-crane]');
    if (!svg) return;
    const H = svg.clientHeight || 500;
    const ink = 'color-mix(in srgb, #1d1f20 40%, transparent)';
    const defl = (x: number, y: number) =>
      `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><circle r="4.2" fill="none" stroke="#416180" stroke-width="1"></circle><circle r="1.1" fill="#416180"></circle></g>`;
    svg.innerHTML = `
      ${Array.from({ length: 11 }, (_, i) => { const y = 26 + ((H - 66) * i) / 10; return `<path d="M9 ${y.toFixed(1)} h8" stroke="${ink}" stroke-width="${i % 5 === 0 ? 1 : 0.6}"></path>`; }).join('')}
      <path data-cpath d="${routePath([[13, 15], [6, H * 0.34], [20, H * 0.63], [13, H - 14]], 2)}" stroke="${ink}" stroke-width="1.1" fill="none"></path>
      ${defl(6, H * 0.34)}${defl(20, H * 0.63)}
      <g data-csheave transform="translate(13,15)"><circle r="7.5" fill="none" stroke="#416180" stroke-width="1.2"></circle><g data-cspokes><path d="M-7.5 0H7.5M0 -7.5V7.5" stroke="#416180" stroke-width="0.9"></path></g><circle r="1.6" fill="#416180"></circle></g>
      <g data-cweight><rect x="-5.5" y="-2" width="11" height="20" fill="#5980a6" stroke="#2c455d" stroke-width="1"></rect><path d="M-5.5 3 L5.5 8 M-5.5 9 L5.5 14" stroke="#2c455d" stroke-width="0.7"></path></g>`;
    const path = svg.querySelector<SVGPathElement>('[data-cpath]');
    rig.cS = path ? pathSampler(path) : null;
  }, []);

  // Assistant / legacy-anchor bridge.
  React.useEffect(() => {
    const applyTarget = (kindNext: Kind, targetId?: string) => {
      setQuery('');
      setKind(kindNext);
      if (targetId) {
        const rowId = targetId.replace(/^project-/, 'project:').replace(/^experience-/, 'experience:');
        if (INDEX_ROWS.some((row) => row.id === rowId)) {
          setExpanded(rowId);
          window.requestAnimationFrame(() => rowRefs.current.get(rowId)?.scrollIntoView({ block: 'center' }));
          return;
        }
      }
      rigRef.current.sc.el?.scrollTo({ top: 0 });
    };
    const onOpenEvent = (event: Event) => {
      const detail = (event as CustomEvent<WorkbenchOpenDetail>).detail;
      if (!detail?.appId || detail.action === 'minimize') return;
      applyTarget(APP_TO_KIND[detail.appId] ?? 'ALL', detail.targetId);
    };
    const onHash = () => {
      const id = window.location.hash.slice(1);
      if (!id) return;
      if (id.startsWith('project-')) applyTarget('PROJECTS', id);
      else if (id.startsWith('experience-')) applyTarget('EXPERIENCE', id);
      else if (id === 'experience') applyTarget('EXPERIENCE');
      else if (id === 'work' || id === 'all-work') applyTarget('PROJECTS');
      else if (id === 'domains') applyTarget('METHODS');
      else if (id === 'proof') applyTarget('PROOF');
      else if (id === 'resumes' || id === 'contact') applyTarget('RESUMES');
      else applyTarget('ALL');
    };
    window.addEventListener(WORKBENCH_OPEN_EVENT, onOpenEvent);
    window.addEventListener('hashchange', onHash);
    if (window.location.hash) onHash();
    return () => {
      window.removeEventListener(WORKBENCH_OPEN_EVENT, onOpenEvent);
      window.removeEventListener('hashchange', onHash);
    };
  }, []);

  // Rig layout + physics loop.
  React.useEffect(() => {
    const rig = rigRef.current;
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotion = () => { rig.motion = !motionQuery.matches; };
    syncMotion();
    motionQuery.addEventListener('change', syncMotion);

    requestAnimationFrame(() => { layoutCrane(); layoutTraverse(); cacheRig(); });
    const onResize = () => { layoutCrane(); layoutTraverse(); cacheRig(); };
    window.addEventListener('resize', onResize);

    const onDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      const board = target?.closest?.('[data-board]') as HTMLElement | null;
      if (board) {
        const entry = rig.boards.find((item) => item.el === board);
        if (entry) {
          const rect = board.getBoundingClientRect();
          entry.v += (event.clientX - rect.left - rect.width / 2 > 0 ? -1 : 1) * 140;
        }
        return;
      }
      const swing = target?.closest?.('[data-swing]') as HTMLElement | null;
      if (swing) {
        const entry = rig.swingers.find((item) => item.el === swing);
        if (entry) entry.v += 100;
      }
    };
    rootRef.current?.addEventListener('pointerdown', onDown);

    const clock = window.setInterval(() => {
      const el = rootRef.current?.querySelector('[data-ficlock]');
      if (el) el.textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    }, 1000);

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const motion = rig.motion;
      const S = rig.sc;
      if (S.el && S.el.isConnected) {
        S.st = S.el.scrollTop;
        S.max = S.el.scrollHeight - S.el.clientHeight;
      }
      const dv = (S.st || 0) - (S.prev || 0);
      S.prev = S.st || 0;
      S.vel = (S.vel || 0) * 0.86 + dv * 0.14;
      const progress = S.max > 0 ? Math.min(1, Math.max(0, (S.st || 0) / S.max)) : 0;
      rig.rot += dv * 0.8;
      rootRef.current?.querySelector('[data-cspokes]')?.setAttribute('transform', `rotate(${(rig.rot % 360).toFixed(1)})`);
      if (motion) {
        const [ny, nv] = spring(rig.wt.y, rig.wt.v, progress, 64, 7, 1 / 60);
        rig.wt.y = ny; rig.wt.v = nv;
      } else {
        rig.wt.y = progress; rig.wt.v = 0;
      }
      const weight = rootRef.current?.querySelector('[data-cweight]');
      if (weight && rig.cS) {
        const t = Math.max(0, Math.min(1, rig.wt.y));
        const point = rig.cS.atLen(20 + t * Math.max(0, rig.cS.len - 44));
        weight.setAttribute('transform', `translate(${point.x.toFixed(1)},${point.y.toFixed(1)})`);
      }
      // Traverse: boards ride the routed cable, swinging off their spreaders.
      const rail = rig.rail;
      rig.tvTry += 1;
      if (rig.tvTry % 15 === 0) {
        const row = rootRef.current?.querySelector('[data-tvscroll]');
        if (row && (!rig.boards.length || !rig.tvS || !rig.tvRow?.isConnected || rig.boards[0]?.el?.isConnected === false)) layoutTraverse();
      }
      if (rig.tvRow?.isConnected) rail.sl = rig.tvRow.scrollLeft;
      const dh = (rail.sl || 0) - (rail.prev || 0);
      rail.prev = rail.sl || 0;
      rail.vel = (rail.vel || 0) * 0.82 + dh * 0.18;
      if (rig.boards.length && rig.tvS && rig.dropG.length) {
        const W = rig.tvW || 400;
        const top = rig.tvTop || 68;
        let nearest = 0;
        let nearestDist = Number.POSITIVE_INFINITY;
        rig.boards.forEach((board, index) => {
          const drop = rig.dropG[index] as HTMLElement | undefined;
          if (!drop) return;
          const cx = board.x - (rail.sl || 0);
          if (cx < -70 || cx > W + 70) {
            drop.style.display = 'none';
            board.el.style.transform = 'none';
            return;
          }
          drop.style.display = '';
          const sampler = rig.tvS as PathSampler;
          const cy = sampler.at(Math.max(2, Math.min(W - 2, cx))).y;
          const swingTarget = motion ? clamp(-(rail.vel * 1.5 + S.vel * 0.12), 8) : 0;
          if (motion) {
            const [na, nv] = spring(board.a, board.v, swingTarget, 54, 3.0, 1 / 60);
            board.a = clamp(na, 8.5); board.v = nv;
          } else {
            board.a = 0; board.v = 0;
          }
          const rad = (board.a * Math.PI) / 180;
          const co = Math.cos(rad);
          const si = Math.sin(rad);
          const rot = (x: number, y: number): [number, number] => [cx + (x - cx) * co - (y - cy) * si, cy + (x - cx) * si + (y - cy) * co];
          const [lx, ly] = rot(cx - 24, top);
          const [rx, ry] = rot(cx + 24, top);
          drop.firstElementChild?.setAttribute('d', `M${lx.toFixed(1)} ${ly.toFixed(1)} L${cx.toFixed(1)} ${cy.toFixed(1)} L${rx.toFixed(1)} ${ry.toFixed(1)}`);
          drop.querySelector('[data-runner]')?.setAttribute('transform', `translate(${cx.toFixed(1)},${cy.toFixed(1)}) rotate(${sampler.at(Math.max(2, Math.min(W - 2, cx))).ang.toFixed(1)})`);
          board.el.style.transformOrigin = `50% ${(cy - top).toFixed(1)}px`;
          board.el.style.transform = `rotate(${board.a.toFixed(2)}deg)`;
          const distance = Math.abs(cx - W / 2);
          if (distance < nearestDist) { nearestDist = distance; nearest = index; }
        });
        rig.hrot -= dh * 1.7;
        rootRef.current?.querySelector('[data-tvs3] [data-spokes]')?.setAttribute('transform', `rotate(${(rig.hrot % 360).toFixed(1)})`);
        rootRef.current?.querySelector('[data-tvs2] [data-spokes]')?.setAttribute('transform', `rotate(${((-rig.hrot * 0.8) % 360).toFixed(1)})`);
        const readout = rootRef.current?.querySelector('[data-tvro]');
        if (readout) readout.textContent = `CAR ${String(nearest + 1).padStart(2, '0')} / ${String(rig.boards.length).padStart(2, '0')}`;
      }
      // Registry rows slide onto their trolley tracks as they enter the viewport.
      if (S.el) {
        const viewBottom = S.el.getBoundingClientRect().bottom;
        for (const hoist of rig.hoists) {
          if (!hoist.el.isConnected) continue;
          const rect = hoist.el.getBoundingClientRect();
          const t = Math.min(1, Math.max(0, (viewBottom - rect.top) / 120));
          const ty = (1 - t) * 12;
          const tx = (1 - t) * 62 * hoist.dir;
          if (motion) {
            const [ny, nv] = spring(hoist.y, hoist.v, ty, 120, 12, 1 / 60);
            hoist.y = ny; hoist.v = nv;
            const [nx, nxv] = spring(hoist.x, hoist.xv, tx, 88, 12.5, 1 / 60);
            hoist.x = nx; hoist.xv = nxv;
          } else {
            hoist.y = ty; hoist.v = 0; hoist.x = tx; hoist.xv = 0;
          }
          // No opacity fade on the car: half-faded registry text fails WCAG
          // contrast; the trolley slide alone carries the entrance.
          hoist.car.style.transform = `translate(${hoist.x.toFixed(2)}px,${hoist.y.toFixed(2)}px)`;
          if (hoist.track) hoist.track.style.opacity = Math.max(0, Math.min(1, (1 - t) * 1.6)).toFixed(3);
          if (hoist.trolley) hoist.trolley.style.transform = `translateX(${(hoist.x + (hoist.dir === -1 ? 26 : 0)).toFixed(2)}px)`;
        }
      }
      for (const swinger of rig.swingers) {
        if (!swinger.el.isConnected) continue;
        const target = motion ? clamp(-S.vel * 0.45, 4) : 0;
        if (motion) {
          const [na, nv] = spring(swinger.a, swinger.v, target, 46, 3.0, 1 / 60);
          swinger.a = clamp(na, 6); swinger.v = nv;
        } else {
          swinger.a = 0; swinger.v = 0;
        }
        swinger.el.style.transformOrigin = '50% -15px';
        swinger.el.style.transform = `rotate(${swinger.a.toFixed(2)}deg)`;
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      motionQuery.removeEventListener('change', syncMotion);
      window.removeEventListener('resize', onResize);
      rootRef.current?.removeEventListener('pointerdown', onDown);
      window.clearInterval(clock);
    };
  }, [cacheRig, layoutCrane, layoutTraverse]);

  // Row set changes → recapture rig elements.
  React.useEffect(() => {
    const raf = requestAnimationFrame(cacheRig);
    return () => cancelAnimationFrame(raf);
  }, [cacheRig, query, kind, expanded]);

  return (
    <div className="fi-root" ref={rootRef}>
      <div className="fi-statusbar">
        <span data-ficlock>00:00</span>
        <span className="fi-statusbar-brand">RM · FIELD INDEX</span>
        <span className="fi-signal" aria-hidden="true"><i /><i /><i /><b /></span>
      </div>
      <div className="fi-searchbar">
        <div className="fi-searchbox">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <path d="M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM15.5 15.5 21 21" />
          </svg>
          <input
            className="input"
            type="search"
            value={query}
            placeholder="Search everything — try “CP-SAT”, “Singpass”, “BERT”…"
            aria-label="Search the field index"
            onChange={(event) => {
              setQuery(event.target.value);
              track('archive_search_changed', { query_length: event.target.value.length, result_count: hits.length });
            }}
          />
          <span className="fi-hits" role="status">{String(hits.length).padStart(2, '0')}/{INDEX_ROWS.length}</span>
        </div>
        <div className="fi-chips" role="group" aria-label="Filter the registry">
          {KINDS.map((item) => (
            <button
              key={item}
              type="button"
              data-active={item === kind || undefined}
              onClick={() => { setKind(item); track('project_filter_changed', { filter: item, result_count: hits.length }); }}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="fi-scroll" data-scroll tabIndex={0} role="region" aria-label="Field index registry">
        {showHero && (
          <div className="fi-hero">
            <span className="wb-kicker">W / ORIGIN — DOSSIER</span>
            <hr className="wb-rule" />
            <h1 className="wb-h1">Rahul Mitra</h1>
            <p className="wb-role">Systems Architect &amp; AI Engineer — ISE × CS × Math</p>
            <p className="wb-bio">
              One searchable registry — every project, role, credential, and résumé on this bench is reachable from
              the bar above. Swipe the priority line, scroll to work the crane.
            </p>
            <div className="wb-actions">
              <a className="btn btn-primary" href={generalResume.pdfUrl} target="_blank" rel="noreferrer" aria-label="Download résumé — General / Master CV (PDF)" onClick={() => track('resume_download_clicked', { role: generalResume.role, format: 'pdf' })}>Master CV</a>
              <a className="btn btn-secondary" href={`mailto:${CONTACT.email}`} onClick={() => track('contact_email_clicked', {})}>Email</a>
              <a className="btn btn-secondary" href={CONTACT.github} target="_blank" rel="noreferrer" onClick={() => track('social_link_clicked', { platform: 'github', location: 'hero' })}>GitHub</a>
            </div>
          </div>
        )}
        {showHero && (
          <div className="fi-traverse">
            <div className="fi-traverse-head">
              <span className="wb-kicker">H / TRAVERSE — PRIORITY LINE</span>
              <span data-tvro>CAR 01 / {String(featuredCards.length).padStart(2, '0')}</span>
            </div>
            <div className="fi-tvline"><svg data-tvline aria-hidden="true" /></div>
            <div className="fi-boards" data-tvscroll tabIndex={0} role="region" aria-label="Priority line">
              {featuredCards.map(({ no, project, outcome }) => (
                <div data-board className="fi-board" key={project.id}>
                  <article className="blueprint fi-boardcard">
                    <Corners />
                    <span className="fi-board-no">{no} · {project.category.split(' · ')[0].toUpperCase()}</span>
                    <h3>{project.title}</h3>
                    <p>{outcome}</p>
                    <span className="tag tag-accent">{project.tags[0]}</span>
                  </article>
                </div>
              ))}
            </div>
            <p className="fi-traverse-hint">SWIPE THE LINE — BOARDS RIDE IT · TAP ONE TO SET IT SWINGING</p>
          </div>
        )}
        {hits.length === 0 && (
          <div className="blueprint fi-empty">
            <Corners />
            <p>NO ENTRIES MATCH “{query}”</p>
            <button type="button" className="btn btn-secondary" onClick={() => { setQuery(''); setKind('ALL'); }}>Clear search &amp; filters</button>
          </div>
        )}
        {groups.map((group) => (
          <div className="fi-group" key={group.label}>
            <div className="fi-grouphead">
              <span>{group.label} REGISTRY</span>
              <span>{String(group.rows.length).padStart(2, '0')} ENTRIES</span>
            </div>
            <hr className="wb-rule" />
            {group.rows.map((row) => {
              const isOpen = expanded === row.id;
              return (
                <div data-hoistrow className="fi-rowrig" key={row.id} ref={(el) => { if (el) rowRefs.current.set(row.id, el); else rowRefs.current.delete(row.id); }}>
                  <div data-track className="fi-track" aria-hidden="true">
                    <svg data-trolley width="26" height="13" viewBox="0 0 26 13" fill="none">
                      <path d="M2 6.5h22M6 6.5V3h14v3.5" stroke="currentColor" strokeWidth="1" />
                      <circle cx="9.5" cy="9" r="2.3" stroke="currentColor" strokeWidth="1" />
                      <circle cx="16.5" cy="9" r="2.3" stroke="currentColor" strokeWidth="1" />
                    </svg>
                  </div>
                  <div data-car className="fi-car">
                    <button
                      type="button"
                      className="fi-row"
                      aria-expanded={isOpen}
                      data-open={isOpen || undefined}
                      onClick={() => setExpanded(isOpen ? null : row.id)}
                    >
                      <span className="fi-row-date">{row.date}</span>
                      <span className="fi-row-main">
                        <span className="fi-row-title">{row.title}</span>
                        <span className="fi-row-sub">{row.sub}</span>
                      </span>
                      <span className="fi-row-chev" aria-hidden="true">{isOpen ? '−' : '+'}</span>
                    </button>
                    {isOpen && (
                      <>
                        <svg aria-hidden="true" width="40" height="14" viewBox="0 0 40 14" className="fi-detail-spreader">
                          <path d="M4 14 20 4m16 10L20 4" stroke="currentColor" strokeWidth="1.1" fill="none" />
                          <circle cx="20" cy="2.8" r="2" stroke="currentColor" strokeWidth="1.1" fill="none" />
                        </svg>
                        <div data-swing className="blueprint fi-detail">
                          <Corners />
                          <p>{row.detail}</p>
                          <div className="wb-tags">
                            {row.tags.map((tag) => <span className="tag tag-accent" key={tag}>{tag}</span>)}
                          </div>
                          {row.link && (
                            <a
                              className="btn btn-secondary fi-detail-cta"
                              href={row.link.href}
                              target={row.link.href.startsWith('mailto:') ? undefined : '_blank'}
                              rel="noreferrer"
                              onClick={() => track('project_link_clicked', { title: row.title, destination: row.link?.href ?? '' })}
                            >
                              {row.link.label}
                            </a>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <p className="fi-footnote">FIELD INDEX · THE SAME REGISTRY POWERS THE DESKTOP WORKBENCH</p>
      </div>
      <svg data-crane className="fi-crane" aria-hidden="true" />
      <nav className="fi-tabbar" aria-label="Contact">
        <a href={`mailto:${CONTACT.email}`} onClick={() => track('contact_email_clicked', { location: 'footer' })}>EMAIL</a>
        <a href={CONTACT.linkedin} target="_blank" rel="noreferrer" onClick={() => track('social_link_clicked', { platform: 'linkedin', location: 'footer' })}>LINKEDIN</a>
        <a href={CONTACT.github} target="_blank" rel="noreferrer" onClick={() => track('social_link_clicked', { platform: 'github', location: 'footer' })}>GITHUB</a>
        <a className="fi-tab-primary" href={generalResume.pdfUrl} target="_blank" rel="noreferrer" aria-label="Download résumé — General / Master CV (PDF)" onClick={() => track('resume_download_clicked', { role: generalResume.role, format: 'pdf' })}>CV ↓</a>
      </nav>
    </div>
  );
};

export default FieldIndex;
