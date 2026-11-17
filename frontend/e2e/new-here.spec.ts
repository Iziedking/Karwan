import { expect, test, type Page } from '@playwright/test';
import type { DirectDeal } from '../core/api';
import { API, ME, funded, serveMoney } from './moneyFixtures';
import { guideCopy } from '../shared/i18n/messages/guide';

/// New here? (view 57, 17 Nov): someone new is answered, not walked through.
/// One line with three questions; a question opens the assistant with it
/// asked; Not now is kept on the account. An account with deals behind it is
/// never asked (T-16).

const copy = guideCopy.en;
const OTHER = '0x00000000000000000000000000000000000000b2';
const settled = {
  jobId: `0x${'ab'.repeat(32)}`, buyer: ME, seller: OTHER, dealAmountUsdc: '120', terms: 'Logo and brand kit', firstReleasePct: 50,
  delivered: true, disputed: false, createdAt: Date.UTC(2026, 9, 1), updatedAt: Date.UTC(2026, 9, 2), sellerApprovedAt: 2, acceptedAt: 3,
  settledAt: Date.UTC(2026, 9, 2), onChain: null,
} as unknown as DirectDeal;
const WAITING = { kind: 'approve_delivery', ref: '0xd1', jobId: '0xd1', href: '/deals/0xd1', amountUsdc: '50' };

async function serve(page: Page, who: { setupDoneAt?: number; deals?: DirectDeal[]; settings?: Record<string, unknown>; moves?: unknown[] }) {
  const settings = { ...(who.setupDoneAt ? { setupDoneAt: who.setupDoneAt } : {}), ...(who.settings ?? {}) };
  await serveMoney(page, { balances: funded, settings });
  await page.route(`${API}/api/terms/status`, (route) => route.fulfill({ json: { currentVersion: '1', acceptedVersion: '1' } }));
  await page.route(`${API}/api/profile**`, (route) =>
    route.fulfill({ json: { profile: { address: ME, displayName: 'Bola Ade', handle: 'bola', settings } } }));
  await page.route(/\/api\/deals\/direct(\?|$)/, (route) => route.fulfill({ json: { deals: who.deals ?? [] } }));
  await page.route(`${API}/api/guide/next`, (route) => route.fulfill({ json: { moves: who.moves ?? [] } }));
  await page.route(`${API}/api/guide/moment`, (route) => route.fulfill({ json: { moment: null } }));
  await page.route(`${API}/api/guide/setup`, (route) => route.fulfill({ json: { steps: [], next: null, complete: true, known: true } }));
  await page.route(`${API}/api/agents/status`, (route) =>
    route.fulfill({ json: { chain: { id: 5042002, rpc: 'http://127.0.0.1:3198', explorer: 'https://testnet.arcscan.app' }, contracts: {} } }));
}

async function openHome(page: Page) {
  await page.goto('/app');
  await page.addStyleTag({ content: 'main button, main input, main textarea, main select, main a { pointer-events: none !important; }' });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
}

const newHere = (page: Page) => page.locator('[data-aman-line="new-here"]');

test('someone new is asked New here? with three questions, and a question opens the assistant with it asked', async ({ page }) => {
  await serve(page, { setupDoneAt: Date.now() - 60_000 });
  await page.route(`${API}/api/assistant/**`, (route) => route.fulfill({ json: { conversations: [], pickUp: null } }));
  await openHome(page);
  await expect(newHere(page)).toContainText(copy.newHere, { timeout: 15000 });
  for (const q of [copy.questions['home.first'], copy.questions['home.findSeller'], copy.questions['home.getPaid']]) {
    await expect(newHere(page).getByRole('button', { name: q })).toBeVisible();
  }
  await newHere(page).getByRole('button', { name: copy.questions['home.first'] }).click();
  await expect(page).toHaveURL(/\/assistant/);
  await expect(page.getByText(copy.questions['home.first']).first()).toBeVisible({ timeout: 15000 });
});

test('Not now on New here is kept on the account', async ({ page }) => {
  await serve(page, { setupDoneAt: Date.now() - 60_000 });
  const saved = page.waitForRequest((r) => r.url().endsWith('/api/settings') && r.method() === 'POST' && (r.postData() ?? '').includes('"guideNewHere":"off"'));
  await openHome(page);
  await newHere(page).getByRole('button', { name: copy.notNow }).click({ timeout: 15000 });
  await saved;
  await expect(newHere(page)).toHaveCount(0);
  await page.reload();
  await page.waitForTimeout(3000);
  await expect(newHere(page)).toHaveCount(0);
});

test('a deal waiting on someone new comes first', async ({ page }) => {
  await serve(page, { setupDoneAt: Date.now() - 60_000, moves: [WAITING] });
  await openHome(page);
  await expect(page.locator('[data-aman-line]')).toBeVisible({ timeout: 15000 });
  await expect(newHere(page)).toHaveCount(0);
});

test('an account that turned the old tour offer off is never asked', async ({ page }) => {
  await serve(page, { setupDoneAt: Date.now() - 60_000, settings: { guideTourOffer: 'off' } });
  await openHome(page);
  await page.waitForTimeout(3500);
  await expect(newHere(page)).toHaveCount(0);
});

test('an account with a deal is not asked on a new device', async ({ page }) => {
  await serve(page, { deals: [settled] });
  await page.goto('/account');
  await expect(page.locator('[data-money-actions]')).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(newHere(page)).toHaveCount(0);
});
