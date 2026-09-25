import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ME, TX, accentControls, funded, watchHydration } from './moneyFixtures';

import { JOB, makeJob, makeProposal, serveSearch } from './searchFixtures';

const offer = {
  seller: '0x6666666666666666666666666666666666666666', priceUsdc: '96', deadlineUnix: 0, score: null,
  suggestedCounterPrice: null, suggestedCounterDeadlineDays: null, sellerTier: null,
  sellerUserAddress: '0x5555555555555555555555555555555555555555', sellerDisplayName: 'Ada Studio', topicalMatch: 92,
};

async function fillRequest(page: Page, need = 'Logo for my bakery') {
  await page.getByLabel('What do you need?').fill(need);
  await page.getByLabel('Most you will pay').fill('120');
  await page.getByLabel('When').fill('5');
  await page.getByRole('button', { name: 'Start the search' }).click();
  return page.getByRole('dialog');
}

test('a first-time buyer sets up, moves the money and starts in one press', async ({ page }) => {
  let posted = 0;
  let funded122 = 0;
  await serveSearch(page, {
    balances: { ...funded },
    activated: false,
    quote: { requiredUsdc: '122', balanceUsdc: '0', topUpNeededUsdc: '122', activated: false },
    fundAgent: (route) => {
      funded122 += 1;
      return route.fulfill({ json: { accepted: true, txHash: TX, reference: 'KWN-2026-0200', movementState: 'completed' } });
    },
    postJob: (route) => {
      posted += 1;
      return route.fulfill({ json: { jobId: JOB, deadlineUnix: 0, txHash: TX, explorerUrl: '' } });
    },
  });
  await page.goto('/buyer');
  const sheet = await fillRequest(page);
  await expect(sheet.getByText('Sets up your agents. Once.')).toBeVisible();
  await expect(sheet.getByText(/Moves 122 USDC to your buyer agent/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Set up, move 122 USDC and start' }).click();
  await expect(page).toHaveURL(new RegExp(`/jobs/${JOB}`));
  await expect(page.getByRole('heading', { name: 'Looking for sellers.' })).toBeVisible();
  expect(funded122).toBe(1);
  expect(posted).toBe(1);
});

test('a slow move keeps the sheet waiting and posts nothing', async ({ page }) => {
  let posted = 0;
  await serveSearch(page, {
    balances: { ...funded },
    quote: { requiredUsdc: '122', balanceUsdc: '0', topUpNeededUsdc: '122', activated: true },
    fundAgent: (route) =>
      route.fulfill({ status: 202, json: { accepted: true, code: 'funding_unconfirmed', txHash: TX, reference: 'KWN-2026-0201' } }),
    postJob: (route) => {
      posted += 1;
      return route.fulfill({ json: { jobId: JOB, deadlineUnix: 0, txHash: TX, explorerUrl: '' } });
    },
  });
  await page.goto('/buyer');
  const sheet = await fillRequest(page);
  await sheet.getByRole('button', { name: 'Move 122 USDC and start' }).click();
  await expect(sheet.getByText('Taking longer than usual')).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Check again' })).toBeVisible();
  await expect(sheet.getByText('Did not go through')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeVisible();
  expect(posted).toBe(0);
});

test('an unclear post is found, never posted twice', async ({ page }) => {
  let posted = 0;
  let jobs: unknown[] = [];
  await serveSearch(page, {
    balances: { ...funded },
    get jobs() {
      return jobs;
    },
    postJob: (route) => {
      posted += 1;
      jobs = [makeJob({ briefText: 'Logo for my bakery' })];
      return route.fulfill({ status: 502, json: { error: 'upstream' } });
    },
  });
  await page.goto('/buyer');
  const sheet = await fillRequest(page);
  await sheet.getByRole('button', { name: 'Start the search' }).click();
  await expect(sheet.getByText('Taking longer than usual')).toBeVisible();
  await sheet.getByRole('button', { name: 'Check again' }).click();
  await expect(page).toHaveURL(new RegExp(`/jobs/${JOB}`));
  expect(posted).toBe(1);
});

test('a request the backend would refuse never reaches the sheet', async ({ page }) => {
  let moves = 0;
  await serveSearch(page, {
    balances: { ...funded },
    fundAgent: (route) => {
      moves += 1;
      return route.fulfill({ json: { accepted: true, txHash: TX, reference: 'KWN-2026-0203', movementState: 'completed' } });
    },
  });
  await page.goto('/buyer');
  await page.getByLabel('What do you need?').fill('Logo');
  await page.getByLabel('Most you will pay').fill('120');
  await page.getByLabel('When').fill('120');
  await page.getByRole('button', { name: 'Start the search' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Use 5 to 500 characters.')).toBeVisible();
  await expect(page.getByText('Enter 1 to 90 days.')).toBeVisible();
  expect(moves).toBe(0);
});

test('a post that reverted says nothing was posted, where the money is, and lets you close', async ({ page }) => {
  await serveSearch(page, {
    balances: { ...funded },
    quote: { requiredUsdc: '122', balanceUsdc: '0', topUpNeededUsdc: '122', activated: true },
    fundAgent: (route) => route.fulfill({ json: { accepted: true, txHash: TX, reference: 'KWN-2026-0204', movementState: 'completed' } }),
    postJob: (route) => route.fulfill({ status: 502, json: { error: 'postJob reverted' } }),
  });
  await page.goto('/buyer');
  const sheet = await fillRequest(page);
  await sheet.getByRole('button', { name: 'Move 122 USDC and start' }).click();
  await expect(sheet.getByText('Did not go through')).toBeVisible();
  await expect(sheet.getByRole('alert')).toContainText('Nothing was posted. The 122 USDC moved stays with your buyer agent.');
  await expect(sheet.getByRole('button', { name: 'Try again' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toBeHidden();
});

test('the buyer can edit and cancel an open request', async ({ page }) => {
  await serveSearch(page, { balances: { ...funded } });
  await page.goto(`/jobs/${JOB}`);
  await expect(page.getByRole('heading', { name: 'Looking for sellers.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit request' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel request' })).toBeVisible();
});

test('a match waiting on the seller gives the buyer no primary action', async ({ page }) => {
  await serveSearch(page, { balances: { ...funded }, job: makeJob({ bids: [offer] }), proposal: makeProposal() });
  await page.goto(`/jobs/${JOB}`);
  await expect(page.getByRole('heading', { name: 'Match found.' })).toBeVisible();
  await expect(page.getByText(/Waiting for Ada Studio to accept/)).toBeVisible();
  expect(await accentControls(page)).toBe(0);
  await expect(page.getByRole('button', { name: /Offers received \(1\)/ })).toHaveAttribute('aria-expanded', 'false');
});

test('a raise gives the buyer one primary action', async ({ page }) => {
  await serveSearch(page, {
    balances: { ...funded },
    proposal: makeProposal({ raisedPriceUsdc: '110', originalPriceUsdc: '96', awaitingParty: 'buyer' }),
  });
  await page.goto(`/jobs/${JOB}`);
  await expect(page.getByRole('button', { name: 'Accept 110 USDC' })).toBeVisible();
  expect(await accentControls(page)).toBe(1);
});

test('the matched seller sees the match and never the rival offers or the timeline', async ({ page }) => {
  await serveSearch(page, {
    balances: { ...funded },
    job: makeJob({ viewerIsBuyer: false, bids: [] }),
    proposal: makeProposal({ buyerUser: '0x7777777777777777777777777777777777777777', sellerUser: ME.toLowerCase() }),
  });
  await page.goto(`/jobs/${JOB}`);
  await expect(page.getByRole('button', { name: 'Accept match' })).toBeVisible();
  await expect(page.getByText(/Offers received/)).toHaveCount(0);
  await expect(page.getByText('What your agent did')).toHaveCount(0);
});

test('a seller with nothing yet sees the offer form straight away', async ({ page }) => {
  await serveSearch(page, { balances: { ...funded } });
  await page.goto('/seller');
  await expect(page.getByLabel('What you offer')).toBeVisible();
});

test('a returning seller reads needs you, bidding, offers, in that order, and can withdraw', async ({ page }) => {
  let abandoned = 0;
  await serveSearch(page, {
    balances: { ...funded },
    matches: [makeProposal({ buyerUser: '0x7777777777777777777777777777777777777777', sellerUser: ME.toLowerCase() })],
    seller: {
      activeBids: [
        { jobId: '0xj2', seller: '0xsa', jobBuyer: '0xb', budgetUsdc: '100', deadlineUnix: 0, lastBidPrice: '80', counterRounds: 1, finalized: false, title: 'Menu design' },
      ],
      recentBids: [{ jobId: '0xj3', sellerAgent: '0xsa', title: 'Brand refresh', outcome: 'lost', lastPrice: '70', at: 5 }],
    },
    listings: [
      { id: 'l1', sellerUser: ME, sellerAgent: '0xsa', title: 'Logo design', description: '', askingPriceUsdc: 90, postedAt: 1, expiresAt: Date.now() + 12 * 86_400_000 },
    ],
    abandon: (route) => {
      abandoned += 1;
      return route.fulfill({ json: { ok: true, abandoned: true } });
    },
  });
  await page.goto('/seller');
  await expect(page.getByRole('heading', { name: 'Needs you' })).toBeVisible();
  const headings = await page.getByRole('heading', { level: 2 }).allTextContents();
  expect(headings.slice(0, 3)).toEqual(['Needs you', 'Your agent is bidding on', 'Your offers']);
  await expect(page.getByText('Negotiating', { exact: true })).toBeVisible();
  await expect(page.getByText('Lost', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm withdraw' }).click();
  await expect.poll(() => abandoned).toBe(1);
});

test('there is no second activation prompt on the buyer or seller page', async ({ page }) => {
  await serveSearch(page, { balances: { ...funded }, activated: false });
  for (const path of ['/buyer', '/seller']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Agent setup')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Activate agents' })).toHaveCount(0);
  }
});

const PAGES = ['/buyer', '/seller', `/jobs/${JOB}`];

for (const theme of ['light', 'dark'] as const) {
  for (const path of PAGES) {
    test(`${path} is accessible, fits and hydrates in ${theme}`, async ({ page }) => {
      const hydration = watchHydration(page);
      await page.addInitScript((value) => localStorage.setItem('karwan-theme', value), theme);
      await serveSearch(page, {
        balances: { ...funded },
        jobs: [makeJob({ briefText: 'A long request title that keeps going to check that nothing spills past the edge' })],
        job: makeJob({ bids: [offer] }),
        proposal: makeProposal(),
      });
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(hydration()).toEqual([]);
    });
  }
}

for (const path of PAGES) {
  test(`${path} reads right to left in Arabic with a long title`, async ({ page, context }) => {
    await context.addCookies([{ name: 'karwan-locale', value: 'ar', domain: '127.0.0.1', path: '/' }]);
    await serveSearch(page, {
      balances: { ...funded },
      jobs: [makeJob({ briefText: 'طلب '.repeat(40) })],
      job: makeJob({ briefText: 'طلب '.repeat(40), bids: [offer] }),
      proposal: makeProposal(),
      seller: {
        activeBids: [
          { jobId: '0xj2', seller: '0xsa', jobBuyer: '0xb', budgetUsdc: '100', deadlineUnix: 0, lastBidPrice: '80', counterRounds: 0, finalized: false, title: 'تصميم '.repeat(30) },
        ],
        recentBids: [],
      },
    });
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
