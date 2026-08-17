import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('recruiter evidence, navigation, projects, and controls remain visible', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Intelligent systems, made operational.' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Download résumé/ })).toBeVisible();
  await expect(page.locator('#experience article')).toHaveCount(5);
  await expect(page.locator('#all-work [id^="project-"]')).toHaveCount(8);
  await page.getByRole('button', { name: 'Load 4 more projects' }).click();
  await expect(page.locator('#all-work [id^="project-"]')).toHaveCount(12);
  await expect(page.getByRole('button', { name: /FX, open optional effects lab/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /AI, open Ask this portfolio/ })).toBeVisible();
  await expect(page.getByText('An interactive portfolio-site experiment, not a professional project claim.')).toBeVisible();
  await expect(page.getByText(/Build Lens|Secure Lens/)).toHaveCount(0);
});

test('project search, filters, anchors, and keyboard stepping work', async ({ page }) => {
  await page.goto('/#all-work');
  const search = page.getByRole('searchbox', { name: /Search by project/ });
  await search.fill('CP-SAT');
  await expect(page.locator('.project-result-count')).toContainText('Showing 1 of 28 projects');
  await search.fill('');
  await page.getByRole('button', { name: 'Responsible security' }).click();
  await expect(page.locator('.project-result-count')).not.toContainText('Showing 0');
  await page.getByRole('button', { name: /^All 28$/ }).click();
  const first = page.locator('#all-work .project-index-list article').first();
  await expect(page.locator('#all-work .project-index-list article[tabindex="0"]')).toHaveCount(1);
  await first.focus();
  await first.press('ArrowDown');
  await expect(page.locator('#all-work .project-index-list article').nth(1)).toBeFocused();
});

test('passes an automated accessibility scan on the evidence surface', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test.describe('capability fallbacks', () => {
  test('mobile keeps evidence before the static guide marker', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('.hero-world-stage')).toBeVisible();
    await expect(page.locator('.hero-guide-static')).toBeVisible();
    await expect(page.getByRole('button', { name: /FX, open optional effects lab/ })).toBeHidden();
    await expect(page.getByRole('button', { name: /AI, open Ask this portfolio/ })).toBeHidden();
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(page.getByRole('button', { name: 'AI · Ask' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'FX · Lab' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Explore World' })).toBeVisible();
    await page.getByRole('button', { name: 'AI · Ask' }).click();
    await expect(page.getByRole('dialog', { name: 'Ask this portfolio' })).toBeVisible();
    await page.getByRole('dialog', { name: 'Ask this portfolio' }).getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'FX · Lab' }).click();
    await expect(page.getByRole('dialog', { name: 'Effects lab' })).toBeVisible();
  });

  test('technical lab tabs support arrow, Home, End, and a focusable panel', async ({ page }) => {
    await page.goto('/#technical-lab');
    const rgb = page.getByRole('tab', { name: /RGB/ });
    await rgb.focus();
    await rgb.press('ArrowRight');
    await expect(page.getByRole('tab', { name: /Objects/ })).toBeFocused();
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: /Trajectory/ })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(rgb).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('tabpanel')).toBeFocused();
  });

  test('reduced motion and Save-Data choose static media', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } }));
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Quick Scan' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.hero-guide-static')).toBeVisible();
    await expect(page.locator('video')).toHaveCount(0);
  });

  test('an explicit Guided choice overrides the reduced-motion static default', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByText('Guided, low-motion rendering')).toBeAttached();
    await page.getByRole('button', { name: 'Guided' }).click();
    await expect(page.locator('.site-shell')).toHaveAttribute('data-motion', 'full');
    await expect(page.locator('.field-guide-stage')).toHaveAttribute('data-mode', 'webgl');
    await expect(page.locator('.field-guide-stage video')).toHaveCount(1);
  });

  test('WebGL failure retains the static guide and portfolio record', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (type.startsWith('webgl')) return null;
        return original.call(this, type, ...args as []) as RenderingContext | null;
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 2, name: 'Experience and education' })).toBeAttached();
    await expect(page.getByRole('button', { name: 'Quick Scan' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.hero-guide-static')).toBeVisible();
  });

  test('canonical Quick Scan keeps heavy guide, world, and video layers unloaded', async ({ page }) => {
    await page.goto('/?mode=scan#work');
    await expect(page.getByRole('button', { name: 'Quick Scan' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.field-guide-stage')).toHaveCount(0);
    await expect(page.locator('.portfolio-world')).toHaveCount(0);
    await expect(page.locator('video')).toHaveCount(0);
    await expect(page).toHaveURL(/\?mode=scan#work$/);
  });

  test('Back and Forward restore the historical experience mode', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Quick Scan' }).click();
    await expect(page).toHaveURL(/\?mode=scan$/);
    await page.getByRole('button', { name: 'Guided' }).click();
    await expect(page).not.toHaveURL(/mode=scan/);
    await page.goBack();
    await expect(page.getByRole('button', { name: 'Quick Scan' })).toHaveAttribute('aria-pressed', 'true');
    await page.goForward();
    await expect(page.getByRole('button', { name: 'Guided' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('Explore World navigates to the future anchor without opening the old modal', async ({ page }) => {
    await page.goto('/');
    const explore = page.locator('.spatial-launch-desktop');
    await expect(explore).toHaveAttribute('href', '#world');
    await explore.click();
    await expect(page).toHaveURL(/#world$/);
    await expect(page.locator('.portfolio-world')).toHaveCount(0);
  });

  test('Effects Lab hands Explore World to the shared optical test bench anchor', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /FX, open optional effects lab/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Effects lab' });

    await expect(dialog).not.toContainText('Spatial portfolio map');
    await expect(dialog).not.toContainText('Lazy-loaded Three.js environment');
    await expect(dialog).toContainText('The shared optical test bench is this site’s enhancement target.');
    const explore = dialog.getByRole('link', { name: 'Explore World' });
    await expect(explore).toHaveAttribute('href', '#world');
    await explore.click();
    await expect(page).toHaveURL(/#world$/);
    await expect(dialog).toBeHidden();
    await expect(page.locator('.portfolio-world')).toHaveCount(0);
  });
});
