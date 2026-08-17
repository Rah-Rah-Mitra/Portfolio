import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('recruiter evidence, navigation, projects, and controls remain visible', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Intelligent systems, made operational.' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Download résumé/ })).toBeVisible();
  await expect(page.locator('#experience article')).toHaveCount(5);
  await expect(page.locator('[id^="project-"]')).toHaveCount(28);
  await expect(page.getByRole('button', { name: /FX, open optional effects lab/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /AI, open Ask this portfolio/ })).toBeVisible();
  await expect(page.getByText('An interactive portfolio-site experiment, not a professional project claim.')).toBeVisible();
  await expect(page.getByText(/Build Lens|Secure Lens/)).toHaveCount(0);
});

test('project search, filters, anchors, and keyboard stepping work', async ({ page }) => {
  await page.goto('/#all-work');
  const search = page.getByRole('searchbox', { name: /Search by project/ });
  await search.fill('CP-SAT');
  await expect(page.getByRole('status')).toContainText('Showing 1 of 28 projects');
  await search.fill('');
  await page.getByRole('button', { name: 'Responsible security' }).click();
  await expect(page.getByRole('status')).not.toContainText('Showing 0');
  await page.getByRole('button', { name: /^All 28$/ }).click();
  const first = page.locator('#all-work .project-index-list article').first();
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
    await expect(page.locator('.portfolio-guide')).toBeHidden();
    await expect(page.locator('.hero-guide-mobile')).toBeVisible();
  });

  test('reduced motion and Save-Data choose static media', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } }));
    await page.goto('/');
    await expect(page.locator('.field-guide-stage')).toHaveAttribute('data-mode', 'static');
    await expect(page.locator('.field-guide-stage video')).toHaveCount(0);
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
    await expect(page.locator('.field-guide-stage')).toHaveAttribute('data-mode', 'static');
  });
});
