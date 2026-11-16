import { expect, test, type Page } from '@playwright/test';
import type { DirectDeal } from '../core/api';
import { API, ME, funded, serveMoney } from './moneyFixtures';
import { guideCopy } from '../shared/i18n/messages/guide';

/// A tour is for someone new, and since 15 Nov evening (view 57) it is offered by
/// Aman, never opened by itself. An account with deals behind it, signing in on a
/// device that has never seen it, is not offered one (T-16).

const OTHER = '0x00000000000000000000000000000000000000b2';
const settled = {
  jobId: `0x${'ab'.repeat(32)}`,
  buyer: ME,
  seller: OTHER,
  dealAmountUsdc: '120',
  terms: 'Logo and brand kit',
  firstReleasePct: 50,
  delivered: true,
  disputed: false,
  createdAt: Date.UTC(2026, 9, 1),
  updatedAt: Date.UTC(2026, 9, 2),
  sellerApprovedAt: 2,
  acceptedAt: 3,
  settledAt: Date.UTC(2026, 9, 2),
  onChain: null,
} as unknown as DirectDeal;

async function serve(page: Page, who: { setupDoneAt?: number; deals?: DirectDeal[] }) {
  await serveMoney(page, { balances: funded });
  // A device that has never seen Karwan: tips on, nothing remembered.
  await page.addInitScript(() => {
    localStorage.removeItem('karwan:guide:disabled');
    localStorage.removeItem('karwan:guide:seen');
  });
  await page.route(`${API}/api/terms/status`, (route) => route.fulfill({ json: { currentVersion: '1', acceptedVersion: '1' } }));
  await page.route(`${API}/api/profile**`, (route) =>
    route.fulfill({ json: { profile: { address: ME, displayName: 'Bola Ade', handle: 'bola', settings: who.setupDoneAt ? { setupDoneAt: who.setupDoneAt } : {} } } }));
  await page.route(new RegExp('/api/deals/direct(\\?|$)'), (route) => route.fulfill({ json: { deals: who.deals ?? [] } }));
  await page.route(`${API}/api/guide/next`, (route) => route.fulfill({ json: { moves: [] } }));
  await page.route(`${API}/api/guide/moment`, (route) => route.fulfill({ json: { moment: null } }));
  await page.route(`${API}/api/agents/status`, (route) =>
    route.fulfill({ json: { chain: { id: 5042002, rpc: 'http://127.0.0.1:3198', explorer: 'https://testnet.arcscan.app' }, contracts: {} } }));
}

const tour = (page: Page) => page.locator('#page-tour-title');

async function openHome(page: Page) {
  await page.goto('/app');
  await page.addStyleTag({ content: 'main button, main input, main textarea, main select, main a { pointer-events: none !important; }' });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
}

const offer = (page: Page) => page.locator('[data-aman-line="tour-offer"]');

test('someone new is offered a look around Home, never thrown into it, and Show me opens the tour', async ({ page }) => {
  await serve(page, { setupDoneAt: Date.now() - 60_000 });
  await openHome(page);
  await expect(offer(page)).toContainText(guideCopy.en.tour.offer, { timeout: 15000 });
  await expect(tour(page)).toHaveCount(0);
  await offer(page).getByRole('button', { name: guideCopy.en.tour.showMe }).click();
  await expect(tour(page)).toBeVisible();
  await expect(page.locator('[data-tour-aman]')).toContainText('Aman · 1 of');
});

test('Not now on the offer turns it off for the account', async ({ page }) => {
  await serve(page, { setupDoneAt: Date.now() - 60_000 });
  const saved = page.waitForRequest((r) => r.url().endsWith('/api/settings') && r.method() === 'POST' && (r.postData() ?? '').includes('"guideTourOffer":"off"'));
  await openHome(page);
  await offer(page).getByRole('button', { name: guideCopy.en.notNow }).click({ timeout: 15000 });
  await saved;
  await expect(offer(page)).toHaveCount(0);
  await expect(tour(page)).toHaveCount(0);
});

test('an account with a deal is not offered a tour on a new device', async ({ page }) => {
  await serve(page, { deals: [settled] });
  await page.goto('/account');
  await expect(page.locator('[data-money-actions]')).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(tour(page)).toHaveCount(0);
  await expect(offer(page)).toHaveCount(0);
});

test('an account set up before today is not offered a tour on a new device', async ({ page }) => {
  await serve(page, { setupDoneAt: Date.UTC(2026, 9, 1) });
  await page.goto('/account');
  await expect(page.locator('[data-money-actions]')).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(tour(page)).toHaveCount(0);
});
