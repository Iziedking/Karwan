import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { DirectDeal } from '../core/api';
import { en } from '../shared/i18n/messages/en';
import { BUYER, JOB, SELLER, deliveredDeal, serveDeal } from './fixtures';

const s = en.dealWorkspace.simple;

function capture(page: Page, path: string) {
  const box: { body: unknown } = { body: null };
  void page.route(`**/api/deals/direct/${JOB}/${path}`, async (route) => {
    box.body = route.request().postDataJSON();
    await route.fulfill({ json: { accepted: true, jobId: JOB } });
  });
  return box;
}

test('the money comes first with one clear action', async ({ page }) => {
  await serveDeal(page, deliveredDeal);
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('1,200');
  await expect(page.getByText('Held in escrow', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Release 600 USDC' })).toBeVisible();
  await expect(page.getByText('Releases automatically on 25 Sep 2026 unless you raise a problem.')).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(0);
});

test('who it is with is one line, and the full record opens on request', async ({ page }) => {
  await serveDeal(page, deliveredDeal);
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByText('14 settled · 13 of 14 on time', { exact: true })).toBeVisible();
  await expect(page.getByText('Verified business')).toHaveCount(0);
  await page.getByRole('button', { name: /^Amina Foods Ltd/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('14 settled · 13 of 14 on time · 0 disputes · since Mar 2026');
  await expect(sheet).toContainText('Verified business');
});

test('a money action opens the confirm sheet with its consequence', async ({ page }) => {
  await serveDeal(page, deliveredDeal);
  await page.goto(`/deals/${JOB}`);
  await page.getByRole('button', { name: 'Release 600 USDC' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('600 USDC goes to Amina Foods Ltd.');
  await expect(sheet).toContainText('This cannot be undone.');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
});

test('the agreement opens in a sheet instead of sitting on the page', async ({ page }) => {
  await serveDeal(page, deliveredDeal);
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByText('Deliver the translated catalogue')).toHaveCount(0);
  await page.getByRole('button', { name: s.agreement, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Deliver the translated catalogue');
});

test('a new counterparty is described neutrally', async ({ page }) => {
  await serveDeal(page, {
    ...deliveredDeal,
    counterpartyTrust: {
      ...deliveredDeal.counterpartyTrust!,
      isNew: true,
      verifiedBusiness: false,
      facts: { settled: 0, distinctCounterparties: 0, onTime: 0, withDeadline: 0, disputes: 0 },
    },
  });
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByText(s.newHere, { exact: true })).toBeVisible();
});

test('sending is never shown as failed', async ({ page }) => {
  await serveDeal(page, { ...deliveredDeal, view: { ...deliveredDeal.view!, money: { line: 'sending' } } });
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByText(en.dealWorkspace.money.sending, { exact: true })).toBeVisible();
  await expect(page.getByText(/failed/i)).toHaveCount(0);
});

test('the seller sees whose move it is', async ({ page }) => {
  await serveDeal(
    page,
    { ...deliveredDeal, view: { ...deliveredDeal.view!, next: { action: null, actor: 'counterparty', amountUsdc: null } } },
    SELLER,
  );
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByText(/^Waiting on /)).toBeVisible();
});

test('the page still works when the trust lookup failed', async ({ page }) => {
  await serveDeal(page, { ...deliveredDeal, counterpartyTrust: null });
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByRole('button', { name: 'Release 600 USDC' })).toBeVisible();
  await page.getByRole('button', { name: 'Release 600 USDC' }).click();
  await expect(page.getByRole('dialog')).toContainText('600 USDC goes to the seller.');
});

const awaitingDelivery: DirectDeal = {
  ...deliveredDeal,
  delivered: false,
  deliveredAt: undefined,
  deadlineUnix: Math.floor(Date.UTC(2030, 0, 10) / 1000),
  view: { ...deliveredDeal.view!, stage: 'awaiting-delivery', next: { action: 'deliver', actor: 'you', amountUsdc: null }, automatic: null },
};

test('the seller delivers from a sheet on the same page', async ({ page }) => {
  await serveDeal(page, awaitingDelivery, SELLER);
  const delivered = capture(page, 'delivered');
  await page.goto(`/deals/${JOB}`);
  await page.getByRole('button', { name: en.dealWorkspace.actions.deliver }).click();
  const submit = page.getByRole('button', { name: s.deliverSubmit });
  await expect(submit).toBeDisabled();
  await page.getByLabel(s.proofLabel).fill('https://example.com/catalogue.pdf');
  await submit.click();
  await expect.poll(() => delivered.body).toEqual({ caller: SELLER, deliveryProof: 'https://example.com/catalogue.pdf' });
});

test('the buyer answers a request for more time in place', async ({ page }) => {
  await serveDeal(page, {
    ...awaitingDelivery,
    extensionRequest: { requestedBy: 'seller', requestedAt: Date.UTC(2026, 9, 1), additionalSeconds: 3 * 86_400, reason: 'Printer delay' },
    view: { ...awaitingDelivery.view!, next: { action: 'respond-extension', actor: 'you', amountUsdc: null } },
  }, BUYER);
  const answered = capture(page, 'extension/respond');
  await page.goto(`/deals/${JOB}`);
  await page.getByRole('button', { name: en.dealWorkspace.actions.respondExtension }).click();
  await expect(page.getByRole('dialog')).toContainText('Printer delay');
  await page.getByRole('button', { name: s.giveTime }).click();
  await expect.poll(() => answered.body).toEqual({ caller: BUYER, decision: 'approved' });
});

test('something is wrong offers a dispute with a reason after delivery', async ({ page }) => {
  await serveDeal(page, deliveredDeal, BUYER);
  const appealed = capture(page, 'appeal');
  await page.goto(`/deals/${JOB}`);
  await page.getByRole('button', { name: s.problem, exact: true }).click();
  await page.getByRole('button', { name: s.disputeTitle }).click();
  await page.getByLabel(s.whatWentWrong).fill('Half the catalogue is missing');
  await page.getByRole('button', { name: s.disputeSubmit }).click();
  await expect.poll(() => appealed.body).toEqual({ caller: BUYER, reason: 'Half the catalogue is missing' });
});

for (const theme of ['light', 'dark'] as const) {
  test(`no horizontal scroll and no accessibility violations in ${theme}`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('karwan-theme', value), theme);
    await serveDeal(page, deliveredDeal);
    await page.goto(`/deals/${JOB}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.waitForTimeout(600);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test('Arabic renders right to left without overflow', async ({ page, context }) => {
  await context.addCookies([{ name: 'karwan-locale', value: 'ar', url: 'http://127.0.0.1:3100' }]);
  await serveDeal(page, deliveredDeal);
  await page.goto(`/deals/${JOB}`);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
