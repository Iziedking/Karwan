import { expect, test, type Page } from '@playwright/test';
import type { Listing, MarketplaceBrief, Workspace } from '../core/api';
import { TRADE_ENTRY_COPY } from '../features/home/tradeEntry';
import { MARKET_REDIRECTS } from '../shared/utils/marketRedirects.mjs';
import { API, ME, SELLER_AGENT, funded, watchHydration } from './moneyFixtures';
import { PROFILE, serveSearch } from './searchFixtures';
import { en } from '../shared/i18n/messages/en';
import { ar } from '../shared/i18n/messages/ar';

/// View 17: one market for every account. The account type is a lens, the
/// entry question is asked once, and every old trade route lands here.

type Account = 'signedOut' | 'person' | 'business';
const SELLER = '0x5555555555555555555555555555555555555555';
const PERSON_OFFER = 'Logo and brand kit for a bakery';
const BUSINESS_OFFER = 'Invoice finance for an export order';

function market() {
  const now = Date.now();
  const expiresAt = now + 7 * 86_400_000;
  const offer = (id: string, title: string, overrides: Partial<Listing>): Listing => ({
    id, title, askingPriceUsdc: 250, postedAt: now, expiresAt, sellerUser: SELLER, sellerAgent: SELLER_AGENT,
    description: 'A defined scope, delivery date and payment stages agreed before work starts.',
    partyKind: 'person', tradeLane: 'service', ...overrides,
  });
  const brief: MarketplaceBrief = {
    jobId: `0x${'1'.padStart(64, '0')}`, briefText: 'A product photographer for one day in Lagos.', budgetUsdc: '120',
    postedAt: now, deadlineUnix: Math.floor(expiresAt / 1000), buyer: '0x7777…7777', bidsCount: 0, offerCount: 0,
    partyKind: 'person', tradeLane: 'service',
  };
  return {
    listings: [offer('one-person', PERSON_OFFER, {}), offer('one-business', BUSINESS_OFFER, { partyKind: 'business', tradeLane: 'finance' })],
    briefs: [brief],
  };
}

const base = { status: 'active', ownerAddress: ME, walletAddress: ME, balanceScope: 'identity', createdAt: 1, updatedAt: 1 };
const personal = { ...base, id: 'ws-personal', kind: 'personal', name: 'Me' } as unknown as Workspace;
const business = { ...base, id: 'ws-business', kind: 'business', name: 'Me Trading Ltd', business: { legalName: 'Me Trading Ltd', verificationStatus: 'not_started' } } as unknown as Workspace;

async function open(page: Page, account: Account, { locale = 'en', theme = 'light', path = '/market', failSave = false } = {}) {
  const hydrationErrors = watchHydration(page);
  const data = market();
  const saved: Array<Record<string, unknown>> = [];
  let settings: Record<string, unknown> = {};
  await page.context().addCookies([{ name: 'karwan-locale', value: locale, domain: '127.0.0.1', path: '/' }]);
  await page.addInitScript((value) => localStorage.setItem('karwan-theme', value), theme);
  if (account === 'business') {
    await page.addInitScript(([key, id]) => localStorage.setItem(key, id), [`karwan:active-workspace:${ME.toLowerCase()}`, business.id]);
  }
  await serveSearch(page, { balances: funded });
  await page.route('**/*', async (route) => {
    const host = new URL(route.request().url()).hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') return route.abort();
    return route.fallback();
  });
  await page.route(`${API}/**`, async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (account === 'signedOut' && url.pathname === '/api/auth/bootstrap') return route.fulfill({ json: { user: null, profile: null } });
    if (account === 'signedOut' && url.pathname === '/api/auth/me') return route.fulfill({ status: 401, json: { error: 'unauthorized' } });
    if (url.pathname === '/api/listings' && method === 'GET') return route.fulfill({ json: { listings: data.listings } });
    if (url.pathname === '/api/jobs/marketplace') return route.fulfill({ json: { briefs: data.briefs } });
    // Hourly work is on here, so the start sheet offers it (it hides while off, view 44 Batch 1).
    if (url.pathname === '/api/features') return route.fulfill({ json: { hourlyWork: true } });
    if (url.pathname === '/api/profile') return route.fulfill({ json: { profile: { ...PROFILE, settings } } });
    if (url.pathname === '/api/workspaces') {
      return route.fulfill({ json: { workspaces: account === 'business' ? [personal, business] : [personal], wallet: { address: ME, balanceScope: 'identity' } } });
    }
    if (url.pathname === '/api/settings' && method === 'POST') {
      if (failSave) return route.fulfill({ status: 503, json: { error: 'unavailable' } });
      const body = route.request().postDataJSON() as { settings: Record<string, unknown> };
      saved.push(body.settings);
      settings = { ...settings, ...body.settings };
      return route.fulfill({ json: { settings } });
    }
    return route.fallback();
  });
  await page.goto(path);
  if (path === '/market') await expect(page.getByTestId('market')).toBeVisible();
  return { saved, hydrationErrors };
}

async function fitsTheScreen(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe('one market', () => {
  for (const account of ['signedOut', 'person', 'business'] as const) {
    test(`${account}: Buy lists personal and business offers, and the start sheet offers five ways in`, async ({ page }) => {
      const copy = TRADE_ENTRY_COPY.en;
      const { hydrationErrors } = await open(page, account);
      await expect(page.getByText(PERSON_OFFER).first()).toBeVisible();
      await expect(page.getByText(BUSINESS_OFFER).first()).toBeVisible();
      // Your trades live in Deals now (view 44), never on the market.
      await expect(page.getByRole('heading', { name: copy.desk.hub.yours })).toHaveCount(0);

      await page.getByRole('button', { name: en.marketShop.dealDirect, exact: true }).click();
      const sheet = page.getByRole('dialog');
      await expect(sheet.getByRole('link')).toHaveCount(4);
      await expect(sheet.getByRole('link', { name: new RegExp(copy.desk.need) })).toHaveAttribute('href', '/buyer?mode=managed#new-deal');
      await expect(sheet.getByRole('link', { name: new RegExp(copy.desk.sell) })).toHaveAttribute('href', '/seller#post-listing');
      // A buyer can run a contest instead of choosing one seller (view 40).
      await expect(sheet.getByRole('link', { name: new RegExp(en.contests.start.title) })).toHaveAttribute('href', '/contests/new');
      // Or hire someone by the hour (view 32).
      await expect(sheet.getByRole('link', { name: new RegExp(en.work.start.title) })).toHaveAttribute('href', '/work/new');
      // A deal already agreed asks who is paying first (view 38).
      await sheet.getByRole('button', { name: new RegExp(copy.agreement) }).click();
      await expect(sheet.getByText(copy.link.question)).toBeVisible();
      await expect(sheet.getByRole('link', { name: new RegExp(copy.link.paying) })).toHaveAttribute('href', '/buyer?mode=direct#new-deal');
      await expect(sheet.getByRole('button', { name: new RegExp(copy.link.gettingPaid) })).toBeVisible();
      await fitsTheScreen(page);
      expect(hydrationErrors()).toEqual([]);
    });
  }

  test('while business accounts are closed, nobody is asked whether they trade for a business', async ({ page }) => {
    // There is only one answer, so the question would be noise (view 38).
    await open(page, 'person');
    await expect(page.getByTestId('market')).toBeVisible();
    await expect(page.getByRole('region', { name: TRADE_ENTRY_COPY.en.entry.question })).toHaveCount(0);
  });

  test('an account with a business is never asked', async ({ page }) => {
    await open(page, 'business');
    await expect(page.getByText(TRADE_ENTRY_COPY.en.entry.question)).toHaveCount(0);
  });

  test('Arabic in dark keeps the market inside the screen', async ({ page }) => {
    await open(page, 'person', { locale: 'ar', theme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('button', { name: ar.marketShop.dealDirect, exact: true })).toBeVisible();
    await fitsTheScreen(page);
  });

  test('your requests open on their own', async ({ page }) => {
    await open(page, 'person', { path: '/market?view=yours&list=requests' });
    await expect(page.getByText(TRADE_ENTRY_COPY.en.desk.hub.requests).first()).toBeVisible();
    await expect(page.getByTestId('market')).toHaveCount(0);
  });
});

test('every old trade route lands in the one market', async ({ request }) => {
  for (const redirect of MARKET_REDIRECTS) {
    const response = await request.get(redirect.source, { maxRedirects: 0 });
    expect(response.status(), redirect.source).toBe(307);
    const location = new URL(response.headers().location ?? '', 'http://127.0.0.1');
    expect(location.pathname + location.search, redirect.source).toBe(redirect.destination);
  }
});
