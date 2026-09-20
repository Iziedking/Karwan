import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { JOB, SELLER, deliveredDeal, serveDeal } from './fixtures';

test('the money comes first with one clear action', async ({ page }) => {
  await serveDeal(page, deliveredDeal);
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('1,200');
  await expect(page.getByText('Held in escrow. Released only when the buyer approves.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Release 600 USDC' })).toBeVisible();
  await expect(page.getByText('Your move')).toBeVisible();
  await expect(page.getByText('Releases automatically on 25 Sep 2026 unless the buyer disputes.')).toBeVisible();
});

test('the trust card shows measured facts and verification', async ({ page }) => {
  await serveDeal(page, deliveredDeal);
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByText('14 settled · 13 of 14 on time · 0 disputes · since Mar 2026')).toBeVisible();
  await expect(page.getByText('Verified business')).toBeVisible();
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
  await expect(page.getByText('New to Karwan. No record yet. Escrow still protects this deal.')).toBeVisible();
});

test('sending is never shown as failed', async ({ page }) => {
  await serveDeal(page, { ...deliveredDeal, view: { ...deliveredDeal.view!, money: { line: 'sending' } } });
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByText('Sent. Waiting for the network to confirm. Nothing is lost.')).toBeVisible();
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
  await expect(page.getByText('Who you are dealing with')).toHaveCount(0);
  await page.getByRole('button', { name: 'Release 600 USDC' }).click();
  await expect(page.getByRole('dialog')).toContainText('600 USDC goes to the seller.');
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
