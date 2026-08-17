import { expect, test } from '@playwright/test';

test('flow-shop schedule, spatial allocation, and project diagrams change computed evidence', async ({ page }) => {
  await page.goto('/?mode=scan#work');

  const flowShop = page.getByRole('region', { name: 'Systems in Motion' });
  await expect(flowShop.getByText('Makespan 18')).toBeVisible();
  await flowShop.getByRole('button', { name: 'Move job C earlier' }).click();
  await expect(flowShop.getByText('Makespan 17')).toBeVisible();
  await expect(flowShop.getByRole('status')).toContainText('one time unit lower');
  await flowShop.getByRole('button', { name: 'Reset schedule' }).click();
  await expect(flowShop.getByText('Makespan 18')).toBeVisible();

  const hybridInspector = page.locator('#selected-hybrid-flow-shop-digital-twin').getByRole('region', { name: 'Hybrid Flow Shop pipeline' });
  await hybridInspector.getByRole('button', { name: 'Inspect CP-SAT schedule' }).click();
  await expect(hybridInspector.getByRole('status')).toContainText('CP-SAT schedule');
  await expect(hybridInspector.getByRole('listitem')).toHaveCount(5);

  const spatial = page.getByRole('region', { name: 'Spatial Systems' });
  await spatial.getByRole('slider', { name: 'Marker X coordinate' }).fill('82');
  await spatial.getByRole('slider', { name: 'Marker Y coordinate' }).fill('22');
  await expect(spatial.getByRole('status')).toContainText('East is the nearest eligible plot');
  await spatial.getByRole('button', { name: 'Show eligibility overlay' }).click();
  await expect(spatial.getByRole('button', { name: 'Hide eligibility overlay' })).toBeVisible();
  await spatial.getByRole('button', { name: 'Reset spatial exhibit' }).click();
  await expect(spatial.getByRole('slider', { name: 'Marker X coordinate' })).toHaveValue('45');

  const architecture = page.getByRole('region', { name: 'OnTheSpectrum architecture' });
  await architecture.getByRole('button', { name: 'Inspect Three.js playable-world QA' }).click();
  await expect(architecture.getByRole('status')).toContainText('Three.js playable-world QA');
  await expect(architecture.getByRole('listitem')).toHaveCount(4);
});

test('departure handoff stays available before, during, and after calibration', async ({ page }) => {
  await page.goto('/?mode=scan#contact');
  const departure = page.getByRole('region', { name: 'Departure calibration' });
  const contactNames = [/Email Rahul/, /^GitHub$/, /^LinkedIn$/, /General résumé/];
  for (const name of contactNames) await expect(departure.getByRole('link', { name })).toBeVisible();
  await departure.getByRole('button', { name: 'Calibrate iris' }).click();
  await expect(departure.getByRole('status')).toContainText('calibrated');
  for (const name of contactNames) await expect(departure.getByRole('link', { name })).toBeVisible();
  await departure.getByRole('button', { name: 'Reset iris' }).click();
  await expect(departure.getByRole('status')).toContainText('open');
});

test('the semantic exhibits stay operable without page overflow at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/?mode=scan#work');
  await expect(page.getByRole('region', { name: 'Systems in Motion' }).getByRole('button', { name: 'Move job C earlier' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Spatial Systems' }).getByRole('slider', { name: 'Marker X coordinate' })).toBeVisible();
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll<HTMLElement>('body *')]
      .map((element) => ({ selector: `${element.tagName.toLowerCase()}.${element.className}`, right: element.getBoundingClientRect().right, width: element.getBoundingClientRect().width }))
      .filter((entry) => entry.right > document.documentElement.clientWidth + 1)
      .sort((left, right) => right.right - left.right)
      .slice(0, 8),
    selectedWork: ['#work', '.selected-project', '.project-body', '.interactive-exhibit', '.project-system-inspector', '.exhibit-table']
      .map((selector) => {
        const element = document.querySelector<HTMLElement>(selector);
        return element ? { selector, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, rect: element.getBoundingClientRect().toJSON() } : null;
      }),
  }));
  expect(overflow.page, JSON.stringify(overflow, null, 2)).toBeLessThanOrEqual(overflow.viewport);
});
