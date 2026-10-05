import { expect, test, type Page, type Response } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { gzipSync } from 'node:zlib';

// The Estate window's live 3D view (WIN-07, plan §10.2), on the real engine in
// the `chromium-webgl` project (SwiftShader, playwright.config.ts). P4b's cases
// 1–7, 11, 12, 15 and 16, plus P7's release-and-reopen (14), whose release P4b
// built. The P5 tour (8), interior streaming (13), context loss (9) and the phone
// row (10) land with the phases that build them.
//
// `?estate-quality=min` starts the engine on its lowest tier, which is also what
// it picks for SwiftShader unasked; the caps checked are the top tier's (§7.11),
// so a pass here says nothing about speed — only that the counts stay in bounds.

const ENGINE_CHUNKS = /\/assets\/(?:estate-engine|EstateHud|announce)-[\w-]+\.js$/;
const ESTATE_FILES = /^\/estate\//;
const LIVE_TIMEOUT = 30_000;

// Errors are collected as in quality.spec.ts; the only ones allowed are what a
// software GL stack prints on its own, matched narrowly.
const GPU_NOISE = [/GPU stall due to ReadPixels/, /Automatic fallback to software WebGL has been deprecated/];
const collectErrors = (page: Page, allowed: RegExp[] = []) => {
  const errors: string[] = [];
  const keep = (text: string) => { if (![...GPU_NOISE, ...allowed].some((pattern) => pattern.test(text))) errors.push(text); };
  page.on('pageerror', (error) => keep(error.message));
  page.on('console', (message) => { if (message.type() === 'error') keep(message.text()); });
  return errors;
};

// Every request path the page makes, in order.
const collectPaths = (page: Page) => {
  const paths: string[] = [];
  page.on('request', (request) => paths.push(new URL(request.url()).pathname));
  return paths;
};

// Counts requestAnimationFrame calls page-wide (§10.2 case 11).
const countFrames = (page: Page) => page.addInitScript(() => {
  const counted = window as Window & { __estateRaf?: number };
  counted.__estateRaf = 0;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => {
    counted.__estateRaf = (counted.__estateRaf ?? 0) + 1;
    return raf(callback);
  };
});
const frames = (page: Page) => page.evaluate(() => (window as Window & { __estateRaf?: number }).__estateRaf ?? 0);

const openEstate = async (page: Page, search = '?estate-quality=min') => {
  await page.goto(`/${search}`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('navigation', { name: 'Tool rail' }).getByRole('button', { name: 'Open Estate' }).click();
  const win = page.getByRole('dialog', { name: 'Estate' });
  await expect(win).toBeVisible();
  return win;
};

const phase = (page: Page) => page.locator('#world');
const waitLive = (page: Page) => expect(phase(page)).toHaveAttribute('data-estate-phase', 'live', { timeout: LIVE_TIMEOUT });
const stage = (page: Page) => page.locator('[data-estate-stage]');
const chip = (page: Page) => page.locator('[data-estate-location]');
const readout = async (page: Page, name: string) => Number(await stage(page).getAttribute(`data-estate-${name}`));

/** Settled: nothing in flight, and the readouts written since. */
const settle = async (page: Page) => {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1_500);
};

const serious = async (page: Page) => (await new AxeBuilder({ page }).include('[data-win="world-3d"]').analyze()).violations
  .filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''));

test.describe('estate window — live 3D view', () => {
  test('1 · boot fetches nothing of the estate or its engine', async ({ page }) => {
    const errors = collectErrors(page);
    const paths = collectPaths(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1_000);
    expect(paths.filter((path) => ESTATE_FILES.test(path) || ENGINE_CHUNKS.test(path) || /EstateController-/.test(path))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('2 · opens live within 30 s on stage 0 and facades only, inside the caps', async ({ page }) => {
    const errors = collectErrors(page);
    const paths = collectPaths(page);
    await openEstate(page);
    await waitLive(page);
    await expect(page.locator('canvas[data-estate-canvas]')).toHaveCount(1);
    await settle(page);
    const estate = paths.filter((path) => ESTATE_FILES.test(path));
    expect(estate.some((path) => /^\/estate\/v\d+\.\d+\/s0\//.test(path)), 'stage 0 downloaded').toBe(true);
    expect(estate.filter((path) => !/^\/estate\/v\d+\.\d+\/(?:pack\.[0-9a-f]{8}\.json|poster\/|s0\/|f\/)/.test(path)), 'only pack, poster, stage 0 and F').toEqual([]);
    await expect.poll(() => stage(page).getAttribute('data-estate-draws')).not.toBeNull();
    expect(await readout(page, 'draws')).toBeGreaterThan(0);
    expect(await readout(page, 'draws')).toBeLessThanOrEqual(150);
    expect(await readout(page, 'tris')).toBeLessThanOrEqual(1_200_000);
    expect(await readout(page, 'programs')).toBeLessThanOrEqual(6);
    expect(errors).toEqual([]);
  });

  test('3 · a registry row flies to Blk 509', async ({ page }) => {
    const errors = collectErrors(page);
    const win = await openEstate(page);
    await waitLive(page);
    await win.getByRole('button', { name: /^Fly to Blk 509/ }).click();
    await expect(chip(page)).toHaveText(/^BLK 509 · /);
    await expect(win.locator('[data-estate-site="BLK_509"]')).toHaveAttribute('aria-pressed', 'true');
    // Focus follows a registry fly-to onto the stage (§8.3).
    await expect.poll(() => stage(page).evaluate((node) => document.activeElement === node)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('4 · Esc peels Fly, then minimises the window', async ({ page }) => {
    const errors = collectErrors(page);
    const win = await openEstate(page);
    await waitLive(page);
    await stage(page).focus();
    await page.keyboard.press('Digit3');
    await expect(chip(page)).toHaveText(/ · FLY$/);
    await page.keyboard.press('Escape');
    await expect(chip(page)).toHaveText(/ · OVERVIEW$/);
    await expect(win).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(win).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('5 · accessible live, the focus ring inside the sheet, the KEYS chip on focus', async ({ page }) => {
    const errors = collectErrors(page);
    const win = await openEstate(page);
    await waitLive(page);
    const keys = win.locator('.wb-estate-chip-keys');
    await expect(keys).toHaveText('Click or Tab to control');
    await stage(page).focus();
    await expect(keys).toHaveText('Keys active');
    await expect(stage(page)).toHaveAttribute('role', 'application');
    // The inset ring is drawn inside the stage's box, and that box inside the
    // sheet's clip (the 8 px padding keeps the blueprint corners in too).
    const inside = await stage(page).evaluate((node) => {
      const box = node.getBoundingClientRect();
      const clip = node.closest('.wb-scroll')!.getBoundingClientRect();
      return box.left >= clip.left - 1 && box.top >= clip.top - 1 && box.right <= clip.right + 1 && box.bottom <= clip.bottom + 1;
    });
    expect(inside).toBe(true);
    await page.screenshot({ path: test.info().outputPath('estate-focus-ring.png') });
    expect(await serious(page)).toEqual([]);
    await win.locator('[data-estate-site="BLK_501"]').focus();
    await expect(keys).toHaveText('Click or Tab to control');
    expect(errors).toEqual([]);
  });

  test('6 · reduced motion holds the poster until Load is pressed', async ({ page }) => {
    const errors = collectErrors(page);
    const paths = collectPaths(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const win = await openEstate(page);
    await expect(phase(page)).toHaveAttribute('data-estate-phase', 'consent');
    const load = win.getByRole('button', { name: /^Load the 3D estate · \d+\.\d MB$/ });
    await expect(load).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(paths.filter((path) => ENGINE_CHUNKS.test(path)), 'no engine before the click').toEqual([]);
    expect(paths.filter((path) => ESTATE_FILES.test(path) && !/^\/estate\/v\d+\.\d+\/poster\//.test(path)), 'only the poster before the click').toEqual([]);
    await load.click();
    await waitLive(page);
    expect(paths.some((path) => ENGINE_CHUNKS.test(path))).toBe(true);
    // A click-initiated load hands the stage the focus once it is live (§8.3).
    await expect.poll(() => stage(page).evaluate((node) => document.activeElement === node)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('7 · without WebGL the window says so, and the registry still works', async ({ page }) => {
    const errors = collectErrors(page);
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
        if (kind === 'webgl2' || kind === 'webgl' || kind === 'experimental-webgl') return null;
        return (original as (...args: unknown[]) => RenderingContext | null).call(this, kind, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    const win = await openEstate(page);
    await expect(phase(page)).toHaveAttribute('data-estate-phase', 'unavailable', { timeout: LIVE_TIMEOUT });
    await expect(win.getByRole('button', { name: 'Reload' })).toBeVisible();
    await expect(win.locator('[data-estate-stage] img')).toBeVisible();
    await expect(win.locator('canvas')).toHaveCount(0);
    const row = win.locator('[data-estate-site="MSCP_513"]');
    await row.click();
    await expect(row).toHaveAttribute('aria-pressed', 'true');
    await expect(win.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute('href', '/estate/LICENSE.txt');
    expect(await serious(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('11 · at rest the page requests no animation frames', async ({ page }) => {
    const errors = collectErrors(page);
    await countFrames(page);
    await openEstate(page);
    await waitLive(page);
    await settle(page);
    const before = [await frames(page), await stage(page).getAttribute('data-estate-ms')] as const;
    await page.waitForTimeout(1_000);
    const after = [await frames(page), await stage(page).getAttribute('data-estate-ms')] as const;
    expect(after[0] - before[0], 'requestAnimationFrame calls in 1 s at rest').toBe(0);
    expect(after[1]).toBe(before[1]);
    expect(errors).toEqual([]);
  });

  test('12 · with motion paused a fly-to cuts: the chip names the block within 2 frames', async ({ page }) => {
    const errors = collectErrors(page);
    const win = await openEstate(page);
    await waitLive(page);
    await page.getByRole('button', { name: 'FX, open optional effects lab' }).click();
    const fx = page.getByRole('dialog', { name: 'Effects lab' });
    await fx.getByRole('button', { name: /^Pause all motion/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'true');
    await fx.getByRole('button', { name: 'Close' }).click();
    await expect(win.getByRole('button', { name: /^Fly to Blk 509/ })).toBeVisible();
    // The click and the two frames happen in the page, so no round trip pads the count.
    const text = await page.evaluate(() => new Promise<string | null>((resolve) => {
      document.querySelector<HTMLButtonElement>('[data-estate-site="BLK_509"]')!.click();
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(document.querySelector('[data-estate-location]')?.textContent ?? null)));
    }));
    expect(text).toMatch(/^BLK 509 · /);
    expect(errors).toEqual([]);
  });

  test('14 · closed past its release hold, it disposes and comes back live on reopen', async ({ page }) => {
    const errors = collectErrors(page);
    const win = await openEstate(page, '?estate-quality=min&estate-release-ms=1000');
    await waitLive(page);
    const phases: string[] = [];
    await page.exposeFunction('__estatePhase', (value: string) => { phases.push(value); });
    await page.evaluate(() => {
      const world = document.getElementById('world')!;
      new MutationObserver(() => (window as Window & { __estatePhase?: (v: string) => void }).__estatePhase?.(world.dataset.estatePhase ?? ''))
        .observe(world, { attributes: true, attributeFilter: ['data-estate-phase'] });
    });
    await page.getByRole('button', { name: 'Close Estate' }).click();
    await expect(win).toBeHidden();
    await expect(phase(page)).toHaveAttribute('data-estate-phase', 'frozen');
    await expect(page.locator('canvas[data-estate-canvas]')).toHaveCount(1);
    // Past the hold the instance is released, and its canvas goes with it.
    await expect(page.locator('canvas[data-estate-canvas]')).toHaveCount(0, { timeout: 5_000 });
    await page.getByRole('navigation', { name: 'Tool rail' }).getByRole('button', { name: 'Open Estate' }).click();
    await expect(phase(page)).toHaveAttribute('data-estate-phase', 'live', { timeout: 10_000 });
    expect(phases).not.toContain('unavailable');
    expect(errors).toEqual([]);
  });

  test('15 · under Save-Data one Load click downloads no more than its label says', async ({ page }) => {
    const errors = collectErrors(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', {
        configurable: true,
        value: { saveData: true, effectiveType: '4g', addEventListener() {}, removeEventListener() {} },
      });
    });
    const win = await openEstate(page);
    await expect(phase(page)).toHaveAttribute('data-estate-phase', 'consent');
    const load = win.getByRole('button', { name: /^Load the 3D estate · \d+\.\d MB$/ });
    const label = await load.textContent();
    const limit = Number(/(\d+\.\d) MB$/.exec(label ?? '')![1]) * 1_000_000;
    await page.waitForLoadState('networkidle');

    // What travels: a pack file is stored gzipped and sent as is; anything else
    // (pack.json, the engine's chunks) is counted as gzip -9 would send it.
    const sizes: Promise<number>[] = [];
    const onResponse = (response: Response) => {
      const path = new URL(response.url()).pathname;
      if (!ESTATE_FILES.test(path) && !ENGINE_CHUNKS.test(path)) return;
      sizes.push(response.body().then((body) => (body[0] === 0x1f && body[1] === 0x8b ? body.length : gzipSync(body, { level: 9 }).length)));
    };
    page.on('response', onResponse);
    await load.click();
    await waitLive(page);
    await settle(page);
    page.off('response', onResponse);
    const total = (await Promise.all(sizes)).reduce((sum, bytes) => sum + bytes, 0);
    expect(total, `downloaded ${total} B after "${label}"`).toBeLessThanOrEqual(limit);
    // Lean mode offers the rest as its own button.
    await expect(win.getByRole('button', { name: /^Load full detail · \+\d+\.\d MB$/ })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('16 · a hashed pack file that 404s asks for a reload', async ({ page }) => {
    // Chromium logs the 404 itself; that one line is expected here.
    const errors = collectErrors(page, [/Failed to load resource: the server responded with a status of 404/]);
    await page.route(/\/estate\/v\d+\.\d+\/f\//, (route) => route.fulfill({ status: 404, body: 'gone' }));
    const win = await openEstate(page);
    await expect(phase(page)).toHaveAttribute('data-estate-phase', 'stale', { timeout: LIVE_TIMEOUT });
    await expect(win.getByRole('button', { name: 'Reload' })).toBeVisible();
    await expect(win.locator('.wb-estate-state')).toContainText(/updated|reload/i);
    await expect(win.locator('canvas')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
