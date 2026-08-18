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
  provenance?: {
    status: 'selected' | 'rejected';
    promptId: string;
    seed: number;
    workflowSha256: string;
    sourceSha256?: string;
    outputSha256?: { poster?: string; webm?: string; mp4?: string };
    rejectionReason?: string;
  };
}

export type DesktopAppId =
  | 'home'
  | 'selected-work'
  | 'experience'
  | 'project-archive'
  | 'systems-lab'
  | 'camera-lab'
  | 'world-3d'
  | 'capabilities'
  | 'proof-vault'
  | 'resumes-contact';

export type ColorSchemePreference = 'dark' | 'light' | 'system';
export type ResolvedColorScheme = 'dark' | 'light';
export type AccentId = 'teal' | 'sky' | 'amber' | 'violet' | 'rose';
export type BackgroundThemeId = 'nbody' | 'fluid';
export type WindowTint = 'neutral' | 'graphite' | 'accent';
export type DockSize = 'small' | 'medium' | 'large';
export type NBodyPreset = 'galaxy' | 'binary' | 'field';
export type NBodyExpansionOrder = 4 | 6 | 8 | 10;
export type NBodyLeafCapacity = 24 | 48 | 72 | 96;

export interface NBodyPreferences {
  preset: NBodyPreset;
  particleCount: number;
  timeScale: number;
  gravity: number;
  softening: number;
  trailPersistence: number;
  expansionOrder: NBodyExpansionOrder;
  leafCapacity: NBodyLeafCapacity;
  pointerAttraction: boolean;
  seed: number;
  showTree: boolean;
}

export interface FluidPreferences {
  speed: number;
  intensity: number;
  opacity: number;
  splatRadius: number;
  curl: number;
  quality: 'balanced' | 'high';
  pointerInteraction: boolean;
}

export interface AppearancePreferences {
  scheme: ColorSchemePreference;
  accent: AccentId;
  background: BackgroundThemeId;
  backgroundPaused: boolean;
  windowTint: WindowTint;
  titlebarOpacity: number;
  reduceTransparency: boolean;
  dockSize: DockSize;
  nbody: NBodyPreferences;
  fluid: FluidPreferences;
}

export type AppearancePreferenceAction =
  | { type: 'SET_SCHEME'; scheme: ColorSchemePreference }
  | { type: 'SET_ACCENT'; accent: AccentId }
  | { type: 'SET_BACKGROUND'; background: BackgroundThemeId }
  | { type: 'SET_BACKGROUND_PAUSED'; paused: boolean }
  | { type: 'SET_WINDOW_TINT'; tint: WindowTint }
  | { type: 'SET_TITLEBAR_OPACITY'; opacity: number }
  | { type: 'SET_REDUCE_TRANSPARENCY'; reduce: boolean }
  | { type: 'SET_DOCK_SIZE'; size: DockSize }
  | { type: 'PATCH_NBODY'; patch: Partial<NBodyPreferences> }
  | { type: 'PATCH_FLUID'; patch: Partial<FluidPreferences> }
  | { type: 'RESET_BACKGROUND' }
  | { type: 'RESET_ALL' };

export type DesktopToolAppId = Exclude<DesktopAppId, 'home'>;

export type DesktopAppKind = 'dossier' | 'evidence' | 'lab' | 'world' | 'proof';

export interface DesktopAppDefinition {
  id: DesktopAppId;
  label: string;
  shortLabel: string;
  compactLabel: string;
  description: string;
  kind: DesktopAppKind;
  fallbackAnchor: `#${string}`;
  iconAsset: string;
  loadStrategy: 'eager' | 'lazy';
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type WindowSnapState = 'floating' | 'left' | 'right' | 'maximized';
export type WindowControlOwner = 'document' | 'app' | 'transition';

export interface WorkstationSessionState {
  focusedAppId: DesktopAppId;
  openAppIds: DesktopToolAppId[];
  minimizedAppIds: DesktopToolAppId[];
  windowStack: DesktopToolAppId[];
  boundsByApp: Partial<Record<DesktopToolAppId, WindowBounds>>;
  snapByApp: Partial<Record<DesktopToolAppId, WindowSnapState>>;
  controlOwner: WindowControlOwner;
}

export type WorkstationEvent =
  | { type: 'APP_OPENED'; appId: DesktopAppId; source: 'rail' | 'link' | 'ai' | 'history' }
  | { type: 'APP_FOCUSED'; appId: DesktopToolAppId }
  | { type: 'APP_MINIMIZED'; appId: DesktopAppId }
  | { type: 'DESKTOP_SHOWN' }
  | { type: 'APP_SNAPPED'; appId: DesktopAppId; snap: WindowSnapState }
  | { type: 'APP_MOVED'; appId: DesktopAppId; bounds: WindowBounds }
  | { type: 'UTILITY_OPENED'; utility: 'ai' | 'fx' };

export interface RenderedAppAsset {
  id: string;
  appId: DesktopAppId;
  src: string;
  width: number;
  height: number;
  alt: string;
  provenanceId: string;
  kind: 'rendered-icon' | 'poster' | 'glb';
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

export type Vector3Tuple = [number, number, number];
export type ResponsiveTier = 'desktop' | 'tablet' | 'mobile';
export type InteractionBounds = { left: number; top: number; right: number; bottom: number };

export type WorldAnchorOverride = Partial<Pick<WorldAnchorDefinition, 'worldOffset' | 'projectionDepth' | 'worldNormal' | 'interactionBounds'>>;

export type WorldAnchorDefinition = {
  id: string;
  elementId: string;
  chapterId: string;
  worldOffset: Vector3Tuple;
  projectionDepth: number;
  worldNormal: Vector3Tuple;
  interactionBounds?: InteractionBounds;
  occluderElementIds?: string[];
  responsive?: Partial<Record<'tablet' | 'mobile', WorldAnchorOverride>>;
};

export type ResolvedWorldAnchor = WorldAnchorDefinition & {
  screenRect: DOMRectReadOnly;
  worldPosition: Vector3Tuple;
  safeTextRects: DOMRectReadOnly[];
};

export type CameraShotOverride = Partial<Omit<CameraShotDefinition, 'id' | 'chapterId' | 'responsive'>>;

export type CameraLightingDefinition = {
  key: number;
  fill: number;
  environment: number;
  keyColor?: string;
  fillColor?: string;
};

export type CameraShotDefinition = {
  id: string;
  chapterId: string;
  position: Vector3Tuple;
  target: Vector3Tuple;
  fov: number;
  near: number;
  far: number;
  roll?: number;
  focusDistance?: number;
  dollyDistance?: number;
  orbitLimits?: { azimuth: [number, number]; polar: [number, number]; distance: [number, number] };
  exposure?: number;
  scrollRange: [number, number];
  transition: { duration: number; easing: string };
  safeTextRegionIds?: string[];
  lighting?: CameraLightingDefinition;
  characterFraming?: { scale: number; offset: Vector3Tuple };
  responsive?: Partial<Record<'tablet' | 'mobile', CameraShotOverride>>;
};

export type QualityTier = 'full' | 'balanced' | 'reduced' | 'static';

export type CameraLabSnapshot = {
  mode: 'intrinsics' | 'extrinsics' | 'optics' | 'stereo';
  intrinsics: { imageWidthPx: number; imageHeightPx: number; focalLengthMm: number; sensorWidthMm: number; sensorHeightMm: number; principalX: number; principalY: number; k1: number; k2: number };
  extrinsics: { camera: Vector3Tuple; yawDegrees: number; pitchDegrees: number; rollDegrees: number; object: Vector3Tuple };
  optics: { fNumber: number; focalLengthMm: number; objectDistanceMm: number; focusDistanceMm: number };
  stereo: { focalPx: number; baselineMeters: number; disparityPx: number; referenceDepthMeters: number };
};

export type PortfolioWorldEvent =
  | { type: 'INTERACTION_PRIMED'; sceneId: SceneId; source: 'visitor' }
  | { type: 'INTERACTION_CHANGED'; sceneId: SceneId; source: 'visitor'; detail: string }
  | { type: 'INTERACTION_RESET'; sceneId: SceneId; source: 'visitor' }
  | { type: 'EXPLORE_ENTERED'; sceneId: SceneId; source: 'visitor' }
  | { type: 'EXPLORE_EXITED'; sceneId: SceneId; source: 'visitor' }
  | { type: 'COURIER_STEP_COMPLETED'; chapterId: string; direction: 'forward' | 'reverse' }
  | { type: 'JOB_REORDERED'; oldMakespan: number; newMakespan: number; makespanDelta: number; order: string[] }
  | { type: 'MAP_MARKER_MOVED'; markerId: string; coordinates: [number, number]; selectedPlot: string; distance: number }
  | { type: 'PROJECT_OPENED'; projectId: string; selectedId: string; selectedIndex: number }
  | { type: 'CAMERA_CALIBRATED'; reprojectionError: number }
  | { type: 'STEREO_POINT_TRIANGULATED'; depthError: number }
  | { type: 'CAMERA_LAB_UPDATED'; snapshot: CameraLabSnapshot }
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
