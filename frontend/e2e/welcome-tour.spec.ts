import { expect, test, type Page } from '@playwright/test';
import type { DirectDeal } from '../core/api';
import { API, ME, funded, serveMoney } from './moneyFixtures';

/// The first-run welcome is for someone new. An account with deals behind it,
/// signing in on a device that has never seen it, is not welcomed again (T-16).

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
}

const tour = (page: Page) => page.locator('#page-tour-title');

test('someone new is welcomed once on their first app page', async ({ page }) => {
  await serve(page, { setupDoneAt: Date.now() - 60_000 });
  await page.goto('/account');
  await expect(tour(page)).toHaveText('Welcome to Karwan');
});

test('an account with a deal is not welcomed on a new device', async ({ page }) => {
  await serve(page, { deals: [settled] });
  await page.goto('/account');
  await expect(page.locator('[data-money-actions]')).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(tour(page)).toHaveCount(0);
});

test('an account set up before today is not welcomed on a new device', async ({ page }) => {
  await serve(page, { setupDoneAt: Date.UTC(2026, 9, 1) });
  await page.goto('/account');
  await expect(page.locator('[data-money-actions]')).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(tour(page)).toHaveCount(0);
});
