import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const uiDir = fileURLToPath(new URL('./src/ui', import.meta.url));

// The SPA is built into a single self-contained index.html so it can ship
// inside the npm package and be served by the local Hono server (docs/11).
export default defineConfig({
  root: 'src/ui',
  base: './',
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: { '@': uiDir },
  },
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
  },
});
