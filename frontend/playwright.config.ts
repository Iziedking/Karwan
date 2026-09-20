import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  // Reduced motion so entrance fades finish immediately: a contrast scan run
  // mid-fade measures a blended colour and reports failures that do not exist
  // once the page has settled.
  use: { baseURL: 'http://127.0.0.1:3100', reducedMotion: 'reduce' },
  webServer: {
    command: 'npx next build && npx next start -p 3100',
    url: 'http://127.0.0.1:3100',
    timeout: 600_000,
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_BACKEND_URL: 'http://127.0.0.1:3199',
      NEXT_PUBLIC_DEAL_WORKSPACE_V2: '1',
    },
  },
  projects: [
    // Chromium at phone metrics rather than devices['iPhone 13'], which is a
    // WebKit profile: CI installs Chromium only.
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: false, hasTouch: true } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
