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
  // Karwan is checking, in its own words, never how it runs inside; and how to tell Karwan from a fake (owner, 3 Nov 2026).
  const panel = page.locator('section').filter({ has: page.getByRole('heading', { name: t.title }) }).last();
  await expect(panel.locator('[data-dispute-safety]')).toHaveText(t.safety);
  await expect(panel).not.toContainText(/judge|reviewer/i);
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
  await expect(page.getByText(/has answered\. You see it once yours is in/)).toBeVisible();
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

const pp = en.profilePage;

test('the buyer sees the steps of the problem, the money held, and what happens if the seller stays silent', async ({ page }) => {
  await serveDeal(page, { ...disputed({ closesAt: Date.now() + 47 * HOUR, open: true, otherSubmitted: false, statements: {} }), disputedBy: 'buyer' });
  await page.goto(`/deals/${JOB}`);
  const steps = page.locator('[data-problem-steps]');
  await expect(steps.getByText(pp.problemOpened)).toBeVisible();
  await expect(steps.getByText(/ answers by /)).toBeVisible();
  await expect(steps.getByText(pp.karwanDecides)).toBeVisible();
  await expect(steps.getByText(/1,200 USDC held by Karwan until it is decided/)).toBeVisible();
  await expect(steps.getByText(/does not answer by .*, Karwan returns the money to you after a check\./)).toBeVisible();
});

test('the seller sees who opened it and never the silent-seller line', async ({ page }) => {
  await serveDeal(page, { ...disputed({ closesAt: Date.now() + 47 * HOUR, open: true, otherSubmitted: false, statements: {} }), disputedBy: 'buyer' }, SELLER);
  await page.goto(`/deals/${JOB}`);
  const steps = page.locator('[data-problem-steps]');
  await expect(steps.getByText(/ opened a problem$/)).toBeVisible();
  await expect(steps.getByText(pp.problemOpened)).toHaveCount(0);
  await expect(steps.getByText(/after a check/)).toHaveCount(0);
});

test('a passed answer date says Karwan is checking', async ({ page }) => {
  await serveDeal(page, disputed({ closesAt: Date.now() - HOUR, open: false, otherSubmitted: false, statements: { buyer: statement } }));
  await page.goto(`/deals/${JOB}`);
  await expect(page.locator('[data-problem-steps]').getByText(pp.answerPassed)).toBeVisible();
});
