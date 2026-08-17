import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('direct-manipulation touch policy', () => {
  it('allows native vertical panning on the spatial marker and never declares touch-action none', () => {
    const stylesheet = readFileSync(new URL('../field-test.css', import.meta.url), 'utf8');
    const markerRule = stylesheet.match(/\.spatial-marker\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    expect(markerRule).toMatch(/touch-action:\s*pan-y\s*;/);
    expect(markerRule).not.toMatch(/touch-action:\s*none\s*;/);
  });
});
