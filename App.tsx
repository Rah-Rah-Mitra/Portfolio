import React from 'react';
import Navbar from './components/Navbar';
import HeroSection from './components/HeroSection';
import SkillsSection from './components/SkillsSection';
import Footer from './components/Footer';
import { SECTION_IDS } from './constants';
import { EffectsProvider, useEffects } from './contexts/PhysicsContext';
import EffectsLabPanel from './components/EffectsLabPanel';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { coreCompetencies, cybersecurityData, fieldNotes, projectArchive, projectHighlights, resumeProfiles, softwareEngineerData } from './portfolioData';
import FluidBackground from './components/FluidBackground';
import ProjectsSection from './components/ProjectsSection';
import AchievementsSection from './components/AchievementsSection';
import EventsTimeline from './components/EventsTimeline';
import AskThePage from './components/AskThePage';
import ResumesSection from './components/ResumesSection';
import ToolsSection from './components/ToolsSection';
import { useScrollDepth } from './hooks/useScrollDepth';
import JourneyNavigator from './components/JourneyNavigator';

const PortfolioWorld = React.lazy(() => import('./components/PortfolioWorld'));

const OptionalExperienceLayers: React.FC = () => {
  const { worldOpen } = useEffects();
  return (
    <>
      <EffectsLabPanel />
      <AskThePage />
      {worldOpen && (
        <React.Suspense fallback={<div className="world-loading" role="status">Preparing the spatial portfolio map...</div>}>
          <PortfolioWorld />
        </React.Suspense>
      )}
    </>
  );
};

const AppContent: React.FC = () => {
  const { theme } = useTheme();
  const portfolioData = theme === 'light' ? softwareEngineerData : cybersecurityData;
  useScrollDepth(theme);
  React.useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!motionQuery.matches) document.documentElement.classList.add('motion-ready');
    return () => document.documentElement.classList.remove('motion-ready');
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
  const allAchievements = theme === 'light'
    ? [...softwareEngineerData.achievements, ...cybersecurityData.achievements]
    : [...cybersecurityData.achievements, ...softwareEngineerData.achievements];

  return (
    <EffectsProvider theme={theme}>
      <div className="site-shell min-h-screen flex flex-col" data-lens={theme === 'light' ? 'build' : 'secure'}>
        <FluidBackground />
        <Navbar name={portfolioData.name} />
        <JourneyNavigator />
        <main id="main-content" className="flex-grow relative z-10">
          <HeroSection id={SECTION_IDS.HOME} data={portfolioData} />
          <ProjectsSection id={SECTION_IDS.PROJECTS} projects={projectHighlights} archiveProjects={projectArchive} />
          <SkillsSection id={SECTION_IDS.DOMAINS} clusters={coreCompetencies} />
          <EventsTimeline id={SECTION_IDS.EXPERIENCE} notes={fieldNotes} projects={projectHighlights} archiveProjects={projectArchive} />
          <AchievementsSection id={SECTION_IDS.ACHIEVEMENTS} achievements={allAchievements} />
          <ResumesSection id={SECTION_IDS.RESUMES} resumes={resumeProfiles} />
          <ToolsSection id={SECTION_IDS.TOOLS} />
        </main>
        <div className="relative z-10">
          <Footer
            id={SECTION_IDS.CONTACT}
            name={portfolioData.name}
            email={portfolioData.contactEmail}
            linkedinUrl={portfolioData.linkedinUrl}
            githubUrl={portfolioData.githubUrl}
            instagramUrl={portfolioData.instagramUrl}
          />
        </div>
        <OptionalExperienceLayers />
      </div>
    </EffectsProvider>
  );
}


const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
};

export default App;
