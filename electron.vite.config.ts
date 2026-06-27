import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@judge': resolve(__dirname, 'src/judge')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: 'src/renderer',
    server: {
      fs: {
        // Renderer code imports from src/shared, src/judge, and data/cache/*.
        allow: [resolve(__dirname, '.')]
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          snip: resolve(__dirname, 'src/renderer/snip.html')
        }
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@judge': resolve(__dirname, 'src/judge'),
        '@renderer': resolve(__dirname, 'src/renderer')
      }
    }
  }
});
