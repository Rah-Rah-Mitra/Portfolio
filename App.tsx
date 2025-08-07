import React from 'react';
import { PortfolioData } from './types';
import Navbar from './components/Navbar';
import HeroSection from './components/HeroSection';
import AchievementsSection from './components/AchievementsSection';
import SkillsSection from './components/SkillsSection';
import ExperienceSection from './components/ExperienceSection';
import ContactSection from './components/ContactSection';
import Footer from './components/Footer';
import { SECTION_IDS } from './constants';
import { PhysicsProvider } from './contexts/PhysicsContext';
import PhysicsControls from './components/PhysicsControls';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { softwareEngineerData, cybersecurityData } from './portfolioData';

const AppContent: React.FC = () => {
  const { theme } = useTheme();
  const portfolioData = theme === 'light' ? softwareEngineerData : cybersecurityData;

  const backgroundClass = theme === 'light' 
    ? 'bg-gray-900 text-gray-200'
    : 'dark bg-black text-gray-300';

  return (
    <PhysicsProvider theme={theme}>
      <div className={`min-h-screen flex flex-col ${backgroundClass}`}>
        <Navbar name={portfolioData.name} />
        <main className="flex-grow">
          <HeroSection id={SECTION_IDS.HOME} data={portfolioData} />
          <AchievementsSection id={SECTION_IDS.ACHIEVEMENTS} achievements={portfolioData.achievements} />
          <SkillsSection id={SECTION_IDS.SKILLS} skills={portfolioData.skills} />
          <ExperienceSection id={SECTION_IDS.EXPERIENCE} experiences={portfolioData.experiences} />
          <ContactSection id={SECTION_IDS.CONTACT} email={portfolioData.contactEmail} linkedinUrl={portfolioData.linkedinUrl} githubUrl={portfolioData.githubUrl} instagramUrl={portfolioData.instagramUrl} />
        </main>
        <Footer name={portfolioData.name} />
        <PhysicsControls />
      </div>
    </PhysicsProvider>
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