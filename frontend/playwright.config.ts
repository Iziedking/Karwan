import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.KARWAN_E2E_PORT || 3100);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  // Reduced motion so entrance fades finish immediately: a contrast scan run
  // mid-fade measures a blended colour and reports failures that do not exist
  // once the page has settled.
  use: { baseURL, reducedMotion: 'reduce' },
  webServer: {
    command: `npx next build && npx next start -p ${port}`,
    url: baseURL,
    timeout: 600_000,
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_BACKEND_URL: 'http://127.0.0.1:3199',
      NEXT_PUBLIC_DEAL_WORKSPACE_V2: '1',
      NEXT_PUBLIC_MONEY_V2: '1',
      NEXT_PUBLIC_SEARCH_V2: '1',
      // Balances are read from the chain; the specs answer this RPC themselves.
      NEXT_PUBLIC_ARC_RPC_URL: 'http://127.0.0.1:3198',
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
