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

async function mockApi(page: Page, opts: { signedInAs?: string; request?: Record<string, unknown>; onCreate?: (body: unknown) => void } = {}) {
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
    if (pathname === `/api/deposit/requests/${TOKEN}`) return route.fulfill({ json: { request: opts.request ?? openRequest } });
    if (pathname === '/api/deposit/requests' && method === 'POST') {
      opts.onCreate?.(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: { request: openRequest } });
    }
    if (pathname.startsWith('/api/profile')) {
      return route.fulfill({ json: { profile: { address: SELLER, displayName: 'Kingizie', handle: 'izieking' } } });
    }
    if (pathname === '/api/reputation') return route.fulfill({ json: { score: 809, tier: 'ESTABLISHED', successCount: 20 } });
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
