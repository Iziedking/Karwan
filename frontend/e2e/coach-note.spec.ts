import { expect, test } from '@playwright/test';
import { moneyPagesCopy } from '../shared/i18n/messages/moneyPages';
import { funded, serveMoney } from './moneyFixtures';

/// The first visit to Money shows one note under the balance, in the soft green
/// bubble, closed with Got it and never shown again (owner, 9 Nov 2026, Figma 218:604).

for (const locale of ['en', 'ar'] as const) {
  test(`the first-visit note on Money shows once and Got it is remembered, ${locale}`, async ({ page }, info) => {
    await page.context().addCookies([{ name: 'karwan-locale', value: locale, domain: '127.0.0.1', path: '/' }]);
    await serveMoney(page, { balances: funded });
    // The money fixtures turn the page guide off; this person has it on and has
    // already seen the first-run welcome, which goes first.
    await page.addInitScript(() => {
      localStorage.removeItem('karwan:guide:disabled');
      localStorage.setItem('karwan:guide:seen', JSON.stringify(['welcome-v1']));
    });
    await page.goto('/account');
    const note = page.locator('[data-coach-note="money-balance"]');
    await expect(note).toHaveText(new RegExp(moneyPagesCopy[locale].firstVisit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await expect(page.locator('.karwan-splash-mark')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: info.outputPath(`coach-note-${locale}.png`), fullPage: true });
    await note.locator('[data-coach-got-it]').click();
    await expect(note).toHaveCount(0);
    await page.reload();
    await expect(page.locator('[data-money-actions]')).toBeVisible();
    await expect(note).toHaveCount(0);
  });
}

test('someone with the page guide off never sees the first-visit note', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  await page.goto('/account');
  await expect(page.locator('[data-money-actions]')).toBeVisible();
  await expect(page.locator('[data-coach-note]')).toHaveCount(0);
});
