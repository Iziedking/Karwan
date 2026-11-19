import { expect, test, type Page } from '@playwright/test';

const API = 'http://127.0.0.1:3199';
const ME = '0x1111111111111111111111111111111111111111';
const SAVED = { notificationsMuted: true, publicPassport: false, guide: 'off' };

// Holds the saved settings back until the test lets them through.
async function serve(page: Page) {
  let release!: () => void;
  const held = new Promise<void>((r) => { release = r; });
  await page.addInitScript(() => {
    try { localStorage.setItem('karwan:guide:disabled', '1'); } catch { /* private mode */ }
  });
  await page.route(`${API}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/bootstrap') {
      return route.fulfill({ json: { user: { address: ME, method: 'circle', hasPasskey: true }, profile: null } });
    }
    if (path.startsWith('/api/client-errors')) return route.fulfill({ status: 204, body: '' });
    if (path === '/api/settings' && route.request().method() === 'GET') {
      await held;
      return route.fulfill({ json: { settings: SAVED } });
    }
    if (path === '/api/assistant/memory') {
      await held;
      return route.fulfill({ json: { enabled: false, notes: [] } });
    }
    return route.fulfill({ json: { items: [], events: [], movements: [], messages: [], bridges: [] } });
  });
  return release;
}

const switches = ['Notifications', 'List me on the public Credit Passport board', 'Aman’s help on pages', 'Remember our conversations'];

test('Settings never shows a switch at a value that is not yours while your choices load', async ({ page }) => {
  const release = await serve(page);
  await page.goto('/settings');
  await expect(page.locator('#settings-group-panel')).toBeVisible();
  await page.waitForTimeout(800);
  for (const name of switches) {
    const on = page.getByRole('switch', { name, checked: true });
    await expect(on, `${name} must not read on before the account answers`).toHaveCount(0);
  }
  release();
  for (const name of switches) {
    await expect(page.getByRole('switch', { name }).first()).toHaveAttribute('aria-checked', 'false');
  }
});

test('a second visit to Settings shows your choices at once', async ({ page }) => {
  const release = await serve(page);
  release();
  await page.goto('/settings');
  const notifications = page.getByRole('switch', { name: 'Notifications' });
  await expect(notifications).toHaveAttribute('aria-checked', 'false');
  // From here on the account never answers again: only what was already read can show.
  await page.route(`${API}/api/settings*`, () => undefined);
  await page.getByRole('link', { name: 'Home' }).first().click();
  await page.waitForURL(/\/app/);
  await page.goBack();
  await page.waitForURL(/\/settings/);
  await expect(notifications).toHaveAttribute('aria-checked', 'false');
});
