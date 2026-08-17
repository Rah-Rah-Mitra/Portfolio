import { GuideChapter, ProjectMedia } from './types';

export const calibrationMedia: ProjectMedia = {
  id: 'field-calibration-ambient',
  kind: 'video',
  posterSrc: '/media/field-calibration-poster.webp',
  webmSrc: '/media/field-calibration.webm',
  mp4Src: '/media/field-calibration.mp4',
  durationSeconds: 4.04,
  width: 768,
  height: 512,
  alt: 'Graphite survey cameras in a white calibration laboratory with false-color tracking overlays.',
  transcript: 'A slow lateral camera move passes multiple survey-camera rigs in a bright laboratory. Sparse false-color green and violet tracking fields move across the equipment. No people, speech, or text appear.',
  workflowId: 'ltxv-fast-t2v-distilled-4837376',
  loadPriority: 'near-viewport',
};

export const guideChapters: GuideChapter[] = [
  { sectionId: 'home', label: 'Overview', cue: 'idle', pathProgress: 0.03, camera: [0, 1.4, 5.2], annotation: 'Establish the operating position', reducedMotionLabel: 'Field engineer at origin' },
  { sectionId: 'work', label: 'Selected work', cue: 'inspect', pathProgress: 0.18, camera: [1.2, 1.1, 4.6], annotation: 'Inspect representative systems', reducedMotionLabel: 'Field engineer inspecting selected work' },
  { sectionId: 'experience', label: 'Experience', cue: 'walk', pathProgress: 0.34, camera: [-0.8, 1.25, 4.8], annotation: 'Follow professional delivery', reducedMotionLabel: 'Field engineer following the experience path' },
  { sectionId: 'all-work', label: 'All projects', cue: 'inspect', pathProgress: 0.49, camera: [0.7, 1.05, 4.4], annotation: 'Traverse the complete evidence set', reducedMotionLabel: 'Field engineer reviewing the project index' },
  { sectionId: 'technical-lab', label: 'Technical lab', cue: 'calibrate', pathProgress: 0.64, camera: [-1.1, 1.35, 4.3], annotation: 'Calibrate perception and pose', reducedMotionLabel: 'Field engineer calibrating a camera rig' },
  { sectionId: 'domains', label: 'Capabilities', cue: 'walk', pathProgress: 0.76, camera: [0.9, 1.15, 4.9], annotation: 'Connect methods to evidence', reducedMotionLabel: 'Field engineer crossing capability stations' },
  { sectionId: 'proof', label: 'Proof', cue: 'inspect', pathProgress: 0.88, camera: [-0.5, 1.2, 4.6], annotation: 'Verify awards and credentials', reducedMotionLabel: 'Field engineer verifying proof' },
  { sectionId: 'contact', label: 'Contact', cue: 'idle', pathProgress: 0.98, camera: [0, 1.4, 5.2], annotation: 'Complete the handoff', reducedMotionLabel: 'Field engineer at the handoff point' },
];
