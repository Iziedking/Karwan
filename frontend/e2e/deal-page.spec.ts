import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { DirectDeal } from '../core/api';
import { en } from '../shared/i18n/messages/en';
import { BUYER, JOB, SELLER, serveDeal } from './fixtures';

/// The deal page for every kind (view 44, Batch 5): the top, the steps, this
/// moment, Checked by Karwan, one move, and the release sheet.

const t = en.dealPage;
const DAY = 86_400_000;
const at = Date.UTC(2026, 9, 28);

const base = (over: Partial<DirectDeal> = {}): DirectDeal => ({
  jobId: JOB,
  buyer: BUYER,
  seller: SELLER,
  dealAmountUsdc: '120',
  firstReleasePct: 100,
  terms: 'Logo in 3 versions\nFull, short and icon.',
  delivered: true,
  deliveredAt: at + 2 * DAY,
  createdAt: at,
  updatedAt: at + 2 * DAY,
  sellerApprovedAt: at,
  acceptedAt: at + DAY,
  agreementVersion: 1,
  agreementDigest: '0xdigest',
  deliveryCheck: 'passed',
  deliveryMatch: { verdict: 'aligned', reason: 'Three logo versions, as agreed.' },
  onChain: { state: 2, milestonePcts: [100], milestonesReleased: 0, dealAmountWei: '120000000', sellerNetWei: '119400000', feeTotalWei: '1200000', releasedWei: '0' },
  view: {
    stage: 'awaiting-final-release',
    money: { line: 'held' },
    progress: [],
    next: { action: 'release', actor: 'you', amountUsdc: '120' },
    automatic: { kind: 'auto-release', at: Date.UTC(2026, 10, 6) },
    hold: null,
  },
  counterpartyTrust: {
    role: 'seller', name: 'Ada', verifiedBusiness: false, verifiedPerson: true,
    facts: { settled: 23, distinctCounterparties: 20, onTime: 22, withDeadline: 23, disputes: 0 },
    memberSince: Date.UTC(2026, 2, 1), stakeUsdc: null, provenAccounts: [], isNew: false,
  },
  ...over,
} as DirectDeal);

const current = (page: Page) => page.locator('[data-steps-track] [aria-current="step"]');
const noSideways = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

test('the buyer sees who, how much, the steps, this moment, the check and one move', async ({ page }, info) => {
  await serveDeal(page, base());
  let released: unknown = null;
  await page.route(`**/api/deals/direct/${JOB}/release`, async (route) => {
    released = route.request().postDataJSON();
    await route.fulfill({ json: { accepted: true, jobId: JOB } });
  });
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('120');
  await expect(page.getByText('Logo in 3 versions', { exact: true })).toBeVisible();
  await expect(page.getByText('Held by Karwan', { exact: true })).toBeVisible();
  await expect(current(page)).toContainText(t.steps.paidOut);
  await expect(page.getByText(t.yourMove, { exact: true })).toBeVisible();
  await expect(page.getByText('Ada delivered. Check it and release the payment.')).toBeVisible();
  await expect(page.getByText('Releases automatically on 6 Nov 2026 unless you raise a problem.')).toBeVisible();
  const card = page.locator('[data-checked-card]');
  await expect(card).toContainText(t.checkedTitle);
  await expect(card).toContainText(t.result.matches);
  await expect(card).toContainText('Three logo versions, as agreed.');

  const release = page.getByRole('button', { name: 'Release 120 USDC' });
  const width = page.viewportSize()!.width;
  if (width >= 1024) await expect(page.locator('[data-steps-card]').getByRole('button', { name: 'Release 120 USDC' })).toBeVisible();
  else expect(await page.locator('[data-move-bar]').evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
  await noSideways(page);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  await page.screenshot({ path: info.outputPath('deal.png'), fullPage: true });

  await release.click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Release 120 USDC to Ada?' })).toBeVisible();
  for (const label of [t.release.to, t.release.for, t.release.deal, t.release.heldBy, t.release.checked]) {
    await expect(sheet.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(sheet.getByText(t.result.matches, { exact: true })).toBeVisible();
  await expect(sheet.getByText(t.release.cannotUndo)).toBeVisible();
  await expect(sheet.getByRole('button', { name: t.release.notYet })).toBeVisible();
  await page.screenshot({ path: info.outputPath('release.png') });
  await sheet.getByRole('button', { name: 'Release 120 USDC' }).click();
  await expect.poll(() => released).not.toBeNull();
});

test('a delivery that does not match asks for changes in a message', async ({ page }) => {
  await serveDeal(page, base({ deliveryCheck: 'held', releaseBlockedReason: 'requirement-mismatch', deliveryMatch: { verdict: 'partial', reason: 'Only two versions came.' } }));
  await page.goto(`/deals/${JOB}`);
  const card = page.locator('[data-checked-card]');
  await expect(card).toContainText(t.result.gap);
  await expect(card).toContainText('Only two versions came.');
  await page.getByRole('button', { name: t.askChanges }).click();
  await expect(page.getByRole('dialog').getByRole('textbox')).toHaveValue(t.changesDraft);
});

test("the seller waits on the buyer and never sees the buyer's review", async ({ page }) => {
  await serveDeal(page, base({
    view: { ...base().view!, next: { action: 'release', actor: 'counterparty', amountUsdc: '120' } },
    counterpartyTrust: { ...base().counterpartyTrust!, role: 'buyer', name: 'Chidi' },
  }), SELLER);
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByText('Waiting on Chidi', { exact: true })).toBeVisible();
  await expect(page.getByText('Chidi is checking your delivery.')).toBeVisible();
  await expect(page.locator('[data-checked-card]')).toContainText(t.result.matches);
  await expect(page.getByText('Three logo versions, as agreed.')).toHaveCount(0);
});

test('goods shipped show On the way and Arrived; handed over shows the handover', async ({ page }) => {
  const shipment = { carrier: 'dhl', carrierName: 'DHL', trackingNumber: '123', trackingUrl: null, dispatchedAt: at + 2 * DAY };
  await serveDeal(page, base({ tradeType: 'goods', shipment }));
  await page.goto(`/deals/${JOB}`);
  await expect(page.locator('[data-steps-track]')).toContainText(t.steps.onTheWay);
  await expect(current(page)).toContainText(t.steps.arrived);

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await serveDeal(page, base({
    tradeType: 'goods', goodsWay: 'in_person', delivered: false, deliveredAt: undefined, deliveryCheck: undefined, deliveryMatch: undefined,
    view: { ...base().view!, stage: 'awaiting-delivery', next: { action: 'deliver', actor: 'counterparty', amountUsdc: null }, automatic: null },
  }));
  await page.goto(`/deals/${JOB}`);
  await expect(current(page)).toContainText(t.steps.handedOver);
});

test('a deal paid in stages says what is paid out and what is held', async ({ page }) => {
  await serveDeal(page, base({
    firstReleasePct: 50, milestonePcts: [50, 50], delivered: false, deliveryCheck: undefined, deliveryMatch: undefined,
    onChain: { ...base().onChain!, milestonePcts: [50, 50], milestonesReleased: 1 },
    view: { ...base().view!, stage: 'awaiting-delivery', next: { action: 'deliver', actor: 'counterparty', amountUsdc: null }, automatic: null },
  }));
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByText('60 USDC paid to Ada · 60 USDC held by Karwan')).toBeVisible();
  await expect(current(page)).toContainText('Stage 2');
});

test('a cancelled deal shows the refund and no move', async ({ page }) => {
  await serveDeal(page, base({
    cancelledAt: at + 3 * DAY, delivered: false, deliveryCheck: undefined, deliveryMatch: undefined,
    view: { ...base().view!, stage: 'cancelled', money: { line: 'refunding' }, next: { action: null, actor: 'nobody', amountUsdc: null }, automatic: null },
  }));
  await page.goto(`/deals/${JOB}`);
  const track = page.locator('[data-steps-track]');
  await expect(track).toContainText(t.steps.cancelled);
  await expect(track).toContainText(t.steps.refunded);
  await expect(page.getByRole('button', { name: /^Release/ })).toHaveCount(0);
});

test('Arabic in dark keeps the deal inside the screen', async ({ page }, info) => {
  await page.context().addCookies([{ name: 'karwan-locale', value: 'ar', domain: '127.0.0.1', path: '/' }]);
  await page.addInitScript(() => localStorage.setItem('karwan-theme', 'dark'));
  await serveDeal(page, base({ tradeType: 'goods', shipment: { carrier: 'dhl', carrierName: 'DHL', trackingNumber: '123', trackingUrl: null, dispatchedAt: at } }));
  await page.goto(`/deals/${JOB}`);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('[data-steps-track]')).toBeVisible();
  await noSideways(page);
  await page.screenshot({ path: info.outputPath('deal-ar-dark.png'), fullPage: true });
});

const settled = (over: Partial<DirectDeal> = {}) => base({
  settledAt: at + 5 * DAY,
  onChain: { ...base().onChain!, state: 3, milestonesReleased: 1 },
  view: { ...base().view!, stage: 'settled', money: { line: 'released' }, next: { action: null, actor: 'nobody', amountUsdc: null }, automatic: null },
  ...over,
});

test('a finished deal: the buyer sees Done, rates it with numbers and can get the receipt', async ({ page }) => {
  await serveDeal(page, settled());
  await page.route(`**/api/deals/${JOB}/rating`, (route) => route.fulfill({ json: { rated: false, received: null } }));
  await page.goto(`/deals/${JOB}`);
  await expect(page.locator('[data-deal-done]')).toContainText(t.doneTitle);
  await expect(page.locator('[data-steps-track] [aria-current="step"]')).toHaveCount(0);
  for (const n of [1, 2, 3, 4, 5]) await expect(page.getByRole('radio', { name: `${n} out of 5` })).toBeVisible();
  await expect(page.getByRole('button', { name: en.ratings.submit })).toBeVisible();
  await expect(page.getByRole('button', { name: t.getReceipt })).toBeVisible();
});

test('a finished deal: the seller sees what was paid and the rating they received', async ({ page }, info) => {
  await serveDeal(page, settled({ counterpartyTrust: { ...base().counterpartyTrust!, role: 'buyer', name: 'Chidi' } }), SELLER);
  await page.route(`**/api/deals/${JOB}/rating`, (route) => route.fulfill({ json: { rated: true, received: { stars: 5, note: 'Fast and clear' } } }));
  await page.goto(`/deals/${JOB}`);
  const paid = page.locator('[data-seller-paid]');
  await expect(paid).toContainText('+119.4 USDC');
  await expect(paid).toContainText(t.inBalance);
  await expect(paid).toContainText('Chidi rated you 5');
  await expect(paid).toContainText('Fast and clear');
  await noSideways(page);
  await page.screenshot({ path: info.outputPath('seller-paid.png'), fullPage: true });
});
