import { expect, test, type Page } from '@playwright/test';
import { en } from '../shared/i18n/messages/en';
import { API, ME, funded, serveMoney } from './moneyFixtures';

/// Post an offer and Start a deal in the new look (view 48, batch 9b).

async function signedIn(page: Page, role: 'seller' | 'buyer') {
  await serveMoney(page, { balances: funded });
  await page.route(`${API}/api/profile**`, (route) =>
    route.fulfill({ json: { profile: { address: ME, role, displayName: 'Ada', handle: 'ada' } } }));
  await page.route(`${API}/api/agents/**`, (route) => route.fulfill({ json: { profile: null, jobs: [], activeBids: [], recentBids: [] } }));
  await page.route(`${API}/api/listings/mine**`, (route) => route.fulfill({ json: { listings: [] } }));
}

/// Green controls on the whole page, header and nav included.
const greenControls = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--action').trim();
    document.body.appendChild(probe);
    const green = getComputedStyle(probe).color;
    probe.remove();
    return [...document.querySelectorAll<HTMLElement>('a, button')]
      .filter((el) => el.offsetParent !== null && getComputedStyle(el).backgroundColor === green)
      .map((el) => el.textContent?.trim() ?? '');
  });

const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test('Post an offer is one screen with one green button, and fits a phone', async ({ page }, info) => {
  await signedIn(page, 'seller');
  await page.goto('/seller');
  await expect(page.locator('[data-guide="seller-price"] input')).toBeVisible();
  await expect(page.locator('[data-pay-in-parts]')).toBeVisible();
  await expect(page.getByRole('button', { name: en.dealCreation.review, exact: true })).toBeVisible();
  expect(await greenControls(page)).toEqual([en.dealCreation.review]);
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.screenshot({ path: info.outputPath('post-offer.png'), fullPage: true });
});

test('Start a deal is one screen with one green button, and fits a phone', async ({ page }, info) => {
  await signedIn(page, 'buyer');
  await page.goto('/buyer?mode=direct');
  await page.getByRole('button', { name: new RegExp(`^${en.requestFlow.kinds.one}`) }).click();
  await expect(page.getByLabel(en.directDeal.counterparty.oneBoxLabel)).toBeVisible();
  await expect(page.getByLabel(en.editDealModal.deliverLabel, { exact: true })).toBeVisible();
  // View 56: no milestone setup until the words make parts.
  await expect(page.locator('[data-pay-in-parts]')).toHaveCount(0);
  expect(await greenControls(page)).toEqual([en.dealCreation.review]);
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.screenshot({ path: info.outputPath('start-deal.png'), fullPage: true });
});
