export const SECTION_IDS = {
  HOME: 'home',
  PROJECTS: 'work',
  ALL_PROJECTS: 'all-work',
  TECHNICAL_LAB: 'technical-lab',
  DOMAINS: 'domains',
  EXPERIENCE: 'experience',
  ACHIEVEMENTS: 'proof',
  RESUMES: 'resumes',
  CONTACT: 'contact',
} as const;

// The chapters the assistant's focusGuideChapter command may target, in reading
// order. Every id is an anchor a workbench window renders.
export const JOURNEY_STAGES = [
  { id: SECTION_IDS.HOME, label: 'Overview' },
  { id: SECTION_IDS.PROJECTS, label: 'Selected work' },
  { id: SECTION_IDS.EXPERIENCE, label: 'Experience' },
  { id: SECTION_IDS.ALL_PROJECTS, label: 'All projects' },
  { id: SECTION_IDS.TECHNICAL_LAB, label: 'Technical lab' },
  { id: SECTION_IDS.DOMAINS, label: 'Capabilities' },
  { id: SECTION_IDS.ACHIEVEMENTS, label: 'Proof' },
  { id: SECTION_IDS.RESUMES, label: 'Résumés' },
  { id: SECTION_IDS.CONTACT, label: 'Contact' },
] as const;
