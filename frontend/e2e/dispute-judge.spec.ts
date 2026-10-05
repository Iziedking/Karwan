import { expect, test } from '@playwright/test';
import type { DirectDeal } from '../core/api';
import { en } from '../shared/i18n/messages/en';
import { API } from './moneyFixtures';
import { JOB, SELLER, deliveredDeal, serveDeal } from './fixtures';

const t = en.disputeJudge;
const HOUR = 3_600_000;

const disputed = (dispute: DirectDeal['dispute']): DirectDeal => ({
  ...deliveredDeal,
  disputed: true,
  disputedAt: Date.now() - HOUR,
  view: { ...deliveredDeal.view!, stage: 'disputed', next: { action: null, actor: 'nobody', amountUsdc: null }, automatic: null },
  dispute,
});
const statement = { received: 'A logo in PNG only', missing: 'The SVG and the source file', late: 'No', links: ['https://drive.example/logo'], submittedAt: 1 };

test('the buyer gives an account in three answers and sends it', async ({ page }) => {
  await serveDeal(page, disputed({ closesAt: Date.now() + 47 * HOUR, open: true, otherSubmitted: false, statements: {} }));
  let sent: Record<string, unknown> | null = null;
  await page.route(`${API}/api/deals/direct/${JOB}/dispute/statement`, async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { accepted: true, jobId: JOB, side: 'buyer' } });
  });
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByRole('heading', { name: t.title })).toBeVisible();
  await page.getByLabel(t.receivedBuyer).fill(statement.received);
  await page.getByLabel(t.missing).fill(statement.missing);
  await page.getByLabel(t.late).fill(statement.late);
  await page.getByLabel(t.links).fill('https://drive.example/logo\nnot a link');
  await page.getByRole('button', { name: t.send }).click();
  await expect.poll(() => sent).toMatchObject({ received: statement.received, missing: statement.missing, late: 'No', links: ['https://drive.example/logo'] });
});

test("the seller does not see the buyer's account before giving their own", async ({ page }) => {
  await serveDeal(page, disputed({ closesAt: Date.now() + 47 * HOUR, open: true, otherSubmitted: true, statements: {} }), SELLER);
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByLabel(t.receivedSeller)).toBeVisible();
  await expect(page.getByText(/gave their account\. You see it once yours is in/)).toBeVisible();
  await expect(page.getByText(statement.missing)).toHaveCount(0);
});

test('a proposed ruling shows the split, each finding, and that a reviewer confirms it', async ({ page }) => {
  await serveDeal(page, disputed({
    closesAt: Date.now() - HOUR, open: false, otherSubmitted: true,
    statements: { buyer: statement, seller: { ...statement, received: 'Logo in PNG, SVG and source' } },
    proposal: {
      sellerBps: 6200, confidence: 'clear', summary: 'The logo arrived; the source file did not.', proposedAt: 1, status: 'awaiting-review',
      items: [{ item: 'Logo files', finding: 'delivered', evidence: 'drive link' }, { item: 'Source file', finding: 'missing', evidence: 'check' }],
    },
  }));
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByRole('heading', { name: t.proposalTitle })).toBeVisible();
  await expect(page.getByText(/62% to .* · 38% to /)).toBeVisible();
  await expect(page.getByText(t.findings.missing, { exact: true })).toBeVisible();
  await expect(page.getByText(t.reviewerNote)).toBeVisible();
  await expect(page.getByRole('button', { name: t.send })).toHaveCount(0);
});
