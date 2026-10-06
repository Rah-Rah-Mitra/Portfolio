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
      build: {
        rollupOptions: {
          output: {
            // The Estate engine's chunk holds estate/engine/index.ts, which Rollup
            // would name index-<hash>.js, the entry chunk's own pattern. Named for
            // what it is, it cannot be mistaken for the entry by anything globbing
            // dist/assets. It is found by the module it holds, not by its facade:
            // since P7's bench chunk imports from it, Rollup reports no facade for
            // it. The chunk the engine shares with its HUD (pure lib/estate
            // modules, no facade) would take the name of whichever module Rollup
            // lists first, which moved from announce to plan in P6: it is
            // estate-shared instead, whatever it holds. The §12.4 bench
            // (engine/bench.ts, which the engine imports only under
            // ?estate-bench=1) is estate-bench. Every other chunk keeps Vite's
            // default name.
            chunkFileNames: (chunk) => (
              chunk.moduleIds.some((id) => /[\\/]estate[\\/]engine[\\/]index\.ts$/.test(id))
                ? 'assets/estate-engine-[hash].js'
                : /[\\/]estate[\\/]engine[\\/]bench\.ts$/.test(chunk.facadeModuleId ?? '')
                  ? 'assets/estate-bench-[hash].js'
                  : !chunk.isEntry && !chunk.isDynamicEntry && chunk.moduleIds.some((id) => /[\\/]lib[\\/]estate[\\/]/.test(id))
                  ? 'assets/estate-shared-[hash].js'
                  : 'assets/[name]-[hash].js'
            ),
          },
        },
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
