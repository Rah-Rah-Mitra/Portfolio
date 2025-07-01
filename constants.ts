
import { NavLink } from './types';

export const SECTION_IDS = {
  HOME: 'home',
  ABOUT: 'about',
  ACHIEVEMENTS: 'achievements',
  SKILLS: 'skills',
  EXPERIENCE: 'experience',
  CONTACT: 'contact',
};

export const NAVIGATION_LINKS: NavLink[] = [
  { href: `#${SECTION_IDS.HOME}`, label: 'Home' },
  { href: `#${SECTION_IDS.ACHIEVEMENTS}`, label: 'Achievements' },
  { href: `#${SECTION_IDS.SKILLS}`, label: 'Skills' },
  { href: `#${SECTION_IDS.EXPERIENCE}`, label: 'Experience' },
  { href: `#${SECTION_IDS.CONTACT}`, label: 'Contact' },
];
    