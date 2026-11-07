import { expect, test, type Page } from '@playwright/test';
import { owedMoneyCopy } from '../shared/i18n/messages/owedMoney';
import { funded, serveMoney } from './moneyFixtures';

/// Money owed to you (view 66): a payout that could not be delivered is shown
/// on Money only when something is owed, and Collect opens the confirm sheet.

const API = 'http://127.0.0.1:3199';
const t = owedMoneyCopy.en;

async function serveOwed(page: Page, lines: Array<{ id: string; amountUsdc: string; signs: 'karwan' | 'you'; from: string }>, collected: string[] = []) {
  await page.route(`${API}/api/money/owed**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/money/owed/collect') {
      collected.push('collect');
      return route.fulfill({ json: { collected: lines.map((l) => ({ id: l.id, amountUsdc: l.amountUsdc, reference: 'KWN-2026-0009', txHash: null })), failed: [], yoursToSign: [] } });
    }
    const open = collected.length ? [] : lines;
    const total = open.reduce((n, l) => n + Number(l.amountUsdc), 0);
    return route.fulfill({ json: { totalUsdc: String(total), unreadable: false, lines: open } });
  });
}

test('nothing owed shows no row', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  await serveOwed(page, []);
  await page.goto('/account');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('1,360.50');
  await expect(page.locator('[data-owed]')).toHaveCount(0);
});

test('money owed shows its amount and Collect opens the confirm sheet, which sends it', async ({ page }) => {
  const collected: string[] = [];
  await serveMoney(page, { balances: funded });
  await serveOwed(page, [{ id: `agreement:0x${'bb'.repeat(20)}`, amountUsdc: '40', signs: 'karwan', from: 'deal' }], collected);
  await page.goto('/account');
  const row = page.locator('[data-owed]');
  await expect(row.getByRole('heading', { name: t.title })).toBeVisible();
  await expect(row).toContainText('40.00');
  await expect(row).toContainText(t.why);
  await row.getByRole('button', { name: t.collect, exact: true }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: t.sheet.title })).toBeVisible();
  await expect(sheet).toContainText(t.sheet.toValue);
  await expect(sheet).toContainText(/40(.00)? USDC/);
  await sheet.getByTestId('deal-confirm').click();
  await expect(row.getByRole('status')).toHaveText(t.done);
  expect(collected).toEqual(['collect']);
  await expect(row.getByRole('button', { name: t.collect, exact: true })).toHaveCount(0);
});
