import { expect, test } from '@playwright/test';
import type { DirectDeal } from '../core/api';
import { en } from '../shared/i18n/messages/en';
import { BUYER, JOB, SELLER, deliveredDeal, serveDeal } from './fixtures';

const copy = en.directDealDetail.actionPanel.awaitingAcceptance;

const offered: DirectDeal = {
  ...deliveredDeal,
  delivered: false,
  deliveredAt: undefined,
  sellerApprovedAt: undefined,
  acceptedAt: undefined,
  onChain: null,
  view: {
    stage: 'awaiting-acceptance',
    money: { line: 'not-funded' },
    progress: [
      { step: 'agreed', state: 'current' },
      { step: 'funded', state: 'upcoming' },
      { step: 'delivered', state: 'upcoming' },
      { step: 'checked', state: 'upcoming' },
      { step: 'released', state: 'upcoming' },
    ],
    next: { action: 'accept', actor: 'you', amountUsdc: null },
    automatic: null,
  },
};

test('the seller turns the terms down and tells the buyer why', async ({ page }) => {
  await serveDeal(page, offered, SELLER);
  let sent: unknown = null;
  await page.route(`**/api/deals/direct/${JOB}/decline`, async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { accepted: true, jobId: JOB, deal: offered } });
  });
  await page.goto(`/deals/${JOB}`);

  await page.getByRole('button', { name: copy.declineCta, exact: true }).click();
  const send = page.getByRole('button', { name: copy.declineSend, exact: true });
  await expect(send).toBeDisabled();
  await page.getByLabel(copy.declineLabel).fill('300 USDC for this scope, and 10 days');
  await send.click();
  await expect.poll(() => sent).toEqual({ caller: SELLER, note: '300 USDC for this scope, and 10 days' });
});

test('the buyer reads the note and changing the terms leads', async ({ page }) => {
  await serveDeal(page, {
    ...offered,
    sellerDeclinedAt: Date.UTC(2026, 9, 1),
    sellerDeclineNote: '300 USDC for this scope, and 10 days',
    view: { ...offered.view!, next: { action: null, actor: 'you', amountUsdc: null } },
  }, BUYER);
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByText(copy.buyerDeclinedTitle, { exact: true })).toBeVisible();
  await expect(page.getByText('300 USDC for this scope, and 10 days', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: copy.editTermsCta, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('the old deal page offers the same turn-down', async ({ page }) => {
  await serveDeal(page, offered, SELLER);
  await page.goto(`/deals/${JOB}?workspace=v1`);
  await page.getByRole('button', { name: copy.declineCta, exact: true }).click();
  await expect(page.getByLabel(copy.declineLabel)).toBeVisible();
});

test('the buyer can cancel on the new deal page while nothing is funded', async ({ page }) => {
  await serveDeal(page, { ...offered, view: { ...offered.view!, next: { action: null, actor: 'counterparty', amountUsdc: null } } }, BUYER);
  let cancelled: unknown = null;
  await page.route(`**/api/deals/direct/${JOB}/cancel`, async (route) => {
    cancelled = route.request().postDataJSON();
    await route.fulfill({ json: { accepted: true, jobId: JOB } });
  });
  await page.goto(`/deals/${JOB}`);
  await page.getByRole('button', { name: en.dealWorkspace.simple.problem, exact: true }).click();
  await expect(page.getByText(en.dealWorkspace.cancelDeal.consequence)).toBeVisible();
  await page.getByTestId('deal-confirm').click();
  await expect.poll(() => cancelled).toEqual({ caller: BUYER });
});
