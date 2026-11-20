import { expect, test } from '@playwright/test';
import type { DirectDeal } from '../core/api';
import { dealRecordCopy } from '../shared/i18n/messages/dealRecord';
import { API } from './moneyFixtures';
import { BUYER, JOB, SELLER, deliveredDeal, serveDeal } from './fixtures';

/// View 94: a finished deal shows its signed record, either side shares it by
/// a link it can take back, and the shared page names people, never addresses
/// (Figma 382:570).
const t = dealRecordCopy.en;
const T = Date.UTC(2026, 9, 20, 10);
const DAY = 86_400_000;
const HELD_TX = `0x${'e5'.repeat(32)}`;
const PAID_TX = `0x${'f6'.repeat(32)}`;

const settled = {
  ...deliveredDeal,
  settledAt: T + 6 * DAY,
  onChain: { ...deliveredDeal.onChain!, state: 3 },
  view: {
    ...deliveredDeal.view!, stage: 'settled', money: { line: 'released' },
    progress: deliveredDeal.view!.progress.map((p) => ({ ...p, state: 'done' })),
    next: { action: null, actor: 'nobody', amountUsdc: null }, automatic: null,
  },
} as DirectDeal;

const record = {
  v: 1,
  jobId: JOB,
  reference: 'ABAB-ABAB',
  kind: 'goods',
  buyer: BUYER,
  seller: SELLER,
  agreed: { digest: null, buyerAt: T + DAY, sellerAt: T, title: 'Cotton lint, 20 bales', priceUsdc: '500' },
  held: { usdc: '500', at: T + DAY, tx: HELD_TX, reference: 'KWN-HELD' },
  stages: [
    {
      index: 0,
      confirmed: { way: 'buyer_confirmed', at: T + 5 * DAY },
      released: { sellerUsdc: '495', refundUsdc: '0', feeUsdc: '5', at: T + 6 * DAY, tx: PAID_TX, reference: 'KWN-PAID' },
    },
  ],
  ended: 'settled',
  endedAt: T + 6 * DAY,
};
const { buyer: _b, seller: _s, jobId: _j, ...sharedRecord } = record;

test('a finished deal shows its record, and a side shares it, opens it signed out and takes it back', async ({ page, browser }) => {
  await serveDeal(page, settled, SELLER);
  let live: string | null = null;
  const token = 'k3Fq9aZ';
  await page.route(`${API}/api/deals/${JOB}/record`, (route) =>
    route.fulfill({ json: { side: 'seller', record, digest: '0x01', writtenAt: T + 6 * DAY + 3_600_000, proof: {}, share: live } }));
  await page.route(`${API}/api/deals/${JOB}/record/share`, async (route) => {
    if (route.request().method() === 'DELETE') {
      live = null;
      return route.fulfill({ json: { stopped: true } });
    }
    live = token;
    return route.fulfill({ json: { token, link: `https://karwan.site/deal-record/${token}` } });
  });

  await page.goto(`/deals/${JOB}`);
  const card = page.locator('[data-deal-record]');
  await expect(card.getByRole('heading', { name: t.title })).toBeVisible();
  await expect(card).toContainText('ABAB-ABAB');
  await expect(card.locator('[data-row="agreed"]')).toContainText('500 USDC for Cotton lint, 20 bales');
  await expect(card.locator('[data-row="held"]')).toContainText('500 USDC');
  await expect(card.locator('[data-row="held"] a')).toHaveAttribute('href', new RegExp(`${HELD_TX}$`));
  await expect(card.locator('[data-row="confirmed"]')).toContainText(t.ways.buyer_confirmed);
  await expect(card.locator('[data-row="released"]')).toContainText('495 USDC to you');
  await expect(card.locator('[data-row="released"]')).toContainText('5 USDC fee');
  await expect(card.locator('[data-row="released"] a')).toHaveAttribute('href', new RegExp(`${PAID_TX}$`));
  await expect(card.locator('[data-row="signed"]')).toContainText(t.signedBy);

  await card.getByRole('button', { name: t.share }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: t.sheetTitle })).toBeVisible();
  await expect(sheet.getByText(t.sheetLine)).toBeVisible();
  await expect(sheet.locator('[data-share-link]')).toHaveText(`https://karwan.site/deal-record/${token}`);
  await expect(sheet.getByRole('button', { name: t.copy })).toBeVisible();

  // Anyone with the link, signed out, reads the same record by name, never by address.
  const outsider = await browser.newPage();
  await outsider.route(`${API}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === `/api/deal-records/shared/${token}`) {
      return live
        ? route.fulfill({ json: { sharedBy: 'seller', buyer: { name: 'Ada Obi', tag: 'ada' }, seller: { name: 'Musa Tailors', tag: 'musa' }, record: sharedRecord, writtenAt: T + 6 * DAY, signedByKarwan: true } })
        : route.fulfill({ status: 404, json: { error: 'No deal record here.', code: 'not_found' } });
    }
    if (path === '/api/auth/bootstrap') return route.fulfill({ json: { user: null, profile: null } });
    return route.fulfill({ json: { items: [] } });
  });
  await outsider.goto(`/deal-record/${token}`);
  const shared = outsider.locator('[data-shared-record]');
  await expect(shared.getByRole('heading', { name: t.title })).toBeVisible();
  await expect(shared).toContainText('ABAB-ABAB');
  await expect(shared).toContainText(t.sharedBySeller);
  await expect(shared.locator('[data-side="buyer"]')).toContainText('Ada Obi');
  await expect(shared.locator('[data-side="buyer"]')).toContainText('@ada');
  await expect(shared.locator('[data-side="seller"]')).toContainText('Musa Tailors');
  await expect(shared.locator('[data-row="released"]')).toContainText('495 USDC to the seller');
  await expect(shared.locator('[data-signature]')).toHaveText(t.signatureHolds);
  await expect(shared).not.toContainText(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/);

  await sheet.getByRole('button', { name: t.stop }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await outsider.reload();
  await expect(outsider.getByText(t.notFound)).toBeVisible();
  await outsider.close();
});

test('a deal that ended before its record is written says it is on its way', async ({ page }) => {
  await serveDeal(page, settled, BUYER);
  await page.route(`${API}/api/deals/${JOB}/record`, (route) => route.fulfill({ status: 404, json: { error: 'No deal record here.', code: 'not_found' } }));
  await page.goto(`/deals/${JOB}`);
  await expect(page.locator('[data-deal-record]')).toContainText(t.writing);
  await expect(page.locator('[data-deal-record]').getByRole('button', { name: t.share })).toHaveCount(0);
});

test('a deal still under way has no record section', async ({ page }) => {
  await serveDeal(page, deliveredDeal, BUYER);
  await page.goto(`/deals/${JOB}`);
  await expect(page.locator('[data-deal-workspace], main').first()).toBeVisible();
  await expect(page.locator('[data-deal-record]')).toHaveCount(0);
});
