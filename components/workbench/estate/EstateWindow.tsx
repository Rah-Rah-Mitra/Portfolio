import React from 'react';
import { Corners } from '../bits';
import { ESTATE_CATALOGUE } from '../../../lib/estate/catalogue.generated';
import type { EstateSiteId } from '../../../lib/estate/ids';
import { ESTATE_DISPLAY_NAME, ESTATE_FIGCAPTION, EstateRegistry } from './EstateRegistry';
import type { EstateControllerProps, EstateModel, EstateModelHandlers } from './estateModel';

// The Estate window (WIN-07, #world, FIG. 07): Sample Town N5, the generated
// HDB estate. This file is in the main bundle and prerendered; it is the view
// and a small bootstrap, nothing more (estateModel.ts explains the split):
//  - the view draws an EstateModel: the poster (a lazy duotone picture from the
//    catalogue), FIG. 07's caption, a state plate, the side panel
//    (EstateRegistry) and, once there is one, the engine's HUD. No canvas is
//    ever rendered here: the engine appends its own to the stage;
//  - until the controller arrives the model is POSTER_MODEL, the prerender's;
//  - the bootstrap imports the controller (estate/EstateController.tsx, a lazy
//    chunk) the first time the window is open, or when a focus request or a
//    row press comes first, holding the latest such request for it.
// The render touches no window, document or devicePixelRatio. The stage is
// found by DOM scan ('[data-estate-stage]'), never by ref, and no Hoist wraps
// it: the hoist nudge must never swing the viewer.

/** The prerender's model, and the view's until the controller reports. */
export const POSTER_MODEL: EstateModel = Object.freeze({
  phase: 'poster',
  stateText: '',
  action: null,
  selected: null,
  notice: null,
  plate: null,
  progress: null,
  interactive: false,
  focusable: false,
  rowsFly: false,
  focus: null,
  hud: null,
});

/**
 * lib/estate/events.ts ESTATE_FOCUS_EVENT, restated: events.ts validates
 * against the storey tables in ids.ts, which the controller chunk carries and
 * this bundle need not. tests/estate-window.dom.test.tsx pins the two equal.
 */
export const ESTATE_FOCUS_EVENT_NAME = 'portfolio:estate-focus';

const CONTROLLER_FAILED = 'The 3D estate did not finish downloading.';

// Shallow: the controller keeps action, focus and hud the same objects while
// they are unchanged, so a field-by-field identity check is exact.
const sameModel = (a: EstateModel, b: EstateModel) =>
  (Object.keys(a) as Array<keyof EstateModel>).every((key) => a[key] === b[key]);

// The stage is a keyboard viewport only while there is one to drive (§8.7).
const VIEWPORT = {
  role: 'application',
  tabIndex: 0,
  'aria-roledescription': '3D estate viewer',
  'aria-label': `${ESTATE_DISPLAY_NAME} viewport`,
  'aria-describedby': 'estate-keys',
} as const;

/** The window body: what the prerender shows, and what the controller drives. */
export const EstateView: React.FC<{
  model: EstateModel;
  rootRef?: React.Ref<HTMLDivElement>;
  onSite: (site: EstateSiteId) => void;
  onAction: () => void;
}> = ({ model, rootRef, onSite, onAction }) => {
  const { poster } = ESTATE_CATALOGUE;
  const { hud } = model;
  return (
    <div id="world" className="wb-estate" data-estate-phase={model.phase} ref={rootRef}>
      <figure
        className="wb-estate-stage blueprint wb-figure"
        data-estate-stage
        tabIndex={model.focusable ? -1 : undefined}
        {...(model.interactive ? VIEWPORT : null)}
      >
        <Corners />
        <picture className="wb-estate-poster duotone">
          <source type="image/webp" srcSet={poster.srcSet} sizes="(min-width: 1600px) 1200px, 760px" />
          <img src={poster.src} width={poster.w} height={poster.h} alt={poster.alt} loading="lazy" decoding="async" />
        </picture>
        <figcaption>{ESTATE_FIGCAPTION}</figcaption>
        {model.plate && (
          <p className="wb-estate-plate" aria-hidden="true">
            {model.plate}
            {model.phase === 'loading' && (
              <span className="wb-estate-progress"><span style={{ width: `${Math.round((model.progress ?? 0) * 100)}%` }} /></span>
            )}
          </p>
        )}
        {hud && <hud.Hud {...hud.props} />}
      </figure>
      <aside className="wb-estate-side" aria-label={`${ESTATE_DISPLAY_NAME} registry`}>
        <EstateRegistry
          stateText={model.stateText}
          action={model.action ? { ...model.action, onClick: onAction } : null}
          selected={model.selected}
          rowsFly={model.rowsFly}
          onSite={onSite}
          notice={model.notice}
        />
      </aside>
    </div>
  );
};

export const EstateWindow: React.FC = () => {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [model, setModel] = React.useState<EstateModel>(POSTER_MODEL);
  const [Controller, setController] = React.useState<React.ComponentType<EstateControllerProps> | null>(null);
  const handlersRef = React.useRef<EstateModelHandlers | null>(null);
  const pendingRef = React.useRef<unknown>(null);
  const mountedRef = React.useRef(false);
  const importingRef = React.useRef(false);

  const onModel = React.useCallback((next: EstateModel, handlers: EstateModelHandlers) => {
    handlersRef.current = handlers;
    setModel((prev) => (sameModel(prev, next) ? prev : next));
  }, []);
  const takePending = React.useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    return pending;
  }, []);

  const loadController = React.useCallback(() => {
    if (importingRef.current || !mountedRef.current) return;
    importingRef.current = true;
    import('./EstateController').then((module) => {
      if (mountedRef.current) setController(() => module.EstateController);
    }, (error: unknown) => {
      importingRef.current = false;
      console.warn('[estate]', error);
      if (mountedRef.current) setModel((prev) => ({ ...prev, phase: 'error', stateText: CONTROLLER_FAILED, action: { label: 'Retry', primary: false } }));
    });
  }, []);

  // Wake the controller the first time the window is open (FieldWorkbench
  // opens it by its section's inline display), or on a focus request.
  React.useEffect(() => {
    mountedRef.current = true;
    const section = rootRef.current?.closest<HTMLElement>('section[data-win="world-3d"]') ?? null;
    const open = () => section === null || section.style.display !== 'none';
    const observer = new MutationObserver(() => {
      if (!open()) return;
      observer.disconnect();
      loadController();
    });
    if (open()) loadController();
    else if (section) observer.observe(section, { attributes: true, attributeFilter: ['style'] });
    const onFocusRequest = (event: Event) => {
      if (handlersRef.current) return; // the controller listens for itself
      pendingRef.current = (event as CustomEvent<unknown>).detail;
      loadController();
    };
    window.addEventListener(ESTATE_FOCUS_EVENT_NAME, onFocusRequest);
    return () => {
      mountedRef.current = false;
      observer.disconnect();
      window.removeEventListener(ESTATE_FOCUS_EVENT_NAME, onFocusRequest);
    };
  }, [loadController]);

  // The controller asks; the view moves focus once its DOM is committed, and
  // only when focus is free (on the body, or already inside this window).
  const focusSeq = model.focus?.seq;
  React.useEffect(() => {
    const request = model.focus;
    const root = rootRef.current;
    if (!request || !root) return;
    const active = document.activeElement;
    if (active !== null && active !== document.body && !root.contains(active)) return;
    const target = root.querySelector<HTMLElement>(request.target === 'stage' ? '[data-estate-stage]' : '[data-estate-action]');
    target?.focus({ preventScroll: true });
    // Keyed on the request's sequence number only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSeq]);

  const onSite = React.useCallback((site: EstateSiteId) => {
    if (handlersRef.current) {
      handlersRef.current.onSite(site);
      return;
    }
    // Before the controller: highlight it, and hand it over as a request.
    pendingRef.current = { site };
    setModel((prev) => ({ ...prev, selected: site }));
    loadController();
  }, [loadController]);

  const onAction = React.useCallback(() => {
    if (handlersRef.current) handlersRef.current.onAction();
    else loadController();
  }, [loadController]);

  return (
    <>
      <EstateView model={model} rootRef={rootRef} onSite={onSite} onAction={onAction} />
      {Controller && <Controller rootRef={rootRef} onModel={onModel} takePending={takePending} />}
    </>
  );
};

export default EstateWindow;
