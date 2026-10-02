import { expect, test, type Page } from '@playwright/test';
import { en } from '../shared/i18n/messages/en';
import { TERMS_COPY } from '../features/deals/terms/termsCopy';
import { API, ME, funded, serveMoney } from './moneyFixtures';

const rs = en.dealCreation.requestSteps;
const f = en.postListing.flow;
const tb = TERMS_COPY.en;

async function signedIn(page: Page, role: 'seller' | 'buyer') {
  await page.addInitScript(() => {
    try { localStorage.setItem('karwan:guide:disabled', '1'); } catch { /* private mode */ }
  });
  await serveMoney(page, { balances: funded });
  await page.route(`${API}/api/profile**`, route =>
    route.fulfill({ json: { profile: { address: ME, role, displayName: 'Ada', handle: 'ada', buyer: { milestonePcts: [50, 50] } } } }));
  await page.route(`${API}/api/agents/**`, route => route.fulfill({ json: { profile: null, jobs: [], activeBids: [], recentBids: [] } }));
  await page.route(`${API}/api/listings/mine**`, route => route.fulfill({ json: { listings: [] } }));
}

test('an offer is set in three steps: price, floor, ready-in time and terms', async ({ page }) => {
  await signedIn(page, 'seller');
  let posted: Record<string, unknown> | null = null;
  await page.route(`${API}/api/listings`, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    posted = route.request().postDataJSON();
    return route.fulfill({ status: 500, json: { error: 'stop here' } });
  });

  await page.goto('/seller');
  await expect(page.getByText(`${rs.stepOf.replace('{n}', '1')} · ${rs.describe}`)).toBeVisible();
  const next = page.getByRole('button', { name: rs.continue, exact: true });
  await expect(next).toBeDisabled();
  await page.locator('[data-guide="seller-listing"] input').fill('Logo design for small shops');
  await page.locator('[data-guide="seller-listing"] textarea').fill('A logo in SVG and PNG with two rounds of changes.');
  await next.click();

  await expect(page.getByRole('button', { name: `${f.perUnit}, ${f.soon}` })).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('button', { name: `${f.perHour}, ${f.soon}` })).toHaveAttribute('aria-disabled', 'true');
  await page.locator('[data-guide="seller-price"] input').fill('100');
  await page.locator('[data-guide="seller-floor"] input').fill('40');
  await expect(page.getByText(f.floorTooLow, { exact: true })).toBeVisible();
  await expect(next).toBeDisabled();
  await page.locator('[data-guide="seller-floor"] input').fill('80');
  await page.getByRole('button', { name: f.other, exact: true }).click();
  await page.getByRole('textbox', { name: f.otherDays, exact: true }).fill('5');
  await next.click();

  await page.getByRole('textbox', { name: `${tb.part.replace('{n}', '1')}: ${tb.whatLabel}`, exact: true }).fill('Three logo sketches to choose from');

  // Every deal starts as one milestone; a second is added on purpose.

  await page.getByRole('button', { name: tb.addPart, exact: true }).click();
  await page.getByRole('textbox', { name: `${tb.part.replace('{n}', '2')}: ${tb.whatLabel}`, exact: true }).fill('Logo in SVG and PNG');
  await page.getByRole('textbox', { name: `${tb.part.replace('{n}', '1')} %` }).fill('30');
  await page.getByRole('button', { name: en.dealCreation.review, exact: true }).click();
  await expect(page.getByText(f.readyInRow.replace('{n}', '5'), { exact: true })).toBeVisible();
  await page.getByRole('button', { name: f.publish }).click();

  await expect.poll(() => posted).not.toBeNull();
  expect(posted).toMatchObject({
    askingPriceUsdc: 100,
    negotiationMaxDecreasePct: 20,
    readyInDays: 5,
    ttlDays: 30,
    termsDraft: {
      proof: 'link',
      parts: [{ pct: 30, what: 'Three logo sketches to choose from' }, { pct: 70, what: 'Logo in SVG and PNG' }],
      reviewWindowDays: 3,
    },
  });
  expect(String((posted as unknown as { terms: string }).terms)).toContain(': Logo in SVG and PNG');
});

test('a deal started from an offer starts from its terms and ready-in time', async ({ page }) => {
  await signedIn(page, 'buyer');
  await page.route(`${API}/api/listings/lst_1**`, route => route.fulfill({
    json: {
      status: 'open',
      listing: {
        id: 'lst_1',
        sellerUser: '0x3333333333333333333333333333333333333333',
        sellerAgent: '0x4444444444444444444444444444444444444444',
        title: 'Logo design',
        description: 'A logo in SVG and PNG.',
        askingPriceUsdc: 100,
        postedAt: Date.now(),
        expiresAt: Date.now() + 86_400_000,
        readyInDays: 5,
        termsDraft: {
          conditions: ['2 rounds of changes included'],
          proof: 'link',
          parts: [{ pct: 20, what: 'Three logo sketches' }, { pct: 30, what: 'Two refined directions' }, { pct: 50, what: 'Logo in SVG and PNG' }],
          reviewWindowDays: 7,
        },
      },
    },
  }));

  await page.goto('/buyer?mode=direct&seller=0x3333333333333333333333333333333333333333&amount=100&listing=lst_1');
  const next = page.getByRole('button', { name: rs.continue, exact: true });
  await next.click();
  await expect(page.getByText(/^Due /)).toBeVisible();
  await next.click();
  await expect(page.getByRole('textbox', { name: `${tb.part.replace('{n}', '3')}: ${tb.whatLabel}`, exact: true })).toHaveValue('Logo in SVG and PNG');
  await expect(page.getByRole('textbox', { name: `${tb.part.replace('{n}', '1')} %` })).toHaveValue('20');
  await expect(page.getByRole('textbox', { name: `${tb.part.replace('{n}', '2')} %` })).toHaveValue('30');
  await expect(page.getByRole('textbox', { name: `${tb.part.replace('{n}', '3')} %` })).toHaveValue('50');
  await expect(page.getByRole('button', { name: tb.days.replace('{n}', '7'), exact: true })).toHaveAttribute('aria-pressed', 'true');
});
