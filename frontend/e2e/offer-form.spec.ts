import { expect, test, type Page } from '@playwright/test';
import { en } from '../shared/i18n/messages/en';
import { TERMS_COPY } from '../features/deals/terms/termsCopy';
import { API, ME, funded, serveMoney } from './moneyFixtures';
import { requestFlowCopy } from '../shared/i18n/messages/requestFlow';

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

test('an offer is one screen: price, ready-in time, the floor in place, and its parts drafted from the words (views 48, 56)', async ({ page }) => {
  await signedIn(page, 'seller');
  let draftedFrom = '';
  await page.route(`${API}/api/deals/draft`, async route => {
    draftedFrom = (route.request().postDataJSON() as { brief: string }).brief;
    return route.fulfill({ json: { draft: { title: 'Logo design', parts: [{ pct: 30, what: 'Three logo sketches to choose from' }, { pct: 70, what: 'Logo in SVG and PNG' }], tradeType: 'service', quantity: null, source: 'rules' } } });
  });
  let posted: Record<string, unknown> | null = null;
  await page.route(`${API}/api/listings`, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    posted = route.request().postDataJSON();
    return route.fulfill({ status: 500, json: { error: 'stop here' } });
  });

  await page.goto('/seller');
  await expect(page.getByText(rs.stepOf.replace('{n}', '1'), { exact: false })).toHaveCount(0);
  const review = page.getByRole('button', { name: en.dealCreation.review, exact: true });
  await expect(review).toBeDisabled();
  await page.locator('[data-guide="seller-listing"] input').fill('Logo design for small shops');
  await page.locator('[data-guide="seller-listing"] textarea').fill('Three logo sketches first, then the logo in SVG and PNG.');
  // No milestone setup on the form (view 56): the words carry it.
  await expect(page.locator('[data-pay-in-parts]')).toHaveCount(0);
  // The seller can place the offer in a market category (view 44).
  const design = page.getByRole('group', { name: en.marketShop.categoriesLabel }).getByRole('button', { name: en.marketShop.categories.design });
  await design.click();
  await expect(design).toHaveAttribute('aria-pressed', 'true');

  // Ways to charge that do not work yet stay hidden until business accounts open.
  await expect(page.getByRole('button', { name: f.perUnit })).toHaveCount(0);
  await expect(page.getByRole('button', { name: f.perHour })).toHaveCount(0);
  await page.locator('[data-guide="seller-price"] input').fill('100');
  await page.locator('summary', { hasText: f.floor }).click();
  await page.locator('[data-guide="seller-floor"] input').fill('40');
  await expect(page.getByText(f.floorTooLow, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: f.other, exact: true }).click();
  await page.getByRole('textbox', { name: f.otherDays, exact: true }).fill('5');
  await expect(review).toBeDisabled();
  await page.locator('[data-guide="seller-floor"] input').fill('80');

  await review.click();
  expect(draftedFrom).toBe('Logo design for small shops. Three logo sketches first, then the logo in SVG and PNG.');
  await expect(page.locator('[data-drafted]')).toHaveText(requestFlowCopy.en.drafted);
  await expect(page.getByRole('region').locator('dd').filter({ hasText: '30%: Three logo sketches to choose from' }).first()).toBeVisible();
  await expect(page.getByText(f.readyInRow.replace('{n}', '5'), { exact: true })).toBeVisible();
  expect(posted).toBeNull();
  await page.getByRole('button', { name: f.publish }).click();

  await expect.poll(() => posted).not.toBeNull();
  expect(posted).toMatchObject({
    category: 'design',
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

test('an offer whose words make one part posts one milestone named by its title', async ({ page }) => {
  await signedIn(page, 'seller');
  await page.route(`${API}/api/deals/draft`, route => route.fulfill({ json: { draft: { title: 'Menu photos', parts: [{ pct: 100, what: 'Menu photos' }], tradeType: 'service', quantity: null, source: 'rules' } } }));
  let posted: Record<string, unknown> | null = null;
  await page.route(`${API}/api/listings`, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    posted = route.request().postDataJSON();
    return route.fulfill({ status: 500, json: { error: 'stop here' } });
  });
  await page.goto('/seller');
  await page.locator('[data-guide="seller-listing"] input').fill('Menu photos');
  await page.locator('[data-guide="seller-listing"] textarea').fill('Photos of 12 dishes, edited for the web.');
  await page.locator('[data-guide="seller-price"] input').fill('200');
  await page.getByRole('button', { name: f.days.replace('{n}', '3'), exact: true }).click();
  await page.getByRole('button', { name: en.dealCreation.review, exact: true }).click();
  await expect(page.locator('[data-drafted]')).toHaveCount(0);
  await page.getByRole('button', { name: f.publish }).click();
  await expect.poll(() => posted).not.toBeNull();
  expect(posted).toMatchObject({ askingPriceUsdc: 200, readyInDays: 3, termsDraft: { parts: [{ pct: 100, what: 'Menu photos' }] } });
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
  // One screen: the date and the seller's milestones are there at once.
  await expect(page.getByText(/^Due /)).toBeVisible();
  await expect(page.locator('[data-pay-in-parts]')).toHaveAttribute('open', '');
  await expect(page.getByRole('textbox', { name: `${tb.part.replace('{n}', '3')}: ${tb.whatLabel}`, exact: true })).toHaveValue('Logo in SVG and PNG');
  await expect(page.getByRole('textbox', { name: `${tb.part.replace('{n}', '1')} %` })).toHaveValue('20');
  await expect(page.getByRole('textbox', { name: `${tb.part.replace('{n}', '2')} %` })).toHaveValue('30');
  await expect(page.getByRole('textbox', { name: `${tb.part.replace('{n}', '3')} %` })).toHaveValue('50');
  await expect(page.getByRole('button', { name: tb.days.replace('{n}', '7'), exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('a deal link keeps its person whichever kind of deal is picked (owner notes, 4 Nov)', async ({ page }) => {
  const rf = requestFlowCopy.en;
  await signedIn(page, 'buyer');
  await page.goto('/buyer?mode=direct&seller=%40kingizie');
  await expect(page.locator('[data-kind-with]')).toHaveText(rf.kindWith.replace('{who}', '@kingizie'));
  await expect(page.getByRole('button', { name: new RegExp(rf.kinds.contest) })).toHaveCount(0);
  await page.getByRole('button', { name: new RegExp(`^${rf.kinds.one}`) }).click();
  await expect(page.getByPlaceholder(en.directDeal.counterparty.oneBoxPlaceholder)).toHaveValue('@kingizie');
});
