import React from 'react';
import { EffectsProvider } from './contexts/PhysicsContext';
import EffectsLabPanel from './components/EffectsLabPanel';
import FluidBackground from './components/FluidBackground';
import AskThePage from './components/AskThePage';
import { useScrollDepth } from './hooks/useScrollDepth';
import { track } from './lib/analytics';
import PortfolioExperience from './components/PortfolioExperience';
import { ExperienceModeProvider, useExperienceMode } from './contexts/ExperienceModeContext';

export const OptionalExperienceLayers: React.FC = () => {
  return (
    <>
      <EffectsLabPanel />
      <AskThePage />
    </>
  );
};

const AppContent: React.FC = () => {
  const { policy } = useExperienceMode();
  useScrollDepth();
  React.useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!motionQuery.matches && !policy.lowMotion) document.documentElement.classList.add('motion-ready');
    return () => document.documentElement.classList.remove('motion-ready');
  }, [policy.lowMotion]);
  React.useEffect(() => {
    track('portfolio_viewed', { surface: 'continuous_field_test' });
  }, []);
  React.useEffect(() => {
    const timers = new Set<number>();
    const alignToHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'auto' });
    };
    const scheduleAlignment = () => {
      if (!window.location.hash) return;
      document.documentElement.classList.add('hash-target-visible');
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
      [0, 80, 180, 320, 500, 720, 960].forEach((delay) => {
        const timer = window.setTimeout(() => {
          alignToHash();
          timers.delete(timer);
        }, delay);
        timers.add(timer);
      });
    };
    scheduleAlignment();
    window.addEventListener('hashchange', scheduleAlignment);
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener('hashchange', scheduleAlignment);
    };
  }, []);
  return (
    <EffectsProvider>
      <div className="site-shell min-h-screen" data-experience-mode={policy.mode} data-motion={policy.lowMotion ? 'low' : 'full'}>
        {policy.allowHeavyAssets && <FluidBackground />}
        <PortfolioExperience />
        <OptionalExperienceLayers />
      </div>
    </EffectsProvider>
  );
}


const App: React.FC = () => {
  return <ExperienceModeProvider><AppContent /></ExperienceModeProvider>;
};

export default App;
