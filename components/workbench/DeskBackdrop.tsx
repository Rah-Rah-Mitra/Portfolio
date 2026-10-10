import React, { Suspense, useContext, useEffect, useState } from 'react';
import { EffectsContext } from '../../contexts/PhysicsContext';

// The desk backdrops behind the desktop workbench (the Estate drawing set, an
// N-body field, fluid smoke).
// This file ships in the main bundle, so it is only the gate: the layer itself
// (DeskBackdropLayer: policy, caption, the engines' lazy chunks) is a lazy
// chunk, loaded once a backdrop is on. When all are off — the pinned boot
// state — and throughout SSR, this renders nothing at all.
//
// `live` is set in an effect, so the lazy element never reaches renderToString
// or hydration, and only on the desktop surface: a phone drops the workbench
// right after hydration (App.tsx) and never needs the layer's chunk.

const DeskBackdropLayer = React.lazy(() => import('./DeskBackdropLayer'));

// An FX layer must never take the page down with it: a failure here (no
// worker, a driver bug, a chunk that will not load) drops the backdrop and
// leaves the workbench running. All toggles off unmounts the boundary, so
// switching one back on retries.
class BackdropBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.warn('[backdrop]', error); }
  render() { return this.state.failed ? null : this.props.children; }
}

export const DeskBackdrop: React.FC = () => {
  // Read the context directly rather than through useEffects(): the workbench
  // is also mounted bare (tests/workbench-deeplink), and with no FX provider
  // there is nothing to draw.
  const settings = useContext(EffectsContext)?.settings;
  const [live, setLive] = useState(false);
  useEffect(() => { if (window.innerWidth > 880) setLive(true); }, []);
  if (!live || !settings || !(settings.nbody.enabled || settings.fluid.enabled || settings.drawing?.enabled)) return null;
  return (
    <BackdropBoundary>
      <Suspense fallback={null}><DeskBackdropLayer settings={settings} /></Suspense>
    </BackdropBoundary>
  );
};

export default DeskBackdrop;
