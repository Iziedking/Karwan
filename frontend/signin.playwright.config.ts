import { defineConfig, devices } from '@playwright/test';

const network = process.env.KARWAN_UI_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
const port = 3100;
const evidence = `../ui-evidence/signin/${network}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: /signin\.spec\.ts$/,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  outputDir: `${evidence}/results`,
  reporter: [['list'], ['json', { outputFile: `${evidence}/report.json` }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    reducedMotion: 'reduce',
    screenshot: 'on',
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  webServer: {
    command: `${process.env.KARWAN_UI_REUSE_BUILD === '1' ? '' : 'npx next build && '}npx next start -p ${port}`,
    url: `http://127.0.0.1:${port}`,
    timeout: 600_000,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_BACKEND_URL: 'http://127.0.0.1:3199',
      NEXT_PUBLIC_ARC_RPC_URL: 'http://127.0.0.1:3198',
      NEXT_PUBLIC_ARC_NETWORK: network,
      NEXT_PUBLIC_DEAL_WORKSPACE_V2: '1',
      NEXT_PUBLIC_MONEY_V2: '1',
      NEXT_PUBLIC_SEARCH_V2: '1',
      ...(network === 'mainnet' ? {
        NEXT_PUBLIC_RECOVERY: '1',
        NEXT_PUBLIC_CIRCLE_CLIENT_KEY: 'LIVE_E2E:0:0',
        NEXT_PUBLIC_CIRCLE_CLIENT_URL: 'http://127.0.0.1:3198',
      } : {}),
    },
  },
  projects: [
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
