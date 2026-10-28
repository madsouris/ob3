import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The SPA is built into a single self-contained index.html so it can ship
// inside the npm package and be served by the local Hono server (docs/11).
export default defineConfig({
  root: 'src/ui',
  base: './',
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
  },
});
