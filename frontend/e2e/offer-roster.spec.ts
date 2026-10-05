import { expect, test } from '@playwright/test';
import { funded } from './moneyFixtures';
import { JOB, makeJob, makeProposal, serveSearch } from './searchFixtures';

const seller = (n: number) => `0x${String(n).repeat(40)}`;
const bid = (n: number, name: string, priceUsdc: string, topicalMatch: number) => ({
  seller: seller(n), priceUsdc, deadlineUnix: Math.floor(Date.now() / 1000) + 6 * 86_400, score: 70,
  suggestedCounterPrice: null, suggestedCounterDeadlineDays: null, sellerTier: 'strong',
  sellerUserAddress: null, sellerDisplayName: name, topicalMatch,
});
const bids = [
  bid(1, 'Ada Okafor', '280', 90),
  bid(2, 'Kofi Mensah', '240', 60),
  bid(3, 'Zainab Bello', '300', 55),
  bid(4, 'Tunde Lawal', '255', 20),
  bid(5, 'Musa Idris', '290', 10),
];

for (const version of ['live', 'v2'] as const) {
  test(`${version}: offers fold into one row, open as a ranked list, and any offer can be chosen`, async ({ page }) => {
    if (version === 'v2') {
      await page.addInitScript(() => {
        try { sessionStorage.setItem('karwan:search', 'v2'); } catch { /* storage blocked */ }
      });
    }
    let chosen: unknown = null;
    await serveSearch(page, {
      balances: { ...funded },
      job: makeJob({ budgetUsdc: '300', bids }),
      chooseOffer: async (route) => {
        chosen = route.request().postDataJSON();
        await route.fulfill({ json: { accepted: true, jobId: JOB, txHash: '0x1' } });
      },
    });
    await page.goto(`/jobs/${JOB}`);

    const folded = page.getByRole('button', { name: /5 offers so far/ });
    await expect(folded).toBeVisible();
    await expect(folded).toHaveAttribute('aria-expanded', 'false');
    await folded.click();

    await expect(page.getByRole('heading', { name: '5 offers', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Musa Idris/ })).toHaveCount(0);
    await expect(page.getByText('Strong fit').first()).toBeVisible();
    await expect(page.getByText(/out of 100|\/100/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Show 1 more' }).click();
    await expect(page.getByRole('button', { name: /Musa Idris/ })).toBeVisible();

    await page.getByRole('button', { name: /Kofi Mensah/ }).click();
    await page.getByRole('button', { name: 'Choose Kofi Mensah for 240 USDC' }).click();
    await expect(page.getByText(/puts 240 USDC in escrow now/)).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect.poll(() => chosen).toMatchObject({ seller: seller(2) });
  });
}

test("the agent's pick waits for the seller; only the other offers can be chosen", async ({ page }) => {
  await serveSearch(page, {
    balances: { ...funded },
    job: makeJob({ budgetUsdc: '300', bids }),
    proposal: makeProposal({ sellerAgent: seller(1), agreedPriceUsdc: '270' }),
  });
  await page.goto(`/jobs/${JOB}`);
  await page.getByRole('button', { name: /4 other offers/ }).click();
  await page.getByRole('button', { name: /Ada Okafor/ }).click();
  await expect(page.getByText("Your agent's pick").last()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Choose / })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Kofi Mensah/ }).click();
  await expect(page.getByRole('button', { name: 'Choose Kofi Mensah for 240 USDC' })).toBeVisible();
});
