import { expect, test, type Page } from '@playwright/test';
import { en } from '../shared/i18n/messages/en';
import { API, RATES, funded, serveMoney } from './moneyFixtures';

/// Guarantee earnings read in the account's own currency (owner, 8 Nov 2026):
/// a naira account saw "Claim 6.32 USDC" and three totals in USDC under naira
/// rows. The claim, the totals and the chart now all say naira.

async function openEarnings(page: Page, currency: 'NGN' | 'USDC') {
  await serveMoney(page, {
    balances: funded,
    rates: RATES,
    settings: currency === 'NGN' ? { displayCurrency: 'NGN' } : {},
    guarantee: { inPlaceUsdc: '125', heldUsdc: '0', freeUsdc: '125', comingBackUsdc: '0', ready: false, previousUsdc: '0', waitDays: 7 },
  });
  await page.route(`${API}/api/yield/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/yield/me') {
      return route.fulfill({ json: { configured: true, claimableUsdc: '6.32', lifetimeCreditedUsdc: '179.5', lifetimeClaimedUsdc: '173.18' } });
    }
    if (path === '/api/yield/protocol') {
      return route.fulfill({ json: { configured: true, totalCreditedUsdc: '47.29', totalClaimedUsdc: '34', outstandingUsdc: '13.29' } });
    }
    if (path === '/api/yield/history') {
      return route.fulfill({ json: { configured: true, history: [
        { day: '2026-11-06', dailyCreditedUsdc: '20', cumulativeCreditedUsdc: '20' },
        { day: '2026-11-07', dailyCreditedUsdc: '27.29', cumulativeCreditedUsdc: '47.29' },
      ] } });
    }
    return route.fulfill({ json: { configured: false } });
  });
  await page.goto('/account?tab=guarantee');
  await page.getByRole('button', { name: en.moneyPages.guarantee.earnings }).click();
  return page.locator('section[aria-labelledby="guarantee-earnings"]');
}

test('a naira account reads its guarantee earnings in naira, claim included', async ({ page }, testInfo) => {
  const earnings = await openEarnings(page, 'NGN');
  const claim = earnings.getByRole('button', { name: /^Claim / });
  await expect(claim).toBeVisible();
  await expect(claim).toContainText('₦');
  await expect(claim).not.toContainText('USDC');
  const t = en.guaranteeReserves;
  await expect(earnings.getByText(t.distributed, { exact: true })).toBeVisible();
  await expect(earnings.getByText(t.chartTitle, { exact: true })).toBeVisible();
  await expect(earnings.getByText('NGN', { exact: true })).toBeVisible();
  // The USYC price is the one figure that is a token's own price, in dollars.
  await expect(earnings).not.toContainText('USDC');
  await earnings.screenshot({ path: testInfo.outputPath('guarantee-earnings-ngn.png') });
});

test('a USDC account keeps its guarantee earnings in USDC', async ({ page }) => {
  const earnings = await openEarnings(page, 'USDC');
  await expect(earnings.getByRole('button', { name: /^Claim / })).toHaveText('Claim 6.32 USDC');
  await expect(earnings.getByText('USDC', { exact: true }).first()).toBeVisible();
});
