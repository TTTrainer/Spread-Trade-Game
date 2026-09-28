import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      externalizeDeps: true,
      rollupOptions: { input: { index: resolve(__dirname, 'app/main/index.ts') } },
    },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      externalizeDeps: true,
      rollupOptions: {
        input: { index: resolve(__dirname, 'app/preload/index.ts') },
        // Sandboxed preloads must be CommonJS.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src'),
    base: './',
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      emptyOutDir: true,
      chunkSizeWarningLimit: 4000,
      rollupOptions: { input: resolve(__dirname, 'src/index.html') },
    },
    plugins: [react()],
  },
});
