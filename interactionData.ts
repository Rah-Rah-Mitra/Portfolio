import type { InteractionDefinition, InteractionFallback, SceneId, SemanticFallbackAnchor } from './types';

export type InteractionCapabilities = {
  quickScan: boolean;
  reducedMotion: boolean;
  webglAvailable: boolean;
};

export type InteractionResponse = {
  mode: 'interactive' | 'semantic';
  responseTarget: InteractionFallback['responseTarget'];
  message: string;
};

export type InteractionValidation = {
  valid: boolean;
  issues: string[];
};

const sceneIds: SceneId[] = [
  'calibration',
  'systems-in-motion',
  'spatial-systems',
  'selected-work',
  'camera-laboratory',
  'departure',
];

export const semanticFallbackAnchors: readonly SemanticFallbackAnchor[] = [
  '#home',
  '#experience',
  '#all-work',
  '#work',
  '#technical-lab',
  '#contact',
];

export const interactionDefinitions: InteractionDefinition[] = [
  {
    id: 'calibration',
    title: 'Calibration',
    purpose: 'Orient visitors to the evidence-led laboratory journey.',
    model: 'Optical Courier arrival and guide calibration.',
    primaryManipulation: 'Choose Guided Story or Explore.',
    secondaryDetail: 'Read the evidence index and journey cue.',
    ambientMotion: 'Subtle calibration field only when motion is allowed.',
    characterReaction: 'Idle calibration acknowledgement.',
    controls: [{ owner: 'visitor', control: 'Guided Story / Explore', resetLabel: 'Return to Guided Story', keyboardShortcut: 'Escape' }],
    fallback: { responseTarget: '#home', message: 'Read the portfolio overview and evidence index.' },
    testCoverage: ['semantic overview', 'Quick Scan', 'reduced motion'],
  },
  {
    id: 'systems-in-motion',
    title: 'Systems in Motion',
    purpose: 'Explain the fixed flow-shop model through direct manipulation.',
    model: 'Three-job, two-machine permutation flow-shop.',
    primaryManipulation: 'Reorder jobs and inspect the resulting schedule.',
    secondaryDetail: 'Inspect completion times, idle time, and critical operation.',
    ambientMotion: 'Measured schedule transitions only.',
    characterReaction: 'Inspects the active schedule.',
    controls: [{ owner: 'visitor', control: 'Job order', resetLabel: 'Reset schedule', keyboardShortcut: 'Escape' }],
    fallback: { responseTarget: '#experience', message: 'Read the operational systems evidence and accessible schedule table.' },
    testCoverage: ['all permutations', 'keyboard reorder', 'accessible Gantt table'],
  },
  {
    id: 'spatial-systems',
    title: 'Spatial Systems',
    purpose: 'Demonstrate synthetic site-allocation reasoning without proprietary claims.',
    model: 'Synthetic allocation markers, route, and eligible plots.',
    primaryManipulation: 'Move the marker and compare eligible plots.',
    secondaryDetail: 'Toggle layers and inspect distance calculations.',
    ambientMotion: 'Static by default; marker response is input-driven.',
    characterReaction: 'Points toward the selected eligible plot.',
    controls: [{ owner: 'visitor', control: 'Marker position and layers', resetLabel: 'Reset site marker', keyboardShortcut: 'Escape' }],
    fallback: { responseTarget: '#all-work', message: 'Read the synthetic spatial-systems explanation and data table.' },
    testCoverage: ['geometry', 'touch parity', 'table fallback'],
  },
  {
    id: 'selected-work',
    title: 'Selected Work',
    purpose: 'Connect interaction to Rahul Mitra’s factual project evidence.',
    model: 'Semantic project diagrams with optional controlled detail.',
    primaryManipulation: 'Scrub a documented pipeline or expand an architecture.',
    secondaryDetail: 'Read ordered diagrams, outcomes, and proof links.',
    ambientMotion: 'Off when constrained; never required for understanding.',
    characterReaction: 'Inspects the currently expanded evidence.',
    controls: [{ owner: 'visitor', control: 'Pipeline scrub and detail expansion', resetLabel: 'Reset selected-work detail', keyboardShortcut: 'Escape' }],
    fallback: { responseTarget: '#work', message: 'Read the selected-work evidence and project links.' },
    testCoverage: ['ordered semantic diagrams', 'Reset', 'project links'],
  },
  {
    id: 'camera-laboratory',
    title: 'Camera Laboratory',
    purpose: 'Teach camera geometry with clearly labelled, non-professional experiments.',
    model: 'Intrinsics, extrinsics, optics, and stereo equations.',
    primaryManipulation: 'Adjust one camera variable at a time.',
    secondaryDetail: 'Compare presets, equations, and computed results.',
    ambientMotion: 'Paused for Quick Scan, reduced motion, and static fallback.',
    characterReaction: 'Calibrates the active camera mode.',
    controls: [{ owner: 'visitor', control: 'Camera parameter controls', resetLabel: 'Reset Camera Laboratory', keyboardShortcut: 'Escape' }],
    fallback: { responseTarget: '#technical-lab', message: 'Open the Camera Laboratory evidence and equations.' },
    testCoverage: ['pure math', 'presets', 'keyboard controls', 'semantic fallback'],
  },
  {
    id: 'departure',
    title: 'Departure',
    purpose: 'Close the journey without gating contact or resume actions.',
    model: 'Optical iris acknowledgement around visible handoff links.',
    primaryManipulation: 'Replay or reset the optional departure treatment.',
    secondaryDetail: 'Read contact options and select a role-targeted resume.',
    ambientMotion: 'Disabled in Quick Scan and reduced-motion paths.',
    characterReaction: 'Signals a short successful handoff.',
    controls: [{ owner: 'visitor', control: 'Replay departure', resetLabel: 'Reset departure', keyboardShortcut: 'Escape' }],
    fallback: { responseTarget: '#contact', message: 'Open contact options and role-targeted resumes.' },
    testCoverage: ['visible contact actions', 'Replay', 'reduced motion'],
  },
];

export const validateInteractionDefinitions = (definitions: readonly InteractionDefinition[]): InteractionValidation => {
  const issues: string[] = [];
  const ids = new Set<string>();

  definitions.forEach((definition) => {
    if (ids.has(definition.id)) issues.push(`${definition.id} is duplicated`);
    ids.add(definition.id);
    if (!semanticFallbackAnchors.includes(definition.fallback.responseTarget)) {
      issues.push(definition.fallback.responseTarget.startsWith('#')
        ? `${definition.id} fallback responseTarget must target a published semantic fallback anchor`
        : `${definition.id} fallback responseTarget must be an in-page anchor`);
    }
  });

  sceneIds.forEach((id) => {
    if (!ids.has(id)) issues.push(`${id} definition is required`);
  });

  return { valid: issues.length === 0, issues };
};

export const resolveInteractionResponse = (
  definition: InteractionDefinition,
  capabilities: InteractionCapabilities,
): InteractionResponse => ({
  mode: capabilities.quickScan || capabilities.reducedMotion || !capabilities.webglAvailable ? 'semantic' : 'interactive',
  responseTarget: definition.fallback.responseTarget,
  message: definition.fallback.message,
});
