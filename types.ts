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

export interface ExperienceItem {
  id: string | number;
  role: string;
  company: string;
  duration: string;
  responsibilities: string[];
  logoUrl?: string;
}

export interface ProjectHighlight {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  repoUrl?: string;
  liveUrl?: string;
  imageUrl?: string;
  accent: 'cyan' | 'red' | 'violet' | 'green' | 'amber' | 'blue';
  linkedEventIds?: string[];
  npcRole?: string;
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
  experiences: ExperienceItem[];
}

export interface NavLink {
  href: string;
  label: string;
}
