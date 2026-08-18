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

test('desktop tools open as a bounded smart cascade and background focus only replaces the route', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Camera Lab' }).click();
  await page.getByRole('button', { name: 'Open Systems Lab' }).click();
  await page.getByRole('button', { name: 'Open Experience' }).click();

  const geometry = await page.evaluate(() => {
    const header = document.querySelector('.portfolio-header')?.getBoundingClientRect();
    const rail = document.querySelector('.workstation-rail')?.getBoundingClientRect();
    const windows = [...document.querySelectorAll<HTMLElement>('.workstation-window:not([hidden])')].map((element) => {
      const rect = element.getBoundingClientRect();
      return { appId: element.dataset.appId, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width };
    });
    return {
      headerBottom: header?.bottom ?? 0,
      railTop: rail?.top ?? window.innerHeight,
      windows,
    };
  });

  expect(geometry.windows).toHaveLength(3);
  expect(new Set(geometry.windows.map((entry) => `${entry.left}:${entry.top}`)).size).toBe(3);
  for (const appWindow of geometry.windows) {
    expect(appWindow.top).toBeGreaterThanOrEqual(geometry.headerBottom);
    expect(appWindow.bottom).toBeLessThanOrEqual(geometry.railTop);
    expect(appWindow.left).toBeGreaterThanOrEqual(0);
    expect(appWindow.right).toBeLessThanOrEqual(1440);
    expect(appWindow.width).toBeGreaterThanOrEqual(720);
    expect(appWindow.width).toBeLessThanOrEqual(980);
  }

  await page.getByRole('dialog', { name: 'Camera Lab' }).click({ position: { x: 12, y: 100 } });
  await expect(page).toHaveURL(/\?app=camera-lab/);
  await expect(page.getByRole('dialog', { name: 'Camera Lab' })).toHaveAttribute('data-window-state', 'focused');
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
    const app = document.querySelector('.workstation-window:not([hidden])')?.getBoundingClientRect();
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

test('mobile preserves the desktop stack while exposing one full-screen sheet', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Camera Lab' }).click();
  await page.getByRole('button', { name: 'Open Systems Lab' }).click();
  await page.getByRole('button', { name: 'Open Experience' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(3);
  const desktopBounds = await page.locator('.workstation-window:not([hidden])').evaluateAll((elements) => elements.map((element) => {
    const appWindow = element as HTMLElement;
    return { appId: appWindow.dataset.appId, left: appWindow.style.left, top: appWindow.style.top, width: appWindow.style.width, height: appWindow.style.height };
  }));

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: 'Experience' })).toBeVisible();
  await page.getByRole('button', { name: 'Open Camera Lab' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: 'Camera Lab' })).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole('dialog')).toHaveCount(3);
  const restoredBounds = await page.locator('.workstation-window:not([hidden])').evaluateAll((elements) => elements.map((element) => {
    const appWindow = element as HTMLElement;
    return { appId: appWindow.dataset.appId, left: appWindow.style.left, top: appWindow.style.top, width: appWindow.style.width, height: appWindow.style.height };
  }));
  expect(restoredBounds).toEqual(desktopBounds);
});

test('Show Desktop preserves Home scroll and the open stack', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.evaluate(() => window.scrollTo(0, 520));
  const before = await page.evaluate(() => window.scrollY);
  await page.getByRole('button', { name: 'Open Camera Lab' }).click();
  await page.getByRole('button', { name: 'Open Systems Lab' }).click();
  await page.getByRole('button', { name: 'Open Home / Dossier' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Home / Dossier application' })).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  await expect(page.locator('.workstation-module[data-app-id="camera-lab"]')).toHaveAttribute('data-state', 'minimized');
  await expect(page.locator('.workstation-module[data-app-id="systems-lab"]')).toHaveAttribute('data-state', 'minimized');
});

test('only the focused heavy application owns a live WebGL surface', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Systems Lab' }).click();
  await expect(page.getByRole('dialog', { name: 'Systems Lab' }).locator('canvas')).toHaveCount(1, { timeout: 15000 });
  await page.getByRole('button', { name: 'Open Camera Lab' }).click();
  await expect(page.getByRole('dialog', { name: 'Camera Lab' }).locator('canvas')).toHaveCount(1, { timeout: 15000 });
  await expect(page.getByRole('dialog', { name: 'Systems Lab' }).locator('canvas')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Systems Lab' })).toContainText('SUSPENDED / POSTER');
  await expect(page.getByRole('dialog').locator('canvas')).toHaveCount(1);
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
