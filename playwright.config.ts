import { defineConfig, devices } from '@playwright/test';

/**
 * Browser smoke test, run locally before a push (`.githooks/pre-push`). CI keeps
 * its own vitest matrix: the point here is to catch a broken build or a dead
 * click path on the machine you are pushing from.
 *
 * One project (Chromium) and one worker keep it under a minute and keep the
 * server's file writes predictable.
 */
const PORT = 19871;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `node scripts/e2e-server.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
