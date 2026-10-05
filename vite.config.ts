import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
    return {
      server: {
        proxy: {
          '/api': `http://127.0.0.1:${process.env.API_PORT ?? 5174}`,
        },
        // external/ is the Bonsai-Estate submodule (provenance only) and artifacts/
        // holds local pack builds; neither is ever served or watched.
        watch: {
          ignored: ['**/external/**', '**/artifacts/**'],
        },
        fs: {
          // Setting deny replaces Vite's defaults, so they are repeated first.
          deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/external/**'],
        },
      },
      // Scan only the real entry: the default crawls every **/*.html, which would
      // include the submodule's reports/report.html.
      optimizeDeps: {
        entries: ['index.html'],
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
