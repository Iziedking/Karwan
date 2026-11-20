import { expect, test, type Page } from '@playwright/test';
import type { DirectDeal, DisputeHearingView } from '../core/api';
import { en } from '../shared/i18n/messages/en';
import { API } from './moneyFixtures';
import { JOB, SELLER, deliveredDeal, serveDeal } from './fixtures';

/// View 90, escrow family: the problem card while both sides are heard, a
/// person confirms the finding and either side may object (Figma 375:570).
const t = en.disputeJudge;
const h = t.hearing;
const HOUR = 3_600_000;
const NOW = Date.now();
const OPENED = NOW - 30 * HOUR;

const statement = { received: '20 bales of cotton lint', missing: 'Nothing', late: 'No', links: [], submittedAt: NOW - 20 * HOUR };
const base: DisputeHearingView = { step: 'answers', answersBy: OPENED + 72 * HOUR, findingBy: OPENED + 108 * HOUR, objectBy: null, askedAt: null, ruleBy: null };

const heard = (hearing: DisputeHearingView, dispute: Partial<NonNullable<DirectDeal['dispute']>> = {}): DirectDeal => ({
  ...deliveredDeal,
  escrowVersion: 'suite',
  disputed: true,
  disputedAt: OPENED,
  disputedBy: 'buyer',
  view: { ...deliveredDeal.view!, stage: 'disputed', next: { action: null, actor: 'nobody', amountUsdc: null }, automatic: null },
  dispute: { closesAt: hearing.answersBy, open: hearing.step === 'answers', otherSubmitted: false, statements: {}, hearing, ...dispute },
});

const card = (page: Page) => page.locator('[data-problem-card]');
const toggle = (page: Page) => card(page).getByRole('button', { name: t.openTitle });

test('closed, the card is one row: the step now, its date and the money held; a tap opens it', async ({ page }) => {
  await serveDeal(page, heard(base, { statements: { seller: statement } }), SELLER);
  await page.goto(`/deals/${JOB}`);
  const c = card(page);
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(c.locator('[data-problem-status]')).toHaveText(/^.+ answers by .+ · .+ USDC held$/);
  await expect(c.locator('[data-problem-steps]')).toBeHidden();
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(c.locator('[data-problem-steps]')).toBeVisible();
  await expect(c.locator('[data-problem-status]')).toBeVisible();
});

test('it opens by itself when the person has something to do', async ({ page }) => {
  await serveDeal(page, heard(base));
  await page.goto(`/deals/${JOB}`);
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(card(page).locator('[data-problem-status]')).toHaveText(/^Your answer is due by /);
});

test('while both sides answer: the money held, where it stands, the date the other side has, and nothing decided yet', async ({ page }) => {
  await serveDeal(page, heard(base, { statements: { seller: statement } }), SELLER);
  await page.goto(`/deals/${JOB}`);
  await toggle(page).click();
  const c = card(page);
  await expect(c).toHaveAttribute('data-hearing', 'answers');
  await expect(c.getByRole('heading', { name: t.openTitle })).toBeVisible();
  await expect(c.locator('[data-problem-held]')).toContainText('USDC is held until it is decided');
  const steps = c.locator('[data-problem-steps]');
  await expect(steps.locator('[aria-current="step"]')).toContainText(h.answer);
  await expect(steps.getByText(h.opened)).toBeVisible();
  await expect(steps.getByText(h.findingNext)).toBeVisible();
  await expect(steps.getByText(h.objectNext)).toBeVisible();
  const panel = c.locator('[data-step-panel]');
  await expect(panel.getByText(/^You answered on /)).toBeVisible();
  await expect(panel.locator('[data-countdown]')).toContainText(/ can answer until /);
  await expect(panel.getByText(h.beforeBoth)).toBeVisible();
  // Nothing about how Karwan works inside, and how to tell Karwan from a fake.
  await expect(c).not.toContainText(/judge|reviewer|model/i);
  await expect(c.locator('[data-dispute-safety]')).toHaveText(t.safety);
  await expect(page.locator('[data-problem-wait]')).toContainText(h.wait.answersLine);
});

test('what each side said is folded, and opens on a tap', async ({ page }) => {
  await serveDeal(page, heard(base, { statements: { seller: statement } }), SELLER);
  await page.goto(`/deals/${JOB}`);
  await toggle(page).click();
  const c = card(page);
  await expect(c.getByRole('heading', { name: h.sides })).toBeVisible();
  const mine = c.locator('[data-statement]');
  await expect(mine).toContainText(/Sent /);
  await expect(mine.getByText(statement.received)).toBeHidden();
  await mine.locator('summary').click();
  await expect(mine.getByText(statement.received)).toBeVisible();
  await expect(c.locator('[data-side="empty"]')).toContainText(/Can answer until /);
});

test('a side that has not answered yet answers in the card', async ({ page }) => {
  await serveDeal(page, heard(base));
  await page.goto(`/deals/${JOB}`);
  await expect(card(page).locator('[data-step-panel]').getByText(h.youToAnswer)).toBeVisible();
  await expect(page.getByLabel(t.receivedBuyer)).toBeVisible();
  await expect(page.getByRole('button', { name: t.send })).toBeVisible();
});

test('while Karwan writes the finding, the sides see when it is due and no finding before a person confirms it', async ({ page }) => {
  await serveDeal(page, heard({ ...base, step: 'finding' }, { otherSubmitted: true, statements: { buyer: statement, seller: statement } }));
  await page.goto(`/deals/${JOB}`);
  await expect(card(page).locator('[data-problem-status]')).toHaveText(/^Karwan’s finding is due by /);
  await toggle(page).click();
  const c = card(page);
  await expect(c).toHaveAttribute('data-hearing', 'finding');
  await expect(c.locator('[data-problem-steps] [aria-current="step"]')).toContainText(h.finding);
  await expect(c.locator('[data-step-panel]').getByText(h.reading)).toBeVisible();
  await expect(c.locator('[data-countdown]')).toContainText(/^Due by /);
  await expect(c.locator('[data-finding]')).toHaveCount(0);
  await expect(c.getByLabel(t.receivedBuyer)).toHaveCount(0);
  await expect(page.locator('[data-problem-wait]')).toContainText(h.wait.findingLine);
});

test('in the time to object the seller sees the finding, the days left, and can ask for a person', async ({ page }) => {
  const objectBy = NOW + 50 * HOUR;
  await serveDeal(page, heard({ ...base, step: 'object', objectBy }, {
    open: false,
    otherSubmitted: true,
    statements: { buyer: statement, seller: statement },
    proposal: {
      sellerBps: 10_000, items: [], confidence: 'clear', summary: 'The carrier marked 20 dry bales delivered on 22 Oct.',
      proposedAt: NOW - 30 * HOUR, status: 'confirmed', reviewedSellerBps: 10_000, reviewedAt: NOW - 24 * HOUR,
    },
  }), SELLER);
  let asked: Record<string, unknown> | null = null;
  await page.route(`${API}/api/deals/direct/${JOB}/dispute/escalate`, async (route) => {
    asked = route.request().postDataJSON();
    await route.fulfill({ json: { accepted: true, jobId: JOB, txHash: '0x01' } });
  });
  await page.goto(`/deals/${JOB}`);
  const c = card(page);
  await expect(c).toHaveAttribute('data-hearing', 'object');
  await expect(c.locator('[data-problem-steps]').getByText(/^Checked by a person at Karwan · /)).toBeVisible();
  const finding = c.locator('[data-finding]');
  await expect(finding.getByText(h.found)).toBeVisible();
  await expect(finding.getByText(h.toYou)).toBeVisible();
  await expect(finding.getByText(/dry bales/)).toBeVisible();
  await expect(c.locator('[data-countdown]')).toHaveText('2 days left to object, then it pays out');
  await expect(c.locator('[data-problem-steps]').getByText(h.paid, { exact: true })).toBeVisible();
  await expect(page.locator('[data-problem-wait]')).toContainText(h.wait.objectTitle);
  await c.getByRole('button', { name: h.ask }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText(h.askConsequence)).toBeVisible();
  await sheet.getByRole('button', { name: h.ask }).click();
  await expect.poll(() => asked).toMatchObject({ caller: SELLER });
});

test('the buyer reads the same finding from their side', async ({ page }) => {
  await serveDeal(page, heard({ ...base, step: 'object', objectBy: NOW + 10 * HOUR }, {
    open: false,
    statements: { buyer: statement, seller: statement },
    proposal: { sellerBps: 10_000, items: [], confidence: 'clear', summary: 'Delivered.', proposedAt: 1, status: 'confirmed', reviewedSellerBps: 10_000, reviewedAt: NOW - 24 * HOUR },
  }));
  await page.goto(`/deals/${JOB}`);
  const c = card(page);
  await expect(c.locator('[data-finding]')).toContainText(/^Karwan found\s*Paid to .+ in full/);
  await expect(c.locator('[data-countdown]')).toHaveText('10 hours left to object, then it pays out');
});

test('once asked, people decide by the escrow date and nothing is left to press', async ({ page }) => {
  await serveDeal(page, heard({ ...base, step: 'people', objectBy: NOW - 2 * HOUR, askedAt: NOW - 20 * HOUR, ruleBy: NOW + 100 * HOUR }, {
    open: false,
    statements: { buyer: statement, seller: statement },
    proposal: { sellerBps: 10_000, items: [], confidence: 'clear', summary: 'Delivered.', proposedAt: 1, status: 'confirmed', reviewedSellerBps: 10_000, reviewedAt: NOW - 50 * HOUR },
  }), SELLER);
  await page.goto(`/deals/${JOB}`);
  await expect(card(page).locator('[data-problem-status]')).toHaveText(/^People decide by /);
  await toggle(page).click();
  const c = card(page);
  await expect(c).toHaveAttribute('data-hearing', 'people');
  const steps = c.locator('[data-problem-steps]');
  await expect(steps.getByText(h.asked)).toBeVisible();
  await expect(steps.getByText(/^Paid to you in full · /)).toBeVisible();
  await expect(steps.locator('[aria-current="step"]')).toContainText(h.people);
  await expect(c.locator('[data-step-panel]').getByText(h.peopleLine)).toBeVisible();
  await expect(c.locator('[data-countdown]')).toContainText(/^Decided by /);
  await expect(steps.getByText(h.paidAsDecided)).toBeVisible();
  await expect(c.getByRole('button', { name: h.ask })).toHaveCount(0);
  await expect(page.locator('[data-problem-wait]')).toContainText(h.wait.peopleLine);
});
