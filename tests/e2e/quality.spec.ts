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
    await expect(rail.getByRole('button')).toHaveCount(11); // 10 modules + DESK
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
    await expect(archive.getByRole('status')).toContainText('01 / 28 SHOWN');

    await rail.getByRole('button', { name: 'Open Experience' }).click();
    const experience = page.getByRole('dialog', { name: 'Experience' });
    await expect(experience).toBeVisible();
    await expect(experience.locator('[id^="experience-"]')).toHaveCount(7);
    await expect(experience.getByRole('heading', { name: /STMicroelectronics/ })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(experience).toBeHidden();
  });

  test('serves seven role-targeted résumés and the contact handoff', async ({ page }) => {
    await page.goto('/?app=resumes-contact');
    const resumes = page.getByRole('dialog', { name: 'Resumes & Contact' });
    await expect(resumes).toBeVisible();
    await expect(resumes.getByRole('link', { name: /Download résumé .*PDF/ })).toHaveCount(7);
    const first = resumes.getByRole('link', { name: /Download résumé .*PDF/ }).first();
    await expect(first).toHaveAttribute('href', /\/resume\/generated\/rahul-mitra-.+\.pdf/);
    await expect(resumes.getByRole('link', { name: 'Email Rahul' })).toBeVisible();
  });

  test('prerendered document keeps the semantic evidence without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('.wb-root').getByRole('heading', { level: 1, name: 'Rahul Mitra' })).toBeVisible();
    expect(await page.locator('[id^="experience-"]').count()).toBe(7);
    expect(await page.locator('#all-work [id^="project-"]').count()).toBe(28);
    await context.close();
  });

  test('desktop has no serious accessibility violations', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''));
    expect(serious).toEqual([]);
  });
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
