import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { Listing, ListingSeller, MarketplaceBrief } from '../core/api';
import { ar } from '../shared/i18n/messages/ar';
import { en } from '../shared/i18n/messages/en';
import { API, funded, SELLER_AGENT, watchHydration } from './moneyFixtures';
import { serveSearch } from './searchFixtures';

/// The market as a shop (view 44): Buy and Sell, search, categories, photo
/// cards with the seller, and the Sell side's requests that fit you first.

const messages = { en, ar };
const SELLER = '0x5555555555555555555555555555555555555555';
type Theme = 'light' | 'dark';
type Locale = 'en' | 'ar';
type World = { signedOut?: boolean; empty?: boolean; offersDown?: boolean; fits?: string[] };

const ada: ListingSeller = { name: 'Ada Obi', tag: 'ada', verified: true, rating: { kind: 'rated', value: 4.8, count: 23 }, country: 'NG' };

function marketData() {
  const now = Date.now();
  const expiresAt = now + 7 * 86_400_000;
  const offer = (id: string, title: string, price: number, ago: number, over: Partial<Listing> = {}): Listing => ({
    id, title, askingPriceUsdc: price, postedAt: now - ago, expiresAt, sellerUser: SELLER, sellerAgent: SELLER_AGENT,
    description: 'Clear scope and delivery.', partyKind: 'person', tradeLane: 'service', seller: ada, ...over,
  });
  const request = (n: number, briefText: string, budget: number, over: Partial<MarketplaceBrief> = {}): MarketplaceBrief => ({
    jobId: `0x${String(n).padStart(64, '0')}`, briefText, budgetUsdc: String(budget), postedAt: now - n * 1000,
    deadlineUnix: Math.floor(expiresAt / 1000), buyer: '0x7777…7777', bidsCount: 0, offerCount: 0, ...over,
  });
  const listings: Listing[] = [
    offer('logo', 'Logo and brand kit for a small business', 120, 1000, { category: 'design', readyInDays: 3, deliveryKind: 'remote' }),
    offer('iphone', 'iPhone 13, 128 GB, clean, with charger', 310, 2000, { category: 'phones', readyInDays: 1, deliveryKind: 'goods', seller: { ...ada, name: 'Tunde Phones', tag: 'tunde' } }),
    offer('ankara', 'Ankara wax print, 6 yards', 18, 3000, { category: 'fashion', readyInDays: 2, deliveryKind: 'goods', seller: null }),
    offer('landing', 'Landing page with a contact form', 200, 4000, { category: 'tech', readyInDays: 5 }),
    offer('rice', 'Bag of parboiled rice, 25 kg', 45, 5000, { category: 'farm', readyInDays: 3, deliveryKind: 'goods' }),
    offer('photos', 'Product photos for your shop, 20 shots', 60, 6000, { category: 'design', readyInDays: 2 }),
    offer('fridge', 'Fridge, 2 doors, used 1 year', 180, 7000, { category: 'home' }),
    offer('example-new', 'Example stock that is newest', 99, 10, { category: 'design', example: true }),
  ];
  const briefs: MarketplaceBrief[] = [
    request(1, 'Logo for a food business. Simple and bold.', 150, { bidsCount: 2, offerCount: 1, poster: { ...ada, name: 'Chidi Eze', tag: 'chidi' } }),
    request(2, 'Menu design for a small restaurant.', 60),
    request(3, 'Flyer for a church event.', 25, { bidsCount: 5, poster: { ...ada, name: null, tag: 'tunde' } }),
  ];
  return { listings, briefs };
}

async function open(page: Page, { theme = 'light', locale = 'en', route = '/market', world = {} }:
  { theme?: Theme; locale?: Locale; route?: string; world?: World } = {}) {
  const hydrationErrors = watchHydration(page);
  const data = marketData();
  const fitsCalls: string[] = [];
  await page.context().addCookies([{ name: 'karwan-locale', value: locale, domain: '127.0.0.1', path: '/' }]);
  await page.addInitScript(value => {
    localStorage.setItem('karwan-theme', value);
    localStorage.setItem('karwan:guide:disabled', '1');
  }, theme);
  await serveSearch(page, { balances: funded });
  await page.route('**/*', async route => {
    const host = new URL(route.request().url()).hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') return route.abort();
    return route.fallback();
  });
  await page.route(`${API}/**`, async route => {
    const url = new URL(route.request().url());
    if (world.signedOut && url.pathname === '/api/auth/bootstrap') return route.fulfill({ json: { user: null, profile: null } });
    if (world.signedOut && url.pathname === '/api/auth/me') return route.fulfill({ status: 401, json: { error: 'unauthorized' } });
    if (url.pathname === '/api/listings/fits') {
      fitsCalls.push(url.search);
      return route.fulfill({ json: { jobIds: world.fits ?? [] } });
    }
    if (url.pathname === '/api/listings') {
      if (world.offersDown) return route.fulfill({ status: 503, json: { error: 'offers unavailable' } });
      return route.fulfill({ json: { listings: world.empty ? [] : data.listings } });
    }
    if (url.pathname === '/api/jobs/marketplace') return route.fulfill({ json: { briefs: world.empty ? [] : data.briefs } });
    return route.fallback();
  });
  await page.goto(route);
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages[locale].marketShop.heroTitle);
  return { hydrationErrors, fitsCalls };
}

async function sound(page: Page, testInfo: TestInfo, name: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
}

const cards = (page: Page) => page.locator('[data-listing-card]');

for (const [theme, locale] of [['light', 'en'], ['dark', 'en'], ['dark', 'ar']] as const) {
  test(`Buy reads like a shop, ${theme} ${locale}`, async ({ page }, testInfo) => {
    const { hydrationErrors } = await open(page, { theme, locale });
    const t = messages[locale].marketShop;
    await expect(page.getByRole('tab', { name: t.buy })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: t.sell })).toHaveAttribute('aria-selected', 'false');
    await expect(page.getByRole('searchbox', { name: t.search })).toBeVisible();
    await expect(page.getByRole('group', { name: t.categoriesLabel }).getByRole('button')).toHaveText([
      t.all, t.categories.design, t.categories.tech, t.categories.phones, t.categories.fashion, t.categories.food,
      t.categories.farm, t.categories.home, t.categories.lessons, t.categories.repairs, t.categories.rentals,
    ]);
    await expect(page.getByRole('heading', { level: 2, name: t.newOnKarwan })).toBeVisible();
    // Six fresh cards, real ones first: the newer example is not among them.
    await expect(cards(page)).toHaveCount(6);
    await expect(cards(page).filter({ hasText: 'Example stock' })).toHaveCount(0);
    const logo = cards(page).first();
    await expect(logo).toContainText('Logo and brand kit');
    await expect(logo).toContainText('120');
    await expect(logo).toContainText(t.protected);
    await expect(logo).toContainText('Ada Obi');
    await expect(logo.getByRole('img', { name: t.verified })).toBeVisible();
    if (locale === 'en') {
      await expect(logo).toContainText('4.8 from 23 deals');
      await expect(logo).toContainText('Delivers in 3 days');
      await expect(cards(page).filter({ hasText: 'iPhone 13' })).toContainText('Ships in 1 day');
      await expect(cards(page).filter({ hasText: 'Ankara' })).toContainText(t.someone);
    }
    // No photo of its own: a sample photo, marked, never a broken image.
    await expect(logo.locator('img')).toHaveAttribute('src', '/market-samples/design.jpg');
    await expect(logo).toContainText(t.samplePhoto);
    // Photos load lazily, so bring the card into view before checking it painted.
    await logo.scrollIntoViewIfNeeded();
    await expect.poll(() => logo.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    expect(hydrationErrors()).toEqual([]);
    await sound(page, testInfo, `buy-${theme}-${locale}`);
  });
}

test('See all lists every offer, examples last and marked', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: en.marketShop.seeAll }).click();
  await expect(cards(page)).toHaveCount(8);
  await expect(cards(page).last()).toContainText(en.marketShop.example);
  await expect(cards(page).last()).not.toContainText(en.marketShop.samplePhoto);
});

test('a category narrows the offers and the address keeps it', async ({ page }) => {
  await open(page);
  await page.getByRole('group', { name: en.marketShop.categoriesLabel }).getByRole('button', { name: en.marketShop.categories.phones }).click();
  await expect(page.getByRole('heading', { level: 2, name: en.marketShop.categories.phones })).toBeVisible();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText('iPhone 13');
  await expect(page).toHaveURL(/\/market\?category=phones$/);
  await page.reload();
  await expect(page.getByRole('group', { name: en.marketShop.categoriesLabel }).getByRole('button', { name: en.marketShop.categories.phones })).toHaveAttribute('aria-pressed', 'true');
});

test('a search with no match says so and offers the way to ask', async ({ page }) => {
  await open(page);
  await page.getByRole('searchbox', { name: en.marketShop.search }).fill('tractor');
  await expect(page.getByText(en.marketShop.nothingMatches)).toBeVisible();
  await expect(cards(page)).toHaveCount(0);
  await expect(page.getByRole('link', { name: en.marketShop.postNeed })).toHaveAttribute('href', '/buyer');
  await page.getByRole('button', { name: en.marketShop.clear }).click();
  await expect(cards(page)).toHaveCount(6);
});

test('Sell shows what buyers need, the requests that fit you first', async ({ page }, testInfo) => {
  const { fitsCalls } = await open(page, { route: '/market?side=sell', world: { fits: [`0x${'3'.padStart(64, '0')}`] } });
  const t = en.marketShop;
  await expect(page.getByRole('tab', { name: t.sell })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('link', { name: new RegExp(t.listWhatYouSell) })).toHaveAttribute('href', '/seller#post-listing');
  const rows = page.locator('[data-request-row]');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText('Flyer for a church event');
  await expect(rows.first()).toContainText(t.fits);
  await expect(rows.first()).toContainText('Up to 25 USDC');
  await expect(rows.first()).toContainText('@tunde · 5 offers so far');
  await expect(rows.filter({ hasText: 'Logo for a food business' })).toContainText('Chidi Eze');
  // A request with nobody readable shows only its offers line, never an address.
  await expect(rows.filter({ hasText: 'Menu design' })).not.toContainText('0x');
  await expect(rows.nth(1)).not.toContainText(t.fits);
  await expect(page.getByText(t.fitsFirst)).toBeVisible();
  expect(fitsCalls.length).toBeGreaterThan(0);
  await sound(page, testInfo, 'sell');
});

test('signed out, Sell marks nothing and never asks which requests fit', async ({ page }) => {
  const { fitsCalls } = await open(page, { route: '/market?side=sell', world: { signedOut: true, fits: [`0x${'1'.padStart(64, '0')}`] } });
  await expect(page.locator('[data-request-row]')).toHaveCount(3);
  await expect(page.getByText(en.marketShop.fits)).toHaveCount(0);
  expect(fitsCalls).toEqual([]);
});

test('offers that fail to load say so, and Try again brings them back', async ({ page }) => {
  const world: World = { offersDown: true };
  await open(page, { world });
  await expect(page.getByRole('status').filter({ hasText: en.marketShop.loadError })).toBeVisible();
  world.offersDown = false;
  await page.getByRole('button', { name: en.marketShop.retry }).click();
  await expect(cards(page)).toHaveCount(6);
});

test('an empty market invents nothing and offers the way to ask', async ({ page }) => {
  await open(page, { world: { empty: true } });
  await expect(cards(page)).toHaveCount(0);
  await expect(page.getByText(en.marketShop.nothingMatches)).toBeVisible();
  await expect(page.getByRole('link', { name: en.marketShop.postNeed })).toHaveAttribute('href', '/buyer');
});

test('signed out, /listings lands on the market', async ({ page }) => {
  await open(page, { route: '/listings', world: { signedOut: true } });
  await expect(page).toHaveURL(/\/market$/);
  await expect(cards(page)).toHaveCount(6);
});
