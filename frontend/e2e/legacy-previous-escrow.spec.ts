import { expect, test, type Page } from '@playwright/test';
import { BUYER } from './fixtures';
import { en } from '../shared/i18n/messages/en';

/// Once the escrow family is live, the deals from before it are gathered on the
/// legacy page to reconcile, each opening its own deal page (view 27).

const API = 'http://127.0.0.1:3199';
const SELLER = '0x5555555555555555555555555555555555555555';
const profile = { address: BUYER, displayName: 'Bless', handle: 'bless', role: 'buyer', createdAt: 1, updatedAt: 1 };
const c = en.previousEscrow;

const deal = (jobId: string, stage: string, createdAt: number, extra: Record<string, unknown> = {}) => ({
  jobId, buyer: BUYER.toLowerCase(), seller: SELLER, dealAmountUsdc: '120', firstReleasePct: 50, createdAt,
  counterpartyName: '@amina',
  view: { stage, money: { line: 'held' }, progress: [], next: { action: null, actor: 'nobody', amountUsdc: null }, automatic: null },
  ...extra,
});

async function signedIn(page: Page, deals: unknown[]) {
  await page.addInitScript(() => localStorage.setItem('karwan:guide:disabled', '1'));
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/auth/bootstrap') {
      return route.fulfill({ json: { user: { address: BUYER, method: 'circle', hasPasskey: true }, profile } });
    }
    if (pathname === '/api/profile') return route.fulfill({ json: { profile } });
    if (pathname === '/api/legacy/window') {
      return route.fulfill({ json: { open: false, closesAtMs: null, daysRemaining: null, hasLegacyEscrow: false, hasLegacyVault: false, legacyEscrowAddress: null, legacyVaultAddress: null, generations: [] } });
    }
    if (pathname === '/api/deals/direct') return route.fulfill({ json: { deals } });
    if (route.request().method() !== 'GET') return route.fulfill({ status: 403, body: '' });
    return route.fulfill({ json: { items: [], events: [], movements: [], messages: [], workspaces: [] } });
  });
}

test('deals from before the new escrow are listed, open first, each opening its deal page', async ({ page }) => {
  const settled = '0x' + 'a'.repeat(64);
  const open = '0x' + 'b'.repeat(64);
  const family = '0x' + 'c'.repeat(64);
  await signedIn(page, [
    deal(settled, 'settled', 30, { previousEscrow: true }),
    deal(open, 'awaiting-delivery', 10, { previousEscrow: true }),
    deal(family, 'awaiting-delivery', 40, { escrowVersion: 'suite' }),
  ]);
  await page.goto('/legacy');
  // The list shows after sign-in and the deal read both land.
  await expect(page.getByRole('heading', { name: new RegExp(c.title) })).toBeVisible({ timeout: 15_000 });
  const links = page.getByRole('link', { name: c.open });
  await expect(links).toHaveCount(2);
  await expect(links.first()).toHaveAttribute('href', `/deals/${open}`);
  await expect(links.nth(1)).toHaveAttribute('href', `/deals/${settled}`);
  await expect(page.getByText(en.dealStage.labels['awaiting-delivery'])).toBeVisible();
});

test('nothing is listed when every deal is on the new escrow', async ({ page }) => {
  await signedIn(page, [deal('0x' + 'c'.repeat(64), 'settled', 1, { escrowVersion: 'suite' })]);
  await page.goto('/legacy');
  await expect(page.getByRole('heading', { name: new RegExp(en.legacyPage.closed.title) })).toBeVisible();
  await expect(page.getByRole('heading', { name: new RegExp(c.title) })).toHaveCount(0);
});
