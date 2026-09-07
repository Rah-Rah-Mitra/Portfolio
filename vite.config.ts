import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
    return {
      server: {
        proxy: {
          '/api': `http://127.0.0.1:${process.env.API_PORT ?? 5174}`,
        },
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
