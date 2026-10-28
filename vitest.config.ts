import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts on purpose: the app build uses
// `root: src/ui`, while tests live at the repo root.
export default defineConfig({
  test: {
    root: '.',
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    // Watcher-driven tests wait on real filesystem events; give them room on a
    // loaded CI machine instead of failing on the 5 s default.
    testTimeout: 20_000,
    // Several suites start chokidar watchers. Running files in parallel makes
    // FSEvents drop events under load, so the suite runs sequentially.
    fileParallelism: false,
  },
});
