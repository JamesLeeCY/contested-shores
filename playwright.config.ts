import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  // Serial: the performance and save tests measure timing and must not compete for the CPU.
  workers: 1,
  use: { baseURL: `http://localhost:4173${process.env.BASE_PATH ?? '/'}`, viewport: { width: 1280, height: 720 } },
  webServer: { command: 'npm run preview -- --port 4173 --strictPort', port: 4173, reuseExistingServer: true },
});
