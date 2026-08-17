import { expect, test } from '@playwright/test';

const viewports = [
  { width: 1440, height: 1000 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 800 },
];

for (const viewport of viewports) {
  test(`Guided and Quick Scan preserve the reading column at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    for (const path of ['/', '/?mode=scan']) {
      await page.goto(path);
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
      await expect(page.getByRole('heading', { level: 1, name: 'Intelligent systems, made operational.' })).toBeVisible();
      await expect(page.getByRole('link', { name: /Download résumé/ })).toBeVisible();
    }
  });
}

test('desktop hero copy starts below the sticky header', async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const geometry = await page.evaluate(() => ({
      headerBottom: document.querySelector('.portfolio-header')?.getBoundingClientRect().bottom ?? 0,
      headingTop: document.querySelector('#portfolio-title')?.getBoundingClientRect().top ?? 0,
      heroBottom: document.querySelector('.portfolio-hero')?.getBoundingClientRect().bottom ?? 0,
      stageBottom: document.querySelector('.hero-world-stage')?.getBoundingClientRect().bottom ?? 0,
    }));
    expect(geometry.headingTop).toBeGreaterThanOrEqual(geometry.headerBottom);
    expect(geometry.stageBottom).toBeLessThanOrEqual(geometry.heroBottom);
  }
});

test('the first recruiter view names recent experience and two leading projects', async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const path of ['/', '/?mode=scan']) {
      await page.goto(path);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      const firstView = await page.evaluate(() => {
        const header = document.querySelector('.portfolio-header')?.getBoundingClientRect();
        const heading = document.querySelector('#portfolio-title')?.getBoundingClientRect();
        return {
          scrollY: window.scrollY,
          header: header ? { top: header.top, bottom: header.bottom } : null,
          heading: heading ? { top: heading.top, bottom: heading.bottom } : null,
        };
      });
      expect(firstView.scrollY).toBe(0);
      expect(firstView.header).not.toBeNull();
      expect(firstView.header!.top).toBeGreaterThanOrEqual(0);
      expect(firstView.header!.bottom).toBeLessThanOrEqual(viewport.height);
      expect(firstView.heading).not.toBeNull();
      expect(firstView.heading!.top).toBeGreaterThanOrEqual(firstView.header!.bottom);
      expect(firstView.heading!.bottom).toBeLessThanOrEqual(viewport.height);
      const proof = page.getByLabel('Current proof');
      await expect(proof).toContainText('Abbott');
      await expect(proof).toContainText('Hybrid Flow Shop');
      await expect(proof).toContainText('Churp');
      await expect(proof).toContainText('OnTheSpectrum');
      const bottom = await proof.evaluate((element) => element.getBoundingClientRect().bottom);
      expect(bottom).toBeLessThanOrEqual(viewport.height);
    }
  }
});

test('offscreen optical world is visually dormant while recruiter evidence is read', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const world = page.locator('.optical-world-canvas');
  await expect(world).toBeAttached();
  await expect(world).not.toHaveAttribute('data-scene-visible', '');
  await expect(world).toHaveCSS('opacity', '0');
});

test('active technical layers cannot wash through semantic headings or sticky project controls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const projectControls = page.locator('.project-controls');
  await projectControls.scrollIntoViewIfNeeded();
  await expect(projectControls).toHaveCSS('background-color', 'rgb(255, 255, 255)');

  const worldHeading = page.locator('.portfolio-world-mount > header');
  await worldHeading.scrollIntoViewIfNeeded();
  await expect(worldHeading).toHaveCSS('position', 'relative');
  await expect(worldHeading).toHaveCSS('z-index', '1');
  await expect(worldHeading).toHaveCSS('background-color', 'rgb(255, 255, 255)');

  const worldSurface = page.locator('.optical-world');
  await worldSurface.scrollIntoViewIfNeeded();
  await expect(page.locator('.optical-world-canvas')).toHaveAttribute('data-scene-visible', '');
  await page.locator('#domains').scrollIntoViewIfNeeded();
  await page.waitForTimeout(50);
  const departingOpacity = Number(await page.locator('.optical-world-canvas').evaluate((element) => getComputedStyle(element).opacity));
  expect(departingOpacity).toBeLessThanOrEqual(0.01);
});

test('forced-colors preserves visible controls and keyboard focus', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/?mode=scan');
  const selectedWork = page.getByRole('link', { name: 'View selected work' });
  await selectedWork.focus();
  await expect(selectedWork).toBeFocused();
  await expect(page.getByRole('button', { name: 'Quick Scan' })).toBeVisible();
});

test('all Camera Laboratory modes, examples, resets, and Courier reactions remain wired', async ({ page }) => {
  await page.goto('/');
  const world = page.locator('.optical-world');
  await expect(world).toBeAttached();
  const flowShop = page.getByRole('region', { name: 'Systems in Motion' });
  await flowShop.scrollIntoViewIfNeeded();
  await flowShop.getByRole('button', { name: 'Move job C earlier' }).click();
  await expect(world).toHaveAttribute('data-reaction', 'point-bottleneck');

  const spatial = page.getByRole('region', { name: 'Spatial Systems' });
  await spatial.scrollIntoViewIfNeeded();
  await spatial.getByRole('slider', { name: 'Marker X coordinate' }).fill('82');
  await expect(world).toHaveAttribute('data-reaction', 'inspect-marker');

  const inspector = page.locator('#selected-on-the-spectrum').getByRole('region', { name: 'OnTheSpectrum architecture' });
  await inspector.scrollIntoViewIfNeeded();
  await inspector.getByRole('button', { name: 'Inspect Three.js playable-world QA' }).click();
  await expect(world).toHaveAttribute('data-reaction', 'inspect-project');

  const lab = page.getByRole('region', { name: 'Camera Laboratory', exact: true });
  await lab.scrollIntoViewIfNeeded();
  await lab.getByRole('spinbutton', { name: 'Focal length (mm)' }).fill('50');
  await expect(world).toHaveAttribute('data-reaction-alias', /success|puzzled/);
  const modes = [
    ['Intrinsics', 'Intrinsics results', 'Load Intrinsics example', 'Reset Intrinsics'],
    ['Extrinsics', 'Extrinsics results', 'Load Extrinsics example', 'Reset Extrinsics'],
    ['Optics', 'Optics results', 'Load Optics example', 'Reset Optics'],
    ['Stereo', 'Stereo results', 'Load Stereo example', 'Reset Stereo'],
  ] as const;
  for (const [mode, table, example, reset] of modes) {
    await lab.getByRole('tab', { name: mode }).click();
    await expect(lab.getByRole('table', { name: table })).toBeVisible();
    await lab.getByRole('button', { name: example }).click();
    await lab.getByRole('button', { name: reset }).click();
  }
});

test('offscreen optical world does not sustain an idle render loop', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.optical-world canvas')).toHaveCount(1);
  await page.waitForTimeout(1_200);
  await page.evaluate(() => {
    (window as Window & { __qualityWorldFrames?: number }).__qualityWorldFrames = 0;
    window.addEventListener('portfolio:world-frame', () => {
      const qualityWindow = window as Window & { __qualityWorldFrames?: number };
      qualityWindow.__qualityWorldFrames = (qualityWindow.__qualityWorldFrames ?? 0) + 1;
    });
  });
  await page.waitForTimeout(600);
  const frames = await page.evaluate(() => (window as Window & { __qualityWorldFrames?: number }).__qualityWorldFrames ?? 0);
  expect(frames).toBeLessThanOrEqual(1);
});

test('semantic recruiter evidence survives with JavaScript disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('/?mode=scan');
  await expect(page.getByRole('heading', { level: 1, name: 'Intelligent systems, made operational.' })).toBeVisible();
  await expect(page.locator('#experience article')).toHaveCount(5);
  await expect(page.locator('#all-work [id^="project-"]')).toHaveCount(28);
  await expect(page.locator('#resumes article')).toHaveCount(7);
  await expect(page.getByText('An interactive portfolio-site experiment, not a professional project claim.')).toBeAttached();
  await expect(page.getByText(/Build Lens|Secure Lens/)).toHaveCount(0);
  await context.close();
});
