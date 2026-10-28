import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts on purpose: the app build uses
// `root: src/ui`, while tests live at the repo root.
export default defineConfig({
  test: {
    root: '.',
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
  },
});
