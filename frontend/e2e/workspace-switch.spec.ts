import { expect, test, type Page } from '@playwright/test';
import { BUYER } from './fixtures';
import { en } from '../shared/i18n/messages/en';

const API = 'http://127.0.0.1:3199';
const profile = { address: BUYER, displayName: 'Bless', handle: 'bless', role: 'buyer', createdAt: 1, updatedAt: 1 };
const base = { status: 'active', ownerAddress: BUYER, walletAddress: BUYER, balanceScope: 'identity', createdAt: 1, updatedAt: 1 };
const personal = { ...base, id: 'ws-personal', kind: 'personal', name: 'Bless' };
const business = { ...base, id: 'ws-business', kind: 'business', name: 'B-Fame Tech', business: { legalName: 'B-Fame Tech', verificationStatus: 'not_started' } };

async function signedInWithBusinessActive(page: Page, opts: { saved?: boolean; workspaces?: unknown[] } = {}) {
  await page.addInitScript(([key, id, saved]) => {
    localStorage.setItem('karwan:guide:disabled', '1');
    if (saved) localStorage.setItem(key, id);
  }, [`karwan:active-workspace:${BUYER.toLowerCase()}`, business.id, opts.saved === false ? '' : '1']);
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/auth/bootstrap') {
      return route.fulfill({ json: { user: { address: BUYER, method: 'circle', hasPasskey: true }, profile } });
    }
    if (pathname === '/api/profile') return route.fulfill({ json: { profile } });
    if (pathname === '/api/workspaces') return route.fulfill({ json: { workspaces: opts.workspaces ?? [personal, business], wallet: { address: BUYER, balanceScope: 'identity' } } });
    if (route.request().method() !== 'GET') return route.fulfill({ status: 403, body: '' });
    return route.fulfill({ json: { items: [], events: [], movements: [], messages: [] } });
  });
}

test('from the business profile you can switch back to your personal account', async ({ page }) => {
  await signedInWithBusinessActive(page);
  await page.goto('/profile/business');
  await page.getByRole('button', { name: `${en.businessProfilePage.label}: ${business.name}` }).click();
  await page.getByRole('button', { name: new RegExp(en.onboarding.accountTypeStep.individual.title) }).click();
  await expect(page).toHaveURL(/\/app$/);
  const active = await page.evaluate((key) => localStorage.getItem(key), `karwan:active-workspace:${BUYER.toLowerCase()}`);
  expect(active).toBe(personal.id);
});

test('an account that signed up as a business opens on it and can still switch to personal', async ({ page }) => {
  await signedInWithBusinessActive(page, { saved: false, workspaces: [business, personal] });
  await page.goto('/profile/business');
  await page.getByRole('button', { name: `${en.businessProfilePage.label}: ${business.name}` }).click();
  await page.getByRole('button', { name: new RegExp(en.onboarding.accountTypeStep.individual.title) }).click();
  const active = await page.evaluate((key) => localStorage.getItem(key), `karwan:active-workspace:${BUYER.toLowerCase()}`);
  expect(active).toBe(personal.id);
});

test('an unverified business shows its status, not an action that does nothing', async ({ page }) => {
  await signedInWithBusinessActive(page);
  await page.goto('/profile/business');
  await expect(page.getByText(en.account.kind.notVerified, { exact: true })).toBeVisible();
  await expect(page.getByText(en.businessProfilePage.setup, { exact: true })).toHaveCount(0);
});
