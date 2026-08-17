import { describe, expect, it } from 'vitest';
import {
  interactionDefinitions,
  resolveInteractionResponse,
  validateInteractionDefinitions,
} from '../interactionData';
import type { InteractionDefinition, SemanticFallbackAnchor } from '../types';

describe('interactive optical test bench contract', () => {
  it('keeps all six scenes semantically reachable when optional rendering is unavailable', () => {
    const validation = validateInteractionDefinitions(interactionDefinitions);

    expect(validation).toEqual({ valid: true, issues: [] });
    expect(interactionDefinitions.map((scene) => scene.id)).toEqual([
      'calibration',
      'systems-in-motion',
      'spatial-systems',
      'selected-work',
      'camera-laboratory',
      'departure',
    ]);
    expect(interactionDefinitions.every((scene) => scene.fallback.responseTarget.startsWith('#'))).toBe(true);
  });

  it('routes constrained visitors to the documented semantic fallback', () => {
    const cameraLaboratory = interactionDefinitions.find((scene) => scene.id === 'camera-laboratory');
    if (!cameraLaboratory) throw new Error('camera-laboratory definition is required');

    expect(resolveInteractionResponse(cameraLaboratory, {
      quickScan: true,
      reducedMotion: false,
      webglAvailable: true,
    })).toEqual({
      mode: 'semantic',
      responseTarget: '#technical-lab',
      message: 'Open the Camera Laboratory evidence and equations.',
    });
  });

  it('rejects a scene whose fallback would hide evidence outside a semantic anchor', () => {
    const invalidDefinitions: InteractionDefinition[] = interactionDefinitions.map((scene) => (
      scene.id === 'departure'
        ? { ...scene, fallback: { ...scene.fallback, responseTarget: 'world-canvas' as SemanticFallbackAnchor } }
        : scene
    ));

    expect(validateInteractionDefinitions(invalidDefinitions)).toEqual({
      valid: false,
      issues: ['departure fallback responseTarget must be an in-page anchor'],
    });
  });

  it('rejects an unknown in-page target that is not a published semantic fallback anchor', () => {
    const invalidDefinitions: InteractionDefinition[] = interactionDefinitions.map((scene) => (
      scene.id === 'departure'
        ? { ...scene, fallback: { ...scene.fallback, responseTarget: '#world-canvas' as SemanticFallbackAnchor } }
        : scene
    ));

    expect(validateInteractionDefinitions(invalidDefinitions)).toEqual({
      valid: false,
      issues: ['departure fallback responseTarget must target a published semantic fallback anchor'],
    });
  });

  it.each([
    ['reduced motion', { quickScan: false, reducedMotion: true, webglAvailable: true }],
    ['no WebGL', { quickScan: false, reducedMotion: false, webglAvailable: false }],
  ] as const)('routes every scene to semantic evidence for %s', (_condition, capabilities) => {
    interactionDefinitions.forEach((scene) => {
      expect(resolveInteractionResponse(scene, capabilities)).toMatchObject({
        mode: 'semantic',
        responseTarget: scene.fallback.responseTarget,
      });
    });
  });
});
