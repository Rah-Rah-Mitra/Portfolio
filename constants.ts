
import { NavLink } from './types';

export const SECTION_IDS = {
  HOME: 'home',
  PROJECTS: 'work',
  DOMAINS: 'domains',
  EXPERIENCE: 'experience',
  ACHIEVEMENTS: 'proof',
  SKILLS: 'methods',
  RESUMES: 'resumes',
  TOOLS: 'share',
  CONTACT: 'contact',
} as const;

export const NAVIGATION_LINKS: NavLink[] = [
  { href: `#${SECTION_IDS.PROJECTS}`, label: 'Work' },
  { href: `#${SECTION_IDS.DOMAINS}`, label: 'Domains' },
  { href: `#${SECTION_IDS.EXPERIENCE}`, label: 'Experience' },
  { href: `#${SECTION_IDS.ACHIEVEMENTS}`, label: 'Proof' },
  { href: `#${SECTION_IDS.RESUMES}`, label: 'Resumes' },
  { href: `#${SECTION_IDS.CONTACT}`, label: 'Contact' },
];
    
