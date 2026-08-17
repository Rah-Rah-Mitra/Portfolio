
import { NavLink } from './types';

export const SECTION_IDS = {
  HOME: 'home',
  PROJECTS: 'work',
  ALL_PROJECTS: 'all-work',
  TECHNICAL_LAB: 'technical-lab',
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
  { href: `#${SECTION_IDS.EXPERIENCE}`, label: 'Experience' },
  { href: `#${SECTION_IDS.ALL_PROJECTS}`, label: 'Projects' },
  { href: `#${SECTION_IDS.TECHNICAL_LAB}`, label: 'Technical Lab' },
  { href: `#${SECTION_IDS.ACHIEVEMENTS}`, label: 'Proof' },
  { href: `#${SECTION_IDS.RESUMES}`, label: 'Resumes' },
  { href: `#${SECTION_IDS.CONTACT}`, label: 'Contact' },
];

export const JOURNEY_STAGES = [
  { id: SECTION_IDS.HOME, label: 'Overview', frame: 'W / origin', tone: 'origin', angle: -10 },
  { id: SECTION_IDS.PROJECTS, label: 'Selected work', frame: 'C1 / capture', tone: 'work', angle: 8 },
  { id: SECTION_IDS.EXPERIENCE, label: 'Experience', frame: 'C2 / delivery', tone: 'experience', angle: 12 },
  { id: SECTION_IDS.ALL_PROJECTS, label: 'All projects', frame: 'C3 / archive', tone: 'work', angle: -6 },
  { id: SECTION_IDS.TECHNICAL_LAB, label: 'Technical lab', frame: 'C4 / calibrate', tone: 'domains', angle: 7 },
  { id: SECTION_IDS.DOMAINS, label: 'Capabilities', frame: 'C5 / connect', tone: 'domains', angle: -6 },
  { id: SECTION_IDS.ACHIEVEMENTS, label: 'Proof', frame: 'C6 / verify', tone: 'proof', angle: -12 },
  { id: SECTION_IDS.RESUMES, label: 'Résumés', frame: 'C7 / target', tone: 'resumes', angle: 5 },
  { id: SECTION_IDS.CONTACT, label: 'Contact', frame: 'C8 / handoff', tone: 'contact', angle: 0 },
] as const;
    
