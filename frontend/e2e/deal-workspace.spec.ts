import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { DirectDeal } from '../core/api';
import { en } from '../shared/i18n/messages/en';
import { BUYER, JOB, SELLER, deliveredDeal, serveDeal } from './fixtures';

const s = en.dealWorkspace.simple;

function capture(page: Page, path: string) {
  const box: { body: unknown } = { body: null };
  void page.route(`**/api/deals/direct/${JOB}/${path}`, async (route) => {
    box.body = route.request().postDataJSON();
    await route.fulfill({ json: { accepted: true, jobId: JOB } });
  });
  return box;
}

test('the money comes first with one clear action', async ({ page }) => {
  await serveDeal(page, deliveredDeal);
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('1,200');
  await expect(page.getByText('Held by Karwan', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Release 600 USDC' })).toBeVisible();
  await expect(page.getByText('Releases automatically on 25 Sep 2026 unless you raise a problem.')).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(0);
});

test('who it is with is one line, and the full record opens on request', async ({ page }) => {
  await serveDeal(page, deliveredDeal);
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByText('14 settled · 13 of 14 on time', { exact: true })).toBeVisible();
  await expect(page.getByText('Verified business')).toHaveCount(0);
  await page.getByRole('button', { name: /^Amina Foods Ltd/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('14 settled · 13 of 14 on time · 0 disputes · since Mar 2026');
  await expect(sheet).toContainText('Verified business');
});

test('a money action opens the confirm sheet with its consequence', async ({ page }) => {
  await serveDeal(page, deliveredDeal);
  await page.goto(`/deals/${JOB}`);
  await page.getByRole('button', { name: 'Release 600 USDC' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Release 600 USDC to Amina Foods Ltd?' })).toBeVisible();
  await expect(sheet.getByText('Not yet', { exact: true })).toBeVisible();
  await expect(sheet).toContainText('This cannot be undone.');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
});

test('the agreement opens in place from its row instead of sitting on the page', async ({ page }) => {
  await serveDeal(page, deliveredDeal);
  await page.goto(`/deals/${JOB}`);
  const row = page.getByRole('button', { name: new RegExp(`^${s.agreement}`) });
  await expect(row).toHaveAttribute('aria-expanded', 'false');
  await row.click();
  await expect(row).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#deal-row-agreement-body')).toContainText('Deliver the translated catalogue');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('messages stay closed on a wide screen until the message button opens them beside the deal', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serveDeal(page, deliveredDeal);
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('1,200');
  await expect(page.getByRole('log')).toHaveCount(0);
  await page.getByRole('button', { name: /^Message Amina Foods Ltd/ }).click();
  await expect(page.getByRole('dialog').getByRole('log')).toBeVisible();
  await expect(page.locator('#deal-row-messages')).toHaveCount(0);
});

test('Back sits on the deal column, not at the edge of a wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serveDeal(page, deliveredDeal);
  await page.goto(`/deals/${JOB}`);
  const amount = page.getByRole('heading', { level: 1 });
  await expect(amount).toContainText('1,200');
  const back = page.getByRole('button', { name: en.nav.backAria, exact: true }).filter({ visible: true });
  await expect(back).toHaveCount(1);
  // The amount sits inside the deal's hero card; Back lines up with that card.
  const card = page.locator('section[aria-labelledby="deal-amount"]');
  const backBox = await back.boundingBox();
  const cardBox = await card.boundingBox();
  expect(Math.abs(backBox!.x - cardBox!.x)).toBeLessThan(24);
});

test('a new counterparty is described neutrally', async ({ page }) => {
  await serveDeal(page, {
    ...deliveredDeal,
    counterpartyTrust: {
      ...deliveredDeal.counterpartyTrust!,
      isNew: true,
      verifiedBusiness: false,
      facts: { settled: 0, distinctCounterparties: 0, onTime: 0, withDeadline: 0, disputes: 0 },
    },
  });
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByText(s.newHere, { exact: true })).toBeVisible();
});

test('sending is never shown as failed', async ({ page }) => {
  await serveDeal(page, { ...deliveredDeal, view: { ...deliveredDeal.view!, money: { line: 'sending' } } });
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByText(en.dealWorkspace.money.sending, { exact: true })).toBeVisible();
  await expect(page.getByText(/failed/i)).toHaveCount(0);
});

test('the seller sees whose move it is', async ({ page }) => {
  await serveDeal(
    page,
    { ...deliveredDeal, view: { ...deliveredDeal.view!, next: { action: null, actor: 'counterparty', amountUsdc: null } } },
    SELLER,
  );
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByText(/^Waiting on /)).toBeVisible();
});

test('the page still works when the trust lookup failed', async ({ page }) => {
  await serveDeal(page, { ...deliveredDeal, counterpartyTrust: null });
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByRole('button', { name: 'Release 600 USDC' })).toBeVisible();
  await page.getByRole('button', { name: 'Release 600 USDC' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Release 600 USDC to the seller?' })).toBeVisible();
});

const awaitingDelivery: DirectDeal = {
  ...deliveredDeal,
  delivered: false,
  deliveredAt: undefined,
  deadlineUnix: Math.floor(Date.UTC(2030, 0, 10) / 1000),
  view: { ...deliveredDeal.view!, stage: 'awaiting-delivery', next: { action: 'deliver', actor: 'you', amountUsdc: null }, automatic: null },
};

test('the seller delivers from a sheet on the same page', async ({ page }) => {
  await serveDeal(page, awaitingDelivery, SELLER);
  const delivered = capture(page, 'delivered');
  await page.goto(`/deals/${JOB}`);
  await page.getByRole('button', { name: en.dealWorkspace.actions.deliver }).click();
  const submit = page.getByRole('dialog').getByRole('button', { name: en.dealPage.sendDelivery });
  await expect(submit).toBeDisabled();
  await page.getByLabel(s.proofLabel).fill('https://example.com/catalogue.pdf');
  await submit.click();
  await expect.poll(() => delivered.body).toEqual({ caller: SELLER, deliveryProof: 'https://example.com/catalogue.pdf' });
});

test('the buyer answers a request for more time in place', async ({ page }) => {
  await serveDeal(page, {
    ...awaitingDelivery,
    extensionRequest: { requestedBy: 'seller', requestedAt: Date.UTC(2026, 9, 1), additionalSeconds: 3 * 86_400, reason: 'Printer delay' },
    view: { ...awaitingDelivery.view!, next: { action: 'respond-extension', actor: 'you', amountUsdc: null } },
  }, BUYER);
  const answered = capture(page, 'extension/respond');
  await page.goto(`/deals/${JOB}`);
  await page.getByRole('button', { name: en.dealWorkspace.actions.respondExtension }).click();
  await expect(page.getByRole('dialog')).toContainText('Printer delay');
  await page.getByRole('button', { name: s.giveTime }).click();
  await expect.poll(() => answered.body).toEqual({ caller: BUYER, decision: 'approved' });
});

const pp = en.profilePage;

test('something is wrong offers three plain choices, and not what we agreed opens a problem', async ({ page }) => {
  await serveDeal(page, deliveredDeal, BUYER);
  const appealed = capture(page, 'appeal');
  await page.goto(`/deals/${JOB}`);
  await page.getByRole('button', { name: s.problem, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: pp.wrongTitle })).toBeVisible();
  await expect(dialog.getByRole('button', { name: new RegExp(pp.needsChanges) })).toBeVisible();
  await expect(dialog.getByRole('button', { name: new RegExp(pp.nothingArrived) })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Open a dispute' })).toHaveCount(0);
  await dialog.getByRole('button', { name: new RegExp(pp.notAgreed) }).click();
  await expect(dialog.getByRole('heading', { name: 'Open a problem' })).toBeVisible();
  await page.getByLabel(s.whatWentWrong).fill('Half the catalogue is missing');
  await page.getByRole('button', { name: s.disputeSubmit }).click();
  await expect.poll(() => appealed.body).toEqual({ caller: BUYER, reason: 'Half the catalogue is missing' });
});

test('it needs changes opens Messages with a started note', async ({ page }) => {
  await serveDeal(page, deliveredDeal, BUYER);
  await page.goto(`/deals/${JOB}`);
  await page.getByRole('button', { name: s.problem, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: new RegExp(pp.needsChanges) }).click();
  await expect(page.getByRole('dialog').getByRole('textbox')).toHaveValue(en.dealPage.changesDraft);
});

test('goods that have not arrived also offer nothing arrived, which opens a problem', async ({ page }) => {
  await serveDeal(page, { ...deliveredDeal, tradeType: 'goods', tradeLane: 'finance' }, BUYER);
  await page.goto(`/deals/${JOB}`);
  await page.getByRole('button', { name: s.problem, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: new RegExp(pp.nothingArrived) }).click();
  await expect(page.getByRole('dialog').getByLabel(s.whatWentWrong)).toBeVisible();
});

for (const theme of ['light', 'dark'] as const) {
  test(`no horizontal scroll and no accessibility violations in ${theme}`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('karwan-theme', value), theme);
    await serveDeal(page, deliveredDeal);
    await page.goto(`/deals/${JOB}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.waitForTimeout(600);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test('Arabic renders right to left without overflow', async ({ page, context }) => {
  await context.addCookies([{ name: 'karwan-locale', value: 'ar', url: 'http://127.0.0.1:3100' }]);
  await serveDeal(page, deliveredDeal);
  await page.goto(`/deals/${JOB}`);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

const API = 'http://127.0.0.1:3199';
const ONE_PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

test('a goods order is shipped from the same page with its carrier and tracking number', async ({ page }) => {
  await serveDeal(page, { ...awaitingDelivery, tradeType: 'goods', tradeLane: 'finance' }, SELLER);
  await page.route(`${API}/api/deals/carriers`, (route) =>
    route.fulfill({ json: { carriers: [{ slug: 'dhl', name: 'DHL', needsUrl: false }, { slug: 'other', name: 'Other carrier', needsUrl: true }] } }),
  );
  const delivered = capture(page, 'delivered');
  await page.goto(`/deals/${JOB}`);
  await page.getByRole('button', { name: en.dealWorkspace.actions.deliver }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(s.shipTitle);
  const submit = dialog.getByRole('button', { name: en.dealPage.sendDelivery });
  await expect(submit).toBeDisabled();
  await dialog.getByRole('radio', { name: 'DHL' }).click();
  await dialog.getByLabel(s.trackingLabel).fill('JD014600006');
  await expect(submit).toBeDisabled();
  await dialog.locator('input[type="file"]').setInputFiles({ name: 'parcel.png', mimeType: 'image/png', buffer: ONE_PIXEL_PNG });
  await submit.click();
  await expect.poll(() => delivered.body).toMatchObject({ caller: SELLER, shipment: { carrier: 'dhl', trackingNumber: 'JD014600006' } });
  expect((delivered.body as { photos: string[] }).photos).toEqual([expect.stringMatching(/^data:image\/jpeg;base64,/)]);
  await expect(page).not.toHaveURL(/workspace=v1/);
});

test('the seller of a delivered business order gets paid now on the same page', async ({ page }) => {
  const g = en.dealWorkspace.getPaid;
  const deal: DirectDeal = {
    ...deliveredDeal,
    tradeType: 'goods',
    tradeLane: 'finance',
    shipment: { carrier: 'dhl', trackingNumber: 'JD014600006', trackingUrl: 'https://www.dhl.com/track?id=JD014600006' },
    factoringRequestedAt: Date.UTC(2026, 9, 18),
    // Getting paid early runs on the escrow family (view 18).
    escrowVersion: 'suite',
  } as DirectDeal;
  await serveDeal(page, deal, SELLER);
  const offer = {
    id: '6f1c2a3b-0000-4000-8000-000000000001', invoiceId: JOB, financier: '0x5555555555555555555555555555555555555555', seller: SELLER,
    status: 'offered', offeredAdvanceUsdc: '480', expectedReturnUsdc: '504', faceValueUsdc: '600', discountBps: 400,
    offeredAt: Date.now(), expiresAt: Date.now() + 86_400_000, createdAt: Date.now(), updatedAt: Date.now(),
  };
  await page.route(`${API}/api/factoring/offers/${JOB}`, (route) => route.fulfill({ json: { offers: [offer] } }));
  const accepted: { body: unknown } = { body: null };
  await page.route(`${API}/api/factoring/accept`, async (route) => {
    accepted.body = route.request().postDataJSON();
    await route.fulfill({ json: { offer: { ...offer, status: 'accepted' } } });
  });
  await page.goto(`/deals/${JOB}`);
  await page.getByRole('button', { name: en.dealWorkspace.layers.getPaid, exact: true }).click();
  await expect(page.getByRole('heading', { name: g.requestedTitle })).toBeVisible();
  await expect(page.getByText('480 USDC now', { exact: true })).toBeVisible();
  await expect(page.getByText('504 USDC repaid from this deal', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: g.review }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('You get 480 USDC now. When the buyer releases, 504 USDC of this deal goes to the financier first');
  await dialog.getByRole('button', { name: g.accept }).click();
  await expect.poll(() => accepted.body).toEqual({ offerId: offer.id });
});

test('the buyer never sees the seller’s early payment', async ({ page }) => {
  await serveDeal(page, { ...deliveredDeal, tradeType: 'goods', tradeLane: 'finance', factoringRequestedAt: Date.UTC(2026, 9, 18) } as DirectDeal, BUYER);
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByRole('heading', { name: en.dealWorkspace.getPaid.requestedTitle })).toHaveCount(0);
});

test('a rating link opens the rating on a settled deal', async ({ page }) => {
  await serveDeal(page, { ...deliveredDeal, settledAt: Date.UTC(2026, 9, 18) } as DirectDeal, BUYER);
  await page.route(`${API}/api/deals/${JOB}/rating`, (route) => route.fulfill({ json: { rated: false } }));
  await page.goto(`/deals/${JOB}#rate`);
  await expect(page.locator('#rate').getByRole('heading', { name: 'Rate this deal' })).toBeVisible();
  await expect(page.locator('#rate').getByRole('radio')).toHaveCount(5);
});

test('on desktop a confirm opens as a full-height drawer on the end side, and scrolls on a short window', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the drawer is the desktop shape');
  await serveDeal(page, { ...deliveredDeal, counterpartyTrust: null });
  await page.goto(`/deals/${JOB}`);
  await page.getByRole('button', { name: 'Release 600 USDC' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(400);
  // The page keeps a scrollbar gutter (scrollbar-gutter: stable), so the edge is
  // the overlay's, which stops at most a gutter short of the window.
  const overlay = (await page.locator('[role="presentation"]').filter({ has: dialog }).boundingBox())!;
  const box = (await dialog.boundingBox())!;
  expect(Math.round(box.x + box.width)).toBe(Math.round(overlay.x + overlay.width));
  expect(Math.round(box.height)).toBe(Math.round(overlay.height));
  expect(overlay.x + overlay.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 16);

  await page.setViewportSize({ width: 1440, height: 700 });
  const last = dialog.getByRole('button').last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();

  await context.addCookies([{ name: 'karwan-locale', value: 'ar', url: 'http://127.0.0.1:3100' }]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/deals/${JOB}`);
  await page.locator('[data-steps-track]').waitFor();
  await page.getByRole('button', { name: /600/ }).first().click();
  await page.waitForTimeout(400);
  expect(Math.round((await page.getByRole('dialog').boundingBox())!.x)).toBe(0);
});

const dp = en.dealPage;
const disputedView = { ...deliveredDeal.view!, stage: 'disputed' as const, next: { action: null, actor: 'nobody' as const, amountUsdc: null }, automatic: null };

test('a proposal to refund the buyer from a dispute is answered here, saying where the money goes', async ({ page }) => {
  await serveDeal(page, {
    ...deliveredDeal,
    disputed: true,
    cancellationProposal: { proposedBy: 'seller', kind: 'refund-from-dispute', reason: 'Fair enough, refund them', proposedAt: Date.UTC(2026, 8, 20) },
    view: { ...disputedView, next: { action: 'respond-cancel', actor: 'you', amountUsdc: null } },
  } as DirectDeal, BUYER);
  const accepted = capture(page, 'cancel/accept');
  await page.goto(`/deals/${JOB}`);
  await page.getByRole('button', { name: dp.answerProposal }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Fair enough, refund them');
  await expect(dialog).toContainText('1,200 USDC goes back to the buyer.');
  await dialog.getByRole('button', { name: dp.refundBuyer }).click();
  await expect.poll(() => accepted.body).toEqual({ caller: BUYER });
  await expect(page).not.toHaveURL(/workspace=v1/);
});

test('in a dispute either side proposes paying the seller or refunding the buyer', async ({ page }) => {
  await serveDeal(page, { ...deliveredDeal, disputed: true, view: disputedView } as DirectDeal, SELLER);
  const proposed = capture(page, 'cancel/propose');
  await page.goto(`/deals/${JOB}`);
  await page.getByRole('button', { name: s.problem, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('radio', { name: dp.refundBuyer })).toBeVisible();
  await dialog.getByRole('radio', { name: dp.paySeller }).click();
  await dialog.getByLabel(s.reasonLabel).fill('The catalogue was delivered in full');
  await dialog.getByRole('button', { name: s.proposeSubmit }).click();
  await expect.poll(() => proposed.body).toEqual({ caller: SELLER, reason: 'The catalogue was delivered in full', kind: 'release-from-dispute' });
});

const HOUR = 3_600_000;
const afterFirstRelease = {
  ...deliveredDeal,
  reviewWindowStartedAt: Date.now() - 2 * HOUR,
  delayAppealGraceMs: HOUR,
  delayAppealResponseWindowMs: 5 * 60_000,
  view: { ...deliveredDeal.view!, stage: 'awaiting-final-release' as const, next: { action: 'release' as const, actor: 'counterparty' as const, amountUsdc: '600' } },
} as DirectDeal;

test('after the first release the seller asks a quiet buyer to release', async ({ page }) => {
  await serveDeal(page, afterFirstRelease, SELLER);
  const asked = capture(page, 'delay-appeal');
  await page.goto(`/deals/${JOB}`);
  await page.getByRole('button', { name: s.problem, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: new RegExp(dp.askRelease) }).click();
  await expect(page.getByRole('dialog')).toContainText('has to release the next payment');
  await page.getByRole('button', { name: dp.askReleaseSend }).click();
  await expect.poll(() => asked.body).toEqual({ caller: SELLER });
});

test('the buyer answers an ask to release with a reason', async ({ page }) => {
  await serveDeal(page, { ...afterFirstRelease, delayAppealRaisedAt: Date.now() - 60_000, view: { ...afterFirstRelease.view!, next: { action: 'release', actor: 'you', amountUsdc: '600' } } } as DirectDeal, BUYER);
  const answered = capture(page, 'delay-appeal-respond');
  await page.goto(`/deals/${JOB}`);
  await page.getByRole('button', { name: s.problem, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: dp.answerAppeal }).click();
  await page.getByLabel(s.reasonLabel).fill('Two pages are still in English');
  await page.getByRole('button', { name: dp.answerAppealSend }).click();
  await expect.poll(() => answered.body).toEqual({ caller: BUYER, reason: 'Two pages are still in English' });
});

test('a payout that needs another look is checked again from the deal, before any new release', async ({ page }) => {
  await serveDeal(page, deliveredDeal, BUYER);
  const reference = 'movement-payout-1';
  await page.route(`${API}/api/deals/direct/${JOB}/movements`, (route) => route.fulfill({ json: { movements: [{
    reference, kind: 'milestone_payout', state: 'needs_attention', currency: 'USDC', amountUsdc: '600.000000', summary: 'Payout',
    nextActor: 'karwan', createdAt: 1, updatedAt: 1, legs: [],
  }] } }));
  const checked = capture(page, `payouts/${reference}/reconcile`);
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByText(en.directDealDetail.settlementRecord.recoveryTitle)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Release 600 USDC' })).toHaveCount(0);
  await page.getByRole('button', { name: dp.checkAgain }).click();
  await expect.poll(() => checked.body).toEqual({ caller: BUYER });
});

test('a deal on an older contract points to Earlier deals and offers no move here', async ({ page }) => {
  await serveDeal(page, { ...deliveredDeal, legacyEscrow: true } as DirectDeal, BUYER);
  await page.goto(`/deals/${JOB}`);
  await expect(page.getByText(dp.earlierEscrow)).toBeVisible();
  await expect(page.getByRole('link', { name: dp.openEarlier })).toHaveAttribute('href', '/legacy');
  await expect(page.getByRole('button', { name: 'Release 600 USDC' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: s.problem, exact: true })).toHaveCount(0);
});

test('an old link to the previous deal page opens the deal page there is now', async ({ page }) => {
  await serveDeal(page, deliveredDeal);
  await page.goto(`/deals/${JOB}?workspace=v1&handoff=1`);
  await expect(page.locator('[data-steps-card]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Release 600 USDC' })).toBeVisible();
});
