import { expect, test } from '@playwright/test';

test('the maximized Dossier keeps recruiter evidence and resume inside the mobile first view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const rail = page.getByRole('navigation', { name: 'Workstation applications' });
  const resume = page.getByRole('link', { name: /Download résumé/ });
  const h1 = page.getByRole('heading', { level: 1, name: 'Intelligent systems, made operational.' });

  await expect(h1).toBeVisible();
  await expect(resume).toBeVisible();
  const geometry = await page.evaluate(() => {
    const railRect = document.querySelector('.workstation-rail')?.getBoundingClientRect();
    const resumeRect = document.querySelector('.hero-actions a[href*="rahul-mitra-general"]')?.getBoundingClientRect();
    return {
      rail: railRect ? { top: railRect.top, height: railRect.height, bottom: railRect.bottom } : null,
      resume: resumeRect ? { top: resumeRect.top, bottom: resumeRect.bottom } : null,
      viewportHeight: window.innerHeight,
    };
  });
  expect(geometry.rail).not.toBeNull();
  expect(geometry.rail!.height).toBeLessThanOrEqual(78);
  expect(geometry.rail!.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.resume).not.toBeNull();
  expect(geometry.resume!.bottom).toBeLessThanOrEqual(geometry.rail!.top - 8);
  await expect(rail).toBeVisible();
});

test('focused desktop apps stay inside the workstation work area', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Camera Lab' }).click();

  const geometry = await page.evaluate(() => {
    const header = document.querySelector('.portfolio-header')?.getBoundingClientRect();
    const rail = document.querySelector('.workstation-rail')?.getBoundingClientRect();
    const windowRect = document.querySelector('.workstation-window')?.getBoundingClientRect();
    return {
      headerBottom: header?.bottom ?? 0,
      railTop: rail?.top ?? window.innerHeight,
      window: windowRect ? { top: windowRect.top, bottom: windowRect.bottom, width: windowRect.width } : null,
    };
  });

  expect(geometry.window).not.toBeNull();
  expect(geometry.window!.top).toBeGreaterThanOrEqual(geometry.headerBottom);
  expect(geometry.window!.bottom).toBeLessThanOrEqual(geometry.railTop);
  expect(geometry.window!.width).toBeGreaterThanOrEqual(1040);
});

test('mobile applications are full-screen sheets without precision window controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Camera Lab' }).click();
  await page.waitForTimeout(350);

  await expect(page.getByRole('dialog', { name: 'Camera Lab' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move Camera Lab window' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Resize Camera Lab window' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Snap Camera Lab left' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Minimize Camera Lab' })).toBeVisible();

  const geometry = await page.evaluate(() => {
    const header = document.querySelector('.portfolio-header')?.getBoundingClientRect();
    const rail = document.querySelector('.workstation-rail')?.getBoundingClientRect();
    const app = document.querySelector('.workstation-window')?.getBoundingClientRect();
    return {
      headerBottom: header?.bottom ?? 0,
      railTop: rail?.top ?? window.innerHeight,
      clientWidth: document.documentElement.clientWidth,
      app: app ? { top: app.top, bottom: app.bottom, left: app.left, right: app.right } : null,
    };
  });
  expect(geometry.app).not.toBeNull();
  expect(geometry.app!.top).toBeCloseTo(geometry.headerBottom, 0);
  expect(geometry.app!.bottom).toBeCloseTo(geometry.railTop, 0);
  expect(geometry.app!.left).toBeCloseTo(0, 0);
  expect(geometry.app!.right).toBeCloseTo(geometry.clientWidth, 0);
});

test('AI opens as the right copilot while FX remains the left utility tray', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');

  await page.getByRole('button', { name: 'AI, open Ask this portfolio' }).click();
  await page.waitForTimeout(450);
  const copilot = page.getByRole('dialog', { name: 'Ask this portfolio' });
  await expect(copilot).toBeVisible();
  const copilotRect = await copilot.evaluate((element) => element.getBoundingClientRect());
  expect(copilotRect.right).toBeCloseTo(1440, 0);
  expect(copilotRect.left).toBeGreaterThan(700);
  await copilot.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'FX, open optional effects lab' }).click();
  await page.waitForTimeout(450);
  const effects = page.getByRole('dialog', { name: 'Effects Lab' });
  await expect(effects).toBeVisible();
  const effectsRect = await effects.evaluate((element) => element.getBoundingClientRect());
  expect(effectsRect.left).toBeCloseTo(0, 0);
  expect(effectsRect.right).toBeLessThan(700);
});
