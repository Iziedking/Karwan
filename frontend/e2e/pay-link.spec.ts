import { expect, test, type Page } from '@playwright/test';
import { BUYER, SELLER } from './fixtures';
import { en } from '../shared/i18n/messages/en';
import { serveTopUpTokenBalances } from './instantTopUpFixtures';

const API = 'http://127.0.0.1:3199';
const TOKEN = 'req-token-1';
const copy = en.payLink;
const DEPOSIT_ADDRESS = '0x7711886865c33606ebd977da02a6a25373c75a35';

const openRequest = {
  requestId: TOKEN,
  recipientAddress: SELLER,
  amountUsdc: '10',
  purpose: 'Logo, first draft',
  expiresAt: Date.now() + 6 * 86_400_000,
  status: 'open',
  createdAt: Date.now(),
  acceptedChains: ['Ethereum', 'Base'],
};

async function mockApi(page: Page, opts: { signedInAs?: string; request?: Record<string, unknown> | (() => Record<string, unknown>); onReceive?: () => void; reputation?: Record<string, unknown>; onCreate?: (body: unknown) => void } = {}) {
  await page.addInitScript(() => localStorage.setItem('karwan:guide:disabled', '1'));
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();
    if (pathname === '/api/auth/bootstrap') {
      return route.fulfill({ json: opts.signedInAs ? { user: { address: opts.signedInAs, method: 'circle', hasPasskey: true }, profile: null } : { user: null, profile: null } });
    }
    if (pathname === '/api/deposit/address') {
      return route.fulfill({ json: { supported: true, chains: [{ key: 'base', name: 'Base', address: DEPOSIT_ADDRESS }, { key: 'eth', name: 'Ethereum', address: DEPOSIT_ADDRESS }], solana: null } });
    }
    const current = () => (typeof opts.request === 'function' ? opts.request() : opts.request ?? openRequest);
    if (pathname === `/api/deposit/requests/${TOKEN}`) return route.fulfill({ json: { request: current() } });
    if (pathname === `/api/deposit/requests/${TOKEN}/receive` && method === 'POST') {
      opts.onReceive?.();
      return route.fulfill({ json: { request: current() } });
    }
    if (pathname === '/api/deposit/requests' && method === 'POST') {
      opts.onCreate?.(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: { request: openRequest } });
    }
    if (pathname.startsWith('/api/profile')) {
      return route.fulfill({ json: { profile: { address: SELLER, displayName: 'Kingizie', handle: 'izieking' } } });
    }
    if (pathname === '/api/reputation') return route.fulfill({ json: opts.reputation ?? { score: 809, tier: 'ESTABLISHED', successCount: 20 } });
    if (method !== 'GET') return route.fulfill({ status: 403, body: '' });
    return route.fulfill({ json: { items: [], events: [], movements: [], messages: [] } });
  });
}

test('a payment link opens its own page: who asks, how much, Arc first, one button', async ({ page }) => {
  await mockApi(page);
  await page.goto(`/deposit/request/${TOKEN}`);
  await expect(page.getByText('Kingizie', { exact: true })).toBeVisible();
  await expect(page.getByText('@izieking · ESTABLISHED · 20 deals')).toBeVisible();
  await expect(page.getByText(copy.pay.forTemplate.replace('{purpose}', 'Logo, first draft'))).toBeVisible();
  const chips = page.getByRole('radiogroup', { name: copy.pay.payFrom }).getByRole('radio');
  await expect(chips.first()).toHaveText(copy.pay.arc);
  await expect(chips.first()).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: copy.pay.connect })).toBeVisible();
  // No deposit card, no recipient picker, no contract warning.
  await expect(page.getByText(/Contract address/)).toHaveCount(0);
  await expect(page.getByText(/Choose recipient/i)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('a sealed record shows the requester tier, never a deal count', async ({ page }) => {
  await mockApi(page, { reputation: { sealed: true, address: SELLER, displayName: 'Kingizie', tag: 'izieking', tier: 'ESTABLISHED', reasons: ['HAS_COMPLETED_DEALS'], memberSince: null } });
  await page.goto(`/deposit/request/${TOKEN}`);
  await expect(page.getByText('@izieking · Tier Established')).toBeVisible();
  await expect(page.getByText(/\d+ deals/)).toHaveCount(0);
});

test('a paid request says so, and the requester sees their own link to share', async ({ page }) => {
  await mockApi(page, { request: { ...openRequest, status: 'matched', paidAt: Date.now(), paidChain: 'Arc' } });
  await page.goto(`/deposit/request/${TOKEN}`);
  await expect(page.getByText(copy.pay.paidBadge, { exact: true })).toBeVisible();
  await expect(page.getByText(`${copy.pay.paid.replace('{amount}', '10')} ${copy.pay.paidTo.replace('{name}', '@izieking')}`)).toBeVisible();

  const owner = await page.context().newPage();
  await mockApi(owner, { signedInAs: SELLER });
  await owner.goto(`/deposit/request/${TOKEN}`);
  await expect(owner.getByText(copy.pay.yours)).toBeVisible();
  await expect(owner.getByRole('button', { name: copy.create.copy })).toBeVisible();
  await expect(owner.getByRole('button', { name: en.nav.backAria })).toBeVisible();
});

test('any signed-in account creates a link that lasts a week', async ({ page }) => {
  let created: unknown = null;
  await mockApi(page, { signedInAs: BUYER, onCreate: (body) => (created = body) });
  await page.goto('/request');
  await expect(page.getByRole('heading', { name: copy.create.title })).toBeVisible();
  const create = page.getByRole('button', { name: copy.create.create });
  await expect(create).toBeDisabled();
  await page.getByPlaceholder('0').fill('10');
  await page.getByPlaceholder(copy.create.forPlaceholder).fill('Logo, first draft');
  await create.click();
  await expect(page.getByRole('heading', { name: copy.create.ready })).toBeVisible();
  await expect(page.getByText(`/deposit/request/${TOKEN}`)).toBeVisible();
  expect(created).toEqual({ amountUsdc: '10', purpose: 'Logo, first draft', ttlMinutes: 7 * 24 * 60 });
});

test('no wallet: the exchange route is a small link under the wallet button', async ({ page }) => {
  await mockApi(page);
  await page.goto(`/deposit/request/${TOKEN}`);
  await expect(page.getByRole('button', { name: copy.pay.connect })).toBeVisible();
  await expect(page.getByRole('button', { name: copy.pay.useEmail })).toBeVisible();
});

test('an account short of the amount gets its address, and Pay lights once the USDC lands', async ({ page }) => {
  const balances: Record<string, number> = { [BUYER.toLowerCase()]: 4 };
  await serveTopUpTokenBalances(page, balances);
  await mockApi(page, { signedInAs: BUYER });
  await page.goto(`/deposit/request/${TOKEN}`);
  await expect(page.getByRole('heading', { name: /Send 6(\.00)? USDC to pay @izieking/ })).toBeVisible();
  await expect(page.getByText(DEPOSIT_ADDRESS)).toBeVisible();
  await expect(page.getByText(copy.pay.fundWaiting)).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: copy.pay.payFrom })).toHaveCount(0);
  const pay = page.getByRole('button', { name: copy.pay.payCta.replace('{amount}', '10') });
  await expect(pay).toBeDisabled();

  balances[BUYER.toLowerCase()] = 12;
  await expect(pay).toBeEnabled({ timeout: 20_000 });
  await expect(page.getByText(copy.pay.fundWaiting)).toHaveCount(0);
});

const RECEIVING = '0x5a1e000000000000000000000000000000000abc';
const SOLANA = 'So1anaReceive1111111111111111111111111111';

test('pay with: wallet first, any chain when available, card and USSD shown as coming soon and inert', async ({ page }) => {
  await mockApi(page, { request: { ...openRequest, anyChain: true } });
  await page.goto(`/deposit/request/${TOKEN}`);
  const options = page.getByRole('radiogroup', { name: copy.pay.payWith });
  await expect(options.getByRole('radio', { name: new RegExp(copy.pay.optWallet) })).toHaveAttribute('aria-checked', 'true');
  await expect(options.getByRole('radio', { name: new RegExp(copy.pay.optChain) })).toBeVisible();
  await expect(options.getByText(copy.pay.optCard)).toBeVisible();
  await expect(options.getByText(copy.pay.optUssd)).toBeVisible();
  await expect(options.getByText(copy.pay.soon)).toHaveCount(2);
  await expect(options.getByRole('radio', { name: new RegExp(copy.pay.optCard) })).toHaveCount(0);
});

test('send from any chain: the request address, the exact amount, part payment, then paid and an account offer', async ({ page }) => {
  let state: Record<string, unknown> = { ...openRequest, anyChain: true };
  let asked = 0;
  await mockApi(page, {
    request: () => state,
    onReceive: () => {
      asked += 1;
      state = { ...state, receiving: { evm: { address: RECEIVING, chains: ['Ethereum', 'Base', 'Arbitrum', 'Polygon'] }, solana: { address: SOLANA } } };
    },
  });
  await page.goto(`/deposit/request/${TOKEN}`);
  await page.getByRole('radio', { name: new RegExp(copy.pay.optChain) }).click();
  await expect(page.getByText(RECEIVING)).toBeVisible();
  expect(asked).toBe(1);
  await expect(page.getByText('10 USDC', { exact: true })).toBeVisible();
  await expect(page.getByText(copy.pay.watching)).toBeVisible();
  await page.getByRole('radio', { name: copy.pay.solanaTab }).click();
  await expect(page.getByText(SOLANA)).toBeVisible();

  state = { ...state, receivedUsdc: '6', remainingUsdc: '4', payments: [{ amountUsdc: '6', chain: 'Base', at: Date.now(), delivery: 'moving' }] };
  await expect(page.getByText(copy.pay.partReceived.replace('{got}', '6').replace('{total}', '10').replace('{left}', '4'))).toBeVisible({ timeout: 15_000 });

  state = {
    ...state,
    status: 'matched',
    paidAt: Date.now(),
    paidChain: 'Base',
    receivedUsdc: '10',
    remainingUsdc: '0',
    payments: [
      { amountUsdc: '6', chain: 'Base', at: Date.now(), delivery: 'delivered' },
      { amountUsdc: '4', chain: 'Base', at: Date.now(), delivery: 'moving' },
    ],
  };
  await expect(page.getByText(copy.pay.stepMoving)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(copy.pay.canClose.replace('{name}', '@izieking'))).toBeVisible();

  state = { ...state, payments: [{ amountUsdc: '6', chain: 'Base', at: Date.now(), delivery: 'delivered' }, { amountUsdc: '4', chain: 'Base', at: Date.now(), delivery: 'delivered' }] };
  await expect(page.getByText(copy.pay.paidBadge, { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(copy.pay.joinTitle)).toBeVisible();
  await expect(page.getByRole('button', { name: copy.pay.joinCta })).toBeVisible();
  await expect(page.getByRole('button', { name: copy.pay.done })).toHaveCount(0);
});

test('a paid request never sends a signed-in payer to the landing page', async ({ page }) => {
  await mockApi(page, { signedInAs: BUYER, request: { ...openRequest, status: 'matched', paidAt: Date.now(), paidChain: 'Arc' } });
  await page.goto(`/deposit/request/${TOKEN}`);
  await page.getByRole('button', { name: copy.pay.goHome }).click();
  await expect(page).toHaveURL(/\/app$/);
});

test('a paid request saves its receipt as an image', async ({ page }) => {
  await mockApi(page, { request: { ...openRequest, status: 'matched', paidAt: Date.now(), paidChain: 'Base' } });
  await page.goto(`/deposit/request/${TOKEN}`);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: copy.pay.saveReceipt }).click();
  expect((await download).suggestedFilename()).toMatch(/^karwan-receipt-.+\.png$/);
});
