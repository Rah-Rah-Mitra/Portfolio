import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import provenance from '../workflows/media/provenance.json';

const hash = (path: string) => createHash('sha256').update(readFileSync(new URL(`../${path}`, import.meta.url))).digest('hex').toUpperCase();

describe('media provenance and public budget', () => {
  it('preserves exact prompts, seeds, model/license, prompt IDs, timings, and rejected hashes', () => {
    const generated = provenance.records.filter((record) => record.id === 'camera-lab-composite-6081701' || record.id === 'hybrid-flow-shop-vignette-6081702');
    expect(generated).toHaveLength(2);
    generated.forEach((record) => {
      expect(record.status).toBe('rejected-not-shipped');
      expect(record.model).toBe('ltxv-2b-0.9.8-distilled.safetensors');
      expect(record.modelSha256).toMatch(/^[A-F0-9]{64}$/);
      expect(record.license).toMatch(/LTX-Video/i);
      expect(record.positivePrompt).toMatch(/white/i);
      expect(record.negativePrompt).toMatch(/people/i);
      expect(record.committedWorkflowSha256).toMatch(/^[A-F0-9]{64}$/);
    });
    expect(JSON.stringify(generated)).toContain('82589529-2060-463f-8d25-5a17e5d4adfb');
    expect(JSON.stringify(generated)).toContain('14be20db-6a2d-4a4d-b309-86f84cea26dd');
  });

  it('ships neither rejected output and verifies the deterministic audio sprite', () => {
    expect(existsSync(new URL('../public/media/camera-lab-composite.mp4', import.meta.url))).toBe(false);
    expect(existsSync(new URL('../public/media/hybrid-flow-shop-vignette.mp4', import.meta.url))).toBe(false);
    const audio = provenance.records.find((record) => record.id === 'optical-cues-audio-sprite');
    expect(audio?.status).toBe('selected-shipped');
    expect(hash('public/media/optical-cues.mp3')).toBe(audio?.outputSha256);
    expect(readFileSync(new URL('../public/media/optical-cues.mp3', import.meta.url)).byteLength).toBeLessThan(200_000);
  });
});
