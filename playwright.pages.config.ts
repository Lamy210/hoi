import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/pages',
  timeout: 60000,
  use: { baseURL: 'http://localhost:4174', viewport: { width: 1440, height: 900 } },
  webServer: {
    command: 'npm run preview -- --port 4174 --strictPort --base /hoi/',
    url: 'http://localhost:4174/hoi/',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
