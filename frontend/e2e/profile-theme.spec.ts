import { expect, test } from '@playwright/test';
import { en } from '../shared/i18n/messages/en';
import { API, funded, serveMoney } from './moneyFixtures';

/// The theme (view 48): Dark or Light, chosen in Settings beside the language
/// (view 83), shown at once and saved on the account for the next device.

test('the old Theme link opens Settings, Light applies at once and is saved on the account', async ({ page }, testInfo) => {
  await serveMoney(page, { balances: funded });
  const saved: unknown[] = [];
  await page.route(`${API}/api/settings**`, async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { settings: {} } });
    saved.push(route.request().postDataJSON());
    return route.fulfill({ json: { settings: { theme: 'light' } } });
  });
  await page.goto('/profile/theme');
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { level: 1, name: en.settings.title })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`^${en.settings.theme}`) }).click();
  const dark = page.getByRole('radio', { name: en.settings.themeDark });
  const light = page.getByRole('radio', { name: en.settings.themeLight });
  // Dark unless Light was chosen.
  await expect(dark).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await light.click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('karwan-theme'))).toBe('light');
  await expect.poll(() => saved.length).toBeGreaterThan(0);
  expect(JSON.stringify(saved.at(-1))).toContain('"theme":"light"');
  await expect(page.locator('.karwan-splash-mark')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('theme.png'), fullPage: true });
});
