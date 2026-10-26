import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import type { DirectDeal } from '../core/api';
import { dealLiveCopy } from '../shared/i18n/messages/dealLive';
import { en } from '../shared/i18n/messages/en';
import { BUYER, JOB, SELLER, deliveredDeal, serveDeal } from './fixtures';
import { API, funded, serveMoney } from './moneyFixtures';

/// The escrow family's two new surfaces (plan 2, Task 14 step 1): the record
/// card the assistant shows before a first money step, and the settled deal's
/// record line. Measured at each project's size, light and dark, and Arabic.

const recordCard = {
  kind: 'confirm',
  id: 'set_up_record:0xbuyer:1',
  intent: 'set_up_record',
  title: 'Set up your Karwan record',
  summary:
    'Your deals and checks are written to it. Your agents run your deals for you; your buying agent can pay up to 1,005 USDC at a time and 10,000 USDC in total for one year.',
  fields: [
    { label: 'Your buying agent pays', value: 'Up to 1,005 USDC at a time' },
    { label: 'In total', value: '10,000 USDC for one year' },
  ],
  payload: { address: '0xbuyer' },
  confirmLabel: 'Set up my record',
  cancelLabel: 'Not now',
};

const settled = (onBothRecords: boolean | null): DirectDeal => ({
  ...deliveredDeal,
  escrowVersion: 'suite',
  settledAt: Date.UTC(2026, 8, 26),
  view: {
    stage: 'settled',
    money: { line: 'released' },
    progress: [
      { step: 'agreed', state: 'done', at: Date.UTC(2026, 8, 11) },
      { step: 'funded', state: 'done', at: Date.UTC(2026, 8, 12) },
      { step: 'delivered', state: 'done', at: Date.UTC(2026, 8, 18) },
      { step: 'released', state: 'done', at: Date.UTC(2026, 8, 26) },
    ],
    next: { action: null, actor: 'nobody', amountUsdc: null },
    automatic: null,
    onBothRecords,
  },
}) as DirectDeal;

async function appearance(page: Page, context: BrowserContext, theme: 'light' | 'dark', locale: 'en' | 'ar') {
  await page.addInitScript((value) => localStorage.setItem('karwan-theme', value), theme);
  if (locale === 'ar') await context.addCookies([{ name: 'karwan-locale', value: 'ar', url: 'http://127.0.0.1:3100' }]);
}

/// The boot splash covers the page until its data settles; a screenshot waits for it.
async function splashGone(page: Page) {
  await page.waitForFunction(() => !document.querySelector('[role="status"][class*="z-[9999]"]'), undefined, { timeout: 10_000 });
}

async function noSideways(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const [theme, locale] of [['light', 'en'], ['dark', 'en'], ['light', 'ar'], ['dark', 'ar']] as const) {
  test(`the record card reads in full in ${theme} ${locale}`, async ({ page, context }, testInfo) => {
    await appearance(page, context, theme, locale);
    await serveMoney(page, { balances: funded });
    await page.route(`${API}/api/assistant/**`, async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/assistant/chat') return route.fulfill({ json: { reply: 'Here is your record setup. Check it and confirm.', actions: [recordCard] } });
      if (path === '/api/assistant/conversations' && route.request().method() === 'GET') return route.fulfill({ json: { conversations: [] } });
      return route.fulfill({ json: { conversation: { id: 'c1', title: 'Chat', updatedAt: 0, messages: [] } } });
    });
    await page.goto('/assistant');
    await page.getByRole('textbox').fill('Set up my record');
    await page.getByRole('textbox').press('Enter');
    await expect(page.getByText(recordCard.title, { exact: true })).toBeVisible();
    await expect(page.getByText(recordCard.summary)).toBeVisible();
    // UI law v2: 44px targets, on both of the card's buttons.
    for (const name of [recordCard.confirmLabel, recordCard.cancelLabel]) {
      const button = page.getByRole('button', { name, exact: true });
      await expect(button).toBeVisible();
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await noSideways(page);
    await splashGone(page);
    await page.screenshot({ path: testInfo.outputPath(`record-card-${theme}-${locale}.png`), fullPage: true });
  });
}

for (const [theme, locale] of [['light', 'en'], ['dark', 'en'], ['light', 'ar'], ['dark', 'ar']] as const) {
  test(`a settled deal's record line in ${theme} ${locale}`, async ({ page, context }, testInfo) => {
    await appearance(page, context, theme, locale);
    const words = dealLiveCopy[locale];
    for (const [state, line, body] of [
      [true, words.onBothRecords, null],
      [false, words.completeTitle, words.recordPending],
      [null, words.completeTitle, null],
    ] as const) {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await serveDeal(page, settled(state));
      await page.goto(`/deals/${JOB}`);
      await expect(page.getByText(line, { exact: true })).toBeVisible();
      if (body) await expect(page.getByText(body, { exact: true })).toBeVisible();
      // No record claim at all when a side had no record when it was paid in.
      if (state === null) await expect(page.getByText(words.completeBody, { exact: true })).toHaveCount(0);
      await noSideways(page);
      await splashGone(page);
      await page.screenshot({ path: testInfo.outputPath(`deal-record-${String(state)}-${theme}-${locale}.png`), fullPage: true });
    }
  });
}

test('the seller sets up their record before agreeing, and the buyer pays as usual after', async ({ page }) => {
  const awaitingAcceptance = {
    ...deliveredDeal,
    delivered: false,
    deliveredAt: undefined,
    sellerApprovedAt: undefined,
    acceptedAt: undefined,
    onChain: undefined,
    view: {
      stage: 'awaiting-acceptance',
      money: { line: 'not-funded' },
      progress: [{ step: 'agreed', state: 'current' }, { step: 'funded', state: 'upcoming' }, { step: 'released', state: 'upcoming' }],
      next: { action: 'accept', actor: 'you', amountUsdc: null },
      automatic: null,
    },
  } as unknown as DirectDeal;
  await serveDeal(page, awaitingAcceptance, SELLER);
  const order: string[] = [];
  let recordDone = false;
  await page.route(`${API}/api/record/setup`, async (route) => {
    if (route.request().method() === 'POST') {
      order.push('record');
      recordDone = true;
      return route.fulfill({ json: { complete: true } });
    }
    return route.fulfill({ json: { available: true, complete: recordDone } });
  });
  await page.route(`${API}/api/deals/direct/${JOB}/accept`, async (route) => {
    order.push('agree');
    return route.fulfill({ json: { accepted: true, jobId: JOB, status: 'seller-approved' } });
  });
  await page.goto(`/deals/${JOB}`);
  await page.getByRole('button', { name: en.dealWorkspace.actions.accept, exact: true }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText(dealLiveCopy.en.recordFirst);
  await sheet.getByRole('button', { name: en.dealWorkspace.confirm.confirm, exact: true }).click();
  await expect.poll(() => order).toEqual(['record', 'agree']);
});

test('while reviewing, the buyer can ask once for more time to check', async ({ page }) => {
  const reviewing = {
    ...deliveredDeal,
    escrowVersion: 'suite',
    view: {
      stage: 'awaiting-first-release',
      money: { line: 'held' },
      progress: [{ step: 'agreed', state: 'done' }, { step: 'funded', state: 'done' }, { step: 'delivered', state: 'done' }, { step: 'released', state: 'upcoming' }],
      next: { action: 'release', actor: 'you', amountUsdc: '600' },
      automatic: { kind: 'auto-release', at: Date.UTC(2026, 9, 28, 9, 0) },
    },
  } as unknown as DirectDeal;
  await serveDeal(page, reviewing, BUYER);
  let asked: unknown = null;
  await page.route(`${API}/api/deals/direct/${JOB}/still-reviewing`, async (route) => {
    asked = route.request().postDataJSON();
    return route.fulfill({ json: { accepted: true, jobId: JOB, reviewExtensionMs: 3 * 86_400_000 } });
  });
  await page.goto(`/deals/${JOB}`);
  await page.getByRole('button', { name: en.dealWorkspace.simple.problem, exact: true }).click();
  await page.getByRole('button', { name: en.dealWorkspace.simple.moreReviewTitle, exact: true }).click();
  await expect(page.getByText(en.dealWorkspace.simple.moreReviewBody)).toBeVisible();
  await page.getByRole('button', { name: en.dealWorkspace.simple.moreReviewSubmit, exact: true }).click();
  await expect.poll(() => asked).toEqual({ caller: BUYER });
});
