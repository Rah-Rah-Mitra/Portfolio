import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CameraLab } from '../components/workbench/CameraLab';

// The prerender guard: this project runs in node, where `window` is undefined,
// exactly as it is when App is prerendered. The SSR output must already be the
// complete default Intrinsics view — real SVG, real numbers, real text.

describe('Camera Lab prerender', () => {
  it('renders the default Intrinsics view without a browser', () => {
    expect(typeof window).toBe('undefined');
    const markup = renderToString(React.createElement(CameraLab));

    expect(markup).toContain('role="tablist"');
    expect(markup.match(/role="tab"/g)).toHaveLength(4);
    expect(markup).toMatch(/aria-selected="true"[^>]*id="cam-tab-intrinsics"|id="cam-tab-intrinsics"[^>]*aria-selected="true"/);
    expect(markup).toContain('Where does a ray land on the sensor?');
    expect(markup).toContain('1400');
    expect(markup).toContain('54.4');
    expect(markup).toContain('FIG. 06 ');
    expect(markup).toContain('FIG. 06b');
    expect(markup).toContain('Not yet run');
    expect(markup).toContain('Synthetic, deterministic');
    expect(markup).toContain('not project evidence');
    expect(markup).toContain('CS4277');
    // Plan, image, chart and six calibration thumbnails.
    expect((markup.match(/role="img"/g) ?? []).length).toBeGreaterThanOrEqual(9);
    // Exactly two hoists: FieldWorkbench caches them when the window opens.
    expect(markup.match(/data-hoist=/g)).toHaveLength(2);
  });

  it('carries no canvas and no hard-coded colour', () => {
    const markup = renderToString(React.createElement(CameraLab));
    expect(markup).not.toContain('<canvas');
    expect(markup).not.toMatch(/(fill|stroke|style)="[^"]*#[0-9a-fA-F]{3,8}\b/);
    expect(markup).not.toMatch(/NaN|Infinity/);
  });

  it('renders identically twice (stable hydration)', () => {
    expect(renderToString(React.createElement(CameraLab))).toBe(renderToString(React.createElement(CameraLab)));
  });
});
