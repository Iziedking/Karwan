import { expect, test } from '@playwright/test';
import { BUYER } from './fixtures';

const API = 'http://127.0.0.1:3199';
const profile = { address: BUYER, displayName: 'breezee', handle: 'breezee', role: 'buyer', createdAt: 1, updatedAt: 1 };

test('the activation banner sits beside the workspace rail, never under it', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the rail shows on desktop only');
  await page.addInitScript(() => localStorage.setItem('karwan:guide:disabled', '1'));
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/auth/bootstrap') {
      return route.fulfill({ json: { user: { address: BUYER, method: 'circle', hasPasskey: true }, profile } });
    }
    if (pathname === '/api/profile') return route.fulfill({ json: { profile } });
    // Agents not activated yet: the activation banner shows, as on a new account.
    if (pathname === '/api/activation/status') return route.fulfill({ json: { activated: false } });
    if (route.request().method() !== 'GET') return route.fulfill({ status: 403, body: '' });
    return route.fulfill({ json: { items: [], events: [], movements: [], messages: [] } });
  });

  await page.goto('/app');
  const banner = page.locator('[data-workspace-nudge="true"] aside');
  const rail = page.locator('#workspace-navigation');
  await expect(banner).toBeVisible();
  await expect(rail).toBeVisible();
  const b = (await banner.boundingBox())!;
  const r = (await rail.boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(r.x + r.width);
  if (process.env.KARWAN_SHOTS) await page.screenshot({ path: '/out/nudge.png' });
});
