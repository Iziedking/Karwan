import { expect, test } from '@playwright/test';
import { BUYER } from './fixtures';
import { en } from '../shared/i18n/messages/en';

const API = 'http://127.0.0.1:3199';
const HASH = `0x${'3ecd9a91'.repeat(8)}`;
const copy = en.activity.myMoney;

test('a receipt prints as one page with its QR code, mark and stamp', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'print is checked once');
  await page.addInitScript(() => localStorage.setItem('karwan:guide:disabled', '1'));
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/auth/bootstrap') {
      return route.fulfill({ json: { user: { address: BUYER, method: 'circle', hasPasskey: true }, profile: null } });
    }
    if (pathname === '/api/activity/me') {
      return route.fulfill({
        json: {
          items: [{
            id: 'yield-1', ts: Date.UTC(2026, 9, 2, 10), kind: 'yield', summary: 'Earned 1.41 USDC of staking yield',
            amountUsdc: '1.41', txHash: HASH, refId: null, chain: 'arc', jobId: null, status: 'done',
          }],
        },
      });
    }
    if (route.request().method() !== 'GET') return route.fulfill({ status: 403, body: '' });
    return route.fulfill({ json: { items: [], events: [], movements: [], messages: [] } });
  });

  await page.goto(`/activity?receipt=${HASH}`);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(copy.receiptVerifyTitle)).toBeVisible();
  await expect(dialog.locator('canvas[role="img"]')).toBeVisible();
  await expect(dialog.locator('img[src="/brand/karwan-mark-lime.svg"]')).toBeVisible();

  await page.emulateMedia({ media: 'print' });
  const box = await page.locator('.karwan-receipt-print').boundingBox();
  expect(box?.height ?? 0).toBeGreaterThan(300);
  // Nothing but the receipt is laid out in print.
  await expect(dialog.getByRole('button', { name: copy.receiptExportPdf })).toBeHidden();
  await page.pdf({ path: test.info().outputPath('receipt.pdf'), format: 'A4', printBackground: true });
  if (process.env.KARWAN_SHOTS) {
    await page.pdf({ path: '/out/receipt.pdf', format: 'A4', printBackground: true });
    await page.screenshot({ path: '/out/receipt-print.png', fullPage: true });
  }
});
