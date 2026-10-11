import { expect, test } from '@playwright/test';

const API = 'http://127.0.0.1:3199';

test('the landing page opens no live event stream; the market still does', async ({ page }) => {
  const streams: string[] = [];
  await page.addInitScript(() => localStorage.setItem('karwan:guide:disabled', '1'));
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/events') {
      streams.push(page.url());
      return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: ': ok\n\n' });
    }
    if (pathname === '/api/auth/bootstrap') return route.fulfill({ json: { user: null, profile: null } });
    return route.fulfill({ json: {} });
  });

  await page.goto('/');
  await expect(page.locator('main')).toBeVisible();
  await page.waitForTimeout(1500);
  expect(streams).toEqual([]);

  await page.goto('/market');
  await expect.poll(() => streams.length, { timeout: 10_000 }).toBeGreaterThan(0);
});
