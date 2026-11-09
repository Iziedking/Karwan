import { test, type Page } from '@playwright/test';
import { join } from 'node:path';
import type { DirectDeal } from '../core/api';
import { BUYER, SELLER, JOB, deliveredDeal, serveDeal } from './fixtures';
import { API, ME, RATES, funded, serveMoney } from './moneyFixtures';
import { makeJob, serveSearch, JOB as SJOB } from './searchFixtures';

/// The docs pictures, taken from today's screens with test data (owner, 9 Nov
/// 2026: the docs showed the oldest look). Skipped unless DOCS_SHOTS=1, so the
/// normal browser tests never run it; see public/docs/images/README.md.
test.skip(process.env.DOCS_SHOTS !== '1', 'set DOCS_SHOTS=1 to retake the docs pictures');
test.setTimeout(300_000);
test.use({ viewport: { width: 1200, height: 820 } });

async function settle(page: Page) {
  await page.locator('.karwan-splash-mark').waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
}
async function shot(page: Page, name: string, info: import('@playwright/test').TestInfo) {
  await settle(page);
  await page.screenshot({ path: info.outputPath(name + '.png') });
  await page.screenshot({ path: join(process.cwd(), 'public', 'docs', 'images', name + '.png') });
}
const light = (page: Page) => page.addInitScript(() => { localStorage.setItem('karwan-theme', 'light'); localStorage.setItem('karwan:guide:disabled', '1'); });

const waitingDelivery: DirectDeal = {
  ...deliveredDeal, delivered: false, deliveredAt: undefined, deadlineUnix: Math.floor(Date.UTC(2030, 0, 10) / 1000),
  view: { ...deliveredDeal.view!, stage: 'awaiting-delivery', progress: [
    { step: 'agreed', state: 'done', at: Date.UTC(2026, 8, 11) }, { step: 'funded', state: 'done', at: Date.UTC(2026, 8, 12) },
    { step: 'delivered', state: 'current' }, { step: 'checked', state: 'upcoming' }, { step: 'released', state: 'upcoming' }], automatic: null,
    next: { action: 'deliver', actor: 'you', amountUsdc: null } },
};
const afterFirst: DirectDeal = {
  ...deliveredDeal, onChain: { ...deliveredDeal.onChain!, milestonesReleased: 1, releasedWei: '595500000' },
  view: { ...deliveredDeal.view!, stage: 'awaiting-final-release', next: { action: 'release', actor: 'you', amountUsdc: '600' } },
};
const settled = {
  ...deliveredDeal, settledAt: Date.UTC(2026, 8, 22), onChain: { ...deliveredDeal.onChain!, state: 3, milestonesReleased: 2, releasedWei: '1191000000' },
  view: { ...deliveredDeal.view!, stage: 'settled', money: { line: 'released' }, progress: deliveredDeal.view!.progress.map((p) => ({ ...p, state: 'done' })),
    next: { action: null, actor: 'nobody', amountUsdc: null }, automatic: null, onBothRecords: true },
} as DirectDeal;

const deals: Array<[string, DirectDeal, string]> = [
  ['deal-lifecycle1', waitingDelivery, SELLER],
  ['deal-lifecycle2', { ...waitingDelivery, view: { ...waitingDelivery.view!, next: { action: 'deliver', actor: 'counterparty', amountUsdc: null } } }, BUYER],
  ['deal-lifecycle3', { ...deliveredDeal, view: { ...deliveredDeal.view!, next: { action: 'release', actor: 'counterparty', amountUsdc: '600' } } }, SELLER],
  ['deal-lifecycle4', deliveredDeal, BUYER],
  ['deal-lifecycle5', afterFirst, BUYER],
  ['deal-lifecycle6', settled, BUYER],
];
for (const [name, deal, viewer] of deals) {
  test('docs ' + name, async ({ page }, info) => {
    await light(page);
    await serveDeal(page, deal, viewer);
    await page.route(`${API}/api/deals/${JOB}/rating`, (r) => r.fulfill({ json: { rated: false } }));
    await page.goto(`/deals/${JOB}`);
    await shot(page, name, info);
  });
}

test('docs negotiation-timeline', async ({ page }, info) => {
  await light(page);
  const bid = (n: number) => ({ seller: `0x${String(n).repeat(40)}`, priceUsdc: String(100 + n * 5), deadlineUnix: Math.floor(Date.now() / 1000) + 6 * 86_400, score: 70, suggestedCounterPrice: null, suggestedCounterDeadlineDays: null, sellerTier: 'new', sellerUserAddress: null, sellerDisplayName: ['Ada', 'Tunde', 'Amaka'][n - 1], topicalMatch: 80 });
  await serveSearch(page, { balances: funded, job: makeJob({ budgetUsdc: '150', bids: [1, 2, 3].map(bid) }) } as never);
  await page.route('**/api/jobs/*/reach', (r) => r.fulfill({ json: { reach: { fit: 9, offered: 3, asked: 0, nobodyYet: false } } }));
  await page.goto(`/jobs/${SJOB}`);
  await settle(page);
  const offers = page.getByRole('button', { name: /offers so far/ }).first();
  await offers.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.mouse.wheel(0, -140);
  await offers.click();
  await page.waitForTimeout(800);
  await shot(page, 'negotiation-timeline', info);
});

test('docs agent-guardrails', async ({ page }, info) => {
  await light(page);
  await serveSearch(page, { balances: funded } as never);
  await page.goto('/buyer');
  await settle(page);
  const note = page.getByText(/Agents of people you might deal with/).first();
  if (await note.count()) {
    const close = note.locator('xpath=ancestor::*[.//button][1]').getByRole('button').first();
    await close.click().catch(() => {});
  }
  await page.locator('textarea').first().fill('Design a logo for my bakery, two rounds of changes. SVG and PNG files.');
  await page.getByPlaceholder('0').first().fill('150');
  await page.getByText('Budget', { exact: true }).first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await shot(page, 'agent-guardrails', info);
});

test('docs reputation-tiers', async ({ page }, info) => {
  await light(page);
  await serveSearch(page, { balances: funded } as never);
  await page.route(`${API}/api/reputation**`, (r) => r.fulfill({ json: { address: ME, score: 520, tier: 'ESTABLISHED', scoreTier: 'ESTABLISHED', successCount: 14, disputedCount: 0, failedCount: 0, totalDeals: 14, terms: {}, inputs: { stakeUsdc: 125, lifetimeVolumeUsdc: 4200, distinctCounterparties: 9 } } }));
  await page.goto('/credit-passport/' + ME);
  await shot(page, 'reputation-tiers', info);
});

test('docs stake-card', async ({ page }, info) => {
  await light(page);
  await serveMoney(page, { balances: funded, rates: RATES, guarantee: { inPlaceUsdc: '125', heldUsdc: '40', freeUsdc: '85', comingBackUsdc: '0', ready: false, waitDays: 7 } } as never);
  await page.goto('/account?tab=guarantee');
  await shot(page, 'stake-card', info);
});

test('docs bridge-steps', async ({ page }, info) => {
  await light(page);
  await serveMoney(page, { balances: funded } as never);
  await page.goto('/bridge');
  await shot(page, 'bridge-steps', info);
});
