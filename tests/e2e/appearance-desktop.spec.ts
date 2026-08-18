import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('starts dark, preserves recruiter evidence, and persists Light before reload paint', async ({ page }) => {
  await page.goto('/?mode=guided');
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /résumé/i }).first()).toBeVisible();
  await page.getByRole('button', { name: 'View' }).click();
  await page.getByRole('menuitem', { name: 'Appearance…' }).click();
  await page.getByRole('radio', { name: 'Light' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'light');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#ffffff');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'light');
});

test('scopes the custom desktop menu and exposes keyboard-accessible commands', async ({ page }) => {
  await page.goto('/?mode=guided');
  const prevented = await page.evaluate(() => {
    const field = document.querySelector<HTMLElement>('[data-desktop-field]')!;
    const link = document.querySelector<HTMLAnchorElement>('.hero-actions a')!;
    const fieldEvent = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 80, clientY: 100 });
    field.dispatchEvent(fieldEvent);
    const fieldPrevented = fieldEvent.defaultPrevented;
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const linkEvent = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    link.dispatchEvent(linkEvent);
    return { fieldPrevented, linkPrevented: linkEvent.defaultPrevented };
  });
  expect(prevented).toEqual({ fieldPrevented: true, linkPrevented: false });
  await page.locator('[data-desktop-field]').click({ button: 'right', position: { x: 8, y: 8 } });
  await expect(page.getByRole('menu', { name: 'Desktop menu' })).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Desktop menu' })).toBeHidden();
  await page.keyboard.press('Control+,');
  await expect(page.getByRole('dialog', { name: 'Desktop Preferences' })).toBeVisible();
});

test('uses full-screen mobile Preferences with no desktop precision affordances', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?mode=guided');
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Preferences' }).click();
  const preferences = page.getByRole('dialog', { name: 'Desktop Preferences' });
  await expect(preferences).toBeVisible();
  const box = await preferences.boundingBox();
  expect(box).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
  await expect(page.getByRole('tab', { name: 'Desktop' })).toBeVisible();
  const nativeMenuPreserved = await page.evaluate(() => {
    const field = document.querySelector<HTMLElement>('[data-desktop-field]')!;
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 12, clientY: 12 });
    field.dispatchEvent(event);
    return !event.defaultPrevented;
  });
  expect(nativeMenuPreserved).toBe(true);
});

test('Quick Scan imports no desktop renderer and keeps all evidence available', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  await page.goto('/?mode=scan');
  await expect(page.locator('[data-experience-mode="scan"]')).toBeVisible();
  await expect(page.locator('.desktop-background-controller')).toHaveCount(0);
  await expect(page.locator('canvas.nbody-background, .nbody-background canvas')).toHaveCount(0);
  await expect(page.locator('#all-work .project-index-list article[id^="project-"]')).toHaveCount(28);
  expect(requested.some((url) => /NBodyBackground|nbody\.worker|FluidBackground/.test(url))).toBe(false);
});

for (const scheme of ['dark', 'light'] as const) {
  test(`${scheme} workstation passes an axe scan`, async ({ page }) => {
    await page.addInitScript((nextScheme) => {
      localStorage.setItem('portfolio-appearance-v1', JSON.stringify({
        scheme: nextScheme, accent: 'teal', background: 'nbody', backgroundPaused: true,
        windowTint: 'graphite', titlebarOpacity: 92, reduceTransparency: false, dockSize: 'medium',
        nbody: { preset: 'galaxy', particleCount: 2048, timeScale: 1, gravity: 1, softening: 0.012, trailPersistence: 38, expansionOrder: 8, leafCapacity: 48, pointerAttraction: true, seed: 41, showTree: false },
        fluid: { speed: 0.7, intensity: 38, opacity: 28, splatRadius: 28, curl: 18, quality: 'balanced', pointerInteraction: true },
      }));
    }, scheme);
    await page.goto('/?mode=guided');
    const results = await new AxeBuilder({ page }).exclude('.nbody-background').analyze();
    expect(results.violations).toEqual([]);
  });
}
