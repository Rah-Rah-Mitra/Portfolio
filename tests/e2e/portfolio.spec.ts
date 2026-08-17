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

test('supporting media and optional output controls stay accessible and user-controlled', async ({ page }) => {
  await page.goto('/');
  const video = page.getByLabel('Abstract calibration laboratory with restrained optical movement.');
  await expect(video).toHaveCount(1);
  await expect(video).toHaveAttribute('preload', 'none');
  await expect(video.locator('source')).toHaveCount(2);
  await expect(page.getByText(/contains no portfolio evidence/i)).toBeAttached();
  const play = page.getByRole('button', { name: 'Play Field Calibration Ambient' });
  await expect(play).toBeVisible();
  await play.click();
  await expect(page.getByRole('button', { name: 'Pause Field Calibration Ambient' })).toBeVisible();

  await page.getByRole('button', { name: /FX, open optional effects lab/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Effects lab' });
  await expect(dialog.getByRole('button', { name: /Sound cues/i })).toHaveAttribute('aria-pressed', 'false');
  await dialog.getByRole('button', { name: /Sound cues/i }).click();
  await expect(dialog.getByRole('button', { name: /Sound cues/i })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('portfolio-sound-enabled'))).toBe('true');
  await expect(dialog.getByLabel('Visual density')).toHaveValue('balanced');
  await expect(dialog.getByLabel('World quality')).toHaveValue('balanced');
  await expect(dialog.getByRole('button', { name: /Fluid field/i })).toHaveAttribute('aria-pressed', 'false');
});

test.describe('capability fallbacks', () => {
  test('mobile keeps evidence before the static guide marker', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('.hero-world-stage')).toBeVisible();
    await expect(page.locator('.hero-calibration-static')).toBeVisible();
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

  test('camera laboratory tabs support arrow, Home, End, and a focusable panel', async ({ page }) => {
    await page.goto('/#technical-lab');
    const intrinsics = page.getByRole('tab', { name: 'Intrinsics' });
    await intrinsics.focus();
    await intrinsics.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Extrinsics' })).toBeFocused();
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: 'Stereo' })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(intrinsics).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('tabpanel')).toBeFocused();
  });

  test('reduced motion and Save-Data choose static media', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } }));
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Quick Scan' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.hero-calibration-static')).toBeVisible();
    await expect(page.locator('video')).toHaveCount(0);
  });

  test('an explicit Guided choice overrides the reduced-motion static default', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByText('Guided, low-motion rendering')).toBeAttached();
    await page.getByRole('button', { name: 'Guided' }).click();
    await expect(page.locator('.site-shell')).toHaveAttribute('data-motion', 'full');
    await expect(page.locator('.optical-world')).toBeAttached();
    await expect(page.locator('.optical-world-canvas canvas')).toHaveCount(1);
    await expect(page.locator('video')).toHaveCount(1);
    await expect(page.locator('video')).toHaveAttribute('preload', 'none');
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
    await expect(page.locator('.hero-calibration-static')).toBeVisible();
  });

  test('canonical Quick Scan keeps heavy guide, world, and video layers unloaded', async ({ page }) => {
    await page.goto('/?mode=scan#work');
    await expect(page.getByRole('button', { name: 'Quick Scan' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.optical-world')).toHaveCount(0);
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

  test('Explore World navigates to the shared optical bench without opening a modal', async ({ page }) => {
    await page.goto('/');
    const explore = page.locator('.spatial-launch-desktop');
    await expect(explore).toHaveAttribute('href', '#world');
    await explore.click();
    await expect(page).toHaveURL(/#world$/);
    await expect(page.locator('.optical-world')).toBeAttached();
    await page.getByRole('button', { name: 'Enter Explore' }).click();
    await expect(page.locator('.optical-world')).toHaveAttribute('data-control-owner', 'visitor');
    await page.keyboard.press('Escape');
    await expect(page.locator('.optical-world')).toHaveAttribute('data-control-owner', 'story');
    await page.getByRole('button', { name: 'Enter Explore' }).click();
    const before = await page.locator('.optical-world').getAttribute('data-world-rotation');
    const heading = await page.getByRole('heading', { name: 'Explore the shared optical test bench' }).boundingBox();
    await page.mouse.move(heading!.x + 5, heading!.y + 5); await page.mouse.down(); await page.mouse.move(heading!.x + 30, heading!.y + 5); await page.mouse.up();
    await expect(page.locator('.optical-world')).toHaveAttribute('data-world-rotation', before ?? '0');
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator('.optical-world')).toHaveAttribute('data-control-owner', 'story');
  });

  test('Quick Scan synchronously releases Explore before the optional world unmounts', async ({ page }) => {
    await page.goto('/#world');
    await expect(page.locator('.optical-world')).toBeAttached();
    await page.getByRole('button', { name: 'Enter Explore' }).click();
    await expect(page.locator('.optical-world')).toHaveAttribute('data-control-owner', 'visitor');
    await page.getByRole('button', { name: 'Quick Scan' }).click();
    await expect(page.getByRole('button', { name: 'Quick Scan' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.optical-world')).toHaveCount(0);
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
    await expect(page.locator('.optical-world')).toBeAttached();
  });
});

test('camera geometry remains interactive in Quick Scan without loading the world', async ({ page }) => {
  await page.goto('/?mode=scan#technical-lab');
  await page.getByRole('tab', { name: 'Stereo' }).click();
  const panel = page.getByRole('tabpanel');
  await panel.getByRole('spinbutton', { name: 'Disparity (px)' }).fill('21');
  await expect(panel.getByRole('table', { name: 'Stereo results' })).toContainText('4.000 m');
  await expect(page.locator('.optical-world')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show Engineer View' }).click();
  await expect(page.getByRole('region', { name: 'Engineer View' })).toContainText('Intrinsic matrix K');
});
