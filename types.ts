export interface AchievementItem {
  id: string | number;
  title: string;
  description: string;
  date: string;
  imageUrl?: string;
  category?: string;
  tags?: string[];
  proofUrl?: string;
  proofLabel?: string;
}

export interface SkillItem {
  id: string | number;
  name: string;
  icon?: React.ReactNode;
}

export interface ProjectHighlight {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  repoUrl?: string;
  liveUrl?: string;
  dateLabel?: string;
  sortDate?: string;
  links?: Array<{
    label: string;
    url: string;
  }>;
  imageUrl?: string;
  accent: 'cyan' | 'red' | 'violet' | 'green' | 'amber' | 'blue';
  linkedEventIds?: string[];
  npcRole?: string;
  featuredPriority?: number;
  spotlight?: {
    context: string;
    contribution: string;
    approach: string;
    outcome: string;
  };
}

export interface ResumeProfile {
  id: string;
  role: string;
  headline: string;
  keywords: string[];
  docxUrl: string;
  pdfUrl: string;
  accent: ProjectHighlight['accent'];
  recommendedFor?: Array<'build' | 'secure'>;
}

export interface CompetencyCluster {
  id: string;
  title: string;
  summary: string;
  tools: string[];
  proof: string[];
  accent: ProjectHighlight['accent'];
}

export type FieldNoteKind = 'event' | 'achievement' | 'project' | 'career' | 'education' | 'certification';

export interface FieldNoteLink {
  label: string;
  url: string;
}

export interface FieldNote {
  id: string;
  title: string;
  kind: FieldNoteKind;
  kinds: FieldNoteKind[];
  aliases?: string[];
  dateLabel: string;
  sortDate: string;
  source: 'LinkedIn' | 'GitHub' | 'Portfolio' | 'Education';
  summary: string;
  tags: string[];
  people?: string[];
  organizations?: string[];
  linkedProjectIds?: string[];
  links?: FieldNoteLink[];
  imageUrl?: string;
  npcDialogue?: string;
}

export interface ExperienceRecord {
  id: string;
  kind: 'professional' | 'education';
  role: string;
  organization: string;
  location: string;
  dateLabel: string;
  sortDate: string;
  scope: string;
  responsibilities: string[];
  outcomes: string[];
  tags: string[];
  linkedProjectIds: string[];
}

export interface EventHighlight {
  id: string;
  title: string;
  dateLabel: string;
  exactDateRange?: string;
  source: 'LinkedIn' | 'GitHub' | 'Portfolio';
  summary: string;
  tags: string[];
  people?: string[];
  organizations?: string[];
  linkedProjectIds?: string[];
  linkUrl?: string;
  imageUrl?: string;
  npcDialogue: string;
}

export interface PortfolioData {
  name: string;
  tagline: string;
  bio: string;
  profileImageUrl: string;
  contactEmail: string;
  linkedinUrl?: string;
  githubUrl?: string;
  instagramUrl?: string;
  achievements: AchievementItem[];
  skills: SkillItem[];
  experience?: ExperienceRecord[];
  projects?: ProjectHighlight[];
  capabilities?: CompetencyCluster[];
  resumes?: ResumeProfile[];
  guideChapters?: GuideChapter[];
  technicalDemos?: TechnicalDemo[];
}

export interface ProjectMedia {
  id: string;
  kind: 'poster' | 'video' | 'interactive';
  posterSrc: string;
  webmSrc?: string;
  mp4Src?: string;
  durationSeconds?: number;
  width: number;
  height: number;
  alt: string;
  transcript?: string;
  workflowId?: string;
  loadPriority?: 'critical' | 'near-viewport' | 'lazy';
}

export interface GuideChapter {
  sectionId: string;
  label: string;
  cue: 'idle' | 'walk' | 'run' | 'inspect' | 'calibrate';
  pathProgress: number;
  camera: [number, number, number];
  annotation: string;
  reducedMotionLabel: string;
}

export interface TechnicalDemoLayer {
  id: 'rgb' | 'detection' | 'segmentation' | 'features' | 'matches' | 'map' | 'trajectory';
  label: string;
  method: string;
  description: string;
}

export interface TechnicalDemo {
  id: string;
  title: string;
  disclaimer: string;
  provenance: string;
  metrics: Array<{ label: string; value: string }>;
  layers: TechnicalDemoLayer[];
}

export interface NavLink {
  href: string;
  label: string;
}
