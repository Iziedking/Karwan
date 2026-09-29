import { expect, test, type Page, type Route } from '@playwright/test';
import { API, BUYER_AGENT, funded, ME, TX, watchHydration } from './moneyFixtures';
import { JOB, makeJob, serveSearch } from './searchFixtures';
import { deliveredDeal, JOB as DEAL_JOB } from './fixtures';
import type { DirectDeal, DirectDealFundingQuote } from '../core/api';
import {
  assertTopUpAppearance, blockTopUpProviders, captureTopUpScreen, checkTopUpKeyboardFocus,
  gatewayBalance, noProtocolWords, prepareTopUpAppearance, topUpBefore, topUpEvidenceManifest,
  topUpMainnet, topUpMessages, serveTopUpTokenBalances, type TopUpLocale, type TopUpTheme,
} from './instantTopUpFixtures';

type FundingWorld = {
  confirmed?: string;
  pending?: string;
  balanceError?: boolean;
  deposit?: (route: Route) => Promise<void>;
  fund?: (route: Route) => Promise<void>;
  fundHold?: Promise<void>;
  deal?: DirectDeal;
};

const dealQuote: DirectDealFundingQuote = {
  settlementCurrency: 'USDC', localCurrencyConversion: 'not-provided',
  dealAmountUsdc: '1200', buyerFeeUsdc: '9', sellerFeeUsdc: '9', feeTotalUsdc: '18',
  fundedAmountUsdc: '1209', sellerNetUsdc: '1191', feeBps: 75,
  quotedAt: Date.UTC(2026, 8, 29), quoteFingerprint: `0x${'12'.repeat(32)}`,
};

function dealNeedingFunds(): DirectDeal {
  const deal: DirectDeal = {
    ...deliveredDeal, delivered: false, receiptReferences: [], agreementDigest: `0x${'34'.repeat(32)}`,
    view: {
      stage: 'awaiting-funding', money: { line: 'not-funded' },
      progress: [{ step: 'agreed', state: 'done' }, { step: 'funded', state: 'current' },
        { step: 'delivered', state: 'upcoming' }, { step: 'checked', state: 'upcoming' }, { step: 'released', state: 'upcoming' }],
      next: { action: 'fund', actor: 'you', amountUsdc: '1200' }, automatic: null,
    },
  };
  delete deal.acceptedAt;
  delete deal.deliveredAt;
  deal.onChain = null;
  return deal;
}

async function open(page: Page, path: string, theme: TopUpTheme, locale: TopUpLocale, world: FundingWorld = {}) {
  const hydrationErrors = watchHydration(page);
  await prepareTopUpAppearance(page, theme, locale);
  const balances = { ...funded, [BUYER_AGENT.toLowerCase()]: 91.72 };
  await serveSearch(page, { balances, job: makeJob() });
  await blockTopUpProviders(page);
  await serveTopUpTokenBalances(page, balances);
  let acceptCalls = 0;
  let confirmed = world.confirmed ?? '40';
  let deal = world.deal;
  const depositCalls: Record<string, unknown>[] = [];
  const fundCalls: Record<string, unknown>[] = [];
  const dealFundCalls: Record<string, unknown>[] = [];
  await page.route(`${API}/**`, async route => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === '/api/gateway/balance') {
      return world.balanceError
        ? route.fulfill({ status: 503, json: { error: 'Balance unavailable' } })
        : route.fulfill({ json: { balance: gatewayBalance(confirmed, world.pending ?? '8') } });
    }
    if (url.pathname === '/api/gateway/refresh') return route.fulfill({ json: { ok: true } });
    if (url.pathname === '/api/research/status') {
      return route.fulfill({ json: { active: false, creditUsdc: 0, priceUsdc: 1.5 } });
    }
    if (url.pathname === '/api/research/agentkit/status') {
      return route.fulfill({ json: {
        verification: 'not-checked', provider: 'world-agentbook', mode: 'unavailable',
        allowancePolicy: { scope: 'counterparty-report', reportsPer24Hours: 5 }, allowance: null,
      } });
    }
    if (url.pathname === '/api/money/capabilities') {
      return route.fulfill({ json: {
        settlementHome: 'Arc', supportedAsset: 'USDC',
        capabilities: [
          { rail: 'gateway_deposit', direction: 'in', state: 'live', provider: 'circle' },
          { rail: 'cctp_deposit', direction: 'in', state: 'live', provider: 'circle' },
          { rail: 'arc_transfer', direction: 'out', state: 'live', provider: 'arc' },
          { rail: 'bank_deposit', direction: 'in', state: 'unavailable', provider: 'none' },
          { rail: 'bank_withdrawal', direction: 'out', state: 'unavailable', provider: 'none' },
        ],
      } });
    }
    if (url.pathname === '/api/gateway/deposit' && method === 'POST') {
      depositCalls.push(route.request().postDataJSON() as Record<string, unknown>);
      if (world.deposit) return world.deposit(route);
      return route.fulfill({ json: { ok: true, gatewayAddress: ME, amountUsd: 4.25, source: 'identity',
        depositTxHash: TX, reference: 'KWN-2026-ADD-0001', movementState: 'submitted' } });
    }
    if (url.pathname === '/api/gateway/fund-agent' && method === 'POST') {
      const body = route.request().postDataJSON() as { agent: string; amountUsdc: number; requestId: string };
      fundCalls.push(body);
      if (world.fund) return world.fund(route);
      const buyerBalance = balances[BUYER_AGENT.toLowerCase()];
      if (buyerBalance === undefined) return route.fulfill({ status: 503, json: { error: 'Agent balance unavailable', code: 'unavailable' } });
      if (body.agent !== 'buyer' || !(body.amountUsdc > 0) || Number(confirmed) < body.amountUsdc) {
        return route.fulfill({ status: 409, json: { error: 'Insufficient confirmed USDC', code: 'insufficient_balance' } });
      }
      if (world.fundHold) await world.fundHold;
      balances[BUYER_AGENT.toLowerCase()] = buyerBalance + body.amountUsdc;
      confirmed = String(Number(confirmed) - body.amountUsdc);
      return route.fulfill({ json: { ok: true, agent: 'buyer', recipientAddress: BUYER_AGENT, amountUsd: body.amountUsdc,
        txHash: TX, reference: 'KWN-2026-TOPUP-0002', movementState: 'completed' } });
    }
    if (deal && url.pathname === `/api/deals/direct/${deal.jobId}`) return route.fulfill({ json: { deal } });
    if (deal && url.pathname === `/api/deals/direct/${deal.jobId}/movements`) return route.fulfill({ json: { movements: [] } });
    if (deal && url.pathname === `/api/chat/${deal.jobId}`) return route.fulfill({ json: { messages: [], writable: true, closedReason: null } });
    if (deal && url.pathname === `/api/deals/direct/${deal.jobId}/funding-quote`) return route.fulfill({ json: { quote: dealQuote } });
    if (deal && url.pathname === `/api/deals/direct/${deal.jobId}/fund` && method === 'POST') {
      dealFundCalls.push(route.request().postDataJSON() as Record<string, unknown>);
      const buyerBalance = balances[BUYER_AGENT.toLowerCase()];
      if (buyerBalance === undefined) return route.fulfill({ status: 503, json: { error: 'Agent balance unavailable', code: 'unavailable' } });
      if (buyerBalance < Number(dealQuote.fundedAmountUsdc)) {
        return route.fulfill({ status: 409, json: { error: 'Agent balance is short', code: 'INSUFFICIENT_AGENT_BALANCE' } });
      }
      balances[BUYER_AGENT.toLowerCase()] = buyerBalance - Number(dealQuote.fundedAmountUsdc);
      deal = { ...deal, acceptedAt: Date.now(), updatedAt: Date.now(), fundTxHash: TX,
        view: { stage: 'awaiting-delivery', money: { line: 'held' },
          progress: [{ step: 'agreed', state: 'done' }, { step: 'funded', state: 'done' },
            { step: 'delivered', state: 'current' }, { step: 'checked', state: 'upcoming' }, { step: 'released', state: 'upcoming' }],
          next: { action: 'deliver', actor: 'counterparty', amountUsdc: null }, automatic: null } };
      return route.fulfill({ json: { accepted: true, jobId: deal.jobId, status: 'funded', txHash: TX,
        reference: 'KWN-2026-FUND-0003', quote: dealQuote } });
    }
    if (url.pathname === `/api/jobs/${JOB}/offers` && method === 'GET') {
      return route.fulfill({ json: { count: 1, role: 'buyer', request: {
        briefText: 'Logo and brand kit for a Lagos bakery. Logo, colours and a one page guide.',
        budgetUsdc: '120', deadlineUnix: Math.floor(Date.now() / 1000) + 5 * 86_400,
      }, offers: [{ id: 'instant-topup-offer', jobId: JOB, sellerUser: '0x5555555555555555555555555555555555555555',
        priceUsdc: '96', fundedUsdc: '96.725', deliverByUnix: Math.floor(Date.now() / 1000) + 4 * 86_400,
        note: 'Three logo routes, final kit by Saturday.', state: 'pending', createdAt: 1,
        lapsesAt: Math.floor(Date.now() / 1000) + 5 * 86_400 }] } });
    }
    if (/\/offers\/[^/]+\/accept$/.test(url.pathname)) {
      acceptCalls += 1;
      return route.fulfill({ status: 409, json: { error: 'Account needs more USDC', code: 'INSUFFICIENT_AGENT_BALANCE' } });
    }
    return route.fallback();
  });
  await page.goto(path);
  await assertTopUpAppearance(page, theme, locale);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  return { depositCalls, fundCalls, dealFundCalls, acceptCalls: () => acceptCalls, hydrationErrors };
}

function profileFundingCard(page: Page, locale: TopUpLocale) {
  return page.getByRole('heading', { name: topUpMessages[locale].arcFundCard.header.title, exact: true })
    .locator('xpath=ancestor::section[1]');
}

test.afterEach(async ({}, testInfo) => topUpEvidenceManifest(testInfo));

for (const theme of ['light', 'dark'] as const) {
  for (const locale of ['en', 'ar'] as const) {
    test(`default add-money page keeps its current route clear, ${theme} ${locale}`, async ({ page }, testInfo) => {
      const copy = topUpMessages[locale];
      const world = await open(page, '/bridge', theme, locale);
      await expect(page.getByRole('heading', { name: copy.money.cross.titleAdd, exact: true })).toBeVisible();
      if (!topUpBefore) {
        await noProtocolWords(page);
        await checkTopUpKeyboardFocus(page, page.getByRole('button', { name: copy.money.cross.history, exact: true }), testInfo, 'default-money-history');
      }
      await captureTopUpScreen(page, testInfo, 'bridge-default-money');
      expect(world.depositCalls).toHaveLength(0);
      expect(world.fundCalls).toHaveLength(0);
      expect(world.hydrationErrors()).toEqual([]);
    });

    test(`add money shows its existing top-up rail, ${theme} ${locale}`, async ({ page }, testInfo) => {
      const copy = topUpMessages[locale];
      const world = await open(page, '/bridge?money=v1&rail=gateway', theme, locale);
      const tab = page.getByRole('tab', { name: copy.depositRails.gateway.tab, exact: true });
      await expect(tab).toBeVisible();
      if (!topUpBefore) {
        await noProtocolWords(page);
        await checkTopUpKeyboardFocus(page, tab, testInfo, 'instant-topup-tab');
      }
      await captureTopUpScreen(page, testInfo, 'bridge-classic-topup-route');
      await tab.click();
      const card = page.locator('[data-guide="bridge-gateway"]');
      await expect(card).toBeVisible();
      await expect(card.getByPlaceholder('0.00', { exact: true })).toBeVisible();
      if (topUpBefore) {
        // The canonical label renderer removes bracket markers in every locale.
        await expect(page.locator('body')).toContainText(/Gateway/i);
        await captureTopUpScreen(page, testInfo, 'bridge-instant-topup');
      } else {
        await expect(tab).toContainText(copy.depositRails.gateway.tab);
        await expect(card.getByRole('button', { name: copy.gatewayCard.cta, exact: true })).toBeDisabled();
        await captureTopUpScreen(page, testInfo, 'bridge-instant-topup', { root: card, primary: 1, maxHeadingWeight: 500 });
      }
      expect(world.depositCalls).toHaveLength(0);
      expect(world.fundCalls).toHaveLength(0);
      expect(world.hydrationErrors()).toEqual([]);
    });

    test(`profile keeps funding words out of account navigation, ${theme} ${locale}`, async ({ page }, testInfo) => {
      const world = await open(page, '/profile', theme, locale);
      await expect(page.locator('.product-surface').last()).toBeVisible();
      await captureTopUpScreen(page, testInfo, 'profile-account-hub', { maxHeadingWeight: 600 });
      expect(world.depositCalls).toHaveLength(0);
      expect(world.fundCalls).toHaveLength(0);
      expect(world.hydrationErrors()).toEqual([]);
    });

    test(`profile funding shows the available amount in context, ${theme} ${locale}`, async ({ page }, testInfo) => {
      test.skip(topUpMainnet, 'Agent funding is a testnet capability; mainnet account navigation is covered separately.');
      const copy = topUpMessages[locale];
      const world = await open(page, '/profile/agent-funds?money=v1', theme, locale);
      const card = profileFundingCard(page, locale);
      await expect(card).toBeVisible();
      const amount = card.getByPlaceholder('0.00', { exact: true });
      await expect(amount).toBeVisible();
      await amount.fill('5');
      await expect(card.getByText(copy.gatewayTopUp.availableTemplate.replace('{amount}', '40'), { exact: true })).toBeVisible();
      await expect(card.getByRole('button', { name: copy.gatewayTopUp.cta, exact: true })).toBeEnabled();
      if (topUpBefore) {
        await expect(page.locator('body')).toContainText(copy.gatewayTopUp.availableTemplate.replace('{amount}', '40'));
      } else {
        await noProtocolWords(page);
        await checkTopUpKeyboardFocus(page, amount, testInfo, 'profile-topup-amount');
      }
      await captureTopUpScreen(page, testInfo, 'profile-topup-ready', { root: card, primary: 1, wholePagePrimary: 1, maxHeadingWeight: 500 });
      const surface = page.locator('main.profile-route.product-surface');
      await expect(surface).toBeVisible();
      if (!topUpBefore) {
        const heading = surface.getByRole('heading', { level: 1 });
        const frame = page.locator('main.profile-route > div > section');
        await expect(heading).toHaveCount(1);
        await expect(frame).toHaveCount(1);
        const headingStyle = await heading.evaluate(element => {
          const style = getComputedStyle(element);
          return { fontWeight: style.fontWeight, fontSize: style.fontSize, letterSpacing: style.letterSpacing };
        });
        const frameStyle = await frame.evaluate(element => {
          const style = getComputedStyle(element);
          return { borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
            boxShadow: style.boxShadow, borderRadius: style.borderRadius };
        });
        await testInfo.attach('profile-agent-funds-frame', {
          body: JSON.stringify({ heading: headingStyle, frame: frameStyle }, null, 2), contentType: 'application/json',
        });
        expect(headingStyle.fontWeight).toBe('500');
        expect(headingStyle.fontSize).toBe((page.viewportSize()?.width ?? 0) >= 640 ? '40px' : '36px');
        expect(['normal', '0px']).toContain(headingStyle.letterSpacing);
        expect(frameStyle.borders).toEqual(['0px', '0px', '0px', '0px']);
        expect(frameStyle.boxShadow).toBe('none');
        expect(frameStyle.borderRadius).toBe('20px');
      }
      await captureTopUpScreen(page, testInfo, 'profile-agent-funds-surface', { root: surface, wholePagePrimary: 1, maxHeadingWeight: 500 });
      expect(world.depositCalls).toHaveLength(0);
      expect(world.fundCalls).toHaveLength(0);
      expect(world.hydrationErrors()).toEqual([]);
    });

    test(`offer shortfall remains in the existing confirmation sheet, ${theme} ${locale}`, async ({ page }, testInfo) => {
      test.skip(!topUpBefore || topUpMainnet, 'This is the committed-source comparison; the after acceptance sequence is in offers.spec.ts.');
      const copy = topUpMessages[locale];
      const world = await open(page, `/jobs/${JOB}`, theme, locale);
      const acceptName = copy.offers.accept.replace('{seller}', '0x5555…5555').replace('{price}', '96');
      await page.getByRole('button', { name: acceptName, exact: true }).click();
      const sheet = page.getByRole('dialog', { name: copy.offers.confirmTitle, exact: true });
      await sheet.getByRole('button', { name: acceptName, exact: true }).click();
      await expect(sheet.getByRole('alert')).toHaveText(copy.offers.errors.topUp);
      await expect(sheet.locator('[data-testid="offer-top-up"]')).toHaveCount(0);
      await expect(sheet.getByLabel(copy.fundAgentOptions.amount.label, { exact: true })).toHaveCount(0);
      expect(world.acceptCalls()).toBe(1);
      expect(world.fundCalls).toHaveLength(0);
      await captureTopUpScreen(page, testInfo, 'offer-short-before', { root: sheet });
    });

    test(`mainnet keeps the unavailable offer route at the account boundary, ${theme} ${locale}`, async ({ page }, testInfo) => {
      test.skip(!topUpMainnet, 'Only the mainnet build has this deal-route gate.');
      const world = await open(page, `/jobs/${JOB}`, theme, locale);
      await expect(page).toHaveURL(/\/account(?:[?#]|$)/);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect(world.acceptCalls()).toBe(0);
      expect(world.fundCalls).toHaveLength(0);
      await captureTopUpScreen(page, testInfo, 'mainnet-offer-account-boundary', { maxHeadingWeight: 600 });
    });
  }
}

test('adding money keeps the pending approval visible and reports its receipt', async ({ page }, testInfo) => {
  test.skip(topUpBefore, 'The committed-source comparison does not execute fixture funding actions.');
  const copy = topUpMessages.en;
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const world = await open(page, '/bridge?money=v1', 'light', 'en', {
    deposit: async route => {
      await hold;
      await route.fulfill({ json: { ok: true, gatewayAddress: ME, amountUsd: 4.25, source: 'identity',
        depositTxHash: TX, reference: 'KWN-2026-ADD-0001', movementState: 'submitted' } });
    },
  });
  await page.getByRole('tab', { name: copy.depositRails.gateway.tab, exact: true }).click();
  const card = page.locator('[data-guide="bridge-gateway"]');
  await card.getByPlaceholder('0.00', { exact: true }).fill('4.25');
  await card.getByRole('button', { name: copy.gatewayCard.cta, exact: true }).click();
  try {
    await expect.poll(() => world.depositCalls.length).toBe(1);
    expect(world.depositCalls[0]).toMatchObject({ amountUsdc: 4.25, source: 'identity' });
    expect(world.depositCalls[0].requestId).toBeTruthy();
    await expect(card.getByRole('button', { name: copy.gatewayCard.depositing, exact: true })).toBeDisabled();
    await captureTopUpScreen(page, testInfo, 'bridge-adding-pending', { root: card, primary: 1, maxHeadingWeight: 500 });
  } finally {
    release();
  }
  await expect(card).toContainText(copy.gatewayCard.pooled);
  await expect(card).toContainText('KWN-2026-ADD-0001');
  expect(world.depositCalls).toHaveLength(1);
  await captureTopUpScreen(page, testInfo, 'bridge-added-confirming', { root: card, primary: 1, maxHeadingWeight: 500 });
});

test('an unknown add-money error keeps its recovery copy free of protocol words', async ({ page }, testInfo) => {
  test.skip(topUpBefore, 'After-only error-copy coverage.');
  const copy = topUpMessages.en;
  const world = await open(page, '/bridge?money=v1', 'dark', 'en', {
    deposit: route => route.fulfill({ status: 502, json: { error: 'Provider response could not be confirmed', code: 'unavailable' } }),
  });
  await page.getByRole('tab', { name: copy.depositRails.gateway.tab, exact: true }).click();
  const card = page.locator('[data-guide="bridge-gateway"]');
  await card.getByPlaceholder('0.00', { exact: true }).fill('4.25');
  await card.getByRole('button', { name: copy.gatewayCard.cta, exact: true }).click();
  // The exact safe wording is owner-reviewed. This fixture checks that the
  // existing generic failure branch uses that key without exposing the SDK.
  await expect(card).toContainText(copy.gatewayCard.failed);
  expect(world.depositCalls).toHaveLength(1);
  await captureTopUpScreen(page, testInfo, 'bridge-add-unconfirmed-error', { root: card, primary: 1, maxHeadingWeight: 500 });
});

for (const scenario of [
  { name: 'short', confirmed: '2', pending: '0', locale: 'en' as const, theme: 'light' as const },
  { name: 'pending funds are not counted as ready', confirmed: '0', pending: '8', locale: 'ar' as const, theme: 'dark' as const },
] as const) {
  test(`profile top-up ${scenario.name}`, async ({ page }, testInfo) => {
    test.skip(topUpBefore || topUpMainnet, 'After-only testnet agent funding read states.');
    const copy = topUpMessages[scenario.locale];
    const world = await open(page, '/profile/agent-funds?money=v1', scenario.theme, scenario.locale, scenario);
    const card = profileFundingCard(page, scenario.locale);
    await card.getByPlaceholder('0.00', { exact: true }).fill('5');
    await expect(card.getByText(copy.gatewayTopUp.shortTemplate.replace('{have}', scenario.confirmed).replace('{need}', '5'), { exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: copy.gatewayTopUp.fundPool, exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: copy.gatewayTopUp.cta, exact: true })).toHaveCount(0);
    expect(world.fundCalls).toHaveLength(0);
    await captureTopUpScreen(page, testInfo, 'profile-topup-short', { root: card, primary: 1, wholePagePrimary: 1, maxHeadingWeight: 500 });
  });
}

test('profile top-up failure stays in context without another submission', async ({ page }, testInfo) => {
  test.skip(topUpBefore || topUpMainnet, 'After-only testnet agent funding failure.');
  const copy = topUpMessages.en;
  const world = await open(page, '/profile/agent-funds?money=v1', 'dark', 'en', {
    fund: route => route.fulfill({ status: 502, json: { error: 'Provider response could not be confirmed', code: 'unavailable' } }),
  });
  const card = profileFundingCard(page, 'en');
  await card.getByPlaceholder('0.00', { exact: true }).fill('5');
  await card.getByRole('button', { name: copy.gatewayTopUp.cta, exact: true }).click();
  await expect(card).toContainText(copy.gatewayTopUp.failed);
  expect(world.fundCalls).toHaveLength(1);
  await expect(card.getByPlaceholder('0.00', { exact: true })).toHaveValue('5');
  await captureTopUpScreen(page, testInfo, 'profile-topup-unconfirmed-error', { root: card, primary: 1, wholePagePrimary: 1, maxHeadingWeight: 500 });
  expect(world.fundCalls).toHaveLength(1);
});

test('deal recovery keeps the outer confirmation locked until child funding finishes', async ({ page }, testInfo) => {
  test.skip(topUpBefore || topUpMainnet, 'After-only testnet deal funding integration.');
  const copy = topUpMessages.en;
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const world = await open(page, `/deals/${DEAL_JOB}?money=v1`, 'light', 'en', {
    deal: dealNeedingFunds(), confirmed: '1500', pending: '0', fundHold: hold,
  });
  await page.getByRole('button', { name: copy.dealWorkspace.actions.fundTemplate.replace('{amount}', '1,200'), exact: true }).click();
  const dialog = page.getByRole('dialog');
  const confirm = dialog.getByTestId('deal-confirm');
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(dialog.getByRole('alert')).toHaveText(copy.directDealDetail.errors.insufficientBalanceTitle);
  const chooser = dialog.getByTestId('deal-funding-recovery');
  await expect(chooser.getByLabel(copy.fundAgentOptions.amount.label, { exact: true })).toHaveValue('1209');
  await captureTopUpScreen(page, testInfo, 'deal-funding-chooser', { root: dialog, primary: 0, wholePagePrimary: 0 });
  await chooser.getByRole('button', { name: copy.fundAgentOptions.wallet.label, exact: true }).click();
  await captureTopUpScreen(page, testInfo, 'deal-funding-ready', { root: dialog, primary: 1, wholePagePrimary: 1 });
  try {
    await chooser.getByRole('button', { name: copy.gatewayTopUp.fundPool, exact: true }).click();
    await expect.poll(() => world.fundCalls.length).toBe(1);
    expect(world.fundCalls[0]).toMatchObject({ agent: 'buyer', amountUsdc: 1209 });
    expect(world.fundCalls[0].requestId).toBeTruthy();
    await expect(chooser.getByRole('button', { name: copy.gatewayTopUp.moving, exact: true })).toBeDisabled();
    await expect(confirm).toBeDisabled();
    await expect(dialog.getByRole('button', { name: copy.dealWorkspace.confirm.cancel, exact: true })).toBeDisabled();
    await expect(chooser.getByLabel(copy.fundAgentOptions.amount.label, { exact: true })).toBeDisabled();
    for (const route of await chooser.locator('button[aria-pressed]').all()) await expect(route).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    const panel = await dialog.boundingBox();
    const viewport = page.viewportSize();
    if (!panel || !viewport) throw new Error('The deal confirmation sheet must have measurable bounds.');
    await page.mouse.click(panel.y > 1 ? viewport.width / 2 : 1, panel.y > 1 ? 1 : viewport.height / 2);
    await expect(dialog).toBeVisible();
    await expect(chooser).toBeVisible();
    expect(world.dealFundCalls).toHaveLength(1);
    expect(world.fundCalls).toHaveLength(1);
    await captureTopUpScreen(page, testInfo, 'deal-child-funding-pending', { root: dialog, primary: 1, wholePagePrimary: 1 });
  } finally {
    release();
  }
  await expect(chooser).toHaveCount(0);
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(confirm).toBeEnabled();
  await expect(confirm).toBeFocused();
  expect(world.dealFundCalls).toHaveLength(1);
  expect(world.fundCalls).toHaveLength(1);
  await captureTopUpScreen(page, testInfo, 'deal-funded-awaiting-confirm', { root: dialog, primary: 1, wholePagePrimary: 1 });
  expect(world.dealFundCalls).toHaveLength(1);
  await confirm.click();
  await expect(dialog).toBeHidden();
  expect(world.dealFundCalls).toHaveLength(2);
  expect(world.dealFundCalls[1]).toMatchObject({ expectedFeeBps: 75, maxFundedAmountUsdc: '1209', quoteFingerprint: dealQuote.quoteFingerprint,
    expectedAgreementVersion: 3, expectedAgreementDigest: `0x${'34'.repeat(32)}` });
  expect(world.fundCalls).toHaveLength(1);
  expect(world.hydrationErrors()).toEqual([]);
});
