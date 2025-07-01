
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

export interface PortfolioData {
  name: string;
  tagline: string;
  bio: string;
  profileImageUrl: string;
  contactEmail: string;
  linkedinUrl?: string;
  githubUrl?: string;
  twitterUrl?: string;
  achievements: AchievementItem[];
  skills: SkillItem[];
  experiences: ExperienceItem[];
}

export interface NavLink {
  href: string;
  label: string;
}
    