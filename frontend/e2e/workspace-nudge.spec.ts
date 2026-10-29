import { expect, test } from '@playwright/test';
import { BUYER } from './fixtures';

const API = 'http://127.0.0.1:3199';
test('the profile banner sits beside the workspace rail, never under it', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the rail shows on desktop only');
  await page.addInitScript(() => localStorage.setItem('karwan:guide:disabled', '1'));
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/auth/bootstrap') {
      return route.fulfill({ json: { user: { address: BUYER, method: 'circle', hasPasskey: true }, profile: null } });
    }
    // No profile yet: the one banner left. Agents are set up by Karwan, never a step (view 38).
    if (pathname === '/api/profile') return route.fulfill({ json: { profile: null } });
    if (route.request().method() !== 'GET') return route.fulfill({ status: 403, body: '' });
    return route.fulfill({ json: { items: [], events: [], movements: [], messages: [] } });
  });

  // Home sends an account with no profile to sign-up; Activity keeps the workspace.
  await page.goto('/activity');
  const banner = page.locator('[data-workspace-nudge="true"] aside');
  const rail = page.locator('#workspace-navigation');
  await expect(banner).toBeVisible();
  await expect(rail).toBeVisible();
  const b = (await banner.boundingBox())!;
  const r = (await rail.boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(r.x + r.width);
  if (process.env.KARWAN_SHOTS) await page.screenshot({ path: '/out/nudge.png' });
});
