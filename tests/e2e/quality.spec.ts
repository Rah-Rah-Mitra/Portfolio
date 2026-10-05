import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Acceptance for the Industry "Field Workbench" UI (desktop) and the
// "Field Index" registry (mobile). Runs against the prerendered production build.

test.describe('field workbench — desktop', () => {
  test('boots the drawing set with Home and Selected Work open', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('RM · FIELD WORKBENCH')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Home / Dossier' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Selected Work' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Rahul Mitra' })).toBeVisible();
    const rail = page.getByRole('navigation', { name: 'Tool rail' });
    await expect(rail.getByRole('button')).toHaveCount(12); // 11 modules + DESK
    // AI / FX layers stay mounted.
    await expect(page.getByRole('button', { name: 'AI, open Ask this portfolio' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'FX, open optional effects lab' })).toBeVisible();
    // The desk never scrolls the document sideways.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('opens, filters, and minimizes registry windows', async ({ page }) => {
    await page.goto('/');
    const rail = page.getByRole('navigation', { name: 'Tool rail' });

    await rail.getByRole('button', { name: 'Open Project Archive' }).click();
    const archive = page.getByRole('dialog', { name: 'Project Archive' });
    await expect(archive).toBeVisible();
    await archive.getByRole('searchbox', { name: 'Search projects' }).fill('Churp');
    await expect(archive.getByRole('status')).toContainText('01 / 29 SHOWN');

    await rail.getByRole('button', { name: 'Open Experience' }).click();
    const experience = page.getByRole('dialog', { name: 'Experience' });
    await expect(experience).toBeVisible();
    // Ten since NTUC Health joined the record in Oct 2026; it is on every résumé.
    await expect(experience.locator('[id^="experience-"]')).toHaveCount(10);
    await expect(experience.getByRole('heading', { name: /STMicroelectronics/ })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(experience).toBeHidden();
  });

  test('a hash deep link opens the archive AND brings the row into view', async ({ page }) => {
    await page.goto('/#project-kaogenie');
    const archive = page.getByRole('dialog', { name: 'Project Archive' });
    await expect(archive).toBeVisible();
    // Opening the window is only half of it: the row has to be inside the
    // sheet's own scroller, not 280px below its bottom edge.
    await expect.poll(() => page.evaluate(() => {
      const row = document.getElementById('project-kaogenie');
      const scroller = row?.closest('.wb-scroll');
      if (!row || !scroller) return false;
      const rowBox = row.getBoundingClientRect();
      const scrollerBox = scroller.getBoundingClientRect();
      return rowBox.top >= scrollerBox.top - 1 && rowBox.bottom <= scrollerBox.bottom + 1;
    })).toBe(true);
  });

  test('states the graduation date in the dossier', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('dialog', { name: 'Home / Dossier' }))
      .toContainText('Graduating Jul 2027');
  });

  test('serves eight résumés and the contact handoff', async ({ page }) => {
    await page.goto('/?app=resumes-contact');
    const resumes = page.getByRole('dialog', { name: 'Resumes & Contact' });
    await expect(resumes).toBeVisible();
    await expect(resumes.getByRole('link', { name: /Download résumé .*PDF/ })).toHaveCount(8);
    const first = resumes.getByRole('link', { name: /Download résumé .*PDF/ }).first();
    await expect(first).toHaveAttribute('href', /\/resume\/generated\/rahul-mitra-.+\.pdf/);
    await expect(resumes.getByRole('link', { name: 'Email Rahul' })).toBeVisible();
  });

  test('resume builder offers the evidence record as accessible controls', async ({ page }) => {
    await page.goto('/?app=resume-builder');
    const builder = page.getByRole('dialog', { name: 'Resume Builder' });
    await expect(builder).toBeVisible();
    // Blocks load after mount, so the picker appears without the API.
    await expect(builder.getByRole('group', { name: 'EXPERIENCE' })).toBeVisible();
    const ticks = builder.getByRole('checkbox');
    expect(await ticks.count()).toBeGreaterThan(10);
    await expect(builder.getByRole('combobox', { name: 'Start from an existing résumé' })).toBeVisible();
    await expect(builder.getByRole('group', { name: 'Bullet detail' })).toBeVisible();
    // The builder must not reuse the anchors the no-JS evidence count relies on.
    expect(await builder.locator('[id^="experience-"]').count()).toBe(0);
    // This is the design system's first checkbox UI — hold it to the same bar.
    const results = await new AxeBuilder({ page }).include('[data-win="resume-builder"]').analyze();
    expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
  });

  test('proof vault carries the certification register behind one disclosure', async ({ page }) => {
    await page.goto('/?app=proof-vault');
    const vault = page.getByRole('dialog', { name: 'Proof Vault' });
    await expect(vault).toBeVisible();
    // Home boots on top of it, so bring the sheet forward before touching it.
    await page.getByRole('navigation', { name: 'Tool rail' }).getByRole('button', { name: 'Open Proof Vault' }).click();
    // Collapsed on arrival, and costing no scroll depth while it is. A closed
    // <details> keeps its children in the DOM with a layout box, so count and
    // visibility both lie here — the sheet's own scrollHeight is the honest measure.
    const register = vault.locator('details.wb-register');
    const sheetDepth = () => vault.locator('[data-scroll]').evaluate((node) => node.scrollHeight);
    expect(await register.evaluate((node: HTMLDetailsElement) => node.open)).toBe(false);
    const collapsed = await sheetDepth();

    await vault.getByText(/43 CERTIFICATIONS/).click();
    expect(await register.evaluate((node: HTMLDetailsElement) => node.open)).toBe(true);
    expect(await sheetDepth()).toBeGreaterThan(collapsed);
    await expect(vault.locator('.wb-archrow')).toHaveCount(43);

    // A chip narrows it, and the counter follows.
    await register.getByRole('button', { name: 'SECURITY', exact: true }).click();
    await expect(vault.locator('.wb-archrow')).toHaveCount(7);
    await expect(register.getByRole('status')).toContainText('07 / 43 SHOWN');

    // The register must not reuse the anchors the no-JS evidence count relies on.
    expect(await vault.locator('[id^="experience-"]').count()).toBe(0);
    // Second-largest interactive surface in the app, and the only axe scan of this window.
    const results = await new AxeBuilder({ page }).include('[data-win="proof-vault"]').analyze();
    expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
  });

  test('prerendered document keeps the semantic evidence without JavaScript', async ({ browser }) => {
    // DOM presence, not visibility: on desktop every window but Home and Selected
    // Work is display:none until JS runs, so these counts include hidden nodes.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('.wb-root').getByRole('heading', { level: 1, name: 'Rahul Mitra' })).toBeVisible();
    expect(await page.locator('[id^="experience-"]').count()).toBe(10);
    expect(await page.locator('#all-work [id^="project-"]').count()).toBe(29);
    await context.close();
  });

  test('desktop has no serious accessibility violations', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''));
    expect(serious).toEqual([]);
  });

  // The labs and desk backgrounds are closed at boot, so the scan above never
  // sees them. Motion is paused first: the hoisted exhibit cards swing, and
  // Playwright will not click an element that is still moving.
  test('lab windows and desk backgrounds stay accessible and error-free', async ({ page }) => {
    test.setTimeout(90_000); // several axe passes over a large prerendered document
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    // Scoped to the surface under test; the boot-state scan above covers the rest.
    const serious = async (scope: string) => (await new AxeBuilder({ page }).include(scope).analyze()).violations
      .filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''));

    await page.goto('/');
    await page.getByRole('button', { name: 'FX, open optional effects lab' }).click();
    const fx = page.getByRole('dialog', { name: 'Effects lab' });
    await fx.getByRole('button', { name: /^Pause all motion/ }).click();
    await fx.getByRole('button', { name: /^N-body field/ }).click();
    await fx.getByRole('button', { name: /^Fluid smoke/ }).click();
    expect(await serious('.effects-lab')).toEqual([]);
    await fx.getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('[data-desk] canvas[data-backdrop]')).toHaveCount(2);

    const rail = page.getByRole('navigation', { name: 'Tool rail' });
    await rail.getByRole('button', { name: 'Open Systems Lab' }).click();
    const systems = page.getByRole('dialog', { name: 'Systems Lab' });
    await expect(systems.locator('#flow-shop')).toBeAttached();
    await expect(systems.locator('#drop-test')).toBeAttached();
    expect(await serious('[data-win="systems-lab"]')).toEqual([]);

    await rail.getByRole('button', { name: 'Open Camera Lab' }).click();
    const camera = page.getByRole('dialog', { name: 'Camera Lab' });
    for (const tab of ['Intrinsics', 'Extrinsics', 'Optics', 'Stereo']) {
      await camera.getByRole('tab', { name: new RegExp(tab) }).click();
      await expect(camera.getByRole('tab', { name: new RegExp(tab) })).toHaveAttribute('aria-selected', 'true');
      expect(await serious('[data-win="camera-lab"]')).toEqual([]);
    }
    expect(errors).toEqual([]);
  });

  // The Estate window's shell (WIN-07). Reduced motion holds the 3D view behind
  // its consent button (allowHeavyAssets is false), so what runs here is only the
  // prerendered poster, the side panel and the load policy: no engine chunk and
  // no WebGL, which tests/e2e/estate.spec.ts covers in its own project.
  for (const size of [{ width: 1280, height: 720 }, { width: 881, height: 700 }]) {
    test(`estate window opens on its still render, accessible, with the licence in reach (${size.width}×${size.height})`, async ({ page }) => {
      test.setTimeout(60_000);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      const estate: string[] = [];
      page.on('request', (request) => {
        const path = new URL(request.url()).pathname;
        if (path.startsWith('/estate/')) estate.push(path);
      });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize(size);

      await page.goto('/');
      await page.waitForLoadState('networkidle');
      expect(estate, 'nothing from /estate/ before the window opens').toEqual([]);

      await page.getByRole('navigation', { name: 'Tool rail' }).getByRole('button', { name: 'Open Estate' }).click();
      const win = page.getByRole('dialog', { name: 'Estate' });
      await expect(win).toBeVisible();
      const poster = win.locator('[data-estate-stage] img');
      await expect.poll(() => poster.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      await expect(win.locator('#world')).toHaveAttribute('data-estate-phase', 'consent');
      await expect(win.getByRole('button', { name: /^Load the 3D estate · \d+\.\d MB$/ })).toBeVisible();
      await expect(win.locator('[data-estate-site]')).toHaveCount(14);
      expect(await win.locator('canvas').count()).toBe(0);
      expect(estate.length).toBeGreaterThan(0);
      expect(estate.filter((path) => !/^\/estate\/v\d+\.\d+\/poster\//.test(path)), 'only the poster until Load').toEqual([]);

      // The sheet does not scroll; the side panel does, and its end is reachable.
      const side = win.locator('.wb-estate-side');
      await side.evaluate((node) => { node.scrollTop = node.scrollHeight; });
      for (const target of [win.locator('[data-estate-credit]'), win.getByRole('link', { name: 'CC BY 4.0' })]) {
        const inside = await target.evaluate((node) => {
          const box = node.getBoundingClientRect();
          const clip = node.closest('.wb-estate-side')!.getBoundingClientRect();
          return box.height > 0 && box.top >= clip.top - 1 && box.bottom <= clip.bottom + 1 && box.left >= clip.left - 1 && box.right <= clip.right + 1;
        });
        expect(inside).toBe(true);
      }
      await expect(win.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute('href', '/estate/LICENSE.txt');

      const results = await new AxeBuilder({ page }).include('[data-win="world-3d"]').analyze();
      expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
});

test.describe('field index — mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('searches the whole registry from one bar', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('RM · FIELD INDEX')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Rahul Mitra' })).toBeVisible();
    const search = page.getByRole('searchbox', { name: 'Search the field index' });
    await search.fill('Churp');
    const row = page.getByRole('button', { name: /Churp/, expanded: false }).first();
    await expect(row).toBeVisible();
    // Expanding a row reveals its detail card.
    await row.click();
    await expect(page.getByRole('button', { name: /Churp/, expanded: true }).first()).toBeVisible();
  });

  test('honours the ?app= link it prints on its own builder row', async ({ page }) => {
    // The registry is the only surface that emits ?app=; tapping its own
    // "OPEN ON DESKTOP" href on a phone used to reload to an untouched index.
    await page.goto('/?app=resume-builder');
    await expect(page.getByRole('button', { name: 'RESUMES' })).toHaveAttribute('data-active', 'true');
    await expect(page.getByRole('button', { name: /Resume Builder/, expanded: true })).toBeVisible();
  });

  test('states the graduation date in the mobile hero', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.fi-hero')).toContainText('Graduating Jul 2027');
  });

  test('keeps direct handoff pinned to the tab bar', async ({ page }) => {
    await page.goto('/');
    const bar = page.getByRole('navigation', { name: 'Contact' });
    await expect(bar.getByRole('link', { name: 'EMAIL' })).toHaveAttribute('href', /^mailto:/);
    await expect(bar.getByRole('link', { name: /Download résumé — General/ })).toHaveAttribute('href', /\/resume\/generated\/rahul-mitra-general-.+\.pdf/);
  });

  test('mobile has no serious accessibility violations', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''));
    expect(serious).toEqual([]);
  });
});
