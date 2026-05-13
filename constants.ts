
import { NavLink } from './types';

export const SECTION_IDS = {
  HOME: 'home',
  PROJECTS: 'projects',
  EVENTS: 'events',
  SKILLS: 'skills',
  CONTACT: 'contact',
};

export const NAVIGATION_LINKS: NavLink[] = [
  { href: `#${SECTION_IDS.HOME}`, label: 'Home' },
  { href: `#${SECTION_IDS.PROJECTS}`, label: 'Projects' },
  { href: `#${SECTION_IDS.EVENTS}`, label: 'Field Notes' },
  { href: `#${SECTION_IDS.SKILLS}`, label: 'Skills' },
  { href: `#${SECTION_IDS.CONTACT}`, label: 'Contact' },
];
    
