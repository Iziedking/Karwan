import { expect, test, type Page } from '@playwright/test';
import type { DirectDeal } from '../core/api';
import { en } from '../shared/i18n/messages/en';
import { BUYER, JOB, SELLER, serveDeal } from './fixtures';

/// Every deal looks like what it is (view 92, phase 1): goods sent read as a
/// parcel tracker, one job shows the delivery itself, and a deal that stopped
/// moving keeps its plain status line. One seal says Held or Your turn.

const t = en.dealPage;
const dc = en.deliveryCard;
const DAY = 86_400_000;
const at = Date.UTC(2026, 10, 18);

const base = (over: Partial<DirectDeal> = {}): DirectDeal => ({
  jobId: JOB,
  buyer: BUYER,
  seller: SELLER,
  dealAmountUsdc: '120',
  firstReleasePct: 100,
  terms: 'Linen suit, made to measure',
  delivered: false,
  createdAt: at,
  updatedAt: at,
  sellerApprovedAt: at,
  acceptedAt: at + DAY,
  deadlineUnix: (at + 8 * DAY) / 1000,
  agreementVersion: 1,
  agreementDigest: '0xdigest',
  onChain: { state: 2, milestonePcts: [100], milestonesReleased: 0, dealAmountWei: '120000000', sellerNetWei: '119400000', feeTotalWei: '1200000', releasedWei: '0' },
  view: {
    stage: 'awaiting-delivery',
    money: { line: 'held' },
    progress: [],
    next: { action: 'deliver', actor: 'counterparty', amountUsdc: null },
    automatic: null,
    hold: null,
  },
  counterpartyTrust: {
    role: 'seller', name: 'Chinedu', verifiedBusiness: false, verifiedPerson: true,
    facts: { settled: 38, distinctCounterparties: 30, onTime: 37, withDeadline: 38, disputes: 0 },
    memberSince: Date.UTC(2026, 2, 1), stakeUsdc: null, provenAccounts: [], isNew: false,
  },
  ...over,
} as DirectDeal);

const shipment = { carrier: 'dhl', carrierName: 'DHL', trackingNumber: '7342119055', trackingUrl: null, dispatchedAt: at + 2 * DAY };
const shipped = (over: Partial<DirectDeal> = {}) => base({
  tradeType: 'goods',
  delivered: true,
  deliveredAt: at + 2 * DAY,
  shipment,
  view: { ...base().view!, stage: 'awaiting-final-release', next: { action: 'release', actor: 'you', amountUsdc: '120' } },
  ...over,
});

const picture = (page: Page, kind: string) => page.locator(`[data-picture="${kind}"]`);
const noSideways = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

test("a buyer's parcel shows the carrier, the number and what to do", async ({ page }) => {
  await serveDeal(page, shipped());
  await page.goto(`/deals/${JOB}`);
  const parcel = picture(page, 'parcel');
  await expect(parcel).toContainText('DHL');
  await expect(parcel).toContainText('7342119055');
  await expect(parcel).toContainText(t.picture.tapArrived);
  await expect(parcel.locator('[data-tracking] a')).toHaveCount(0);
  await expect(parcel.locator('[data-steps-track]')).toBeVisible();
  await expect(page.locator('[data-deal-seal="turn"]')).toHaveText(t.seal.yourTurn);
});

test('with a tracking page the number opens it', async ({ page }) => {
  const url = 'https://www.dhl.com/track?n=7342119055';
  await serveDeal(page, shipped({ shipment: { ...shipment, trackingUrl: url } }));
  await page.goto(`/deals/${JOB}`);
  await expect(picture(page, 'parcel').locator('[data-tracking] a')).toHaveAttribute('href', url);
});

test('the seller before shipping is asked for tracking by the date, and sees Held', async ({ page }) => {
  await serveDeal(page, base({ tradeType: 'goods', view: { ...base().view!, next: { action: 'deliver', actor: 'nobody', amountUsdc: null } } }), SELLER);
  await page.goto(`/deals/${JOB}`);
  await expect(picture(page, 'parcel')).toContainText('Add the tracking number by');
  await expect(page.locator('[data-deal-seal="held"]')).toHaveText(t.seal.held);
});

test('a one-job buyer sees the delivery and the check', async ({ page }) => {
  await serveDeal(page, base({
    terms: 'Product video, 45 seconds',
    delivered: true,
    deliveredAt: at + 3 * DAY,
    deliveryProof: 'Final cut https://drive.google.com/file/d/abc',
    deliveryCheck: 'passed',
    deliveryMatch: { verdict: 'aligned', reason: 'Forty-five seconds, vertical.' },
    view: { ...base().view!, stage: 'awaiting-final-release', next: { action: 'release', actor: 'you', amountUsdc: '120' } },
  }));
  await page.goto(`/deals/${JOB}`);
  const delivery = picture(page, 'delivery');
  await expect(delivery).toContainText('drive.google.com');
  await expect(delivery).toContainText(dc.match.aligned);
  await expect(delivery).toContainText('Check it, then pay');
});

test('a disputed deal keeps the status line', async ({ page }) => {
  await serveDeal(page, shipped({ disputed: true, view: { ...base().view!, stage: 'disputed', next: { action: null, actor: 'nobody', amountUsdc: null } } }));
  await page.goto(`/deals/${JOB}`);
  await expect(picture(page, 'steps')).toContainText(t.routeStatus.disputed);
  await expect(picture(page, 'parcel')).toHaveCount(0);
});

test('at 360 wide in Arabic nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.context().addCookies([{ name: 'karwan-locale', value: 'ar', domain: '127.0.0.1', path: '/' }]);
  await serveDeal(page, shipped({ shipment: { ...shipment, carrierName: 'DHL Express Worldwide', trackingNumber: 'JD014600006281230704' } }));
  await page.goto(`/deals/${JOB}`);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(picture(page, 'parcel')).toBeVisible();
  await noSideways(page);
});
