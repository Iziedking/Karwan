import { chromium, expect, test } from '@playwright/test';
import { BUYER } from './fixtures';

const API = 'http://127.0.0.1:3199';

test('agent linking is one action inside equal stake and yield panels', async ({ baseURL }) => {
  test.setTimeout(120_000);
  const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : 'chromium' });
  try {
    for (const { width, height, theme } of [
      { width: 1440, height: 900, theme: 'dark' },
      { width: 768, height: 1024, theme: 'light' },
      { width: 390, height: 844, theme: 'dark' },
    ]) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      await page.addInitScript((value) => {
        localStorage.setItem('karwan-theme', value);
        localStorage.setItem('karwan:guide:disabled', '1');
      }, theme);
      await page.route(`${API}/**`, async (route) => {
        const { pathname } = new URL(route.request().url());
        if (route.request().method() !== 'GET') return route.fulfill({ status: 403, body: '' });
        if (pathname === '/api/auth/bootstrap') {
          return route.fulfill({ json: { user: { address: BUYER, method: 'circle', hasPasskey: true }, profile: null } });
        }
        if (pathname === '/api/activation/agent-binding') {
          return route.fulfill({ json: { activated: true, agents: [{ agent: '0x3333333333333333333333333333333333333333', kind: 'unbound' }] } });
        }
        if (pathname === '/api/vault/positions') {
          return route.fulfill({ json: {
            vaultAddress: '0x4444444444444444444444444444444444444444',
            positions: [], totalActiveUsdc: '0', totalCoolingUsdc: '0',
            reservedUsdc: '0', freeStakeUsdc: '0', cooldownDays: 3, synced: true,
          } });
        }
        if (pathname === '/api/yield/me') {
          return route.fulfill({ json: { configured: true, address: BUYER, claimableUsdc: '0', lifetimeCreditedUsdc: '0', lifetimeClaimedUsdc: '0' } });
        }
        if (pathname === '/api/reputation') return route.fulfill({ json: { score: 0, tier: 'NEW' } });
        if (pathname.includes('legacy')) return route.fulfill({ json: { positions: [], totalActiveUsdc: '0', totalCoolingUsdc: '0' } });
        return route.fulfill({ json: { items: [], events: [], movements: [], messages: [] } });
      });
      await page.goto(`${baseURL}/stake`);

      const stake = page.getByTestId('stake-account-card');
      const yieldPanel = page.locator('[data-guide="stake-your-yield"]');
      await expect(stake).toBeVisible();
      await expect(yieldPanel).toBeVisible();
      await expect(stake.getByRole('button', { name: 'Link agent' })).toBeVisible();
      await expect(page.getByText('Let your agents use your stake')).toHaveCount(0);

      const stakeBox = await stake.boundingBox();
      const yieldBox = await yieldPanel.boundingBox();
      expect(stakeBox).not.toBeNull();
      expect(yieldBox).not.toBeNull();
      expect(Math.abs(stakeBox!.width - yieldBox!.width)).toBeLessThanOrEqual(1);
      if (width >= 1024) expect(Math.abs(stakeBox!.height - yieldBox!.height)).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      await context.close();
    }
  } finally {
    await browser.close();
  }
});
