
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
import HammerControls from './components/HammerControls';

import { CodeBracketIcon, AcademicCapIcon, CommandLineIcon, DevicePhoneMobileIcon, ServerStackIcon, PaintBrushIcon } from './components/icons/TechIcons'; // Example tech icons

const portfolioData: PortfolioData = {
  name: "Rahul Mitra",
  tagline: "Innovative Software Engineer & Creative Problem Solver",
  bio: "Driven by a passion for technology and a keen eye for detail, I specialize in crafting high-quality software solutions that are both user-friendly and impactful. My journey in tech has been fueled by continuous learning and a desire to build things that make a difference.",
  profileImageUrl: "https://picsum.photos/seed/morganprofile/400/400",
  contactEmail: "rahul.mitra.dev@example.com",
  linkedinUrl: "https://linkedin.com/in/rahulmitra-dev",
  githubUrl: "https://github.com/rahulmitra-dev",
  twitterUrl: "https://twitter.com/rahulmitra_dev",
  achievements: [
    { 
      id: 1, 
      title: "AI-Powered Customer Support Chatbot", 
      description: "Developed and deployed an AI chatbot that reduced customer service response times by 40% and improved user satisfaction scores by 25%. Integrated with existing CRM systems.",
      date: "2023 Q4", 
      imageUrl: "https://picsum.photos/seed/chatbot/600/400", 
      category: "AI & Machine Learning",
      tags: ["Python", "NLP", "Dialogflow", "API Integration"]
    },
    { 
      id: 2, 
      title: "Global E-commerce Platform Optimization", 
      description: "Led the performance optimization initiative for a global e-commerce site, resulting in a 2s reduction in average page load time and a 15% conversion rate increase.", 
      date: "2022 - 2023", 
      imageUrl: "https://picsum.photos/seed/ecommerce/600/400", 
      category: "Web Development",
      tags: ["React", "Node.js", "AWS", "Performance Tuning"]
    },
    { 
      id: 3, 
      title: "Published Research on Quantum Computing Algorithms", 
      description: "Co-authored and published a paper in a peer-reviewed journal on novel algorithms for quantum simulations, contributing to advancements in the field.", 
      date: "2021", 
      imageUrl: "https://picsum.photos/seed/quantum/600/400", 
      category: "Research",
      tags: ["Quantum Computing", "Algorithm Design", "Scientific Publication"]
    },
     { 
      id: 4, 
      title: "Community Coding Bootcamp Mentor", 
      description: "Volunteered as a mentor for a local coding bootcamp, guiding aspiring developers and contributing to curriculum development for web fundamentals.", 
      date: "Ongoing", 
      imageUrl: "https://picsum.photos/seed/bootcamp/600/400", 
      category: "Community",
      tags: ["Mentorship", "Education", "JavaScript", "HTML/CSS"]
    }
  ],
  skills: [
    { id: 1, name: "TypeScript", icon: <CodeBracketIcon className="w-6 h-6" /> },
    { id: 2, name: "React & Next.js", icon: <DevicePhoneMobileIcon className="w-6 h-6" /> },
    { id: 3, name: "Node.js & Express", icon: <ServerStackIcon className="w-6 h-6" /> },
    { id: 4, name: "Python (Flask, Django)", icon: <CommandLineIcon className="w-6 h-6" /> },
    { id: 5, name: "Cloud Platforms (AWS, Azure)", icon: <ServerStackIcon className="w-6 h-6" /> },
    { id: 6, name: "Databases (SQL, NoSQL)", icon: <ServerStackIcon className="w-6 h-6" /> },
    { id: 7, name: "UI/UX Principles", icon: <PaintBrushIcon className="w-6 h-6" /> },
    { id: 8, name: "Agile Methodologies", icon: <AcademicCapIcon className="w-6 h-6" /> },
  ],
  experiences: [
    { 
      id: 1, 
      role: "Lead Software Engineer", 
      company: "Innovatech Solutions", 
      duration: "Mar 2021 - Present", 
      responsibilities: [
        "Architecting and developing scalable microservices for flagship products.",
        "Leading a team of 8 engineers, fostering a collaborative and high-performance culture.",
        "Driving adoption of best practices in code quality, testing, and CI/CD pipelines.",
        "Collaborating with product managers and designers to translate requirements into technical solutions."
      ],
      logoUrl: "https://picsum.photos/seed/innovatechlogo/100/100"
    },
    { 
      id: 2, 
      role: "Full-Stack Developer", 
      company: "Digital Creations Co.", 
      duration: "Jul 2018 - Feb 2021", 
      responsibilities: [
        "Developed and maintained responsive web applications using React, Angular, and Vue.js.",
        "Built RESTful APIs and integrated with third-party services.",
        "Participated in full software development lifecycle, from concept to deployment.",
        "Contributed to database design and optimization."
      ],
      logoUrl: "https://picsum.photos/seed/digitalco/100/100"
    },
    { 
      id: 3, 
      role: "Junior Developer", 
      company: "Startup Hub X", 
      duration: "Jun 2017 - Jul 2018", 
      responsibilities: [
        "Assisted senior developers in building and testing new application features.",
        "Gained experience with version control (Git) and agile development processes.",
        "Provided technical support and bug fixes for existing applications."
      ],
      logoUrl: "https://picsum.photos/seed/startuphubx/100/100"
    },
  ],
};

const App: React.FC = () => {
  return (
    <PhysicsProvider>
      <div className="min-h-screen bg-gray-900 flex flex-col">
        <Navbar name={portfolioData.name} />
        <main className="flex-grow">
          <HeroSection id={SECTION_IDS.HOME} data={portfolioData} />
          <AchievementsSection id={SECTION_IDS.ACHIEVEMENTS} achievements={portfolioData.achievements} />
          <SkillsSection id={SECTION_IDS.SKILLS} skills={portfolioData.skills} />
          <ExperienceSection id={SECTION_IDS.EXPERIENCE} experiences={portfolioData.experiences} />
          <ContactSection id={SECTION_IDS.CONTACT} email={portfolioData.contactEmail} linkedinUrl={portfolioData.linkedinUrl} githubUrl={portfolioData.githubUrl} twitterUrl={portfolioData.twitterUrl} />
        </main>
        <Footer name={portfolioData.name} />
        <HammerControls />
      </div>
    </PhysicsProvider>
  );
};

export default App;
