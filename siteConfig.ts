export const SITE_CONFIG = {
  name: 'Rahul Mitra',
  shortName: 'RM',
  canonicalUrl: 'https://rahul-mitra.com/',
  title: 'Rahul Mitra | Intelligent Systems, AI, Optimization & 3D Perception',
  description: 'Rahul Mitra is a multidisciplinary engineer working across software systems, AI engineering, operations research, 3D computer vision, solution architecture, and cybersecurity.',
  email: 'mitrarahul2002@gmail.com',
  location: 'Singapore',
  // Attested in scripts/resume/content/education.json ("Aug 2023 – Jul 2027")
  // and as server/jobSearch.mjs DEFAULT_PREFERENCES.graduation_date. Kept here
  // so the two rendered surfaces (Home dossier, mobile hero) read one copy
  // instead of each hardcoding the date. buildPortfolioSnapshot projects
  // SITE_CONFIG key by key, so this is invisible to the committed snapshot.
  graduation: 'Jul 2027',
  social: {
    linkedin: 'https://www.linkedin.com/in/rahulmitra-dev',
    github: 'https://github.com/Rah-Rah-Mitra',
    instagram: 'https://www.instagram.com/rah.rah.mitra/',
  },
  resumeEdition: '2026-11',
} as const;

// Each starter has to land on its own topic in the assistant's local fallback
// (tests/assistant.test.ts pins which). "experience" would route a starter to the
// generic timeline answer, which is why the security one says "record".
const CAMERA_LAB_STARTER = 'Open the Camera Lab stereo depth model.';
export const ASSISTANT_STARTERS = [
  'Show me Rahul’s optimization work.',
  'What did Rahul study in 3D computer vision?',
  'Which résumé should I download?',
  'Show Rahul’s security record.',
  CAMERA_LAB_STARTER,
] as const;

// ≤880px the site is the Field Index registry, which has no Camera Lab, so a
// phone is offered a starter that registry can show instead.
export const NARROW_ASSISTANT_STARTERS: readonly string[] = ASSISTANT_STARTERS.map((starter) => (
  starter === CAMERA_LAB_STARTER ? 'Tell me about Swarmline.' : starter
));

export const resumeAssetUrl = (slug: string, format: 'docx' | 'pdf') => (
  `/resume/generated/rahul-mitra-${slug}-${SITE_CONFIG.resumeEdition}.${format}`
);
