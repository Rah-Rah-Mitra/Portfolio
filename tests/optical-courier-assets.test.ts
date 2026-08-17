import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import manifest from '../workflows/optical-courier/prompt-manifest.json';
import validationReport from '../assets/optical-courier/pre-mixamo/validation-report.json';
import proofReport from '../assets/optical-courier/proofs/hunyuan-proof-report.json';
import { COURIER_ASSET_CONTRACT } from '../world/courierAssetContract';
import { validateCourierManifest, validatePreMixamoReport } from '../lib/courierAssetValidation';

const repoPath = (relativePath: string) => new URL(`../${relativePath}`, import.meta.url);
const sha256 = (relativePath: string) => createHash('sha256').update(readFileSync(repoPath(relativePath))).digest('hex');

describe('Optical Courier pre-rig production checkpoint', () => {
  it('preserves three fixed-seed candidates and complete selected-output provenance', () => {
    expect(validateCourierManifest(manifest)).toEqual({ valid: true, issues: [] });
    expect(manifest.status).toBe('pre-rig-ready');
    expect(manifest.generations).toHaveLength(3);
    expect(new Set(manifest.generations.map((generation) => generation.seed)).size).toBe(3);
    expect(manifest.selectedCandidateId).toBeTruthy();

    for (const output of manifest.selectedOutputs) {
      expect(existsSync(repoPath(output.path))).toBe(true);
      expect(sha256(output.path)).toBe(output.sha256);
    }
  });

  it('records the visual review without forbidden props or unsupported rig claims', () => {
    const selected = manifest.generations.find((generation) => generation.id === manifest.selectedCandidateId);
    expect(selected?.review.approved).toBe(true);
    expect(selected?.review.forbiddenPropsObserved).toEqual([]);
    expect(selected?.review.viewConsistency).toMatch(/front.*left.*back/i);
    expect(manifest.negativePrompt).toContain('hard hat');
    expect(manifest.mixamo.status).toBe('blocked-chrome-control');
    expect(manifest.mixamo.rigged).toBe(false);
  });

  it('ships a clean connected upload-ready FBX contract while keeping the runtime fallback', () => {
    expect(validatePreMixamoReport(validationReport)).toEqual({ valid: true, issues: [] });
    expect(validationReport.geometry.primaryConnectedComponents).toBe(1);
    expect(validationReport.geometry.nonManifoldEdges).toBe(0);
    expect(validationReport.geometry.headRatio).toBeGreaterThanOrEqual(6.9);
    expect(validationReport.geometry.headRatio).toBeLessThanOrEqual(7.6);
    expect(existsSync(repoPath(COURIER_ASSET_CONTRACT.preMixamoSource))).toBe(true);
    expect(COURIER_ASSET_CONTRACT.productionGlb).toBeNull();
    expect(COURIER_ASSET_CONTRACT.runtimeFallback).toBe('procedural-optical-courier');
  });

  it('records a measured Hunyuan proof decision instead of promoting voxel topology by appearance', () => {
    expect(proofReport.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(proofReport.inspection).toMatchObject({ connectedComponents: expect.any(Number), nonManifoldEdges: expect.any(Number) });
    expect(['accepted-for-deformation', 'rejected-for-deformation']).toContain(proofReport.decision);
    if (proofReport.decision === 'rejected-for-deformation') {
      expect(proofReport.reasons.length).toBeGreaterThan(0);
      expect(manifest.geometrySource).toBe('blender-procedural-shell');
    }
  });

  it('does not track model weights, browser state, or raw Mixamo downloads', () => {
    const listing = spawnSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
    if (listing.status !== 0) {
      const ignoreRules = readFileSync(repoPath('.gitignore'), 'utf8');
      expect(ignoreRules).toMatch(/assets\/optical-courier\/raw-mixamo\//);
      expect(ignoreRules).toMatch(/assets\/optical-courier\/browser-state\//);
      expect(ignoreRules).toMatch(/assets\/optical-courier\/hunyuan-raw\//);
      return;
    }
    const tracked = listing.stdout.split('\0').filter(Boolean);
    const forbidden = tracked.filter((path) =>
      /(^|\/)(raw-mixamo|browser-state|cookies?|tokens?)(\/|$)/i.test(path)
      || /\.(safetensors|ckpt|pt|pth|bin)$/i.test(path),
    );
    expect(forbidden).toEqual([]);
  });
});
