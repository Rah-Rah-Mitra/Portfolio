
import { NavLink } from './types';

export const SECTION_IDS = {
  HOME: 'home',
  PROJECTS: 'projects',
  ACHIEVEMENTS: 'achievements',
  EVENTS: 'events',
  SKILLS: 'skills',
  RESUMES: 'resumes',
  TOOLS: 'tools',
  CONTACT: 'contact',
};

export const NAVIGATION_LINKS: NavLink[] = [
  { href: `#${SECTION_IDS.HOME}`, label: 'Home' },
  { href: `#${SECTION_IDS.PROJECTS}`, label: 'Projects' },
  { href: `#${SECTION_IDS.ACHIEVEMENTS}`, label: 'Achievements' },
  { href: `#${SECTION_IDS.EVENTS}`, label: 'Field Notes' },
  { href: `#${SECTION_IDS.SKILLS}`, label: 'Skills' },
  { href: `#${SECTION_IDS.RESUMES}`, label: 'Resumes' },
  { href: `#${SECTION_IDS.TOOLS}`, label: 'Tools' },
  { href: `#${SECTION_IDS.CONTACT}`, label: 'Contact' },
];
    
