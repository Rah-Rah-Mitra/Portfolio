import React from 'react';
import { Kicker } from '../bits';
import { archiveRows, dispatchWorkbenchOpen } from '../../../lib/workbench';
import { ESTATE_CATALOGUE } from '../../../lib/estate/catalogue.generated';
import type { EstateSiteId } from '../../../lib/estate/ids';
import type { DesktopAppId } from '../../../types';

// The Estate window's side panel (plan §9.2): what the estate is, as text, with
// every value read from ESTATE_CATALOGUE (generated from the pack), the 14
// buildings as buttons, the key list the live stage points at
// (aria-describedby="estate-keys"), the spatial RECORD the old #world window
// carried, and the licence line. Prerendered in full, so the window reads the
// same with no WebGL, no JavaScript, or a consent not yet given.
//
// Nothing here touches window or document during render. No id starts with
// experience-, project- or selected-: the no-JS evidence counts in
// tests/e2e/quality.spec.ts match on those prefixes, and FieldWorkbench routes
// them to other windows.

type Site = (typeof ESTATE_CATALOGUE.sites)[number];

/**
 * lib/estate/ids.ts ESTATE_NAME, restated: ids.ts builds the storey tables when
 * imported, and the main bundle only needs the name. tests/estate-window.dom.test.tsx
 * pins the two equal.
 */
export const ESTATE_DISPLAY_NAME = 'Sample Town N5';

/** '1206' → '1,206', identically on the server and in every browser (no locale lookup). */
export const groupThousands = (value: number): string => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const KIND_LABEL: Record<Site['kind'], string> = { block: 'Block', mscp: 'Car park', nc: 'Hawker hall' };

/** One registry row's second line: 'Block · SL · L1–L16 + RF · 49.0 m' (the storey range comes written: scripts/estate/lib/manifest.mjs storeyRange). */
export const siteMeta = (site: Site): string =>
  [KIND_LABEL[site.kind], site.typology, site.levels, `${site.heightM.toFixed(1)} m`]
    .filter((part): part is string => Boolean(part)).join(' · ');

const blocks = ESTATE_CATALOGUE.sites.filter((site) => site.kind === 'block').length;

/** FIG. 07's caption, from the catalogue. The 400 × 400 m extent is the masterplan's; the catalogue does not carry it. */
export const ESTATE_FIGCAPTION = `FIG. 07 — ${ESTATE_DISPLAY_NAME.toUpperCase()} · 400 × 400 M · ${blocks} BLOCKS · ${
  ESTATE_CATALOGUE.sites.filter((site) => site.kind !== 'block').map((site) => site.id.replace('_', ' ')).join(' · ')}`;

/** Plan §9.2, pinned; the counts come from the catalogue. */
export const ESTATE_DESCRIPTION = `A generated Singapore HDB neighbourhood, about 400 × 400 m, built as federated IFC4X3 by Rahul’s Bonsai-Estate pipeline with IfcOpenShell, Bonsai and Blender: ${blocks} residential blocks with ${groupThousands(ESTATE_CATALOGUE.flats)} flats, a multi-storey car park and a hawker centre. A sample estate, not a real town and not HDB’s own plans.`;

/** The licence line: model data is CC BY 4.0, not the repository's MIT (public/estate/LICENSE.txt). */
export const ESTATE_LICENCE_URL = '/estate/LICENSE.txt';

/**
 * lib/estate/schema.ts ESTATE_REPO, restated: schema.ts validates the palette
 * when imported, which would put the palette into the main bundle for one
 * string. tests/estate-window.dom.test.tsx pins the two equal.
 */
export const ESTATE_REPO_URL = 'https://github.com/Rah-Rah-Mitra/Bonsai-Estate';

// The archive's 3D / Vision domain, so a new spatial project lists itself here.
const spatialBuilds = archiveRows.filter((row) => row.domain === '3D / Vision');

// Real in-page hrefs keep the targets addressable in the prerendered DOM; with
// JS this opens the target window, even when the hash is already current.
const openFromLink = (event: React.MouseEvent, appId: DesktopAppId, targetId: string) => {
  event.preventDefault();
  dispatchWorkbenchOpen({ appId, targetId });
};

/**
 * The stage's keys (lib/estate/input.ts, plan §8.2 with the pan and look
 * additions) for what this build does: Overview, Plan, Walk and Fly. The full list;
 * the live stage's own description is the HUD's short summary
 * (#estate-keys-desc), because a closed <details> is outside the accessibility
 * tree.
 */
export const ESTATE_KEYS: ReadonlyArray<readonly [string, string]> = [
  ['Drag', 'Orbit; in Walk and Fly, look around'],
  ['Right-drag, Shift-drag', 'Pan; in Walk and Fly, strafe'],
  ['Wheel', 'Zoom towards the pointer; in Walk, half-metre steps; in Fly, speed'],
  ['W S, ↑ ↓', 'Tilt; in Walk and Fly, forward and back; in Plan, the rooms'],
  ['A D', 'Pan sideways; in Walk and Fly, strafe'],
  ['Shift + arrows', 'In Overview, pan'],
  ['← →', 'Rotate; in Walk and Fly, turn'],
  ['PgUp PgDn', 'In Walk, the stairs or the lift, up and down; in Plan, storeys'],
  ['[ ]', 'In Plan, the cut down and up'],
  ['R F', 'In Fly, look up and down'],
  ['Space E, C Q', 'In Fly, up and down'],
  ['Shift', 'In Walk and Fly, faster'],
  ['1, 2, 3', 'Overview, Walk, Fly'],
  ['Enter', 'Fly to the selected building, then walk in; in Plan, into the room; in Walk, take the lift or stair offered'],
  ['Home', 'Back to the aerial view; in Walk, to the start'],
  ['L', 'In Walk and Fly, capture the mouse'],
  ['I', 'Say where the camera is'],
  ['Esc', 'One step back (the lift panel, a climb, Walk, Fly or Plan, the selection); then minimises the window'],
];

/** What the action slot under the description offers: consent's Load, Retry or Reload. */
export interface EstateActionButton {
  label: string;
  primary: boolean;
  onClick: () => void;
}

export interface EstateRegistryProps {
  /** One line on the viewer's state (loading, the hold reason, a failure); '' for none. A polite live region. */
  stateText: string;
  action: EstateActionButton | null;
  /** The highlighted building: the engine's selection when live, the last row pressed otherwise. */
  selected: EstateSiteId | null;
  /** Rows fly the camera (live, with fly-to in this build): their names say so to a screen reader. */
  rowsFly: boolean;
  /** The HUD's Enter or Exit, mirrored beside one row (live only), or null. */
  rowAction?: { site: EstateSiteId; kind: 'enter' | 'exit'; label: string; onClick: () => void } | null;
  /** A row was pressed. */
  onSite: (site: EstateSiteId) => void;
  /** Beside the action, in the status line: "Load the 3D estate to fly there", or null. */
  notice: string | null;
  /** Above BUILDINGS: Plan's room list while in Plan (the window's side slot, P6). */
  extra?: React.ReactNode;
}

export const EstateRegistry: React.FC<EstateRegistryProps> = ({ stateText, action, selected, rowsFly, rowAction, onSite, notice, extra }) => (
  <>
    <Kicker>{ESTATE_DISPLAY_NAME.toUpperCase()} — GENERATED HDB ESTATE</Kicker>
    <h3 className="wb-estate-title">{ESTATE_DISPLAY_NAME}</h3>
    <dl className="wb-estate-facts">
      <div><dt>Buildings</dt><dd>{ESTATE_CATALOGUE.sites.length}</dd></div>
      <div><dt>Flats</dt><dd>{groupThousands(ESTATE_CATALOGUE.flats)}</dd></div>
      <div><dt>Storeys</dt><dd>{ESTATE_CATALOGUE.storeys}</dd></div>
    </dl>
    <p className="wb-estate-desc">{ESTATE_DESCRIPTION}</p>
    <div className="wb-estate-action">
      {/* The notice answers a row press made before the viewer is live: next to
          the Load button it asks for, and spoken, not under fourteen rows. */}
      <p className="wb-estate-state" role="status" aria-live="polite">
        {notice && <span className="wb-estate-notice">{notice}</span>}
        {notice && stateText ? ' ' : null}
        {stateText}
      </p>
      {action && (
        <button type="button" className={`btn ${action.primary ? 'btn-primary' : 'btn-secondary'}`} onClick={action.onClick} data-estate-action>
          {action.label}
        </button>
      )}
    </div>
    {extra}
    <p className="wb-estate-head">BUILDINGS</p>
    <ul className="wb-estate-sites" aria-label={`${ESTATE_DISPLAY_NAME} buildings`}>
      {ESTATE_CATALOGUE.sites.map((site) => (
        <li key={site.id}>
          <button
            type="button"
            className="wb-estate-site"
            data-estate-site={site.id}
            aria-pressed={selected === site.id}
            onClick={() => onSite(site.id)}
          >
            <span className="wb-estate-site-name">{rowsFly && <span className="sr-only">Fly to </span>}{site.name}</span>
            <span className="wb-estate-site-meta">{siteMeta(site)}</span>
          </button>
          {rowAction?.site === site.id && (
            <button type="button" className="btn btn-secondary wb-estate-site-act" data-estate-row-action={rowAction.kind} onClick={rowAction.onClick}>{rowAction.label}</button>
          )}
        </li>
      ))}
    </ul>
    <details className="wb-estate-keys">

      <summary>Keys</summary>
      <dl id="estate-keys" className="wb-estate-keylist">
        {ESTATE_KEYS.map(([keys, what]) => <React.Fragment key={keys}><dt>{keys}</dt><dd>{what}</dd></React.Fragment>)}
      </dl>
    </details>
    <p className="wb-estate-record">
      RECORD — the spatial work behind it: top student of 24 in NUS CS4277 3D Computer Vision. BUILDS —{' '}
      {spatialBuilds.map((row, index) => (
        <React.Fragment key={row.id}>
          {index > 0 && ' · '}
          {/* A fork stays labelled as one: "kalidokit" alone under BUILDS reads as Rahul's library. */}
          <a href={`#project-${row.id}`} onClick={(event) => openFromLink(event, 'project-archive', `project-${row.id}`)}>{row.title}{/\bfork\b/i.test(row.category) ? ' (fork)' : ''}</a>
        </React.Fragment>
      ))}
      . The working camera models are in the{' '}
      <a href="#technical-lab" onClick={(event) => openFromLink(event, 'camera-lab', 'technical-lab')}>Camera Lab</a>.
      The estate’s pipeline is{' '}
      <a href={ESTATE_REPO_URL} target="_blank" rel="noreferrer">Bonsai-Estate on GitHub<span className="sr-only"> (opens in a new tab)</span></a>.
    </p>
    <p className="wb-estate-credit" data-estate-credit>
      Model data © Rahul Mitra · <a href={ESTATE_LICENCE_URL}>CC BY 4.0</a> · Bonsai-Estate {ESTATE_CATALOGUE.edition}
    </p>
  </>
);
