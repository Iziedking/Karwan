import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { DirectDeal, FactoringOffer } from '../core/api';
import { en } from '../shared/i18n/messages/en';
import { BUYER, SELLER } from './fixtures';

const API = 'http://127.0.0.1:3199';
const t = en.financierDashboard;

const invoice = (n: number, over: Partial<DirectDeal> = {}): DirectDeal =>
  ({
    jobId: `0x${String(n).repeat(64).slice(0, 64)}`,
    buyer: BUYER,
    seller: SELLER,
    dealAmountUsdc: '4800',
    firstReleasePct: 100,
    terms: 'Bulk cassava flour, two lorries',
    createdAt: Date.UTC(2026, 9, 1),
    updatedAt: Date.UTC(2026, 9, 2),
    sellerTier: 'established',
    paymentTerms: 'net30',
    counterpartyCompany: { name: 'Amina Foods Ltd', sector: 'agriculture', region: 'Kano' },
    factoringRequestedAdvanceUsdc: '2000',
    claimableUsdc: '4800',
    ...over,
  }) as DirectDeal;

const position = (id: string, status: FactoringOffer['status']): FactoringOffer => ({
  id,
  invoiceId: `0x${'9'.repeat(64)}`,
  financier: BUYER,
  seller: SELLER,
  faceValueUsdc: '3000',
  offeredAdvanceUsdc: '1470',
  expectedReturnUsdc: '1500',
  discountBps: 200,
  status,
  offeredAt: Date.UTC(2026, 9, 3),
  expiresAt: Date.UTC(2026, 9, 4),
  acceptedAt: Date.UTC(2026, 9, 3),
  createdAt: Date.UTC(2026, 9, 3),
  updatedAt: Date.UTC(2026, 9, 3),
});

async function serveDesk(page: Page, opts: { invoices?: DirectDeal[]; positions?: FactoringOffer[] } = {}) {
  await page.addInitScript(() => {
    try { localStorage.setItem('karwan:guide:disabled', '1'); } catch { /* private mode */ }
  });
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/auth/bootstrap') {
      return route.fulfill({ json: { user: { address: BUYER, method: 'circle', hasPasskey: true }, profile: null } });
    }
    if (pathname === '/api/terms/status') return route.fulfill({ json: { currentVersion: '1', acceptedVersion: '1' } });
    if (pathname === '/api/financier/eligibility') {
      return route.fulfill({
        json: { eligible: true, tenureDays: 90, tenureOk: true, stakeUsdc: 500, stakeOk: true, repScore: 800, repTier: 'ESTABLISHED', repOk: true, reasons: [], status: 'approved' },
      });
    }
    if (pathname === '/api/factoring/available') {
      return route.fulfill({ json: { deals: opts.invoices ?? [invoice(1), invoice(2, { counterpartyCompany: undefined, sellerTier: undefined, paymentTerms: undefined })] } });
    }
    if (pathname === '/api/factoring/mine') {
      return route.fulfill({ json: { asFinancier: opts.positions ?? [position('p1', 'accepted'), position('p2', 'settled')], asSeller: [] } });
    }
    if (pathname.startsWith('/api/client-errors')) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ json: { items: [], events: [], movements: [], messages: [] } });
  });
}

test('your positions come first, then invoices as rows with one plain action each', async ({ page }) => {
  await serveDesk(page);
  await page.goto('/financier');
  await expect(page.getByRole('heading', { level: 1, name: t.title })).toBeVisible();
  const positions = page.getByRole('heading', { level: 2, name: t.positions.title });
  const open = page.getByRole('heading', { level: 2, name: t.open.title });
  await expect(positions).toBeVisible();
  await expect(open).toBeVisible();
  const [p, o] = await Promise.all([positions.boundingBox(), open.boundingBox()]);
  expect(p!.y).toBeLessThan(o!.y);
  await expect(page.getByText('1 active · 1,470 USDC out · 1,500 USDC expected back')).toBeVisible();
  await expect(page.getByText('4,800 USDC').first()).toBeVisible();
  await expect(page.getByText(t.open.anySeller)).toBeVisible();
  await expect(page.locator('select')).toHaveCount(0);
  await expect(page.getByRole('button', { name: t.open.makeOffer })).toHaveCount(2);
});

test('an offer opens in the side sheet, keeps focus inside and closes with Escape', async ({ page }) => {
  await serveDesk(page);
  await page.goto('/financier');
  const trigger = page.getByRole('button', { name: t.open.makeOffer }).first();
  await trigger.click();
  const sheet = page.getByRole('dialog', { name: t.offer.title });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(t.offer.youPayNow)).toBeVisible();
  await expect(sheet.getByRole('button', { name: t.offer.postOffer })).toBeEnabled();
  await expect(sheet.getByText('1,960 USDC', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('an invoice with nothing left in escrow says so and cannot be offered on', async ({ page }) => {
  await serveDesk(page, { invoices: [invoice(3, { claimableUsdc: '0' })] });
  await page.goto('/financier');
  await page.getByRole('button', { name: t.open.makeOffer }).click();
  const sheet = page.getByRole('dialog', { name: t.offer.title });
  await expect(sheet.getByText(t.offer.nothingToAdvance)).toBeVisible();
  await expect(sheet.getByRole('button', { name: t.offer.postOffer })).toBeDisabled();
});

test('an empty desk says what appears there and when', async ({ page }) => {
  await serveDesk(page, { invoices: [], positions: [] });
  await page.goto('/financier');
  await expect(page.getByText(t.open.emptyTitle)).toBeVisible();
  await expect(page.getByText(t.open.emptyBody)).toBeVisible();
  await expect(page.getByRole('heading', { name: t.positions.title })).toHaveCount(0);
});

for (const theme of ['light', 'dark'] as const) {
  test(`no horizontal scroll and no accessibility violations in ${theme}`, async ({ page }, info) => {
    await page.addInitScript((value) => localStorage.setItem('karwan-theme', value), theme);
    await serveDesk(page);
    await page.goto('/financier');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const small = await page.evaluate(() =>
      Array.from(document.querySelectorAll('main *'))
        .filter((el) => el.childNodes.length && Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim()))
        .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 14)
        .map((el) => (el as HTMLElement).innerText.slice(0, 30)),
    );
    expect(small).toEqual([]);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    await page.screenshot({ path: `test-results/financier/desk_${info.project.name}_${theme}.png`, fullPage: true });
    await page.getByRole('button', { name: t.open.makeOffer }).first().click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `test-results/financier/offer_${info.project.name}_${theme}.png` });
  });
}

test('Arabic renders right to left without overflow', async ({ page, context }, info) => {
  await context.addCookies([{ name: 'karwan-locale', value: 'ar', url: 'http://127.0.0.1:3100' }]);
  await serveDesk(page);
  await page.goto('/financier');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForTimeout(1500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `test-results/financier/desk_${info.project.name}_ar.png`, fullPage: true });
});
