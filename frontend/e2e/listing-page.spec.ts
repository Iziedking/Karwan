import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { Listing } from '../core/api';
import { en } from '../shared/i18n/messages/en';
import { BUYER } from './fixtures';

/// The listing page (view 44, Figma 02 and D2): a photo, the price, the
/// seller, what you get, how it works, and Order in a bar on a phone or a
/// panel on desktop. The owner manages it instead.

const API = 'http://127.0.0.1:3199';
const SELLER = '0x5555555555555555555555555555555555555555';
const t = en.marketShop;

const listing = (over: Partial<Listing> = {}): Listing => ({
  id: 'lst_logo',
  sellerUser: SELLER,
  sellerAgent: '0x6666666666666666666666666666666666666666',
  title: 'Logo and brand kit for a small business',
  description: 'A logo that works on signs, phones and receipts.',
  askingPriceUsdc: 120,
  postedAt: Date.now() - 3_600_000,
  expiresAt: Date.now() + 7 * 86_400_000,
  readyInDays: 3,
  deliveryKind: 'remote',
  category: 'design',
  termsDraft: { conditions: ['2 rounds of changes'], proof: 'link', reviewWindowDays: 3, parts: [{ pct: 100, what: 'Your logo in 3 versions: full, short and icon' }] },
  seller: { name: 'Ada Obi', tag: 'ada', verified: true, rating: { kind: 'rated', value: 4.8, count: 23 }, country: 'NG' },
  ...over,
});

async function serve(page: Page, opts: { owner?: boolean; signedOut?: boolean } = {}) {
  await page.addInitScript(() => {
    try { localStorage.setItem('karwan:guide:disabled', '1'); } catch { /* private mode */ }
  });
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/auth/bootstrap') {
      if (opts.signedOut) return route.fulfill({ json: { user: null, profile: null } });
      return route.fulfill({ json: { user: { address: opts.owner ? SELLER : BUYER, method: 'circle', hasPasskey: true }, profile: null } });
    }
    if (pathname === '/api/terms/status') return route.fulfill({ json: { currentVersion: '1', acceptedVersion: '1' } });
    if (pathname === '/api/listings/lst_logo') {
      return route.fulfill({ json: { listing: listing(), viewerIsOwner: !!opts.owner, status: 'open', ...(opts.owner ? { floor: 100 } : {}) } });
    }
    if (pathname === '/api/profile') return route.fulfill({ json: { profile: { address: SELLER, displayName: 'Ada Obi', handle: 'ada' } } });
    if (pathname.startsWith('/api/client-errors')) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ json: { items: [], events: [], movements: [], messages: [] } });
  });
}

test('a buyer sees the offer, the seller and one way to order', async ({ page }, testInfo) => {
  await serve(page);
  await page.goto('/listings/lst_logo');
  await expect(page.getByRole('heading', { level: 1, name: 'Logo and brand kit for a small business' })).toBeVisible();
  const seller = page.locator('[data-listing-seller]');
  await expect(seller).toContainText('Ada Obi');
  await expect(seller).toContainText('4.8 from 23 deals · Nigeria');
  await expect(seller).toHaveAttribute('href', '/r/ada');
  await expect(page.getByRole('heading', { level: 2, name: t.listing.whatYouGet })).toBeVisible();
  await expect(page.getByText('Your logo in 3 versions: full, short and icon')).toBeVisible();
  await expect(page.getByText('2 rounds of changes')).toBeVisible();
  await expect(page.getByText('Ada does the work and sends it to you.')).toBeVisible();
  await expect(page.getByText(t.samplePhoto).first()).toBeVisible();
  const order = page.getByRole('link', { name: 'Order · 120 USDC' }).filter({ visible: true });
  await expect(order).toHaveCount(1);
  await expect(order).toHaveAttribute('href', /\/buyer\?seller=0x5555555555555555555555555555555555555555&amount=120&.*listing=lst_logo/);
  const width = page.viewportSize()!.width;
  if (width >= 1024) await expect(page.locator('[data-order-panel]')).toBeVisible();
  else await expect(page.locator('[data-order-bar]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('listing.png'), fullPage: true });
});

test('the owner manages the offer and is never asked to order it', async ({ page }) => {
  await serve(page, { owner: true });
  await page.goto('/listings/lst_logo');
  await expect(page.getByRole('button', { name: en.listingDetail.state.editCta })).toBeVisible();
  await expect(page.getByRole('link', { name: /Order ·/ })).toHaveCount(0);
});

test('Arabic in dark keeps the listing page inside the screen', async ({ page }) => {
  await page.context().addCookies([{ name: 'karwan-locale', value: 'ar', domain: '127.0.0.1', path: '/' }]);
  await page.addInitScript(() => localStorage.setItem('karwan-theme', 'dark'));
  await serve(page, { signedOut: true });
  await page.goto('/listings/lst_logo');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
