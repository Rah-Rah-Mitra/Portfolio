import React from 'react';
import { EffectsProvider } from './contexts/PhysicsContext';
import EffectsLabPanel from './components/EffectsLabPanel';
import AskThePage from './components/AskThePage';
import AudioSpriteController from './components/AudioSpriteController';
import { ExperienceModeProvider } from './contexts/ExperienceModeContext';
import FieldWorkbench from './components/workbench/FieldWorkbench';
import FieldIndex from './components/workbench/FieldIndex';
import { track } from './lib/analytics';

export const OptionalExperienceLayers: React.FC = () => {
  return (
    <>
      <EffectsLabPanel />
      <AskThePage />
      <AudioSpriteController />
    </>
  );
};

// SSR renders both surfaces (CSS media queries hide the inactive one); after
// hydration we collapse to the active surface so only one tree stays live.
const useActiveSurface = () => {
  const [surface, setSurface] = React.useState<'both' | 'desktop' | 'mobile'>('both');
  React.useEffect(() => {
    const query = window.matchMedia('(max-width: 880px)');
    const apply = () => setSurface(query.matches ? 'mobile' : 'desktop');
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);
  return surface;
};

const AppContent: React.FC = () => {
  const surface = useActiveSurface();
  React.useEffect(() => {
    track('portfolio_viewed', { surface: 'field_workbench' });
  }, []);
  return (
    <EffectsProvider>
      <div className="site-shell">
        {surface !== 'mobile' && <FieldWorkbench />}
        {surface !== 'desktop' && <FieldIndex />}
        <OptionalExperienceLayers />
      </div>
    </EffectsProvider>
  );
};

const App: React.FC = () => {
  return <ExperienceModeProvider><AppContent /></ExperienceModeProvider>;
};

export default App;
