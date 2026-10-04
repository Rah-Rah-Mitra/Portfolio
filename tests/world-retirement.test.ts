import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

// The pre-2026-09 "continuous field test" UI (workstation shell, appearance
// system, optical world and Courier, ASCII background) was deleted in the
// 2026-10 sweep. What could be adapted lives on as the FX desk backdrops, the
// Systems Lab drop test and flow-shop bench, and the Camera Lab. This file
// keeps the deletion from quietly coming back, and keeps the docs honest
// about what ships.
const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');
const exists = (path: string) => existsSync(new URL(path, import.meta.url));

describe('retired field-test UI', () => {
  it('stays deleted, with its engines gone from the dependency list', async () => {
    [
      '../components/PortfolioExperience.tsx',
      '../components/WorkstationShell.tsx',
      '../components/OpticalBenchWorld.tsx',
      '../components/PortfolioWorld.tsx',
      '../components/BreakableText.tsx',
      '../contexts/AppearanceContext.tsx',
      '../contexts/WorkstationContext.tsx',
      '../lib/appearance.ts',
      '../world',
      '../fieldTestData.ts',
    ].forEach((path) => expect(exists(path), path).toBe(false));

    const pkg = JSON.parse(await read('../package.json')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    ['three', '@types/three', 'gsap', 'motion', '@chenglou/pretext', 'qrcode'].forEach((name) => expect(deps[name], name).toBeUndefined());
    // matter-js stays for one reason: the Systems Lab drop test.
    expect(deps['matter-js']).toBeDefined();
    expect(Object.keys(pkg.scripts).filter((name) => /courier|merge-shots/.test(name))).toEqual([]);
  });

  it('keeps the live layers free of the retired world and word physics', async () => {
    const [physicsContext, ...active] = await Promise.all([
      '../contexts/PhysicsContext.tsx',
      '../App.tsx',
      '../components/AskThePage.tsx',
      '../components/EffectsLabPanel.tsx',
      '../components/workbench/FieldWorkbench.tsx',
      '../server/pageAgent.mjs',
    ].map(read));

    expect(physicsContext).not.toMatch(/WorldQuality|worldOpen|openWorld|registerWords|pretext|isInteractionActive/);
    expect(active.join('\n')).not.toMatch(/Optical Courier|optical test bench|Three\.js|renders on demand|startNpcDialogue|\bnpcIds\b|Spatial portfolio map/i);
  });

  it('documents the Field Workbench as what ships', async () => {
    const [product, design, readme, claude, surface] = await Promise.all([
      '../PRODUCT.md',
      '../DESIGN.md',
      '../README.md',
      '../CLAUDE.md',
      '../.impeccable/surfaces/index-html.md',
    ].map(read));

    expect(product).toContain('Field Workbench');
    expect(product).toContain('Matter.js (the Systems Lab drop test)');
    expect(product).not.toMatch(/optical test bench|Optical Courier|Explore World|Quick Scan is/i);
    expect(product).toContain('Do not fabricate experience');

    expect(design).toContain('Field Workbench');
    expect(design).not.toMatch(/Dark Optical Desktop|Optical Courier|Shared Optical World|Archivo/);

    expect(readme).toContain('# Rahul Mitra — Field Workbench');
    expect(readme).not.toMatch(/Optical Courier|optical-test-bench|Explore World/);

    expect(claude).not.toContain('unmounted but still on disk');
    expect(surface).toContain('Field Workbench');
    expect(surface).not.toMatch(/precision-retro|selector assembly|Courier reactions/i);
  });
});
