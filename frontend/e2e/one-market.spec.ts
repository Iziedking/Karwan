import { expect, test, type Page } from '@playwright/test';
import type { Listing, MarketplaceBrief, Workspace } from '../core/api';
import { TRADE_ENTRY_COPY } from '../features/home/tradeEntry';
import { MARKET_REDIRECTS } from '../shared/utils/marketRedirects.mjs';
import { API, ME, SELLER_AGENT, funded, watchHydration } from './moneyFixtures';
import { PROFILE, serveSearch } from './searchFixtures';

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
    test(`${account}: Find lists personal and business offers, and Start a trade offers three ways in`, async ({ page }) => {
      const copy = TRADE_ENTRY_COPY.en;
      const { hydrationErrors } = await open(page, account);
      await expect(page.getByText(PERSON_OFFER).first()).toBeVisible();
      await expect(page.getByText(BUSINESS_OFFER).first()).toBeVisible();
      await expect(page.getByRole('heading', { name: copy.desk.hub.yours })).toHaveCount(account === 'signedOut' ? 0 : 1);

      await page.getByRole('button', { name: copy.title, exact: true }).click();
      const sheet = page.getByRole('dialog');
      await expect(sheet.getByRole('link')).toHaveCount(3);
      await expect(sheet.getByRole('link', { name: new RegExp(copy.desk.need) })).toHaveAttribute('href', '/buyer?mode=managed#new-deal');
      await expect(sheet.getByRole('link', { name: new RegExp(copy.desk.sell) })).toHaveAttribute('href', '/seller#post-listing');
      await expect(sheet.getByRole('link', { name: new RegExp(copy.agreement) })).toHaveAttribute('href', '/buyer?mode=direct#new-deal');
      await fitsTheScreen(page);
      expect(hydrationErrors()).toEqual([]);
    });
  }

  test('a person is asked once whether they trade for themselves or a business', async ({ page }) => {
    const copy = TRADE_ENTRY_COPY.en.entry;
    const { saved } = await open(page, 'person');
    const question = page.getByRole('region', { name: copy.question });
    await expect(question).toBeVisible();
    await expect(page.getByRole('button', { name: TRADE_ENTRY_COPY.en.title, exact: true })).toBeVisible();
    await question.getByRole('button', { name: copy.self }).click();
    await expect(question).toHaveCount(0);
    expect(saved).toEqual([{ tradesAs: 'self' }]);
    await page.reload();
    await expect(page.getByTestId('market')).toBeVisible();
    await expect(page.getByRole('region', { name: copy.question })).toHaveCount(0);
  });

  test('a failed save says so and keeps the question', async ({ page }) => {
    const copy = TRADE_ENTRY_COPY.en.entry;
    await open(page, 'person', { failSave: true });
    const question = page.getByRole('region', { name: copy.question });
    await question.getByRole('button', { name: copy.self }).click();
    await expect(question.getByRole('alert')).toHaveText(copy.saveError);
    await expect(question.getByRole('button', { name: copy.self })).toBeEnabled();
  });

  test('an account with a business is never asked', async ({ page }) => {
    await open(page, 'business');
    await expect(page.getByText(TRADE_ENTRY_COPY.en.entry.question)).toHaveCount(0);
  });

  test('Arabic in dark keeps the market inside the screen', async ({ page }) => {
    const copy = TRADE_ENTRY_COPY.ar;
    await open(page, 'person', { locale: 'ar', theme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('button', { name: copy.title, exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: copy.entry.question })).toBeVisible();
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
