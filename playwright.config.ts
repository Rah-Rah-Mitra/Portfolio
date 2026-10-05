import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4175';

// Containers with a system-provisioned Chromium (no playwright install) can
// point PLAYWRIGHT_CHROMIUM_PATH at it instead of downloading a browser.
const executable = process.env.PLAYWRIGHT_CHROMIUM_PATH
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
  : {};

// The Estate window's live 3D view (tests/e2e/estate.spec.ts) needs WebGL2, which
// headless Chromium on a CI box without a GPU only has through SwiftShader. The
// rest of the suite runs without these flags, as it always has.
const WEBGL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const ESTATE_SPEC = /estate\.spec\.ts$/;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: executable,
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    // Acceptance exercises the pre-rendered semantic document, so the local
    // server must be the production build rather than Vite's source shell.
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4175',
    url: baseURL,
    reuseExistingServer: true,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: ESTATE_SPEC },
    {
      name: 'chromium-webgl',
      testMatch: ESTATE_SPEC,
      timeout: 90_000,
      use: { ...devices['Desktop Chrome'], launchOptions: { ...executable, args: WEBGL } },
    },
  ],
});
