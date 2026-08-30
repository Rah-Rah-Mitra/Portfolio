// workbench.ts — registry + data adapters for the Industry "Field Workbench" UI.
// App ids, labels, and anchors reuse lib/workstation.ts so the AI assistant and
// server/pageAgent.mjs command contract keep working unchanged.
import type { DesktopAppId, ProjectHighlight } from '../types';
import { workstationApps } from './workstation';
import { allProjects, coreCompetencies, resumeProfiles, unifiedPortfolioData } from '../portfolioData';

// Lucide-style single-path icons (stroke 1.5), lifted from the redesign mockups.
const APP_ICONS: Record<DesktopAppId, string> = {
  'home': 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5M9.5 21v-6h5v6',
  'selected-work': 'M3.5 7.5h17V20h-17zM8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5M3.5 12h17',
  'experience': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3 2',
  'project-archive': 'M3.5 4h17v4h-17zM5.5 8v12h13V8M10 12h4',
  'systems-lab': 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1',
  'camera-lab': 'M4 8h3.5L9.5 5h5L16.5 8H20v11H4zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  'world-3d': 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12 4 7.5M12 12v9',
  'capabilities': 'M3.5 3.5h7v7h-7zM13.5 3.5h7v7h-7zM3.5 13.5h7v7h-7zM13.5 13.5h7v7h-7z',
  'proof-vault': 'M12 3l7 2.8V11c0 4.8-3.2 7.7-7 9.7C8.2 18.7 5 15.8 5 11V5.8zM9 11.5l2 2 4-4.5',
  'resumes-contact': 'M6.5 3h7L18 7.5V21h-11.5zM13.5 3v4.5H18M9.5 12h5M9.5 15.5h5',
};

export interface WorkbenchApp {
  id: DesktopAppId;
  label: string;
  shortLabel: string;
  kind: string;
  win: string;
  sectionId: string;
  icon: string;
}

export const workbenchApps: readonly WorkbenchApp[] = workstationApps.map((app, index) => ({
  id: app.id,
  label: app.label,
  shortLabel: app.shortLabel,
  kind: app.kind.toUpperCase(),
  win: `WIN-${String(index + 1).padStart(2, '0')}`,
  sectionId: app.fallbackAnchor.slice(1),
  icon: APP_ICONS[app.id],
}));

export const appById = new Map(workbenchApps.map((app) => [app.id, app]));

// Anchors the assistant / legacy links use, beyond the canonical fallback anchors.
export const appForAnchor = (anchor: string): DesktopAppId | undefined => {
  const id = anchor.replace(/^#/, '');
  if (id.startsWith('project-') || id.startsWith('selected-')) return 'project-archive';
  if (id.startsWith('experience-')) return 'experience';
  if (id === 'contact') return 'resumes-contact';
  return workbenchApps.find((app) => app.sectionId === id)?.id;
};

// Featured order fixed by the approved redesign mockups.
const FEATURED_IDS = ['hybrid-flow-shop-digital-twin', 'on-the-spectrum', 'project-utopia', 'churp', 'maritime-deficiency-severity', 'asyncddgs'];

export interface FeaturedCard {
  no: string;
  project: ProjectHighlight;
  outcome: string;
}

export const featuredCards: readonly FeaturedCard[] = FEATURED_IDS
  .map((id) => allProjects.find((project) => project.id === id))
  .filter((project): project is ProjectHighlight => Boolean(project))
  .map((project, index) => ({
    no: String(index + 1).padStart(2, '0'),
    project,
    outcome: project.spotlight?.outcome ?? project.description,
  }));

export const WORKBENCH_DOMAINS = ['All', 'AI', 'Operations', 'Software', 'Security', 'Civic', '3D / Vision'] as const;
export type WorkbenchDomain = (typeof WORKBENCH_DOMAINS)[number];

const PROJECT_DOMAINS: Record<string, WorkbenchDomain> = {
  'on-the-spectrum': '3D / Vision',
  'geometry': '3D / Vision',
  'information-lab': 'Software',
  'arcane': 'Security',
  'hailo-training': 'AI',
  'hybrid-flow-shop-digital-twin': 'Operations',
  'azure-apc-web-simulator': 'Operations',
  'changeover-data-quality-pipeline': 'Operations',
  'project-utopia': 'AI',
  'volt-pulse-sg': 'AI',
  'smart-exam': 'AI',
  'waaah-comics': '3D / Vision',
  'ethos-lens': 'AI',
  'agewelllah-ai': 'AI',
  'maritime-deficiency-severity': 'AI',
  'churp': 'Civic',
  'kaogenie': 'AI',
  'asyncddgs': 'Software',
  'portfolio-repo': 'Software',
  'github-profile-repo': 'Software',
  'kalidokit-fork': '3D / Vision',
  'tp-java': 'Software',
  'ip-java': 'Software',
  'crawl4ai-deepseek-example': 'AI',
  'ie2110-grp-13': 'Operations',
  'fine-tuning-llms-cybersecurity': 'Security',
  'references': 'Software',
  'eg1311-project': 'Software',
};

export interface ArchiveRow {
  id: string;
  date: string;
  title: string;
  category: string;
  stack: string;
  domain: WorkbenchDomain;
  href?: string;
}

export const archiveRows: readonly ArchiveRow[] = allProjects.map((project) => ({
  id: project.id,
  date: project.sortDate?.slice(0, 7) ?? project.dateLabel ?? '—',
  title: project.title,
  category: project.category,
  stack: project.tags.slice(0, 3).join(' · '),
  domain: PROJECT_DOMAINS[project.id] ?? 'Software',
  href: project.repoUrl ?? project.liveUrl,
}));

export const filterArchiveRows = (query: string, domain: WorkbenchDomain): ArchiveRow[] => {
  const q = query.trim().toLowerCase();
  return archiveRows.filter((row) =>
    (domain === 'All' || row.domain === domain) &&
    (!q || `${row.title} ${row.category} ${row.stack} ${row.domain}`.toLowerCase().includes(q)));
};

export const dossierStats = [
  { value: String(coreCompetencies.length).padStart(2, '0'), label: 'ENGINEERING DOMAINS' },
  { value: String(allProjects.length), label: 'PUBLIC PROJECTS INDEXED' },
  { value: 'S$20K', label: 'SPARKS INNOVATION FUND' },
  { value: '1/24', label: 'TOP STUDENT — 3D CV, NUS' },
] as const;

export const CONTACT = {
  email: unifiedPortfolioData.contactEmail,
  github: unifiedPortfolioData.githubUrl ?? 'https://github.com/Rah-Rah-Mitra',
  linkedin: unifiedPortfolioData.linkedinUrl ?? 'https://www.linkedin.com/in/rahulmitra-dev',
} as const;

export const generalResume = resumeProfiles.find((profile) => profile.id === 'general') ?? resumeProfiles[0];

// Event the AI assistant (and any legacy in-page link) uses to open a window /
// reveal a registry row in the new UI.
export const WORKBENCH_OPEN_EVENT = 'portfolio:workbench-open';

export interface WorkbenchOpenDetail {
  appId: DesktopAppId;
  targetId?: string;
  action?: 'minimize';
}

export const dispatchWorkbenchOpen = (detail: WorkbenchOpenDetail) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<WorkbenchOpenDetail>(WORKBENCH_OPEN_EVENT, { detail }));
};
