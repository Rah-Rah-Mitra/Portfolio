import type { ComponentType, RefObject } from 'react';
import type { EstateSiteId } from '../../../lib/estate/ids';
import type { EstatePhase } from '../../../lib/estate/policy';
import type { EstateHudProps } from './engineApi';

// What the Estate window's view draws, and what its controller decides. TYPES
// ONLY, so both sides import it for free.
//
// The split exists for the main bundle's cap (scripts/check-bundle.mjs, plan
// §7.1: the shell may add at most 12,000 B). The view — poster, caption, side
// panel, registry, key list — must be prerendered, so it and the catalogue it
// reads are in the main bundle (EstateWindow.tsx, EstateRegistry.tsx). The
// controller — load policy, presence observers, the engine's lifecycle, Esc
// layers, focus requests, failure handling — decides nothing until the window
// first opens, so it is a small lazy chunk (EstateController.tsx) the window
// imports then. It renders nothing: it reports an EstateModel up, and the view
// draws it. Until it arrives the view shows POSTER_MODEL, which is also what
// the prerender shows.

/** The side panel's button: consent's Load (labelled with its bytes), Retry or Reload. */
export interface EstateModelAction {
  readonly label: string;
  readonly primary: boolean;
}

/**
 * The registry's Enter or Exit beside one row (the HUD's, mirrored, §8.6):
 * 'Enter Blk 509 · 0.2 MB' on the selected row, or 'Exit Blk 509' on the row of
 * the building Walk stands in. Live only, with Enter in the build.
 */
export interface EstateModelRowAction {
  readonly site: EstateSiteId;
  readonly kind: 'enter' | 'exit';
  readonly label: string;
}

/** The HUD the lazy runtime supplies, and its props: drawn as the stage's last child. */
export interface EstateModelHud {
  readonly Hud: ComponentType<EstateHudProps>;
  readonly props: EstateHudProps;
}

export interface EstateModel {
  readonly phase: EstatePhase;
  /** One line on the viewer's state for the side panel's polite live region; '' for none. */
  readonly stateText: string;
  readonly action: EstateModelAction | null;
  /** The highlighted building row. */
  readonly selected: EstateSiteId | null;
  /** Under the rows ("Load the 3D estate to fly there"), or null. */
  readonly notice: string | null;
  /** The opaque plate over the stage (loading, a failure), or null. Visual only: stateText says it. */
  readonly plate: string | null;
  /** First-frame download progress, 0–1, while loading; null when unknown. */
  readonly progress: number | null;
  /** live or frozen: the stage is a keyboard viewport (role application, tabIndex 0). */
  readonly interactive: boolean;
  /** A click-initiated load is warming up: the stage takes focus (tabIndex −1) when the Load button goes. */
  readonly focusable: boolean;
  /** Rows fly the camera: their names say so to a screen reader. */
  readonly rowsFly: boolean;
  /** Enter or Exit beside one row, or null. Kept the same object while unchanged. */
  readonly rowAction: EstateModelRowAction | null;
  /**
   * Move DOM focus to the stage or the action button once the view has
   * committed this model: a new `seq` is a new request. Only when focus is free
   * (on the body or inside the window). Never for an automatic load or a focus
   * request (§8.3).
   */
  readonly focus: { readonly target: 'stage' | 'action'; readonly seq: number } | null;
  readonly hud: EstateModelHud | null;
  /**
   * The side panel's slot above BUILDINGS (P6): Plan's room list, from the lazy
   * runtime, with the HUD's props; it draws nothing outside Plan. Null before
   * there is an engine, and while the HUD is not drawn.
   */
  readonly side: EstateModelHud | null;
}

/** The view's two controls. Stable for the controller's life. */
export interface EstateModelHandlers {
  onSite: (site: EstateSiteId) => void;
  onAction: () => void;
  /** The row action (model.rowAction) was pressed. */
  onRowAction: () => void;
}

/** What EstateWindow hands its controller. */
export interface EstateControllerProps {
  /** div#world: the controller finds the stage and the section from it by DOM scan. */
  rootRef: RefObject<HTMLDivElement | null>;
  /** Report the model whenever it changes, with the handlers the view calls. */
  onModel: (model: EstateModel, handlers: EstateModelHandlers) => void;
  /**
   * A focus request's raw detail, or a row press ({ site }), that arrived
   * before the controller did: the window holds the latest and hands it over
   * once, at mount, unvalidated (lib/estate/events.ts validates it there).
   */
  takePending: () => unknown;
}

/** The estate/EstateController.tsx module, as the window imports it. */
export interface EstateControllerModule {
  EstateController: ComponentType<EstateControllerProps>;
}
