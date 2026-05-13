import React from 'react';
import Navbar from './components/Navbar';
import HeroSection from './components/HeroSection';
import SkillsSection from './components/SkillsSection';
import Footer from './components/Footer';
import { SECTION_IDS } from './constants';
import { EffectsProvider } from './contexts/PhysicsContext';
import EffectsLabPanel from './components/EffectsLabPanel';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { cybersecurityData, fieldNotes, projectArchive, projectHighlights, softwareEngineerData } from './portfolioData';
import FluidBackground from './components/FluidBackground';
import ProjectsSection from './components/ProjectsSection';
import EventsTimeline from './components/EventsTimeline';
import AskThePage from './components/AskThePage';

const PortfolioWorld = React.lazy(() => import('./components/PortfolioWorld'));

const AppContent: React.FC = () => {
  const { theme } = useTheme();
  const portfolioData = theme === 'light' ? softwareEngineerData : cybersecurityData;

  const backgroundClass = theme === 'light' 
    ? 'bg-gray-900 text-gray-200'
    : 'dark bg-black text-gray-300';

  return (
    <EffectsProvider theme={theme}>
      <div className={`min-h-screen flex flex-col ${backgroundClass}`}>
        <FluidBackground />
        <Navbar name={portfolioData.name} />
        <main className="flex-grow relative z-10">
          <HeroSection id={SECTION_IDS.HOME} data={portfolioData} />
          <ProjectsSection id={SECTION_IDS.PROJECTS} projects={projectHighlights} archiveProjects={projectArchive} />
          <EventsTimeline id={SECTION_IDS.EVENTS} notes={fieldNotes} projects={projectHighlights} archiveProjects={projectArchive} />
          <SkillsSection id={SECTION_IDS.SKILLS} skills={portfolioData.skills} />
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
        <EffectsLabPanel />
        <AskThePage />
        <React.Suspense fallback={null}>
          <PortfolioWorld />
        </React.Suspense>
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
