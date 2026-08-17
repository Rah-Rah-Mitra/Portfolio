import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('deferred synthetic calibration study', () => {
  it('keeps generated study outputs outside the public build until launch gates pass', () => {
    expect(existsSync(new URL('../public/lab/study.json', import.meta.url))).toBe(false);
    const generator = readFileSync(new URL('../scripts/perception/build_synthetic_study.py', import.meta.url), 'utf8');
    expect(generator).not.toMatch(/OUTPUT\s*=\s*ROOT\s*\/\s*["']public["']/);
    expect(generator).toMatch(/deferred/i);
  });
});
