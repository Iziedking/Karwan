import { expect, test } from '@playwright/test';
import { API, funded } from './moneyFixtures';
import { JOB, makeJob, serveSearch } from './searchFixtures';

/// View 73: each offer on the shortlist says where its price started and why
/// it ranks there; a price that never moved says nothing about it.

const entry = (rank: number, name: string, priceUsdc: number, extra: Record<string, unknown> = {}) => ({
  rank,
  seller: `0x${String(rank).repeat(40)}`,
  sellerUser: `0x${String(rank + 4).repeat(40)}`,
  name,
  tag: name.toLowerCase(),
  level: 'registered',
  verified: false,
  score: null,
  tier: 'NEW',
  counts: null,
  offer: 'Clothes',
  deliveryDays: 7,
  priceUsdc,
  askedUsdc: null,
  recordChecked: false,
  recommended: rank === 1,
  reasons: ['best_fit'],
  rating: { kind: 'new', count: 0 },
  state: 'ready',
  isNew: true,
  ...extra,
});

// The job page shows the shortlist once an offer is in.
const bid = {
  seller: `0x${'1'.repeat(40)}`, priceUsdc: '118', deadlineUnix: Math.floor(Date.now() / 1000) + 6 * 86_400, score: 70,
  suggestedCounterPrice: null, suggestedCounterDeadlineDays: null, sellerTier: 'new',
  sellerUserAddress: null, sellerDisplayName: 'Tola Tailors', topicalMatch: 80,
};

test('the buyer sees how each price moved and why it ranks there', async ({ page }, info) => {
  await serveSearch(page, {
    balances: funded,
    job: makeJob({ budgetUsdc: '222', bids: [bid] }),
    shortlist: {
      entries: [
        entry(1, 'Tola Tailors', 118, { movedFrom: 150, why: ['fair_price', 'best_fit'] }),
        entry(2, 'Grace Stitches', 210, { movedFrom: 222, why: ['best_fit', 'fair_price'] }),
        entry(3, 'Kemi Couture', 220, { why: ['best_fit', 'trusted'] }),
      ],
      closed: false,
    },
  });
  await page.goto(`/jobs/${JOB}`);
  const list = page.locator('[data-guide="job-shortlist"]');
  await expect(list.getByText('Ranked on fit, price, ratings and record')).toBeVisible();
  const rows = list.locator('li > button');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Tola Tailors');
  await expect(rows.nth(0)).toContainText('Fair price · Best fit');
  await expect(rows.nth(0)).toContainText('118 USDC');
  await expect(rows.nth(0).locator('[data-opened-at]')).toContainText(/Opened at 150(.00)? USDC/);
  await expect(rows.nth(0)).toContainText('Agent’s pick');
  await expect(rows.nth(1).locator('[data-opened-at]')).toContainText(/Opened at 222(.00)? USDC/);
  await expect(rows.nth(2)).toContainText('Best fit · Trusted');
  await expect(rows.nth(2).locator('[data-opened-at]')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('bargain-shortlist.png'), fullPage: true });
});

test('a shortlist without the score keeps today’s lines', async ({ page }) => {
  await serveSearch(page, {
    balances: funded,
    job: makeJob({ budgetUsdc: '222', bids: [bid] }),
    shortlist: { entries: [entry(1, 'Realnica', 96)], closed: false },
  });
  await page.goto(`/jobs/${JOB}`);
  const list = page.locator('[data-guide="job-shortlist"]');
  await expect(list.getByText('Ranked by your agent. Tap one to see more.')).toBeVisible();
  await expect(list.locator('li > button').first()).toContainText('@realnica');
  await expect(list.locator('[data-opened-at]')).toHaveCount(0);
});

test('a seller sees the budget as a range', async ({ page }, info) => {
  await serveSearch(page, { balances: funded });
  await page.route(`${API}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/listings/fits') return route.fulfill({ json: { jobIds: [] } });
    if (url.pathname === '/api/listings/mine') return route.fulfill({ json: { listings: [] } });
    if (url.pathname === '/api/listings') return route.fulfill({ json: { listings: [] } });
    if (url.pathname === '/api/jobs/marketplace') {
      return route.fulfill({
        json: {
          briefs: [{
            jobId: `0x${'9'.padStart(64, '0')}`, briefText: '4 different clothes sewn', budgetRange: { lowUsdc: 150, highUsdc: 230 },
            postedAt: Date.now(), deadlineUnix: Math.floor(Date.now() / 1000) + 7 * 86_400, buyer: '0x7777…7777', bidsCount: 0, offerCount: 3,
            partyKind: 'person', tradeLane: 'service',
          }],
        },
      });
    }
    return route.fallback();
  });
  await page.goto('/market?side=sell');
  const row = page.locator('[data-request-row]').first();
  await expect(row).toContainText('4 different clothes sewn');
  await expect(row).toContainText(/Budget 150(\.00)? USDC to 230(\.00)? USDC/);
  await expect(row).not.toContainText('Up to');
  await page.screenshot({ path: info.outputPath('bargain-seller-range.png'), fullPage: true });
});

test('your call: the buyer agrees at the seller price or lets the agent keep bargaining', async ({ page }, info) => {
  const answers: unknown[] = [];
  await serveSearch(page, {
    balances: funded,
    job: makeJob({ budgetUsdc: '222', bids: [bid] }),
    shortlist: {
      entries: [entry(1, 'Grace Stitches', 210, { movedFrom: 240, why: ['best_fit', 'fair_price'], yourCall: { priceUsdc: 210, offeredUsdc: 200 } })],
      closed: false,
    },
  });
  await page.route(`${API}/api/jobs/${JOB}/your-call`, async (route) => {
    answers.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true, choice: 'agree' } });
  });
  await page.goto(`/jobs/${JOB}`);
  const list = page.locator('[data-guide="job-shortlist"]');
  const row = list.locator('li').first();
  await expect(row.locator('[data-your-call]')).toHaveText('Your call');
  await expect(row).toContainText(/Your agent offered 200(\.00)? USDC/);
  await expect(row.locator('[data-best-fit]')).toHaveCount(0);
  const actions = row.locator('[data-your-call-actions]');
  await expect(actions.getByRole('button', { name: 'Keep bargaining' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('bargain-your-call.png'), fullPage: true });
  await actions.getByRole('button', { name: /^Agree at 210/ }).click();
  await expect.poll(() => answers.length).toBe(1);
  expect(answers[0]).toMatchObject({ seller: `0x${'1'.repeat(40)}`, choice: 'agree' });
});
