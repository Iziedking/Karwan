import { expect, test, type Page } from '@playwright/test';
import type { DirectDeal, FactoringOffer } from '../core/api';
import { en } from '../shared/i18n/messages/en';
import { ar } from '../shared/i18n/messages/ar';
import { BUYER, JOB, SELLER, deliveredDeal, serveDeal } from './fixtures';

/// Get paid now on the escrow family (view 18): the deal page for the seller,
/// the financier desk for a financier who pays from their own wallet.

const API = 'http://127.0.0.1:3199';
const g = en.dealWorkspace.getPaid;
const p = en.financierDashboard.positions;

const familyDeal = {
  ...deliveredDeal,
  tradeType: 'goods',
  tradeLane: 'finance',
  escrowVersion: 'suite',
  factoringRequestedAt: Date.UTC(2026, 9, 28),
} as DirectDeal;

const offer = (over: Partial<FactoringOffer> = {}): FactoringOffer =>
  ({
    id: '6f1c2a3b-0000-4000-8000-000000000002', invoiceId: JOB, financier: '0x5555555555555555555555555555555555555555', seller: SELLER,
    status: 'offered', offeredAdvanceUsdc: '120', expectedReturnUsdc: '123.6', faceValueUsdc: '150', discountBps: 2000,
    offeredAt: Date.now(), expiresAt: Date.now() + 86_400_000, createdAt: Date.now(), updatedAt: Date.now(),
    rail: 'family', holdUsdc: '12', recommended: true, funded: true, ...over,
  }) as FactoringOffer;

async function serveFamily(page: Page, offers: FactoringOffer[], accepted?: { body: unknown }) {
  await serveDeal(page, familyDeal, SELLER);
  await page.route(`${API}/api/factoring/offers/${JOB}`, (route) => route.fulfill({ json: { offers } }));
  await page.route(`${API}/api/factoring/accept`, async (route) => {
    if (accepted) accepted.body = route.request().postDataJSON();
    await route.fulfill({ json: { state: 'accepted', txHash: `0x${'ab'.repeat(32)}` } });
  });
}

test('a seller gets paid now from the deal page, and the offer says what it holds', async ({ page }) => {
  const accepted = { body: null as unknown };
  await serveFamily(page, [offer()], accepted);
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByText(g.hold.replace('{amount}', '12')).first()).toBeVisible();
  await page.getByRole('button', { name: g.review }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(g.hold.replace('{amount}', '12'));
  await dialog.getByRole('button', { name: g.accept }).click();
  await expect.poll(() => accepted.body).toEqual({ offerId: offer().id });
});

test('a short guarantee shows Put up and get paid now, and posts the combined step', async ({ page }) => {
  const accepted = { body: null as unknown };
  await serveFamily(page, [offer({ gapUsdc: '8' })], accepted);
  await page.goto(`/deals/${JOB}`);
  await page.getByRole('button', { name: g.review }).click();
  await page.getByRole('dialog').getByRole('button', { name: g.putUpAndTake.replace('{gap}', '8') }).click();
  await expect.poll(() => accepted.body).toEqual({ offerId: offer().id, putUpGap: true });
});

test('an offer taken from an own-wallet financier shows Waiting for the financier to pay', async ({ page }) => {
  await serveFamily(page, [offer({ status: 'awaiting_financier', waitingForFinancier: true, sellerDeadline: Date.now() + 3_600_000 }), offer({ id: '6f1c2a3b-0000-4000-8000-000000000003' })]);
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByRole('heading', { name: g.waitingTitle })).toBeVisible();
  await expect(page.getByRole('button', { name: g.review })).toHaveCount(0);
});

test('a deal on an older escrow takes no new advances', async ({ page }) => {
  await serveDeal(page, { ...familyDeal, escrowVersion: 'v2' } as DirectDeal, SELLER);
  await page.route(`${API}/api/factoring/offers/${JOB}`, (route) => route.fulfill({ json: { offers: [offer()] } }));
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByText(en.dealWorkspace.simple.agreement).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: g.requestedTitle })).toHaveCount(0);
});

test('the seller path never says stake, vault, insurance, factoring or assignment', async ({ page }) => {
  await serveFamily(page, [offer({ gapUsdc: '8' })]);
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByText(g.hold.replace('{amount}', '12')).first()).toBeVisible();
  await page.getByRole('button', { name: g.review }).click();
  await expect(page.getByText(/\b(stake|staking|vault|insurance|factoring|assignment)\b/i)).toHaveCount(0);
});

test('Get paid now reads right to left in Arabic and fits the screen', async ({ page, context }) => {
  await context.addCookies([{ name: 'karwan-locale', value: 'ar', url: 'http://127.0.0.1:3100' }]);
  await serveFamily(page, [offer()]);
  await page.goto(`/deals/${JOB}`);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('button', { name: ar.dealWorkspace.getPaid.review })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

async function serveDesk(page: Page, positions: FactoringOffer[]) {
  await page.addInitScript(() => {
    try { localStorage.setItem('karwan:guide:disabled', '1'); } catch { /* private mode */ }
  });
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/auth/bootstrap') return route.fulfill({ json: { user: { address: BUYER, method: 'web3', hasPasskey: false }, profile: null } });
    if (pathname === '/api/terms/status') return route.fulfill({ json: { currentVersion: '1', acceptedVersion: '1' } });
    if (pathname === '/api/financier/eligibility') {
      return route.fulfill({ json: { eligible: true, tenureDays: 90, tenureOk: true, stakeUsdc: 500, stakeOk: true, repScore: 800, repTier: 'ESTABLISHED', repOk: true, reasons: [], status: 'approved' } });
    }
    if (pathname === '/api/factoring/available') return route.fulfill({ json: { deals: [] } });
    if (pathname === '/api/factoring/mine') return route.fulfill({ json: { asFinancier: positions, asSeller: [] } });
    if (pathname.startsWith('/api/client-errors')) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ json: { items: [], events: [], movements: [], messages: [] } });
  });
}

test('the financier desk shows Pay the seller with the amount and the time left', async ({ page }) => {
  await serveDesk(page, [offer({ financier: BUYER, status: 'awaiting_financier', sellerDeadline: Date.now() + 3_600_000 })]);
  await page.goto('/financier');
  await expect(page.getByRole('button', { name: p.paySeller })).toBeVisible();
  await expect(page.getByText(/^Pay 120(\.00)? USDC by /)).toBeVisible();
});

test('a family shortfall says what came from the seller guarantee, and both pages fit the dark theme', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('karwan-theme', 'dark'));
  await serveDesk(page, [offer({ financier: BUYER, status: 'defaulted', fromGuaranteeMicros: '12000000' })]);
  await page.goto('/financier');
  await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe('dark');
  await expect(page.getByText(p.shortfall.replace('{amount}', '12'))).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
