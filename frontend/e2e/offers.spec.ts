import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { BUYER_AGENT, funded, API, RPC, TX, watchHydration } from './moneyFixtures';
import { JOB, makeJob, serveSearch } from './searchFixtures';
import type { Offer } from '../features/offers/model';
import {
  assertTopUpAppearance, blockTopUpProviders, captureTopUpScreen, checkTopUpKeyboardFocus,
  gatewayBalance, noProtocolWords, prepareTopUpAppearance, topUpEvidenceManifest,
  topUpMainnet, topUpMessages,
} from './instantTopUpFixtures';

// These pages are the search v2 set, which is off by default; ask for it.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { sessionStorage.setItem('karwan:search', 'v2'); } catch { /* storage blocked */ }
  });
});

test.beforeEach(() => test.skip(topUpMainnet, 'Offer acceptance is unavailable on the mainnet build; the instant-topup suite checks its account redirect.'));
test.afterEach(async ({}, testInfo) => topUpEvidenceManifest(testInfo));

const SELLER_A = '0x5555555555555555555555555555555555555555';
const SELLER_B = '0x8888888888888888888888888888888888888888';
const REQUEST = {
  briefText: 'Logo and brand kit for a Lagos bakery. Logo, colours and a one page guide.',
  budgetUsdc: '120',
  deadlineUnix: Math.floor(Date.now() / 1000) + 5 * 86_400,
};
const offer = (id: string, seller: string, price: string, createdAt: number): Offer => ({
  id,
  jobId: JOB,
  sellerUser: seller,
  priceUsdc: price,
  deliverByUnix: REQUEST.deadlineUnix - 86_400,
  note: 'Three logo routes in 48 hours, final kit by Saturday.',
  state: 'pending',
  createdAt,
  lapsesAt: REQUEST.deadlineUnix,
  fundedUsdc: (Number(price) * 1.0075).toFixed(2),
});

type World = {
  role: 'buyer' | 'seller' | 'visitor';
  offers: Offer[];
  count?: number;
  signedOut?: boolean;
  accept?: { status: number; code?: string };
  balances?: Record<string, number>;
  confirmed?: string;
  pending?: string;
  buyerBalanceUnavailable?: boolean;
  activationUnavailable?: boolean;
  shortUntilFunded?: boolean;
  funding?: { status?: number; code?: string; hold?: Promise<void>; refuseFirst?: boolean };
};

async function open(page: Page, world: World, theme: 'light' | 'dark' = 'light', locale: 'en' | 'ar' = 'en') {
  const hydrationErrors = watchHydration(page);
  if (world.shortUntilFunded) await page.clock.install();
  await prepareTopUpAppearance(page, theme, locale);
  const balances = { ...(world.balances ?? funded) };
  await serveSearch(page, {
    balances,
    job: world.role === 'buyer' ? makeJob() : { jobId: JOB, isParty: false, status: 'open' },
  });
  await blockTopUpProviders(page);
  let buyerReadFailures = 0;
  let activationReadFailures = 0;
  if (world.buyerBalanceUnavailable) {
    await page.route(`${RPC}/**`, async route => {
      if (!route.request().postData()?.toLowerCase().includes(BUYER_AGENT.slice(2).toLowerCase())) return route.fallback();
      buyerReadFailures += 1;
      type Call = { id: number | string };
      const body = route.request().postDataJSON() as Call | Call[];
      const error = (call: Call) => ({ jsonrpc: '2.0', id: call.id, error: { code: -32000, message: 'Balance read temporarily unavailable' } });
      return route.fulfill({ json: Array.isArray(body) ? body.map(error) : error(body) });
    });
  }
  let offers = [...world.offers];
  let acceptCalls = 0;
  let fundedInSheet = false;
  let confirmed = world.confirmed ?? '100';
  let buyerReads = 0;
  page.on('request', request => {
    if (request.url().startsWith(RPC) && request.postData()?.toLowerCase().includes(BUYER_AGENT.slice(2).toLowerCase())) buyerReads += 1;
  });
  const fundingCalls: Array<{ agent: string; amountUsdc: number; requestId: string }> = [];
  await page.route(`${API}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (world.signedOut && path === '/api/auth/bootstrap') return route.fulfill({ json: { user: null, profile: null } });
    if (world.activationUnavailable && path === '/api/activation/status') {
      activationReadFailures += 1;
      return route.fulfill({ status: 503, json: { error: 'Activation metadata unavailable', code: 'unavailable' } });
    }
    if (path === '/api/gateway/balance') return route.fulfill({ json: { balance: gatewayBalance(confirmed, world.pending) } });
    if (path === '/api/gateway/fund-agent' && method === 'POST') {
      const body = route.request().postDataJSON() as { agent: string; amountUsdc: number; requestId: string };
      const balanceBeforeFunding = balances[BUYER_AGENT.toLowerCase()];
      fundingCalls.push(body);
      if (balanceBeforeFunding === undefined) {
        return route.fulfill({ status: 503, json: { error: 'Agent balance unavailable', code: 'unavailable' } });
      }
      if (body.agent !== 'buyer' || !(body.amountUsdc > 0) || Number(confirmed) < body.amountUsdc) {
        return route.fulfill({ status: 409, json: { error: 'Insufficient confirmed USDC', code: 'insufficient_balance' } });
      }
      if (world.funding?.refuseFirst && fundingCalls.length === 1) {
        // A known pre-submission refusal changes no balances. A later retry
        // reuses the production component's request ID and needs a new click.
        return route.fulfill({ status: 409, json: { error: 'Funding request refused before submission', code: 'unavailable' } });
      }
      if (world.funding?.hold) await world.funding.hold;
      if (world.funding?.status && world.funding.status !== 200) {
        return route.fulfill({ status: world.funding.status, json: { error: 'Transfer could not be confirmed', code: world.funding.code ?? 'unavailable' } });
      }
      balances[BUYER_AGENT.toLowerCase()] = balanceBeforeFunding + body.amountUsdc;
      confirmed = String(Number(confirmed) - body.amountUsdc);
      fundedInSheet = true;
      return route.fulfill({ json: { ok: true, agent: body.agent, recipientAddress: BUYER_AGENT, amountUsd: body.amountUsdc,
        txHash: TX, reference: 'KWN-2026-TOPUP-0001', movementState: 'completed' } });
    }
    if (path === `/api/jobs/${JOB}/offers` && method === 'GET') {
      return route.fulfill({
        json: { count: world.count ?? offers.length, offers: world.role === 'visitor' ? [] : offers, role: world.role, request: REQUEST },
      });
    }
    if (path === `/api/jobs/${JOB}/offers` && method === 'POST') {
      const body = route.request().postDataJSON() as { priceUsdc: string };
      const sent = offer('o-new', '0x1111111111111111111111111111111111111111', body.priceUsdc, Date.now());
      offers = [sent];
      return route.fulfill({ status: 201, json: { offer: sent } });
    }
    if (/\/offers\/[^/]+\/accept$/.test(path)) {
      acceptCalls += 1;
      const a = world.shortUntilFunded && !fundedInSheet
        ? { status: 409, code: 'INSUFFICIENT_AGENT_BALANCE' }
        : world.accept ?? { status: 200 };
      return a.status === 200
        ? route.fulfill({ json: { ok: true, txHash: TX } })
        : route.fulfill({ status: a.status, json: { error: 'short', code: a.code } });
    }
    return route.fallback();
  });
  await page.goto(`/jobs/${JOB}`);
  await assertTopUpAppearance(page, theme, locale);
  return { fundingCalls, acceptCalls: () => acceptCalls, hydrationErrors,
    buyerReads: () => buyerReads, buyerReadFailures: () => buyerReadFailures, activationReadFailures: () => activationReadFailures,
    setBuyerBalance: (value: number) => { balances[BUYER_AGENT.toLowerCase()] = value; } };
}

async function layoutIsSound(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  for (const locale of ['en', 'ar'] as const) {
    test(`seller sees the request and can offer, ${theme} ${locale}`, async ({ page }) => {
      await open(page, { role: 'seller', offers: [] }, theme, locale);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(locale === 'en' ? 'Logo and brand kit' : 'Logo');
      // A request written in English keeps its own direction on an Arabic page.
      await expect(page.getByRole('heading', { level: 1 })).toHaveAttribute('dir', 'auto');
      await layoutIsSound(page);
    });
  }
}

test('seller sends an offer and sees it as sent', async ({ page }) => {
  await open(page, { role: 'seller', offers: [] });
  await page.getByRole('button', { name: 'Make an offer' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Price')).toHaveValue('120');
  await dialog.getByLabel('Price').fill('110');
  await layoutIsSound(page);
  await dialog.getByRole('button', { name: 'Send offer' }).click();
  await expect(page.getByText('Offer sent')).toBeVisible();
  await expect(page.getByText(/110 USDC/)).toBeVisible();
});

test('buyer sees offers cheapest first and accepts through the confirm sheet', async ({ page }) => {
  await open(page, { role: 'buyer', offers: [offer('o1', SELLER_A, '120', 1), offer('o2', SELLER_B, '96', 2)] });
  await expect(page.getByRole('heading', { name: '2 offers' })).toBeVisible();
  await expect(page.getByText('Sorted by price. You decide.')).toBeVisible();
  await layoutIsSound(page);
  await page.getByRole('button', { name: /Accept 0x8888…8888 · 96 USDC/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('held until you approve the work');
  // The amount that leaves the wallet, fee included, is the loudest number.
  await expect(dialog).toContainText('96.72 USDC');
  await expect(dialog).toContainText('96 USDC offer plus the fee');
  // The sheet must be a solid surface: money copy never sits over the page text.
  await expect.poll(() => dialog.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  const bg = await dialog.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).not.toMatch(/rgba\(.*,\s*0(\.\d+)?\)$/);
  await dialog.getByRole('button', { name: /Accept 0x8888/ }).click();
  await expect(page.getByText('Offer accepted. The money is held.')).toBeVisible();
});

test('buyer accepting above budget sees the difference', async ({ page }) => {
  await open(page, { role: 'buyer', offers: [offer('o1', SELLER_A, '150', 1)] });
  await page.getByRole('button', { name: /Accept 0x5555/ }).click();
  await expect(page.getByRole('dialog')).toContainText('30 USDC above your budget');
});

test('buyer accepting while short sees the exact top-up action', async ({ page }, testInfo) => {
  await open(page, { role: 'buyer', offers: [offer('o1', SELLER_A, '96', 1)],
    balances: { ...funded, [BUYER_AGENT.toLowerCase()]: 90 }, accept: { status: 409, code: 'INSUFFICIENT_AGENT_BALANCE' } });
  await page.getByRole('button', { name: /Accept 0x5555/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Accept 0x5555/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toHaveText('Top up to accept this offer.');
  await expect(dialog.getByRole('button', { name: 'Top up 6.72 USDC', exact: true })).toBeVisible();
  await captureTopUpScreen(page, testInfo, 'offer-short', { root: dialog, primary: 1, wholePagePrimary: 1 });
});

for (const theme of ['light', 'dark'] as const) {
  for (const locale of ['en', 'ar'] as const) {
    test(`buyer tops up in the same sheet and explicitly accepts again, ${theme} ${locale}`, async ({ page }, testInfo) => {
      const copy = topUpMessages[locale];
      const selectedOffer = { ...offer('o-topup', SELLER_A, '96', 1), fundedUsdc: '96.725' };
      let releaseFunding!: () => void;
      const hold = new Promise<void>(resolve => { releaseFunding = resolve; });
      const world = await open(page, { role: 'buyer', offers: [selectedOffer], shortUntilFunded: true,
        balances: { ...funded, [BUYER_AGENT.toLowerCase()]: 91.72 }, confirmed: '40', pending: '8', funding: { hold } }, theme, locale);
      const acceptName = copy.offers.accept.replace('{seller}', '0x5555…5555').replace('{price}', '96');
      const opener = page.getByRole('button', { name: acceptName, exact: true });
      await opener.click();
      const dialog = page.getByRole('dialog', { name: copy.offers.confirmTitle, exact: true });
      await dialog.getByRole('button', { name: acceptName, exact: true }).click();
      await expect(dialog.getByRole('alert')).toHaveText(copy.offers.errors.topUp);
      const topUp = dialog.getByRole('button', { name: copy.offers.topUpCta.replace('{amount}', '5.01'), exact: true });
      await expect(topUp).toBeVisible();
      await checkTopUpKeyboardFocus(page, topUp, testInfo, 'offer-topup');
      const color = await topUp.evaluate(element => getComputedStyle(element).backgroundColor);
      expect(color).not.toBe(await dialog.getByRole('button', { name: acceptName, exact: true }).evaluate(element => getComputedStyle(element).backgroundColor));
      await captureTopUpScreen(page, testInfo, 'offer-short', { root: dialog, primary: 1, wholePagePrimary: 1 });
      await topUp.click();
      await expect(page.getByRole('dialog')).toHaveCount(1);
      await expect(dialog.getByLabel(copy.fundAgentOptions.amount.label, { exact: true })).toHaveValue('5.01');
      await expect(dialog.getByRole('button', { name: copy.fundAgentOptions.gateway.label, exact: true })).toBeVisible();
      await expect(dialog).not.toContainText(/Gateway|\bpool\b|pooled|unified/i);
      await noProtocolWords(page);
      expect(world.acceptCalls()).toBe(1);
      expect(world.fundingCalls).toHaveLength(0);
      await expect(dialog.getByTestId('offer-top-up')).toBeVisible();
      await captureTopUpScreen(page, testInfo, 'offer-chooser', { root: dialog, primary: 0, wholePagePrimary: 0 });
      await dialog.getByRole('button', { name: copy.fundAgentOptions.wallet.label, exact: true }).click();
      const fund = dialog.getByRole('button', { name: copy.gatewayTopUp.fundPool, exact: true });
      await checkTopUpKeyboardFocus(page, fund, testInfo, 'offer-fund');
      await captureTopUpScreen(page, testInfo, 'offer-funding-ready', { root: dialog, primary: 1, wholePagePrimary: 1 });
      try {
        await fund.click();
        await expect.poll(() => world.fundingCalls.length).toBe(1);
        expect(world.fundingCalls[0]).toMatchObject({ agent: 'buyer', amountUsdc: 5.01 });
        expect(world.fundingCalls[0].requestId).toBeTruthy();
        await expect(dialog.getByRole('button', { name: copy.gatewayTopUp.moving, exact: true })).toBeDisabled();
        await expect(dialog.getByRole('button', { name: copy.offers.cancel, exact: true })).toBeDisabled();
        const chooser = dialog.getByTestId('offer-top-up');
        await expect(chooser.getByLabel(copy.fundAgentOptions.amount.label, { exact: true })).toBeDisabled();
        const routes = chooser.locator('button[aria-pressed]');
        await expect(routes).toHaveCount(4);
        for (const route of await routes.all()) await expect(route).toBeDisabled();
        await page.keyboard.press('Escape');
        await expect(dialog).toBeVisible();
        const panel = await dialog.boundingBox();
        const viewport = page.viewportSize();
        if (!panel || !viewport) throw new Error('The confirmation sheet must have measurable bounds.');
        const backdrop = panel.y > 1 ? { x: viewport.width / 2, y: 1 }
          : panel.x > 1 ? { x: 1, y: viewport.height / 2 }
            : { x: viewport.width - 1, y: viewport.height / 2 };
        await page.mouse.click(backdrop.x, backdrop.y);
        await expect(dialog).toBeVisible();
        await expect(chooser).toBeVisible();
        expect(world.fundingCalls).toHaveLength(1);
        expect(world.acceptCalls()).toBe(1);
        // Chain reads can see the credit before the funding response returns.
        // The chooser's selected amount must survive that read-side update.
        const priorReads = world.buyerReads();
        world.setBuyerBalance(96.73);
        await page.clock.fastForward(30_001);
        await expect.poll(world.buyerReads).toBeGreaterThan(priorReads);
        await expect(dialog.getByTestId('offer-top-up')).toBeVisible();
        await expect(dialog.getByLabel(copy.fundAgentOptions.amount.label, { exact: true })).toHaveValue('5.01');
        await expect(dialog.getByRole('button', { name: copy.gatewayTopUp.moving, exact: true })).toBeDisabled();
        await expect(dialog.getByRole('button', { name: acceptName, exact: true })).toHaveCount(0);
        await captureTopUpScreen(page, testInfo, 'offer-funding-pending', { root: dialog, primary: 1, wholePagePrimary: 1 });
      } finally {
        releaseFunding();
      }
      await expect(dialog.getByLabel(copy.fundAgentOptions.amount.label, { exact: true })).toHaveCount(0);
      await expect(dialog.getByRole('alert')).toHaveCount(0);
      await expect(dialog.getByRole('button', { name: acceptName, exact: true })).toBeEnabled();
      await expect(dialog.getByRole('button', { name: acceptName, exact: true })).toBeFocused();
      // A rendered Accept control and an unchanged request count establish the
      // manual review boundary; funding must never call acceptance on its own.
      expect(world.acceptCalls()).toBe(1);
      expect(world.fundingCalls).toHaveLength(1);
      for (let index = 0; index < 8; index += 1) await page.keyboard.press('Tab');
      expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
      await captureTopUpScreen(page, testInfo, 'offer-funded-awaiting-accept', { root: dialog, primary: 1, wholePagePrimary: 1 });
      expect(world.acceptCalls()).toBe(1);
      await dialog.getByRole('button', { name: acceptName, exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: copy.offers.accepted })).toBeVisible();
      await expect(dialog).toBeHidden();
      expect(world.acceptCalls()).toBe(2);
      expect(world.fundingCalls).toHaveLength(1);
      expect(world.hydrationErrors()).toEqual([]);
      // The accepted result belongs to BuyerOffers; the job's existing headline
      // is outside the funding change. Evidence still takes a full-page screen.
      const acceptedSection = page.getByRole('status').filter({ hasText: copy.offers.accepted })
        .locator('xpath=ancestor::section[1]');
      await captureTopUpScreen(page, testInfo, 'offer-explicitly-accepted', { root: acceptedSection, primary: 0 });
    });
  }
}

for (const appearance of [{ theme: 'light', locale: 'en' }, { theme: 'dark', locale: 'ar' }] as const) {
  test(`a refused top-up needs a deliberate retry, ${appearance.theme} ${appearance.locale}`, async ({ page }, testInfo) => {
    const copy = topUpMessages[appearance.locale];
    const world = await open(page, {
      role: 'buyer', offers: [{ ...offer('o-retry', SELLER_A, '96', 1), fundedUsdc: '96.725' }],
      balances: { ...funded, [BUYER_AGENT.toLowerCase()]: 91.72 }, confirmed: '40', shortUntilFunded: true,
      funding: { refuseFirst: true },
    }, appearance.theme, appearance.locale);
    const acceptName = copy.offers.accept.replace('{seller}', '0x5555…5555').replace('{price}', '96');
    await page.getByRole('button', { name: acceptName, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: copy.offers.confirmTitle, exact: true });
    await dialog.getByRole('button', { name: acceptName, exact: true }).click();
    await dialog.getByRole('button', { name: copy.offers.topUpCta.replace('{amount}', '5.01'), exact: true }).click();
    const chooser = dialog.getByTestId('offer-top-up');
    await chooser.getByRole('button', { name: copy.fundAgentOptions.wallet.label, exact: true }).click();
    const retry = chooser.getByRole('button', { name: copy.gatewayTopUp.fundPool, exact: true });
    await retry.click();
    await expect(chooser.getByText(copy.chainErrors.generic, { exact: true })).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('alert')).toHaveText(copy.offers.errors.topUp);
    await expect(retry).toBeEnabled();
    await expect(dialog.getByRole('button', { name: copy.offers.cancel, exact: true })).toBeEnabled();
    await expect(chooser.getByLabel(copy.fundAgentOptions.amount.label, { exact: true })).toBeEnabled();
    await expect(chooser.getByLabel(copy.fundAgentOptions.amount.label, { exact: true })).toHaveValue('5.01');
    for (const route of await chooser.locator('button[aria-pressed]').all()) await expect(route).toBeEnabled();
    await expect(dialog.getByRole('button', { name: acceptName, exact: true })).toHaveCount(0);
    expect(world.fundingCalls).toHaveLength(1);
    expect(world.acceptCalls()).toBe(1);
    await checkTopUpKeyboardFocus(page, retry, testInfo, 'offer-funding-retry');
    await captureTopUpScreen(page, testInfo, 'offer-funding-refused', { root: dialog, primary: 1, wholePagePrimary: 1 });
    expect(world.fundingCalls).toHaveLength(1);
    expect(world.acceptCalls()).toBe(1);

    await retry.click();
    await expect(chooser).toHaveCount(0);
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    const accept = dialog.getByRole('button', { name: acceptName, exact: true });
    await expect(accept).toBeFocused();
    expect(world.fundingCalls).toHaveLength(2);
    expect(world.fundingCalls[0]).toMatchObject({ agent: 'buyer', amountUsdc: 5.01 });
    expect(world.fundingCalls[1]).toEqual(world.fundingCalls[0]);
    expect(world.acceptCalls()).toBe(1);
    await captureTopUpScreen(page, testInfo, 'offer-retry-funded-awaiting-accept', { root: dialog, primary: 1, wholePagePrimary: 1 });
    expect(world.acceptCalls()).toBe(1);
    await accept.click();
    await expect(page.getByRole('status').filter({ hasText: copy.offers.accepted })).toBeVisible();
    expect(world.acceptCalls()).toBe(2);
    expect(world.fundingCalls).toHaveLength(2);
    expect(world.hydrationErrors()).toEqual([]);
  });
}

for (const unavailable of ['buyer balance', 'recipient metadata'] as const) {
  test(`unknown ${unavailable} does not invent a top-up amount`, async ({ page }, testInfo) => {
    const copy = topUpMessages.en;
    const world = await open(page, {
      role: 'buyer', offers: [offer('o-unknown', SELLER_A, '96', 1)],
      balances: { ...funded, [BUYER_AGENT.toLowerCase()]: 91.72 },
      buyerBalanceUnavailable: unavailable === 'buyer balance', activationUnavailable: unavailable === 'recipient metadata',
      accept: { status: 409, code: 'INSUFFICIENT_AGENT_BALANCE' },
    });
    const acceptName = copy.offers.accept.replace('{seller}', '0x5555…5555').replace('{price}', '96');
    await page.getByRole('button', { name: acceptName, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: copy.offers.confirmTitle, exact: true });
    await dialog.getByRole('button', { name: acceptName, exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText(copy.offers.errors.topUp);
    await expect.poll(unavailable === 'buyer balance' ? world.buyerReadFailures : world.activationReadFailures).toBeGreaterThan(0);
    await expect(dialog.getByRole('button', { name: /^Top up .* USDC$/ })).toHaveCount(0);
    await expect(dialog.getByTestId('offer-top-up')).toHaveCount(0);
    expect(world.fundingCalls).toHaveLength(0);
    expect(world.acceptCalls()).toBe(1);
    await captureTopUpScreen(page, testInfo, 'offer-read-unavailable', { root: dialog, primary: 1, wholePagePrimary: 1 });
    expect(world.fundingCalls).toHaveLength(0);
    expect(world.hydrationErrors()).toEqual([]);
  });
}

for (const scenario of [
  { name: 'falls back to the offer price', fundedUsdc: undefined, buyer: 91.719999, amount: '4.29' },
  { name: 'rounds a microscopic shortfall to one cent', fundedUsdc: '96.720001', buyer: 96.72, amount: '0.01' },
  { name: 'does not offer a top-up when the current balance covers the total', fundedUsdc: '96.72', buyer: 96.72, amount: null },
] as const) {
  test(`short-balance recovery ${scenario.name}`, async ({ page }, testInfo) => {
    const edgeOffer = offer('o-edge', SELLER_A, '96', 1);
    if (scenario.fundedUsdc === undefined) delete edgeOffer.fundedUsdc;
    else edgeOffer.fundedUsdc = scenario.fundedUsdc;
    await open(page, { role: 'buyer', offers: [edgeOffer],
      balances: { ...funded, [BUYER_AGENT.toLowerCase()]: scenario.buyer }, accept: { status: 409, code: 'INSUFFICIENT_AGENT_BALANCE' } });
    await page.getByRole('button', { name: /Accept 0x5555/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /Accept 0x5555/ }).click();
    await expect(dialog.getByRole('alert')).toHaveText(topUpMessages.en.offers.errors.topUp);
    if (scenario.amount) {
      await expect(dialog.getByRole('button', { name: `Top up ${scenario.amount} USDC`, exact: true })).toBeVisible();
    } else {
      await expect(dialog.getByRole('button', { name: /^Top up .* USDC$/ })).toHaveCount(0);
    }
    await captureTopUpScreen(page, testInfo, 'offer-cent-boundary', { root: dialog, primary: 1, wholePagePrimary: 1 });
  });
}

test('signed-out visitor sees the count and a sign-in, never prices of offers', async ({ page }) => {
  await open(page, { role: 'visitor', offers: [], count: 2, signedOut: true });
  await expect(page.getByText('2 offers')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in to make an offer' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Make an offer' })).toHaveCount(0);
});
