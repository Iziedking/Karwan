import { expect, test, type Page } from '@playwright/test';
import { API, ME, funded, serveMoney } from './moneyFixtures';
import { en } from '../shared/i18n/messages/en';
import { ar } from '../shared/i18n/messages/ar';

/// The Deal guarantee page, Legacy contracts and their Profile rows (view 37).

const g = en.dealGuarantee;
const OLD_ESCROW = '0x4879000000000000000000000000000000007301';
const OLD_VAULT = '0x2d45000000000000000000000000000000000c5a';
const SELLER = '0x5555555555555555555555555555555555555555';
const JOB = `0x${'d'.repeat(64)}`;

const profile = { address: ME, displayName: 'Ada', handle: 'ada', role: 'seller', createdAt: 1, updatedAt: 1 };

const guarantee = {
  available: true,
  hasRecord: true,
  inPlaceUsdc: '125',
  heldUsdc: '0',
  freeUsdc: '125',
  comingBackUsdc: '0',
  readyAt: null,
  ready: false,
  previousUsdc: '40',
  waitDays: 7,
};

const positions = {
  deals: [
    { contract: OLD_ESCROW, jobId: JOB, role: 'buyer', otherSide: SELLER, amountUsdc: '60', state: 'funded', steps: ['releaseFinal', 'refund'], heldByKarwan: false },
  ],
  guarantees: [
    { contract: OLD_VAULT, positionId: '3', amountUsdc: '40', state: 'in_place', readyAt: null, steps: ['requestWithdraw'], heldByKarwan: false, previous: true },
    { contract: OLD_VAULT, positionId: '4', amountUsdc: '15', state: 'in_place', readyAt: null, steps: [], heldByKarwan: true, previous: true },
  ],
};

async function serveGuarantee(page: Page, steps: unknown[] = []) {
  await serveMoney(page, { balances: funded });
  await page.route(`${API}/api/profile**`, (route) => route.fulfill({ json: { profile } }));
  await page.route(`${API}/api/guarantee`, (route) => route.fulfill({ json: guarantee }));
  await page.route(`${API}/api/legacy/positions`, (route) => route.fulfill({ json: positions }));
  await page.route(`${API}/api/legacy/step`, async (route) => {
    steps.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true, txHash: `0x${'ab'.repeat(32)}`, amountUsdc: '40' } });
  });
}

test('Profile shows the deal guarantee with its amount, and Legacy contracts under Other', async ({ page }) => {
  await serveGuarantee(page);
  await page.goto('/profile');
  const row = page.getByRole('link', { name: new RegExp(g.profile.dealGuarantee) });
  await expect(row).toHaveAttribute('href', '/guarantee');
  await expect(row).toContainText('125 USDC');
  await expect(page.getByRole('link', { name: g.profile.legacyContracts })).toHaveAttribute('href', '/legacy');
});

test('the old staking address opens the deal guarantee, with a quiet way to the previous contract', async ({ page }) => {
  await serveGuarantee(page);
  await page.goto('/stake');
  await expect(page).toHaveURL(/\/guarantee$/);
  await expect(page.getByText('125 USDC').first()).toBeVisible();
  await expect(page.getByText(g.previous.line.replace('{amount}', '40'))).toBeVisible();
  await expect(page.getByRole('link', { name: g.previous.link })).toHaveAttribute('href', '/legacy#previous-guarantee');
  await expect(page.getByText(/\b(stake|staking|vault|insurance)\b/i)).toHaveCount(0);
});

test('Legacy contracts lists older deals and guarantees, and each step is confirmed first', async ({ page }) => {
  const steps: unknown[] = [];
  await serveGuarantee(page, steps);
  await page.goto('/legacy');
  await expect(page.getByRole('heading', { name: new RegExp(g.legacy.title) })).toBeVisible();
  await expect(page.getByText(g.legacy.withWho.replace('{who}', '0x5555…5555'))).toBeVisible();

  const held = page.locator('#previous-guarantee');
  await expect(held.getByRole('heading', { name: g.legacy.guarantees })).toBeVisible();
  await expect(held.getByText(g.legacy.heldByKarwan)).toBeVisible();

  await held.getByRole('button', { name: g.legacy.steps.requestWithdraw }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  expect(steps).toHaveLength(0);
  await sheet.getByRole('button', { name: g.legacy.steps.requestWithdraw }).click();
  await expect(page.getByText(g.legacy.done.replace('{amount}', '40'))).toBeVisible();
  expect(steps).toEqual([{ kind: 'guarantee', contract: OLD_VAULT, ref: '3', step: 'requestWithdraw' }]);
});

test('releasing an older deal says it cannot be undone before anything moves', async ({ page }) => {
  await serveGuarantee(page);
  await page.goto('/legacy');
  await page.getByRole('button', { name: g.legacy.steps.releaseFinal }).click();
  await expect(page.getByRole('dialog').getByText(g.legacy.releaseWarning)).toBeVisible();
});

test('Legacy contracts reads right to left in Arabic', async ({ page }) => {
  await page.context().addCookies([{ name: 'karwan-locale', value: 'ar', domain: '127.0.0.1', path: '/' }]);
  await serveGuarantee(page);
  await page.goto('/legacy');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: new RegExp(ar.dealGuarantee.legacy.title) })).toBeVisible();
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(scroll).toBeLessThanOrEqual(1);
});

test('both pages fit the screen in the dark theme', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('karwan-theme', 'dark'));
  await serveGuarantee(page);
  for (const route of ['/guarantee', '/legacy']) {
    await page.goto(route);
    await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe('dark');
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(scroll, route).toBeLessThanOrEqual(1);
  }
});
