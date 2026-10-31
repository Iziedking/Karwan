import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import type { DirectDeal, Listing } from '../core/api';
import { en } from '../shared/i18n/messages/en';
import { API, BUYER_AGENT, ME, serveMoney, sseEvent } from './moneyFixtures';

/// The order path (view 44, Figma 05 to 09): sign in and come back, review
/// with one fee line, add money when short, confirm in a sheet, and land on
/// the deal. The seller's agent accepts an order that is the listing.

const t = en.orderFlow;
const SELLER = '0x5555555555555555555555555555555555555555';
const JOB = `0x${'cd'.repeat(32)}`;

const listing: Listing = {
  id: 'lst_logo',
  sellerUser: SELLER,
  sellerAgent: '0x6666666666666666666666666666666666666666',
  title: 'Logo and brand kit',
  description: 'A logo that works on signs, phones and receipts.',
  askingPriceUsdc: 120,
  postedAt: Date.now() - 3_600_000,
  expiresAt: Date.now() + 7 * 86_400_000,
  readyInDays: 3,
  category: 'design',
  terms: 'Your logo in 3 versions.',
  seller: { name: 'Ada', tag: 'ada', verified: true, rating: { kind: 'rated', value: 4.8, count: 23 }, country: 'NG' },
};

const fundingQuote = {
  settlementCurrency: 'USDC', localCurrencyConversion: 'not-provided', dealAmountUsdc: '120', buyerFeeUsdc: '0.6', sellerFeeUsdc: '0.6',
  feeTotalUsdc: '1.2', fundedAmountUsdc: '120.6', sellerNetUsdc: '119.4', feeBps: 100, quotedAt: 0, quoteFingerprint: `0x${'ef'.repeat(32)}`,
};

interface World {
  balances: Record<string, number>;
  creates: unknown[];
  funds: unknown[];
  agentFunds: unknown[];
  events: string;
  createAnswer?: (route: Route) => Promise<void>;
  signedOut?: boolean;
  profile?: boolean;
  waitsForSeller?: boolean;
}

async function serveOrder(page: Page, over: Partial<World> = {}): Promise<World> {
  const world: World = { balances: { [ME.toLowerCase()]: 0, [BUYER_AGENT.toLowerCase()]: 0 }, creates: [], funds: [], agentFunds: [], events: '', ...over };
  await serveMoney(page, {
    balances: world.balances,
    events: () => world.events,
    fundAgent: async (route) => {
      world.agentFunds.push(route.request().postDataJSON());
      world.balances[BUYER_AGENT.toLowerCase()] = 120.6;
      await route.fulfill({ json: { accepted: true, txHash: '0x1', agentAddress: BUYER_AGENT, reference: 'KWN-1', movementState: 'completed' } });
    },
  });
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();
    if (pathname === '/api/auth/bootstrap') {
      if (world.signedOut) return route.fulfill({ json: { user: null, profile: null } });
      return route.fulfill({ json: { user: { address: ME, method: 'circle', hasPasskey: true }, profile: world.profile ? { address: ME, handle: 'bola' } : null } });
    }
    if (pathname === '/api/terms/status') return route.fulfill({ json: { currentVersion: '1', acceptedVersion: '1' } });
    if (pathname === '/api/listings/lst_logo') return route.fulfill({ json: { listing, viewerIsOwner: false, status: 'open' } });
    if (pathname === '/api/listings/lst_logo/quote') {
      return route.fulfill({ json: { priceUsdc: '120', feeUsdc: '0.6', youPayUsdc: '120.6', feeBps: 100, deliverByUnix: Math.floor(Date.UTC(2026, 10, 3) / 1000), parts: 1, waitsForSeller: !!world.waitsForSeller } });
    }
    if (pathname === '/api/deals/direct' && method === 'POST') {
      world.creates.push(route.request().postDataJSON());
      if (world.createAnswer) return world.createAnswer(route);
      return route.fulfill({ json: { deal: { jobId: JOB }, funding: {}, agentAccepted: true } });
    }
    if (pathname === `/api/deals/direct/${JOB}/funding-quote`) return route.fulfill({ json: { quote: fundingQuote } });
    if (pathname === `/api/deals/direct/${JOB}/fund` && method === 'POST') {
      world.funds.push(route.request().postDataJSON());
      return route.fulfill({ json: { accepted: true, jobId: JOB, status: 'funded' } });
    }
    if (pathname === `/api/deals/direct/${JOB}`) {
      const deal = { jobId: JOB, buyer: ME, seller: SELLER, dealAmountUsdc: '120', firstReleasePct: 100, terms: listing.terms, delivered: false, createdAt: Date.now(), updatedAt: Date.now(), agreementVersion: 1, agreementDigest: '0xdigest' } as unknown as DirectDeal;
      return route.fulfill({ json: { deal } });
    }
    return route.fallback();
  });
  return world;
}

const noSideways = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

test('signed out, Order signs in first and comes back to the order', async ({ page }) => {
  await serveOrder(page, { signedOut: true });
  await page.goto('/order/lst_logo');
  await expect(page).toHaveURL(/\/start\?next=%2Forder%2Flst_logo$/);
});

test('signed in on the start screen with somewhere to go back to, you go back there', async ({ page }) => {
  await serveOrder(page, { profile: true });
  await page.goto('/start?next=%2Forder%2Flst_logo');
  await expect(page).toHaveURL(/\/order\/lst_logo$/);
  await expect(page.getByRole('heading', { level: 1, name: t.title })).toBeVisible();
});

test('short of money: add it, it arrives, then one sheet and one payment', async ({ page }, testInfo) => {
  const world = await serveOrder(page);
  await page.goto('/order/lst_logo');
  await expect(page.getByRole('heading', { level: 1, name: t.title })).toBeVisible();
  await expect(page.getByText('By 3 Nov 2026', { exact: true })).toBeVisible();
  await expect(page.getByText('120.00 USDC', { exact: true })).toBeVisible();
  await expect(page.getByText('0.60 USDC', { exact: true })).toBeVisible();
  await expect(page.getByText('120.60 USDC', { exact: true })).toBeVisible();
  await expect(page.getByText(/If Ada does not deliver by 3 Nov 2026, you get it back/)).toBeVisible();
  await noSideways(page);
  await page.screenshot({ path: testInfo.outputPath('review-short.png'), fullPage: true });

  await page.getByRole('button', { name: t.addMoney }).click();
  await page.getByRole('button', { name: new RegExp(t.fromWallet) }).click();
  await expect(page.getByText(ME)).toBeVisible();
  await expect(page.getByText(t.anyNetwork, { exact: true })).toBeVisible();
  await expect(page.getByText('Waiting for your 120.60 USDC')).toBeVisible();
  await noSideways(page);
  await page.screenshot({ path: testInfo.outputPath('add-money.png'), fullPage: true });

  world.balances[ME.toLowerCase()] = 150;
  world.events = sseEvent({ type: 'wallet.credited', jobId: '', actor: 'platform', ts: Date.now(), payload: { owner: ME, amountUsdc: '150.000000' } });
  await expect(page.getByText(t.enough, { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('150.00 USDC arrived in your account')).toBeVisible();
  const pay = page.getByRole('button', { name: 'Pay 120.60 USDC' });
  await expect(pay).toBeEnabled();
  await pay.click();

  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText(t.confirmFor, { exact: true })).toBeVisible();
  await expect(sheet.getByText('Logo and brand kit', { exact: true })).toBeVisible();
  await expect(sheet.getByText(t.confirmHeld, { exact: true })).toBeVisible();
  await expect(sheet.getByText('If Ada does not deliver', { exact: true })).toBeVisible();
  await expect(sheet.getByRole('button', { name: t.notNow })).toBeVisible();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('confirm.png') });
  await sheet.getByTestId('order-pay').click();

  await expect(page).toHaveURL(new RegExp(`/deals/${JOB}$`));
  expect(world.creates).toHaveLength(1);
  expect(world.creates[0]).toMatchObject({ buyerAddress: ME, sellerAddress: SELLER, dealAmountUsdc: 120, deadlineDays: 3, terms: 'Your logo in 3 versions.', listingId: 'lst_logo' });
  expect(world.agentFunds).toHaveLength(1);
  expect(world.agentFunds[0]).toMatchObject({ agent: 'buyer', amountUsdc: 120.6 });
  expect(world.funds).toHaveLength(1);
  expect(world.funds[0]).toMatchObject({ caller: ME, maxFundedAmountUsdc: '120.6', quoteFingerprint: fundingQuote.quoteFingerprint, expectedAgreementVersion: 1 });
});

test("when the seller's agent cannot accept, you land on the deal and nothing is paid", async ({ page }) => {
  const world = await serveOrder(page, {
    balances: { [ME.toLowerCase()]: 200, [BUYER_AGENT.toLowerCase()]: 0 },
    createAnswer: (route) => route.fulfill({ json: { deal: { jobId: JOB }, funding: {}, agentAccepted: false } }),
  });
  await page.goto('/order/lst_logo');
  await page.getByRole('button', { name: 'Pay 120.60 USDC' }).click();
  await page.getByRole('dialog').getByTestId('order-pay').click();
  await expect(page).toHaveURL(new RegExp(`/deals/${JOB}$`));
  expect(world.creates).toHaveLength(1);
  expect(world.agentFunds).toHaveLength(0);
  expect(world.funds).toHaveLength(0);
});

test('an offer that changed before Pay is not ordered', async ({ page }) => {
  const world = await serveOrder(page, {
    balances: { [ME.toLowerCase()]: 200, [BUYER_AGENT.toLowerCase()]: 0 },
    createAnswer: (route) => route.fulfill({ status: 409, json: { error: 'this offer changed', code: 'LISTING_CHANGED' } }),
  });
  await page.goto('/order/lst_logo');
  await page.getByRole('button', { name: 'Pay 120.60 USDC' }).click();
  await page.getByRole('dialog').getByTestId('order-pay').click();
  await expect(page.getByText(t.changed)).toBeVisible();
  await expect(page.getByRole('link', { name: t.backToOffer })).toHaveAttribute('href', '/listings/lst_logo');
  expect(world.funds).toHaveLength(0);
});

test('Arabic in dark keeps the order inside the screen', async ({ page }) => {
  await page.context().addCookies([{ name: 'karwan-locale', value: 'ar', domain: '127.0.0.1', path: '/' }]);
  await page.addInitScript(() => localStorage.setItem('karwan-theme', 'dark'));
  await serveOrder(page);
  await page.goto('/order/lst_logo');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await noSideways(page);
});

test('a goods offer someone already ordered sends your order to the seller, and nothing is paid', async ({ page }) => {
  const world = await serveOrder(page, {
    waitsForSeller: true,
    createAnswer: (route) => route.fulfill({ json: { deal: { jobId: JOB }, funding: {}, agentAccepted: false } }),
  });
  await page.goto('/order/lst_logo');
  await expect(page.getByText('Someone has already ordered this. Ada decides on your order, and you pay only after they accept.')).toBeVisible();
  await expect(page.locator('[data-order-balance]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Pay / })).toHaveCount(0);
  await page.getByRole('button', { name: 'Send your order to Ada' }).click();
  await expect(page).toHaveURL(new RegExp(`/deals/${JOB}$`));
  expect(world.creates).toHaveLength(1);
  expect(world.agentFunds).toHaveLength(0);
  expect(world.funds).toHaveLength(0);
});
