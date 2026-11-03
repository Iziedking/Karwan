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

test('every deal says where it stands, and an ended deal says how it ended (owner notes, 3 Nov)', async ({ page }, testInfo) => {
  const at = Date.UTC(2026, 9, 5);
  await serve(page, [
    ...world.slice(0, 3),
    deal(200, { acceptedAt: 3, settledAt: at }),
    deal(201, { cancelledAt: at }),
    deal(202, { acceptedAt: 3, cancelledAt: at, onChain: { state: 5 } as DirectDeal['onChain'] }),
    deal(203, { acceptedAt: 3, cancelledAt: at, cancelKind: 'resolved' } as Partial<DirectDeal>),
  ]);
  await page.goto('/deals');
  const pill = (scope: ReturnType<typeof section>, state: string) => scope.locator(`[data-deal-state="${state}"]`);
  await expect(pill(section(page, t.needsYou), 'yourMove')).toHaveText(t.state.yourMove);
  await expect(pill(section(page, t.active), 'active')).toHaveText(t.state.active);
  await expect(pill(section(page, t.active), 'disputed')).toHaveText(t.state.disputed);
  const ended = section(page, t.finished);
  await expect(ended.locator('[data-ended-row]')).toHaveCount(4);
  for (const state of ['paidOut', 'cancelled', 'refunded', 'split'] as const) await expect(pill(ended, state)).toHaveText(t.state[state]);
  // The money that never moved or went back is struck through; paid out is not.
  const amount = (n: number) => ended.getByRole('link', { name: new RegExp(ref(n)) }).locator('.tabular-nums').first();
  await expect(amount(201)).toHaveCSS('text-decoration-line', 'line-through');
  await expect(amount(202)).toHaveCSS('text-decoration-line', 'line-through');
  await expect(amount(200)).not.toHaveCSS('text-decoration-line', 'line-through');
  // No green on a pill: green is only the screen's main button.
  for (const el of await page.locator('[data-deal-state]').all()) {
    const bg = await el.evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(bg).not.toBe('rgb(175, 201, 91)');
  }
  await page.screenshot({ path: testInfo.outputPath('deal-states.png'), fullPage: true });
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

test('on desktop a row that needs you carries its move; a move with no short name carries none', async ({ page }, testInfo) => {
  const view = (action: NonNullable<DirectDeal['view']>['next']['action']) => ({
    stage: 'awaiting-funding' as const, money: { line: 'not-funded' as const }, progress: [], next: { action, actor: 'you' as const, amountUsdc: '101' }, automatic: null,
  });
  await serve(page, [
    deal(FUND, { sellerApprovedAt: 2, view: view('fund') }),
    deal(7, { sellerApprovedAt: 2, view: view('respond-cancel') }),
  ]);
  await page.goto('/deals');
  const needs = section(page, t.needsYou);
  const fundRow = needs.getByRole('link').filter({ hasText: ref(FUND) });
  const move = fundRow.locator('[data-row-move]');
  if (testInfo.project.name === 'desktop') {
    await expect(move).toHaveText(t.move.pay);
    await expect(move).toBeVisible();
  } else {
    await expect(move).toBeHidden();
  }
  await expect(page.locator('[data-row-move]')).toHaveCount(1);
});
