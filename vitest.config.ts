import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: { enabled: false },
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
        },
      },
    ],
  },
});
