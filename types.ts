export interface AchievementItem {
  id: string | number;
  title: string;
  description: string;
  date: string;
  imageUrl?: string;
  category?: string;
  tags?: string[];
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
}

export interface ResumeProfile {
  id: string;
  role: string;
  headline: string;
  keywords: string[];
  docxUrl: string;
  pdfUrl: string;
  accent: ProjectHighlight['accent'];
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
}

export interface NavLink {
  href: string;
  label: string;
}
