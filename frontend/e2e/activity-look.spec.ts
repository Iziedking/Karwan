import { expect, test, type Page } from '@playwright/test';
import { en } from '../shared/i18n/messages/en';
import { funded, serveMoney } from './moneyFixtures';

/// Activity and receipts in the new look (view 48, batch 9c).

const copy = en.activity.myMoney;
const HASH = `0x${'5a17c0de'.repeat(8)}`;

/// Green controls on the whole page, header and nav included.
const greenControls = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--action').trim();
    document.body.appendChild(probe);
    const green = getComputedStyle(probe).color;
    probe.remove();
    return [...document.querySelectorAll<HTMLElement>('a, button')]
      .filter((el) => el.offsetParent !== null && getComputedStyle(el).backgroundColor === green)
      .map((el) => el.textContent?.trim() ?? '');
  });

async function withMovements(page: Page) {
  const now = Date.now();
  await serveMoney(page, {
    balances: funded,
    activity: [
      { id: 'in-1', ts: now - 3_600_000, kind: 'transfer_in', summary: 'Received 120 USDC', amountUsdc: '120', txHash: HASH, refId: null, chain: 'arc', jobId: null, status: 'done' },
      { id: 'out-1', ts: now - 7_200_000, kind: 'withdraw', summary: 'Withdrew 250 USDC to Base', amountUsdc: '250', txHash: null, refId: null, chain: 'base', jobId: null, status: 'pending' },
    ],
  });
}

test('Activity signs amounts in one ink colour and has no green', async ({ page }, info) => {
  await withMovements(page);
  await page.goto('/activity');
  const rows = page.locator('[data-ledger-status]');
  await expect(rows).toHaveCount(2);
  const colours = await page.locator('[data-ledger-amount]').evaluateAll((els) => els.map((el) => getComputedStyle(el).color));
  expect(colours).toHaveLength(2);
  expect(colours[0]).toBe(colours[1]);
  await expect(page.locator('[data-ledger-amount]').first()).toHaveText(/^\+/);
  await expect(page.locator('[data-ledger-amount]').last()).toHaveText(/^[−-]/);
  expect(await greenControls(page)).toEqual([]);
  await expect(page.locator('.karwan-splash-mark')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('activity.png'), fullPage: true });

  await page.getByRole('button', { name: copy.filter.in, exact: true }).click();
  await expect(rows).toHaveCount(1);
});

test('a receipt opens with Download image as its one green button', async ({ page }, info) => {
  await withMovements(page);
  await page.goto('/activity');
  await page.locator('[data-ledger-status="done"] button').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: copy.receiptTitle })).toBeVisible();
  expect(await greenControls(page)).toEqual([copy.receiptExportImage]);
  await page.screenshot({ path: info.outputPath('receipt.png') });
});
