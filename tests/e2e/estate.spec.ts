import { expect, test, type Page, type Response } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { gzipSync } from 'node:zlib';

// The Estate window's live 3D view (WIN-07, plan §10.2), on the real engine in
// the `chromium-webgl` project (SwiftShader, playwright.config.ts). P4b's cases
// 1–7, 11, 12, 15 and 16, plus P7's release-and-reopen (14), whose release P4b
// built, and the P4b review's: HUD clicks with the stage focused (5b), the
// stage's description and a fully clean axe scan (5c), a reopen drawn at full
// size and detail (14b), and Reload after a failed engine chunk (17). P5's
// tour (8: Blk 509's stairs and lift, the car park's ramp, the hawker hall)
// and its slow and failed interiors (13). P6's Plan (18: Blk 509 L5 from the
// Overview strip, rooms cycled, the cut moved, walked into; 19: Esc leaves
// Plan and the selection together), the assistant's focusEstate on the local
// fallback (20) and the phone registry's Estate row (10). P7's context loss
// and the GPU claim (9), and release-and-reopen held to its plan wording (14).
// The P6/P7 review's: a context lost while closed comes back on a new canvas
// (9b), and Plan's room list as a keyboard visitor meets it (21). The release
// round's: 8a and 8b screenshot the canvas at an eye-level pose on a heading
// that is a multiple of 90° and fail on pure-black pixels (blackShare below).
//
// No case waits for the network to go idle once it has opened the window: the
// rest of the page decides that (the résumé builder's preview, stubbed below,
// held 'networkidle' open past the budget under load). "Booted" is the page
// hydrated; "settled" is what the engine itself reports (data-estate-pending,
// data-flight). Only the cases that assert nothing was fetched still wait for
// the network to go idle, before they count.
//
// The tour moves with the HUD's step buttons (half a metre, 15°): they are
// discrete, so a route of presses lands in the same place every run, where a
// held key's distance depends on the frame rate. Only the car park's ramp is
// climbed by holding W, as the plan asks. The routes start where Enter's arc
// lands from a landed fly-to at Playwright's 1280 × 720 (Blk 509: the east
// void-deck entrance; the car park: Entrance E; the hawker centre: Entrance E 2).
//
// `?estate-quality=min` starts the engine on its lowest tier, which is also what
// it picks for SwiftShader unasked; the caps checked are the top tier's (§7.11),
// so a pass here says nothing about speed — only that the counts stay in bounds.

// The Load click's chunks (the engine, its HUD and their shared chunk, vite.config.ts)
// and the bench's, which only ?estate-bench=1 ever requests.
const ENGINE_CHUNKS = /\/assets\/(?:estate-engine|estate-shared|estate-bench|EstateHud)-[\w-]+\.js$/;
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

/** Loaded and hydrated: App drops the phone registry once it knows the surface, so the rail's handlers are live. */
const booted = (page: Page) => page.waitForFunction(
  () => document.readyState === 'complete' && !document.querySelector('.fi-root'), undefined, { timeout: LIVE_TIMEOUT },
);

const openEstate = async (page: Page, search = '?estate-quality=min') => {
  await page.goto(`/${search}`);
  await booted(page);
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
const hud = (page: Page) => page.locator('.wb-estate-hud');
const spoken = (page: Page) => page.locator('.wb-estate-hud [role="status"]');

/** Press the HUD's step buttons in order: 'f' step forward, 'b' back, 'l' / 'r' turn 15°, each with a count ('f6'). */
const steps = (page: Page, route: string) => page.evaluate((plan) => {
  const label: Record<string, string> = { f: 'Step forward', b: 'Step back', l: 'Turn left', r: 'Turn right' };
  for (const move of plan.split(' ')) {
    const button = document.querySelector<HTMLButtonElement>(`.wb-estate-steps button[aria-label="${label[move[0]]}"]`);
    if (!button) throw new Error(`no ${label[move[0]]} button`);
    for (let i = 0; i < Number(move.slice(1)); i += 1) button.click();
  }
}, route);

/** Select a building from the registry and let its fly-to land (Enter's arc starts from the framed pose). */
const flyToAndLand = async (page: Page, site: string, label: RegExp) => {
  await page.locator(`[data-estate-site="${site}"]`).click();
  await expect(chip(page)).toHaveText(label);
  await expect.poll(() => hud(page).getAttribute('data-flight')).toBeNull();
};

/** The registry's Enter for the selected row, then the arc: Walk on the building's L1, its walk grid here (the strip is drawn). */
const enterFromRegistry = async (page: Page, name: RegExp, inside: RegExp) => {
  const enter = page.locator('[data-estate-row-action="enter"]');
  await expect(enter).toHaveText(name);
  await enter.click();
  await expect(chip(page)).toHaveText(inside, { timeout: LIVE_TIMEOUT });
  await expect.poll(() => hud(page).getAttribute('data-flight')).toBeNull();
  await expect(page.locator('[data-estate-strip="walk"]')).toBeVisible({ timeout: LIVE_TIMEOUT });
};

/** Every value #world's data-estate-phase takes from now on, in order. */
const watchPhases = async (page: Page): Promise<string[]> => {
  const phases: string[] = [];
  await page.exposeFunction('__estatePhase', (value: string) => { phases.push(value); });
  await page.evaluate(() => {
    const world = document.getElementById('world')!;
    new MutationObserver(() => (window as Window & { __estatePhase?: (v: string) => void }).__estatePhase?.(world.dataset.estatePhase ?? ''))
      .observe(world, { attributes: true, attributeFilter: ['data-estate-phase'] });
  });
  return phases;
};

/**
 * Settled, as the engine reports it: no flight, and nothing downloading or
 * compiling (the stage's data-estate-pending) for 750 ms on end; then the
 * readouts written since.
 */
const settle = async (page: Page) => {
  await page.evaluate(() => { delete (window as Window & { __estateQuiet?: number }).__estateQuiet; });
  await page.waitForFunction((hold) => {
    const scope = window as Window & { __estateQuiet?: number };
    const pending = document.querySelector('[data-estate-stage]')?.getAttribute('data-estate-pending') ?? '0';
    const flying = document.querySelector('.wb-estate-hud')?.hasAttribute('data-flight') === true;
    if (pending !== '0' || flying) {
      scope.__estateQuiet = undefined;
      return false;
    }
    if (scope.__estateQuiet === undefined) scope.__estateQuiet = performance.now();
    return performance.now() - scope.__estateQuiet >= hold;
  }, 750, { polling: 50, timeout: 60_000 });
  await page.waitForTimeout(1_500);
};

/**
 * The share of the canvas's pixels that are pure black (every channel under 6),
 * from a screenshot of it: nothing the palette draws is that dark, but a face
 * whose flat-shading normal came out NaN is. SwiftShader gave such faces a zero
 * screen derivative at eye-level poses on a heading that is a multiple of 90°,
 * and three's normalize( cross( dFdx, dFdy ) ) of it is NaN (materials.ts
 * guards it): 17 % of the frame at stair 5's foot before the guard.
 */
const blackShare = async (page: Page) => {
  const png = await page.locator('[data-estate-stage] canvas').screenshot();
  return page.evaluate(async (b64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${b64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let black = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] < 6 && data[i + 1] < 6 && data[i + 2] < 6) black += 1;
    return black / (data.length / 4);
  }, png.toString('base64'));
};

const serious = async (page: Page) => (await new AxeBuilder({ page }).include('[data-win="world-3d"]').analyze()).violations
  .filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''));
/** Every axe finding in the window, at any impact, by rule id. */
const allFindings = async (page: Page) => (await new AxeBuilder({ page }).include('[data-win="world-3d"]').analyze()).violations
  .map((violation) => `${violation.id} (${violation.impact})`);

test.describe('estate window — live 3D view', () => {
  // The résumé builder window is mounted (closed) on every desktop page and POSTs
  // /api/resume about 450 ms in, then previews the PDF in an iframe, which
  // headless Chromium takes as a download. Nothing here is about résumés: a
  // plain-text answer keeps that off the network and out of the console.
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/resume*', (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: 'estate.spec: the résumé preview is stubbed' }));
  });

  test('1 · boot opens the Estate behind Home on its poster, fetching nothing else of it until it is brought forward', async ({ page }) => {
    const errors = collectErrors(page);
    const paths = collectPaths(page);
    await page.goto('/?estate-quality=min');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1_000);
    await expect(page.getByRole('dialog', { name: 'Estate' })).toBeVisible();
    await expect(page.locator('[data-win="home"]')).toHaveAttribute('data-focused', 'true');
    await expect(phase(page)).toHaveAttribute('data-estate-phase', 'poster');
    expect(paths.filter((path) => ESTATE_FILES.test(path)).every((path) => /^\/estate\/v\d+\.\d+\/poster\//.test(path)), 'only the poster').toBe(true);
    expect(paths.filter((path) => ENGINE_CHUNKS.test(path)), 'no engine').toEqual([]);

    await page.getByRole('navigation', { name: 'Tool rail' }).getByRole('button', { name: 'Open Estate' }).click();
    await waitLive(page);
    expect(paths.some((path) => ENGINE_CHUNKS.test(path))).toBe(true);
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

  test('5b · HUD buttons take a mouse click while the stage holds the keys', async ({ page }) => {
    const errors = collectErrors(page);
    const win = await openEstate(page);
    await waitLive(page);
    const hud = win.locator('.wb-estate-hud');
    // Focus on the stage, as after any drag, Load, or registry fly-to. A press on
    // a HUD button moves focus off it; when the KEYS chip changed width on that
    // blur the row reflowed under the pointer and the click was lost.
    await stage(page).focus();
    const fly = hud.getByRole('button', { name: 'Fly', exact: true });
    const before = await fly.boundingBox();
    await page.mouse.click(before!.x + before!.width / 2, before!.y + before!.height / 2);
    await expect(chip(page)).toHaveText(/ · FLY$/);
    // The click handed the keys back to the stage; the next mouse click lands too.
    await expect.poll(() => stage(page).evaluate((node) => document.activeElement === node)).toBe(true);
    const keys = hud.getByRole('button', { name: 'Keys', exact: true });
    const k = await keys.boundingBox();
    await page.mouse.click(k!.x + k!.width / 2, k!.y + k!.height / 2);
    await expect(hud.getByRole('region', { name: 'Fly keys' })).toBeVisible();
    await stage(page).focus();
    const overview = hud.getByRole('button', { name: 'Overview', exact: true });
    const o = await overview.boundingBox();
    await page.mouse.click(o!.x + o!.width / 2, o!.y + o!.height / 2);
    await expect(chip(page)).toHaveText(/ · OVERVIEW$/);
    // The chip keeps one width whichever label it shows.
    const chipBox = win.locator('.wb-estate-chip-keys');
    await stage(page).focus();
    const focused = (await chipBox.boundingBox())!.width;
    await win.locator('[data-estate-site="BLK_501"]').focus();
    expect((await chipBox.boundingBox())!.width).toBeCloseTo(focused, 0);
    expect(errors).toEqual([]);
  });

  test('5c · the live stage is described by its key summary, and axe finds nothing at any impact', async ({ page }) => {
    const errors = collectErrors(page);
    await openEstate(page);
    await waitLive(page);
    // #estate-keys sits in a closed <details>, outside the accessibility tree: the
    // stage points at the HUD's always-present summary instead.
    await expect(stage(page)).toHaveAccessibleDescription(/^Arrow keys rotate and tilt; A and D, or Shift with the arrows, pan;/);
    await stage(page).focus();
    await page.keyboard.press('Digit3');
    await expect(stage(page)).toHaveAccessibleDescription(/R and F look up and down/);
    await page.keyboard.press('Escape');
    // role=application sits on the stage layer, not on the <figure> (aria-allowed-role).
    expect(await allFindings(page)).toEqual([]);
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

  test('9 · a lost GPU context is restored and goes live again; with FX smoke on, the backdrop yields while the Estate holds the GPU', async ({ page }) => {
    const errors = collectErrors(page);
    const win = await openEstate(page);
    await waitLive(page);
    await settle(page);
    const phases = await watchPhases(page);
    const tris = await readout(page, 'tris');

    // A driver reset, as WEBGL_lose_context stages one: lost, then restored from the CPU copies.
    await page.evaluate(() => {
      const gl = document.querySelector<HTMLCanvasElement>('canvas[data-estate-canvas]')!.getContext('webgl2')!;
      const lose = gl.getExtension('WEBGL_lose_context')!;
      (window as Window & { __estateLose?: WEBGL_lose_context }).__estateLose = lose;
      lose.loseContext();
    });
    await expect(phase(page)).toHaveAttribute('data-estate-phase', 'lost');
    await page.waitForTimeout(500);
    await page.evaluate(() => (window as Window & { __estateLose?: WEBGL_lose_context }).__estateLose!.restoreContext());
    await expect(phase(page)).toHaveAttribute('data-estate-phase', 'live', { timeout: 15_000 });
    // The same canvas, redrawn: one live reset is not two, so it never latched unavailable.
    await expect(page.locator('canvas[data-estate-canvas]')).toHaveCount(1);
    await expect.poll(() => readout(page, 'tris'), { timeout: 15_000 }).toBe(tris);
    expect(phases).toEqual(['lost', 'live']);

    // The FX smoke on: while the Estate is live, focused and under no panel, it holds the GPU and the smoke yields.
    await page.getByRole('button', { name: 'FX, open optional effects lab' }).click();
    const fx = page.getByRole('dialog', { name: 'Effects lab' });
    await fx.getByRole('button', { name: /^Fluid smoke/ }).click();
    const smoke = page.locator('.wb-backdrop-caption [data-backdrop-state]');
    // The FX panel's backdrop over the desk releases the claim: the smoke runs.
    await expect(smoke).toHaveAttribute('data-backdrop-state', 'running', { timeout: 15_000 });
    await fx.getByRole('button', { name: 'Close' }).click();
    await expect(win).toHaveAttribute('data-focused');
    await expect(page.locator('[data-backdrop-state="yielded"]')).toHaveCount(1);
    await expect(smoke).toContainText('HELD · ESTATE');
    expect(errors).toEqual([]);
  });

  test('9b · a context lost while the window is closed, and never restored, comes back on reopen live on a new canvas', async ({ page }) => {
    const errors = collectErrors(page);
    const win = await openEstate(page);
    await waitLive(page);
    await settle(page);
    const canvas = page.locator('canvas[data-estate-canvas]');
    await canvas.evaluate((node) => node.setAttribute('data-lost-one', ''));
    await page.getByRole('button', { name: 'Close Estate' }).click();
    await expect(win).toBeHidden();
    await expect(phase(page)).toHaveAttribute('data-estate-phase', 'frozen');
    const phases = await watchPhases(page);
    // Lost while frozen: uncounted and unseen. WEBGL_lose_context sends no restore of its own.
    await canvas.evaluate((node: HTMLCanvasElement) => { node.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext(); });
    await page.waitForTimeout(500);
    await expect(phase(page)).toHaveAttribute('data-estate-phase', 'frozen');
    await page.getByRole('navigation', { name: 'Tool rail' }).getByRole('button', { name: 'Open Estate' }).click();
    // Released and loaded afresh (pose kept, files from the HTTP cache): a new canvas, live, drawing.
    await expect(page.locator('canvas[data-estate-canvas]:not([data-lost-one])')).toHaveCount(1, { timeout: LIVE_TIMEOUT });
    await waitLive(page);
    await expect(page.locator('canvas[data-estate-canvas]')).toHaveCount(1);
    expect(await page.locator('canvas[data-estate-canvas]').evaluate((node: HTMLCanvasElement) => node.getContext('webgl2')!.isContextLost())).toBe(false);
    await expect.poll(() => readout(page, 'tris'), { timeout: 15_000 }).toBeGreaterThan(0);
    // Never live on the lost one, never a failure: (released, a commit the view may not draw) loading, then live.
    expect(phases.filter((value) => value !== 'released')).toEqual(['loading', 'live']);
    expect(errors).toEqual([]);
  });

  test('14 · closed past its release hold, it disposes and comes back live on reopen', async ({ page }) => {
    const errors = collectErrors(page);
    const win = await openEstate(page, '?estate-quality=min&estate-release-ms=1000');
    await waitLive(page);
    const phases = await watchPhases(page);
    await page.getByRole('button', { name: 'Close Estate' }).click();
    await expect(win).toBeHidden();
    await expect(phase(page)).toHaveAttribute('data-estate-phase', 'frozen');
    await expect(page.locator('canvas[data-estate-canvas]')).toHaveCount(1);
    // Closed 2 s, twice the 1 s hold: the instance is released, and its canvas goes with it.
    await page.waitForTimeout(2_000);
    await expect(page.locator('canvas[data-estate-canvas]')).toHaveCount(0);
    await page.getByRole('navigation', { name: 'Tool rail' }).getByRole('button', { name: 'Open Estate' }).click();
    await expect(phase(page)).toHaveAttribute('data-estate-phase', 'live', { timeout: 10_000 });
    await expect(page.locator('canvas[data-estate-canvas]')).toHaveCount(1);
    expect(phases).not.toContain('unavailable');
    expect(errors).toEqual([]);
  });

  test('14b · closed and reopened inside the hold: the first frame back is full size and full detail, then rest', async ({ page }) => {
    const errors = collectErrors(page);
    await countFrames(page);
    const win = await openEstate(page);
    await waitLive(page);
    await settle(page);
    const canvas = page.locator('canvas[data-estate-canvas]');
    const size = () => canvas.evaluate((node: HTMLCanvasElement) => [node.width, node.height]);
    const open = await size();
    const tris = await readout(page, 'tris');
    expect(open[0]).toBeGreaterThan(100);
    await page.getByRole('button', { name: 'Close Estate' }).click();
    await expect(win).toBeHidden();
    await expect(phase(page)).toHaveAttribute('data-estate-phase', 'frozen');
    await page.waitForTimeout(400); // past the 150 ms resize debounce, with the section display:none
    // A closed window has no box; its buffer keeps its size rather than shrinking to 1 × 1.
    expect(await size()).toEqual(open);
    await page.getByRole('navigation', { name: 'Tool rail' }).getByRole('button', { name: 'Open Estate' }).click();
    await waitLive(page);
    expect(await size()).toEqual(open);
    // Same pose, same files: the same detail, without any input (a held level
    // step that came due at rest once waited for the next keypress).
    await expect.poll(() => readout(page, 'tris'), { timeout: 3_000 }).toBe(tris);
    await page.waitForTimeout(1_000);
    const restFrames = await frames(page);
    await page.waitForTimeout(1_000);
    expect(await frames(page) - restFrames, 'requestAnimationFrame calls in 1 s at rest after reopening').toBe(0);
    expect(errors).toEqual([]);
  });

  test('8a · the P5 tour: Enter Blk 509, the stairs to L2, the lift to L5, and Esc back out', async ({ page }) => {
    const errors = collectErrors(page);
    const paths = collectPaths(page);
    const estateRequests = () => paths.filter((path) => ESTATE_FILES.test(path)).length;
    await countFrames(page);
    const win = await openEstate(page);
    await waitLive(page);
    await flyToAndLand(page, 'BLK_509', /^BLK 509 · /);
    // Enter is mirrored: the HUD's and the registry's carry the same label, with what entering downloads.
    await expect(win.locator('[data-estate-enter="BLK_509"]')).toHaveText(/^Enter Blk 509 · \d+\.\d MB$/);
    await enterFromRegistry(page, /^Enter Blk 509 · \d+\.\d MB$/, /^BLK 509 · L1 · .*WALK$/);
    // Registry Enter puts the keys on the stage (§8.3); its row now offers Exit.
    await expect.poll(() => stage(page).evaluate((node) => document.activeElement === node)).toBe(true);
    await expect(win.locator('[data-estate-row-action="exit"]')).toHaveText('Exit Blk 509');
    for (const kind of ['i', 'w', 'nav']) {
      expect(paths.some((path) => path.includes(`/${kind}/BLK_509.`)), `${kind}/BLK_509 requested`).toBe(true);
    }
    // The strip, from the data: RF by lift then the stairs, L1 here.
    await expect(win.getByRole('button', { name: 'RF +45.60, by lift, then the stairs' })).toBeEnabled();
    await expect(win.getByRole('button', { name: 'L1 ±0.00, here' })).toBeDisabled();

    // From the east void-deck entrance: along the deck, then into stair 5's doorway.
    await steps(page, 'f6 r6 f2');
    const up = win.getByRole('button', { name: 'Take stair 5 up to L2' });
    await expect(up).toBeVisible();
    // The climb downloads nothing: the building's interior and grid are already here (§3 P5, §12.4).
    await settle(page);
    // Eye level, facing the stair's doorway on a heading that is a multiple of 90°: no face drawn black.
    expect(await blackShare(page), 'share of pure-black canvas pixels at stair 5').toBeLessThan(0.001);
    const beforeStairs = estateRequests();
    await up.click();
    await expect(hud(page)).toHaveAttribute('data-transition', 'climb');
    await expect(chip(page)).toHaveText(/^BLK 509 · L2 · /, { timeout: 20_000 });
    await expect.poll(() => hud(page).getAttribute('data-transition'), { timeout: 10_000 }).toBeNull();

    // L5 by the strip: one lift ride behind the paper, and nothing downloaded for it.
    await settle(page);
    expect(estateRequests() - beforeStairs, 'requests for a stair climb').toBe(0);
    const before = estateRequests();
    await win.getByRole('button', { name: 'L5 +12.00, by lift' }).click();
    await expect(chip(page)).toHaveText(/^BLK 509 · L5 · /, { timeout: 10_000 });
    await expect.poll(() => hud(page).getAttribute('data-transition'), { timeout: 10_000 }).toBeNull();
    await settle(page);
    expect(estateRequests() - before, 'requests for a lift ride').toBe(0);
    // The arrival was one utterance with the lift's name; the corridor follows once standing still.
    await expect(spoken(page)).toHaveText(/^Common corridor/, { timeout: 5_000 });
    expect(await readout(page, 'draws')).toBeLessThanOrEqual(150);
    expect(await readout(page, 'tris')).toBeLessThanOrEqual(1_200_000);
    expect(await stage(page).getAttribute('data-estate-band')).toMatch(/^L[34]–L[67]$/);
    // At rest inside a building, as in Overview (case 11): no animation frames, no readout written.
    const rest = [await frames(page), await stage(page).getAttribute('data-estate-ms')] as const;
    await page.waitForTimeout(1_000);
    expect(await frames(page) - rest[0], 'requestAnimationFrame calls in 1 s at rest on L5').toBe(0);
    expect(await stage(page).getAttribute('data-estate-ms')).toBe(rest[1]);

    // Enter on the stage at the landing opens the lift's panel: focus goes in, onto the level above, and it is said.
    const lift = win.locator('[data-estate-lift]');
    await expect(lift).toHaveText(/^LIFT \d · CHOOSE A LEVEL$/);
    const panel = win.getByRole('region', { name: /^Lift \d, levels$/ });
    await stage(page).focus();
    await page.keyboard.press('Enter');
    await expect(panel).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')).toMatch(/^Lift \d to L6$/);
    await expect(spoken(page)).toHaveText(/^Lift \d: choose a level$/);
    await expect(panel.getByRole('button', { name: 'L5, here' })).toBeDisabled();
    // Walk's HUD (location, Exit, the strip, the lift chip and its open panel, the steps) is as clean for axe as Overview's.
    expect(await allFindings(page)).toEqual([]);
    // Esc closes it and hands the keys back to the stage, which opened it.
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect.poll(() => stage(page).evaluate((node) => document.activeElement === node)).toBe(true);

    // The panel rides too: L5 → L12 from its chip, nothing downloaded.
    await lift.click();
    await expect(panel).toBeVisible();
    const beforePanel = estateRequests();
    await panel.getByRole('button', { name: /^Lift \d to L12$/ }).click();
    await expect(chip(page)).toHaveText(/^BLK 509 · L12 · /, { timeout: 10_000 });
    await expect.poll(() => hud(page).getAttribute('data-transition'), { timeout: 10_000 }).toBeNull();
    await settle(page);
    expect(estateRequests() - beforePanel, 'requests for a ride from the panel').toBe(0);

    // The lift the ride left us at: its panel lists what it serves, this level disabled.
    await expect(lift).toHaveText(/^LIFT \d · CHOOSE A LEVEL$/);
    await lift.click();
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('button', { name: 'L12, here' })).toBeDisabled();
    await expect(panel.getByRole('button', { name: /^Lift \d to L5$/ })).toBeEnabled();
    // Esc layers from a HUD button: the panel, then Walk, then the selection, then the window.
    await page.keyboard.press('Tab');
    await expect.poll(() => panel.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(win).toBeVisible();
    await expect.poll(() => lift.evaluate((node) => document.activeElement === node)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(chip(page)).toHaveText(/ · OVERVIEW$/, { timeout: 10_000 });
    await expect(win).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(win.locator('[data-estate-site="BLK_509"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(win).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(win).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('8b · the car park: up its ramp from L1 to L2 by holding W', async ({ page }) => {
    const errors = collectErrors(page);
    const win = await openEstate(page);
    await waitLive(page);
    await flyToAndLand(page, 'MSCP_513', /^MSCP 513 · /);
    await enterFromRegistry(page, /^Enter Car park 513 · \d+\.\d MB$/, /^MSCP 513 · L1 · .*WALK$/);
    // Entrance E, through the lobby to the walkway, north to the cross aisle, west to the ramp's foot, facing up it.
    // Three steps in, at eye level on a heading that is a multiple of 90°, no face is drawn black (the deck floor was).
    await steps(page, 'f3');
    await settle(page);
    expect(await blackShare(page), 'share of pure-black canvas pixels in the car park lobby').toBeLessThan(0.001);
    await steps(page, 'f15 r6 f82 l6 f58 r6 f14 r6');
    await expect(chip(page)).toHaveText(/^MSCP 513 · L1 · RAMP LANDING WEST · WALK$/);
    await stage(page).focus();
    await page.keyboard.down('Shift');
    await page.keyboard.down('KeyW');
    try {
      await expect(chip(page)).toHaveText(/^MSCP 513 · L2 · /, { timeout: 20_000 });
    } finally {
      await page.keyboard.up('KeyW');
      await page.keyboard.up('Shift');
    }
    await expect(win.getByRole('button', { name: 'L2 +3.00, here' })).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('8c · the hawker centre: in at an entrance and along the walkway into the hall', async ({ page }) => {
    const errors = collectErrors(page);
    const win = await openEstate(page);
    await waitLive(page);
    await flyToAndLand(page, 'NC_514', /^NC 514 · /);
    await enterFromRegistry(page, /^Enter Hawker centre · \d+\.\d MB$/, /^NC 514 · L1 · .*WALK$/);
    // The roof is no one's storey: the strip says so rather than offering it.
    await expect(win.getByRole('button', { name: 'RF +8.20, No lift or stair reaches RF' })).toBeDisabled();
    await steps(page, 'f140');
    await expect(chip(page)).toHaveText(/^NC 514 · L1 · SEATING AREA [A-Z -]+ · WALK$/);
    await settle(page);
    expect(await readout(page, 'draws')).toBeLessThanOrEqual(150);
    expect(await readout(page, 'tris')).toBeLessThanOrEqual(1_200_000);
    expect(errors).toEqual([]);
  });

  test('13 · a slow, then failed, interior keeps the facade whole, says so, and Enter reports it', async ({ page }) => {
    // Chromium logs each aborted request itself; those lines are expected here.
    const errors = collectErrors(page, [/Failed to load resource: net::ERR_FAILED/]);
    let held = 0;
    await page.route(/\/estate\/v\d+\.\d+\/i\//, async (route) => {
      held += 1;
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      await route.abort();
    });
    const win = await openEstate(page);
    await waitLive(page);
    await flyToAndLand(page, 'BLK_509', /^BLK 509 · /);
    await win.locator('[data-estate-row-action="enter"]').click();
    await expect(chip(page)).toHaveText(/^BLK 509 · .*WALK$/, { timeout: LIVE_TIMEOUT });
    // Streaming: the facade stays whole (no band opens) and the HUD says why.
    await expect(win.locator('[data-estate-interior="streaming"]')).toHaveText('Streaming interior…', { timeout: 10_000 });
    expect(await stage(page).getAttribute('data-estate-band')).toBeNull();
    // Two retries later it has failed for good: still no band, and the reason is shown.
    await expect(win.locator('[data-estate-interior="failed"]')).toHaveText(/^Blk 509 cannot be entered: its interior did not download/, { timeout: 60_000 });
    // Said as it happens, not only on the next Enter (the chip has no live role).
    await expect(spoken(page)).toHaveText(/^Blk 509 cannot be entered: its interior did not download/);
    expect(held).toBeGreaterThanOrEqual(3);
    expect(await stage(page).getAttribute('data-estate-band')).toBeNull();
    // Back out, and Enter again: refused, said and shown.
    await stage(page).focus();
    await page.keyboard.press('Escape');
    await expect(chip(page)).toHaveText(/ · OVERVIEW$/, { timeout: 10_000 });
    await win.locator('[data-estate-enter="BLK_509"]').click();
    await expect(spoken(page)).toHaveText(/cannot be entered/);
    await expect(win.locator('[data-estate-notice]')).toHaveText(/^Blk 509 cannot be entered/);
    await expect(chip(page)).toHaveText(/ · OVERVIEW$/);
    expect(await stage(page).getAttribute('data-estate-band')).toBeNull();
    expect(errors).toEqual([]);
  });

  test('17 · an engine chunk that failed to download offers Reload, which loads it', async ({ page }) => {
    // Chromium logs the failed fetch itself; that line is expected here.
    const errors = collectErrors(page, [/Failed to load resource: the server responded with a status of 503/]);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const block = /\/assets\/estate-engine-[\w-]+\.js$/;
    await page.route(block, (route) => route.fulfill({ status: 503, body: 'unavailable' }));
    let win = await openEstate(page);
    await win.getByRole('button', { name: /^Load the 3D estate · / }).click();
    await expect(phase(page)).toHaveAttribute('data-estate-phase', 'error', { timeout: LIVE_TIMEOUT });
    await expect(win.locator('.wb-estate-state')).toHaveText('The 3D viewer did not download. Reload to try again.');
    // A browser never fetches a failed module URL again in the same document, so
    // the only action offered is the one that can work.
    const reload = win.getByRole('button', { name: 'Reload' });
    await expect(reload).toBeVisible();
    await expect(win.getByRole('button', { name: 'Retry' })).toHaveCount(0);
    await page.unroute(block);
    await Promise.all([page.waitForEvent('load'), reload.click()]);
    await booted(page);
    await page.getByRole('navigation', { name: 'Tool rail' }).getByRole('button', { name: 'Open Estate' }).click();
    win = page.getByRole('dialog', { name: 'Estate' });
    await win.getByRole('button', { name: /^Load the 3D estate · / }).click();
    await waitLive(page);
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

    // What travels: a pack file is stored gzipped and sent as is; anything else
    // (pack.json, the engine's chunks) is counted as gzip -9 would send it. The
    // poster is on screen before the click and the label leaves it out (policy.ts
    // consentBytes), so it is left out here too, wherever its response lands.
    const sizes: Promise<number>[] = [];
    const onResponse = (response: Response) => {
      const path = new URL(response.url()).pathname;
      if (/^\/estate\/v\d+\.\d+\/poster\//.test(path)) return;
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

  test('18 · Plan: Blk 509 L5 from the Overview strip, ↓ cycles rooms aloud, the cut moves, Enter walks into the picked room', async ({ page }) => {
    const errors = collectErrors(page);
    const paths = collectPaths(page);
    const estateRequests = () => paths.filter((path) => ESTATE_FILES.test(path)).length;
    const win = await openEstate(page);
    await waitLive(page);
    await flyToAndLand(page, 'BLK_509', /^BLK 509 · /);
    // Overview's strip is the selection's storeys, each opening Plan there.
    await expect(win.locator('[data-estate-strip="plan"]')).toBeVisible();
    await win.getByRole('button', { name: 'L5 +12.00, plan view' }).click();
    await expect(chip(page)).toHaveText('BLK 509 · L5 · PLAN');
    await expect(hud(page)).toHaveAttribute('data-mode', 'plan');
    await expect(win.getByRole('button', { name: 'L5 +12.00, in plan' })).toBeDisabled();
    // The cut storey opens once the interior is in, with every room of L5 listed in the side panel.
    await expect.poll(() => stage(page).getAttribute('data-estate-band'), { timeout: LIVE_TIMEOUT }).toMatch(/^L[34]–L[56]$/);
    const rooms = win.getByRole('region', { name: 'Rooms of Blk 509, L5' });
    await expect(rooms.locator('[data-estate-room]')).toHaveCount(105, { timeout: LIVE_TIMEOUT });
    await expect.poll(() => hud(page).getAttribute('data-flight')).toBeNull();
    await settle(page);
    // The cut adds no program (it draws with glass's), and the caps hold.
    expect(await readout(page, 'programs')).toBeLessThanOrEqual(6);
    expect(await readout(page, 'draws')).toBeLessThanOrEqual(150);
    expect(await readout(page, 'tris')).toBeLessThanOrEqual(1_200_000);
    // ↓ on the stage cycles the rooms, each said with its place in the list; the list and the chip follow.
    await stage(page).focus();
    await page.keyboard.press('ArrowDown');
    await expect(spoken(page)).toHaveText(/^Unit 05-101, Bathroom, 1 of 105/);
    await page.keyboard.press('ArrowDown');
    await expect(spoken(page)).toHaveText(/^Unit 05-101, Bedroom, 2 of 105/);
    await expect(win.locator('[data-estate-plan-room]')).toContainText('#05-101 · Bedroom');
    await expect(rooms.getByRole('group', { name: '#05-101' }).getByRole('button', { name: 'Bedroom' })).toHaveAttribute('aria-pressed', 'true');
    // Said, not shown: no notice chip for a pick.
    await expect(win.locator('[data-estate-notice]')).toHaveCount(0);
    // ] raises the cut a step, [ lowers it.
    await page.keyboard.press(']');
    await expect(win.locator('[data-estate-cut]')).toContainText('+1.50 M');
    await page.keyboard.press('[');
    await expect(win.locator('[data-estate-cut]')).toContainText('+1.20 M');
    // Plan's HUD (strip, room and cut chips, steps) and the room list are as clean for axe as Overview's.
    expect(await allFindings(page)).toEqual([]);
    // Enter walks in: the arc comes down through the cut into the bedroom, on L5. Nothing of Blk 509
    // downloads again (Plan had its interior, walk grid and rooms); Walk itself brings the ground
    // heights, and a neighbour within 40 m prefetches its interior, as after any Enter (§7.5, §7.6).
    const before = estateRequests();
    await page.keyboard.press('Enter');
    await expect(chip(page)).toHaveText(/^BLK 509 · L5 · #05-101 · BEDROOM · WALK$/, { timeout: 20_000 });
    await expect.poll(() => hud(page).getAttribute('data-flight')).toBeNull();
    await expect(win.locator('[data-estate-rooms]')).toHaveCount(0);
    await settle(page);
    const walkIn = paths.filter((path) => ESTATE_FILES.test(path)).slice(before);
    expect(walkIn.filter((path) => /\/BLK_509\./.test(path)), 'Blk 509 files downloaded again for the walk-in').toEqual([]);
    expect(walkIn.every((path) => /\/site\/ground\.|\/(?:i|w|nav)\/BLK_5\d\d\./.test(path)), walkIn.join(' ')).toBe(true);
    expect(await stage(page).getAttribute('data-estate-band')).toMatch(/^L[34]–L[67]$/);
    // PLAN while walking plans the storey underfoot (L5), not the block's first typical storey (L2).
    await hud(page).getByRole('group', { name: 'Camera mode' }).getByRole('button', { name: 'Plan' }).click();
    await expect(chip(page)).toHaveText('BLK 509 · L5 · PLAN');
    expect(errors).toEqual([]);
  });

  test('19 · Plan: Esc leaves it and clears the selection with it, so the next Esc minimises the window', async ({ page }) => {
    const errors = collectErrors(page);
    const win = await openEstate(page);
    await waitLive(page);
    await flyToAndLand(page, 'MSCP_513', /^MSCP 513 · /);
    await win.getByRole('button', { name: 'L2 +3.00, plan view' }).click();
    await expect(chip(page)).toHaveText('MSCP 513 · L2 · PLAN');
    await expect(win.getByRole('region', { name: 'Rooms of Multi-storey car park 513, L2' })).toBeVisible({ timeout: LIVE_TIMEOUT });
    await stage(page).focus();
    await page.keyboard.press('PageUp');
    await expect(chip(page)).toHaveText('MSCP 513 · L3 · PLAN');
    await page.keyboard.press('Escape');
    await expect(chip(page)).toHaveText(/ · OVERVIEW$/);
    await expect(win.locator('[data-estate-site="MSCP_513"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(win.locator('[data-estate-rooms]')).toHaveCount(0);
    await expect(win).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(win).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('20 · the assistant on its local fallback: "take me into the hawker centre" opens the Estate and walks in at an NC 514 entrance', async ({ page }) => {
    // The page agent is unreachable, so the answer is AskThePage's own local index
    // (never a network model); Chromium logs the aborted request, which is expected.
    const errors = collectErrors(page, [/Failed to load resource: net::ERR_FAILED/]);
    await page.route('**/api/page-agent', (route) => route.abort());
    await page.goto('/?estate-quality=min');
    await booted(page);
    await page.getByRole('button', { name: 'AI, open Ask this portfolio' }).click();
    await page.getByLabel('Question or page command').fill('take me into the hawker centre');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.locator('.assistant-status')).toHaveText('Answered by the safe local portfolio index.');
    const win = page.getByRole('dialog', { name: 'Estate' });
    await expect(win).toBeVisible();
    // The request waited for the viewer to go live, then walked in: Walk on NC 514's L1, at one of its entrances.
    await expect(chip(page)).toHaveText(/^NC 514 · L1 · .*WALK$/, { timeout: 60_000 });
    await expect.poll(() => hud(page).getAttribute('data-flight'), { timeout: 10_000 }).toBeNull();
    await expect(win.locator('[data-estate-row-action="exit"]')).toHaveText('Exit Hawker centre');
    // The building travelled in the event only: the workbench was asked for #world, never a building id.
    expect(page.url()).not.toMatch(/NC_514/);
    expect(errors).toEqual([]);
  });

  test('21 · Plan’s room list by keyboard: the same plan asked twice stays; one Tab stop whose arrows pick; Walk into hands the keys to the stage, so Esc goes back to Overview', async ({ page }) => {
    const errors = collectErrors(page);
    const win = await openEstate(page);
    await waitLive(page);
    // The assistant's focusEstate with a storey (as AskThePage sends it) opens Plan there.
    const ask = () => page.evaluate(() => { window.dispatchEvent(new CustomEvent('portfolio:estate-focus', { detail: { site: 'BLK_509', storey: 'L05' } })); });
    await ask();
    await expect(chip(page)).toHaveText('BLK 509 · L5 · PLAN', { timeout: LIVE_TIMEOUT });
    const rooms = win.getByRole('region', { name: 'Rooms of Blk 509, L5' });
    await expect(rooms.locator('[data-estate-room]')).toHaveCount(105, { timeout: LIVE_TIMEOUT });
    await expect.poll(() => hud(page).getAttribute('data-flight')).toBeNull();
    // Asked again, as a model does on a follow-up: the plan stays, no fly-to back to Overview.
    await ask();
    await page.waitForTimeout(1_500);
    await expect(chip(page)).toHaveText('BLK 509 · L5 · PLAN');
    await expect(hud(page)).toHaveAttribute('data-mode', 'plan');
    // One stop in the tab order, and "Walk into …" waiting in its slot under the list.
    const room = (i: number) => rooms.locator(`[data-estate-room="${i}"]`);
    const walkInto = rooms.locator('[data-estate-rooms-walkin]');
    await expect(rooms.locator('[data-estate-room][tabindex="0"]')).toHaveCount(1);
    await expect(walkInto).toBeDisabled();
    await expect(walkInto).toHaveText('Pick a room to walk in');
    const top = () => room(0).evaluate((node) => Math.round(node.getBoundingClientRect().top));
    const before = await top();
    // ↓ moves to the next room and picks it, the stage's way; the first pick moves no row.
    await room(0).focus();
    await page.keyboard.press('ArrowDown');
    await expect(room(1)).toBeFocused();
    await expect(room(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(win.locator('[data-estate-plan-room]')).toContainText('#05-101 · Bedroom');
    expect(await top()).toBe(before);
    await page.keyboard.press('ArrowUp');
    await expect(room(0)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    // Tab leaves the list for Walk into; Enter walks in, and the keys go to the stage, not the page.
    await page.keyboard.press('Tab');
    await expect(walkInto).toBeFocused();
    await expect(walkInto).toHaveText('Walk into #05-101 · Bedroom');
    await page.keyboard.press('Enter');
    await expect(chip(page)).toHaveText(/^BLK 509 · L5 · #05-101 · BEDROOM · WALK$/, { timeout: 20_000 });
    await expect(stage(page)).toBeFocused();
    await expect.poll(() => hud(page).getAttribute('data-flight')).toBeNull();
    // Esc in Walk is Walk → Overview; the window stays.
    await page.keyboard.press('Escape');
    await expect(chip(page)).toHaveText(/ · OVERVIEW$/);
    await expect(win).toBeVisible();
    // Plan again; Esc on a room leaves it with the keys on the stage, and the next Esc minimises.
    await ask();
    await expect(chip(page)).toHaveText('BLK 509 · L5 · PLAN', { timeout: LIVE_TIMEOUT });
    await expect(rooms.locator('[data-estate-room]')).toHaveCount(105);
    await rooms.locator('[data-estate-room][tabindex="0"]').focus();
    await page.keyboard.press('Escape');
    await expect(chip(page)).toHaveText(/ · OVERVIEW$/);
    await expect(stage(page)).toBeFocused();
    await expect(win).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(win).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('10 · at 390 × 844, ?app=world-3d shows the PROJECTS chip and the Estate row, pointing to the desktop', async ({ page }) => {
    const paths = collectPaths(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?app=world-3d');
    await expect(page.getByRole('button', { name: 'PROJECTS' })).toHaveAttribute('data-active', 'true');
    await expect(page.getByRole('button', { name: /Sample Town N5/, expanded: true })).toBeVisible();
    const link = page.locator('a[href="/?app=world-3d"]');
    await expect(link).toHaveText('OPEN ON DESKTOP');
    await expect(link).toBeVisible();
    await page.waitForLoadState('networkidle');
    // No 3D on a phone: nothing of the pack, the engine or its HUD is fetched.
    expect(paths.filter((path) => ESTATE_FILES.test(path) && !/\/poster\//.test(path))).toEqual([]);
    expect(paths.filter((path) => ENGINE_CHUNKS.test(path))).toEqual([]);
  });
});
