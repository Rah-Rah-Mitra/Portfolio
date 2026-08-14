export const SITE_CONFIG = {
  name: 'Rahul Mitra',
  shortName: 'RM',
  canonicalUrl: 'https://rahul-mitra.com/',
  title: 'Rahul Mitra | Intelligent Systems, AI, Optimization & 3D Perception',
  description: 'Rahul Mitra is a multidisciplinary engineer working across software systems, AI engineering, operations research, 3D computer vision, solution architecture, and cybersecurity.',
  email: 'mitrarahul2002@gmail.com',
  location: 'Singapore',
  social: {
    linkedin: 'https://www.linkedin.com/in/rahulmitra-dev',
    github: 'https://github.com/Rah-Rah-Mitra',
    instagram: 'https://www.instagram.com/rah.rah.mitra/',
  },
  resumeEdition: '2026-08',
} as const;

export const ASSISTANT_STARTERS = [
  'Show me Rahul’s optimization work.',
  'What did Rahul study in 3D computer vision?',
  'Which résumé should I download?',
  'Show security experience.',
  'Open the spatial portfolio world.',
] as const;

export const resumeAssetUrl = (slug: string, format: 'docx' | 'pdf') => (
  `/resume/generated/rahul-mitra-${slug}-${SITE_CONFIG.resumeEdition}.${format}`
);
