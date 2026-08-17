import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('retired separate spatial world', () => {
  it('has no modal component or legacy world API in production sources', async () => {
    const retiredWorld = new URL('../components/PortfolioWorld.tsx', import.meta.url);
    const physicsContext = await readFile(new URL('../contexts/PhysicsContext.tsx', import.meta.url), 'utf8');
    const activeSources = await Promise.all([
      '../App.tsx',
      '../components/AskThePage.tsx',
      '../components/EffectsLabPanel.tsx',
      '../components/PortfolioExperience.tsx',
      '../server/pageAgent.mjs',
    ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')));

    expect(existsSync(retiredWorld)).toBe(false);
    expect(physicsContext).not.toMatch(/WorldQuality|worldOpen|openWorld|closeWorld|setWorldQuality|\bworld:\s*\{/);
    expect(activeSources.join('\n')).not.toMatch(/Spatial portfolio map|optional spatial layer|className="portfolio-world(?:\s|")|Three\.js spatial world|startNpcDialogue|\bnpcIds\b/i);
  });

  it('documents Explore World as a pending shared anchor rather than a shipped modal', async () => {
    const product = await readFile(new URL('../PRODUCT.md', import.meta.url), 'utf8');
    const design = await readFile(new URL('../DESIGN.md', import.meta.url), 'utf8');

    expect(product).toContain('shared optical test bench');
    expect(product).not.toMatch(/lazy-loaded Three\.js spatial world|optional spatial world/i);
    expect(design).toContain('Explore World');
    expect(design).toContain('Quick Scan');
    expect(design).not.toContain('Spatial World');
  });

  it('keeps active copy and design metadata free of shipped separate-world claims', async () => {
    const designSidecarUrl = new URL('../.impeccable/design.json', import.meta.url);
    const [siteConfig, readme, historicalPrompt] = await Promise.all([
      '../siteConfig.ts',
      '../README.md',
      '../SPATIAL_WORLD_UPGRADE_PROMPT.md',
    ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
    const designSidecar = existsSync(designSidecarUrl) ? await readFile(designSidecarUrl, 'utf8') : null;

    expect(siteConfig).toContain('Go to the Explore World optical test bench anchor.');
    expect(siteConfig).not.toContain('Open the spatial portfolio world.');
    expect(readme).toContain('shared `#world` optical-test-bench anchor');
    expect(readme).not.toMatch(/Spatial World (?:is|are)|and Spatial World are optional/i);
    if (designSidecar) {
      expect(designSidecar).toContain('Explore World');
      expect(designSidecar).not.toContain('Spatial World');
    }
    expect(historicalPrompt).toContain('Superseded historical migration input');
    expect(historicalPrompt).toContain(
      'All remaining Build/Secure and lens references below are historical and non-executable; the current product has no lenses.',
    );
    expect(historicalPrompt).toContain('Retired source at the time');
    expect(historicalPrompt).not.toMatch(/Current world:|Baseline current world|existing Portfolio World|Upgrade the lazy-loaded Three\.js Portfolio World/i);
  });
});
