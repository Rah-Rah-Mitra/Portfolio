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
  provenanceId?: string;
  loadPriority?: 'critical' | 'near-viewport' | 'lazy';
}

export type ExperiencePath = {
  id: string;
  label: string;
  sourceAnchor: `#${string}`;
  evidenceSectionIds: string[];
  initialProgress: number;
  destinationProgress: number;
};

export type SceneId =
  | 'calibration'
  | 'systems-in-motion'
  | 'spatial-systems'
  | 'selected-work'
  | 'camera-laboratory'
  | 'departure';

export type SceneControlOwner = 'story' | 'visitor' | 'transition';

export type SemanticFallbackAnchor =
  | '#home'
  | '#experience'
  | '#all-work'
  | '#work'
  | '#technical-lab'
  | '#contact';

export type SceneControlOwnership = {
  owner: SceneControlOwner;
  control: string;
  resetLabel: string;
  keyboardShortcut?: string;
};

export type InteractionFallback = {
  responseTarget: SemanticFallbackAnchor;
  message: string;
};

export type InteractionDefinition = {
  id: SceneId;
  title: string;
  purpose: string;
  model: string;
  primaryManipulation: string;
  secondaryDetail: string;
  ambientMotion: string;
  characterReaction: string;
  controls: SceneControlOwnership[];
  fallback: InteractionFallback;
  testCoverage: string[];
};

export type WorldAnchor = {
  id: string;
  semanticTarget: `#${string}`;
  position: [number, number, number];
  safeTextRegion: [number, number, number, number];
  interactionBounds: [number, number, number, number];
  projectionDepth: number;
  responsiveOverrides?: Record<'mobile' | 'tablet' | 'desktop', Partial<Pick<WorldAnchor, 'position' | 'safeTextRegion' | 'interactionBounds'>>>;
  occluders?: string[];
};

export type CameraShot = {
  id: string;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  focusDistance?: number;
  exposure?: number;
  transitionMs: number;
};

export type QualityTier = 'full' | 'balanced' | 'reduced' | 'static';

export type PortfolioWorldEvent =
  | { type: 'INTERACTION_PRIMED'; sceneId: SceneId; source: 'visitor' }
  | { type: 'INTERACTION_CHANGED'; sceneId: SceneId; source: 'visitor'; detail: string }
  | { type: 'INTERACTION_RESET'; sceneId: SceneId; source: 'visitor' }
  | { type: 'EXPLORE_ENTERED'; sceneId: SceneId; source: 'visitor' }
  | { type: 'EXPLORE_EXITED'; sceneId: SceneId; source: 'visitor' }
  | { type: 'JOB_REORDERED'; oldMakespan: number; newMakespan: number; makespanDelta: number; order: string[] }
  | { type: 'MAP_MARKER_MOVED'; markerId: string; coordinates: [number, number]; selectedPlot: string; distance: number }
  | { type: 'PROJECT_OPENED'; projectId: string; selectedId: string; selectedIndex: number }
  | { type: 'CAMERA_CALIBRATED'; reprojectionError: number }
  | { type: 'STEREO_POINT_TRIANGULATED'; depthError: number }
  | { type: 'DEPARTURE_COMPLETED'; state: 'closed' | 'calibrated' }
  | { type: 'LAB_RESET'; sceneId?: SceneId }
  | { type: 'QUALITY_CHANGED'; tier: QualityTier };

export type QualityTierDefinition = {
  id: QualityTier;
  allowsWebgl: boolean;
  allowsVideo: boolean;
  allowsAmbientMotion: boolean;
  maxPixelRatio: number;
};

export type WorldEventType =
  | 'chapter-entered'
  | 'interaction-primed'
  | 'interaction-reset'
  | 'quality-changed'
  | 'explore-entered'
  | 'explore-exited';

export type WorldEvent = {
  type: WorldEventType;
  sceneId?: SceneId;
  source: 'narrative' | 'visitor' | 'system';
  occurredAt: number;
  payload?: Record<string, string | number | boolean>;
};

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
