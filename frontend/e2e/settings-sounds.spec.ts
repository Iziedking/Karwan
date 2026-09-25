import { expect, test } from '@playwright/test';

const API = 'http://127.0.0.1:3199';
const ME = '0x1111111111111111111111111111111111111111';

test('the sounds switch mutes money sounds on this device', async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('karwan:guide:disabled', '1'); } catch { /* private mode */ }
  });
  await page.route(`${API}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/bootstrap') {
      return route.fulfill({ json: { user: { address: ME, method: 'circle', hasPasskey: true }, profile: null } });
    }
    if (path.startsWith('/api/client-errors')) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ json: { items: [], events: [], movements: [], messages: [], bridges: [] } });
  });
  await page.goto('/settings');
  const toggle = page.getByRole('switch', { name: 'Play a sound when money moves' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(await page.evaluate(() => localStorage.getItem('karwan-sfx'))).toBe('off');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => localStorage.getItem('karwan-sfx'))).toBe('on');
});
