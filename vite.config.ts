import path from 'path';
import { defineConfig, normalizePath } from 'vite';

// A glob for one folder at the root of this checkout. Vite matches watch and deny
// globs against absolute paths, so a bare '**/external/**' would also match a
// checkout that merely sits under some folder named external (case-insensitively)
// and refuse every file in it. Glob characters in the path are escaped, as Vite
// does for its own cacheDir.
const underRoot = (directory: string) => (
  `${normalizePath(path.resolve(__dirname)).replace(/[()[\]{}!*+?@|]/g, '\\$&')}/${directory}/**`
);

export default defineConfig(() => {
    return {
      server: {
        proxy: {
          '/api': `http://127.0.0.1:${process.env.API_PORT ?? 5174}`,
        },
        // external/ is the Bonsai-Estate submodule (provenance only) and artifacts/
        // holds local pack builds; neither is ever served or watched.
        watch: {
          ignored: [underRoot('external'), underRoot('artifacts')],
        },
        fs: {
          // Setting deny replaces Vite's defaults, so they are repeated first.
          deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', underRoot('external')],
        },
      },
      // Scan only the real entry: the default crawls every **/*.html, which would
      // include the submodule's reports/report.html.
      optimizeDeps: {
        entries: ['index.html'],
        // The Estate window's engine (three r186 and camera-controls) is reached
        // only through the dynamic import in components/workbench/estate/loadEngine.ts.
        // Listing it pre-bundles it at server start, so opening the window in dev
        // does not trigger a dependency re-optimisation and a full page reload.
        include: [
          'three',
          'camera-controls',
          'three/examples/jsm/loaders/GLTFLoader.js',
          'three/examples/jsm/libs/meshopt_decoder.module.js',
        ],
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
