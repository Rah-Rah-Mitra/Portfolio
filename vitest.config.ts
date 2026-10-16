import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: { enabled: false },
    // One budget for both projects: under full-suite load (~450 files on the
    // worker pool) the 5 s default is a race, not a deadline. The pure project
    // lost it on 2026-10-16 — drawing-set's regeneration and repo-hygiene's
    // repo scan take 2.0–2.3 s alone and passed 5 s in a full run, with
    // estate-boundary next at 4.1 s — the way the dom project did before it.
    // Raised once here, not per test, for the reason tests/setup.dom.ts gives.
    // 30 s, not dom's old 20 s: repo-hygiene's drawing-chunks case is ~700
    // sequential temp-file writes and reads, under 0.5 s alone and 14.2 s in one full run.
    // A test that sets its own timeout (the estate suites' 30–120 s) keeps it.
    testTimeout: 30000,
    projects: [
      {
        extends: true,
        test: {
          name: 'pure',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['tests/**/*.dom.test.tsx'],
          // See tests/setup.dom.ts — these suites are load-sensitive, not slow.
          setupFiles: ['./tests/setup.dom.ts'],
        },
      },
    ],
  },
});
