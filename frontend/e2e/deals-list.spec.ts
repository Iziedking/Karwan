import { expect, test, type Page } from '@playwright/test';
import type { DirectDeal } from '../core/api';
import { dealsPageCopy } from '../shared/i18n/messages/dealsPage';
import { en } from '../shared/i18n/messages/en';
import { BUYER, SELLER } from './fixtures';

const API = 'http://127.0.0.1:3199';
const t = dealsPageCopy.en;

const id = (n: number) => `0x${n.toString(16).padStart(8, '0')}${'ab'.repeat(28)}`;
const ref = (n: number) => {
  const body = n.toString(16).padStart(8, '0').toUpperCase();
  return `${body.slice(0, 4)}-${body.slice(4)}`;
};

const deal = (n: number, over: Partial<DirectDeal> = {}): DirectDeal =>
  ({
    jobId: id(n),
    buyer: BUYER,
    seller: SELLER,
    dealAmountUsdc: String(100 + n),
    terms: 'Logo and brand kit',
    firstReleasePct: 50,
    delivered: false,
    disputed: false,
    createdAt: Date.UTC(2026, 9, 1),
    updatedAt: Date.UTC(2026, 9, 1) + n * 60_000,
    onChain: null,
    ...over,
  }) as DirectDeal;

const FUND = 1;
const WAITING = 2;
const DISPUTED = 3;
const world = [
  deal(FUND, { sellerApprovedAt: 2 }),
  deal(WAITING, { sellerApprovedAt: 2, acceptedAt: 3 }),
  deal(DISPUTED, { sellerApprovedAt: 2, acceptedAt: 3, disputed: true }),
  ...Array.from({ length: 12 }, (_, i) => deal(100 + i, { settledAt: Date.UTC(2026, 9, 2) + i })),
];

async function serve(page: Page, deals: DirectDeal[], locale: 'en' | 'ar' = 'en') {
  await page.context().addCookies([{ name: 'karwan-locale', value: locale, domain: '127.0.0.1', path: '/' }]);
  await page.addInitScript(() => {
    try { localStorage.setItem('karwan:guide:disabled', '1'); } catch { /* private mode */ }
  });
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/auth/bootstrap') {
      return route.fulfill({ json: { user: { address: BUYER, method: 'circle', hasPasskey: true }, profile: null } });
    }
    if (pathname === '/api/terms/status') return route.fulfill({ json: { currentVersion: '1', acceptedVersion: '1' } });
    if (pathname === '/api/deals/direct') return route.fulfill({ json: { deals } });
    if (pathname === '/api/jobs/matches/for') return route.fulfill({ json: { proposals: [] } });
    if (pathname === '/api/factoring/mine' || pathname === '/api/po-financing/mine') {
      return route.fulfill({ json: { asFinancier: [], asSeller: [] } });
    }
    if (pathname.startsWith('/api/client-errors')) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ json: { items: [], events: [], movements: [], messages: [] } });
  });
}

const section = (page: Page, name: string) => page.getByRole('region', { name });

test('needs you, then active, then finished; a disputed deal stays active', async ({ page }) => {
  await serve(page, world);
  await page.goto('/deals');
  await expect(page.getByRole('heading', { level: 1, name: t.title })).toBeVisible();
  const needs = section(page, t.needsYou);
  const active = section(page, t.active);
  const finished = section(page, t.finished);
  await expect(needs).toBeVisible();
  const [n, a, f] = await Promise.all([needs.boundingBox(), active.boundingBox(), finished.boundingBox()]);
  expect(n!.y).toBeLessThan(a!.y);
  expect(a!.y).toBeLessThan(f!.y);
  await expect(needs.getByText(ref(FUND))).toBeVisible();
  await expect(active.getByText(ref(WAITING))).toBeVisible();
  await expect(active.getByText(ref(DISPUTED))).toBeVisible();
  await expect(needs.getByRole('link')).toHaveCount(1);
  await expect(active.getByRole('link')).toHaveCount(2);
});

test('finished shows ten, then show more reveals the rest', async ({ page }) => {
  await serve(page, world);
  await page.goto('/deals');
  const finished = section(page, t.finished);
  await expect(finished.getByRole('link')).toHaveCount(10);
  await finished.getByRole('button', { name: t.showMore }).click();
  await expect(finished.getByRole('link')).toHaveCount(12);
  await expect(finished.getByRole('button', { name: t.showMore })).toHaveCount(0);
  await expect(page.getByRole('link', { name: t.allActivity })).toHaveAttribute('href', '/activity');
});

test('no deals yet points to the market', async ({ page }) => {
  await serve(page, []);
  await page.goto('/deals');
  await expect(page.getByText(t.empty)).toBeVisible();
  await expect(page.getByRole('link', { name: t.emptyCta })).toHaveAttribute('href', '/market');
  await expect(section(page, t.needsYou)).toHaveCount(0);
});

test('Arabic reads right to left and the page never scrolls sideways', async ({ page }) => {
  await serve(page, world, 'ar');
  await page.goto('/deals');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1, name: dealsPageCopy.ar.title })).toBeVisible();
  await expect(section(page, dealsPageCopy.ar.needsYou).getByText(ref(FUND))).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('the bars name the same places: four tabs on a phone, the rail on desktop', async ({ page }, testInfo) => {
  await serve(page, world);
  await page.goto('/deals');
  const nav = en.nav;
  if (testInfo.project.name === 'phone') {
    const bar = page.locator('[data-workspace-bottom-nav]');
    // The Profile tab holds the photo or an initial, so match each label inside its tab.
    await expect(bar.getByRole('link')).toHaveText([nav.home, nav.market, nav.deals, nav.profile].map((l) => new RegExp(l)));
    await expect(bar.getByRole('link', { name: nav.deals })).toHaveAttribute('aria-current', 'page');
  }
  if (testInfo.project.name === 'desktop') {
    const rail = page.locator('#workspace-navigation');
    await expect(rail.getByRole('link', { name: nav.home, exact: true })).toBeVisible();
    await expect(rail.getByRole('link', { name: nav.market, exact: true })).toBeVisible();
    const deals = rail.getByRole('link', { name: `${nav.deals}, ${nav.dealsNeedYou.replace('{n}', '1')}` });
    await expect(deals).toHaveAttribute('aria-current', 'page');
    await expect(rail.getByRole('link', { name: nav.money, exact: true })).toBeVisible();
    await expect(rail.getByRole('link', { name: nav.messages, exact: true })).toBeVisible();
    await expect(rail.locator('[data-rail-profile]')).toHaveAttribute('href', '/profile');
    await expect(rail.getByRole('link', { name: nav.activity, exact: true })).toHaveCount(0);
  }
});

test('an old open deals link lands on Deals', async ({ page }) => {
  await serve(page, world);
  await page.goto('/profile/open-deals');
  await expect(page).toHaveURL(/\/deals$/);
  await expect(page.getByRole('heading', { level: 1, name: t.title })).toBeVisible();
});
