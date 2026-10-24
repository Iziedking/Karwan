import { expect, test } from '@playwright/test';
import { funded } from './moneyFixtures';
import { JOB, makeJob, serveSearch } from './searchFixtures';

/// The shortlist arrives folded into one row: who offered and the lowest price.
/// Opening it shows each person with Choose.

const entry = (rank: number, name: string, priceUsdc: number) => ({
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
  offer: 'Logo work',
  deliveryDays: 14,
  priceUsdc,
  askedUsdc: null,
  recordChecked: true,
  recommended: rank === 1,
  reasons: ['best_fit'],
  rating: { kind: 'new', count: 0 },
  state: 'ready',
  isNew: true,
});

test('the shortlist arrives folded and opens on Show', async ({ page }) => {
  await serveSearch(page, {
    balances: funded,
    job: makeJob({
      budgetUsdc: '100',
      bids: [{
        seller: `0x${'2'.repeat(40)}`, priceUsdc: '90', deadlineUnix: Math.floor(Date.now() / 1000) + 6 * 86_400, score: 70,
        suggestedCounterPrice: null, suggestedCounterDeadlineDays: null, sellerTier: 'new',
        sellerUserAddress: null, sellerDisplayName: 'Pamcollins', topicalMatch: 80,
      }],
    }),
    shortlist: { entries: [entry(1, 'Realnica', 116.06), entry(2, 'Pamcollins', 90), entry(3, 'Poz', 113.32)], closed: false },
  });
  await page.goto(`/jobs/${JOB}`);
  const fold = page.getByRole('button', { name: /3 offers, from 90 USDC/ });
  await expect(fold).toBeVisible();
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Choose' })).toHaveCount(0);
  await fold.click();
  await expect(fold).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: 'Choose' })).toHaveCount(3);
});

test('an empty shortlist next to offers shows the offers, never "no one has offered"', async ({ page }) => {
  await serveSearch(page, {
    balances: funded,
    job: makeJob({
      budgetUsdc: '100',
      bids: [{
        seller: `0x${'2'.repeat(40)}`, priceUsdc: '90', deadlineUnix: Math.floor(Date.now() / 1000) + 6 * 86_400, score: 70,
        suggestedCounterPrice: null, suggestedCounterDeadlineDays: null, sellerTier: 'new',
        sellerUserAddress: null, sellerDisplayName: 'Pamcollins', topicalMatch: 80,
      }],
    }),
    shortlist: { entries: [], closed: false },
  });
  await page.goto(`/jobs/${JOB}`);
  await expect(page.getByText('1 offer so far').first()).toBeVisible();
  await expect(page.getByText(/No one has offered yet/)).toHaveCount(0);
});

test('choosing a seller who is not verified says so, then goes ahead on Confirm', async ({ page }) => {
  const sent: Array<{ acknowledgeUnverified?: boolean }> = [];
  await serveSearch(page, {
    balances: funded,
    job: makeJob({
      budgetUsdc: '100',
      bids: [{
        seller: `0x${'2'.repeat(40)}`, priceUsdc: '90', deadlineUnix: Math.floor(Date.now() / 1000) + 6 * 86_400, score: 70,
        suggestedCounterPrice: null, suggestedCounterDeadlineDays: null, sellerTier: 'new',
        sellerUserAddress: null, sellerDisplayName: 'Pamcollins', topicalMatch: 80,
      }],
    }),
    shortlist: { entries: [], closed: false },
    chooseOffer: async (route) => {
      const body = route.request().postDataJSON() as { acknowledgeUnverified?: boolean };
      sent.push(body);
      if (!body.acknowledgeUnverified) {
        return route.fulfill({ status: 409, json: { error: 'This seller is not verified. Confirm that you want to go ahead.', code: 'unverified-needs-ack' } });
      }
      return route.fulfill({ json: { accepted: true, jobId: JOB } });
    },
  });
  await page.goto(`/jobs/${JOB}`);
  await page.getByText('1 offer so far').first().click();
  await page.getByRole('button', { name: /Pamcollins/ }).first().click();
  await page.getByRole('button', { name: 'Choose Pamcollins for 90 USDC' }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();

  await expect(page.getByRole('note').filter({ hasText: 'Pamcollins is not verified' })).toBeVisible();
  await expect(page.getByText('This offer could not be chosen')).toHaveCount(0);
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1]?.acknowledgeUnverified).toBe(true);
});

test("an offer shows the seller's sealed record as reasons, never empty count boxes", async ({ page }) => {
  await serveSearch(page, {
    balances: funded,
    job: makeJob({
      budgetUsdc: '100',
      bids: [{
        seller: `0x${'2'.repeat(40)}`, priceUsdc: '100', deadlineUnix: Math.floor(Date.now() / 1000) + 6 * 86_400, score: 70,
        suggestedCounterPrice: null, suggestedCounterDeadlineDays: null, sellerTier: 'established',
        sellerUserAddress: null, sellerDisplayName: 'Lawfuldlaw', topicalMatch: 80,
      }],
    }),
    shortlist: { entries: [], closed: false },
  });
  await page.route('**/api/reputation?**', (route) => route.fulfill({ json: {
    sealed: true, address: `0x${'2'.repeat(40)}`, displayName: 'Lawfuldlaw', tag: 'lawfuldlaw', tier: 'ESTABLISHED',
    reasons: ['HAS_COMPLETED_DEALS', 'USUALLY_ON_TIME', 'NO_LOST_DISPUTES'], memberSince: 1_700_000_000_000,
  } }));
  await page.goto(`/jobs/${JOB}`);
  await page.getByText('1 offer so far').first().click();
  await page.getByRole('button', { name: /Lawfuldlaw/ }).first().click();
  const record = page.getByRole('list', { name: 'Record' });
  await expect(record).toContainText('Has completed deals on Karwan');
  await expect(record).toContainText('Usually delivers on time');
  await expect(record).toContainText('No lost disputes');
  await expect(page.getByText('Deals settled')).toHaveCount(0);
  await expect(page.getByText('Delivers by')).toBeVisible();
});
