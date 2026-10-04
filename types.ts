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
  /** Where the note is surfaced — not the issuer. A certification's issuer lives
   *  on its Certification record in lib/certifications.ts. */
  source: 'LinkedIn' | 'GitHub' | 'Portfolio' | 'Education';
  /** Certification notes only: the lib/certifications.ts id this note describes.
   *  dateLabel and sortDate are derived from it, so the two cannot drift. */
  certId?: string;
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
  | 'resumes-contact'
  | 'resume-builder';

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

export type DesktopAppKind = 'dossier' | 'evidence' | 'lab' | 'world' | 'proof';

export interface DesktopAppDefinition {
  id: DesktopAppId;
  label: string;
  shortLabel: string;
  kind: DesktopAppKind;
  fallbackAnchor: `#${string}`;
}

// The two labs that send LAB_RESET. The ids predate the workbench (they named
// scenes of the retired field test) and are kept so the payload stays stable.
export type SceneId = 'systems-in-motion' | 'camera-laboratory';

export type Vector3Tuple = [number, number, number];

export type CameraLabSnapshot = {
  mode: 'intrinsics' | 'extrinsics' | 'optics' | 'stereo';
  intrinsics: { imageWidthPx: number; imageHeightPx: number; focalLengthMm: number; sensorWidthMm: number; sensorHeightMm: number; principalX: number; principalY: number; k1: number; k2: number };
  extrinsics: { camera: Vector3Tuple; yawDegrees: number; pitchDegrees: number; rollDegrees: number; object: Vector3Tuple };
  optics: { fNumber: number; focalLengthMm: number; objectDistanceMm: number; focusDistanceMm: number };
  stereo: { focalPx: number; baselineMeters: number; disparityPx: number; referenceDepthMeters: number };
};

// Discrete lab and window outcomes, dispatched through lib/worldEvents.ts.
// AudioSpriteController maps them to sound cues (lib/audioPolicy.ts).
export type PortfolioWorldEvent =
  | { type: 'JOB_REORDERED'; oldMakespan: number; newMakespan: number; makespanDelta: number; order: string[] }
  | { type: 'CAMERA_CALIBRATED'; reprojectionError: number }
  | { type: 'STEREO_POINT_TRIANGULATED'; depthError: number }
  | { type: 'CAMERA_LAB_UPDATED'; snapshot: CameraLabSnapshot }
  | { type: 'LAB_RESET'; sceneId?: SceneId }
  | { type: 'WORKBENCH_WINDOW'; appId: DesktopAppId; action: 'open' | 'close' }
  | { type: 'DROP_TEST_STRUCK'; mode: 'smash' | 'gravity'; bodies: number }
  | { type: 'SCHEDULE_SOLVED'; method: string; makespan: number; optimal: boolean };
