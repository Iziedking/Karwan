import { expect, test, type Page } from '@playwright/test';
import { BUYER } from './fixtures';
import { waysCopy } from '../shared/i18n/messages/ways';

/// How you deal (docs/architecture/26-agents-for-every-deal.md): Profile lists
/// one row per way, and /profile/ways adds one and saves the whole list.

const API = 'http://127.0.0.1:3199';
const c = waysCopy.en;
const profile = {
  address: BUYER, displayName: 'Bless', handle: 'bless', role: 'both', createdAt: 1, updatedAt: 1,
  seller: { skills: ['logo'], bio: 'Logos', minBudgetUsdc: 20, maxBudgetUsdc: 40, minDeadlineDays: 1, maxDeadlineDays: 3 },
  buyer: { maxBudgetUsdc: 300, minDeadlineDays: 1, maxDeadlineDays: 14, bidCollectionSeconds: 45, milestonePcts: [100] },
};

async function signedIn(page: Page, saved: unknown[]) {
  await page.addInitScript(() => localStorage.setItem('karwan:guide:disabled', '1'));
  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    const { pathname } = new URL(req.url());
    if (pathname === '/api/auth/bootstrap') return route.fulfill({ json: { user: { address: BUYER, method: 'circle', hasPasskey: true }, profile } });
    if (pathname === '/api/profile') return route.fulfill({ json: { profile } });
    if (pathname === '/api/setup/ways' && req.method() === 'POST') {
      saved.push(req.postDataJSON());
      return route.fulfill({ json: { profile, lines: [] } });
    }
    if (req.method() !== 'GET') return route.fulfill({ status: 403, body: '' });
    return route.fulfill({ json: { items: [], events: [], movements: [], messages: [], workspaces: [] } });
  });
}

test('a goods way is added in place and saved with the rest', async ({ page }) => {
  const saved: Array<{ ways: { sell: Array<{ shape: string }> } }> = [];
  await signedIn(page, saved as unknown[]);
  await page.goto('/profile/ways');
  await expect(page.getByRole('heading', { name: c.title })).toBeVisible();
  await expect(page.getByText('20 to 40 USDC · 1 to 3 days')).toBeVisible();

  const save = page.getByRole('button', { name: c.save, exact: true });
  await expect(save).toBeDisabled();
  await page.getByRole('button', { name: `+ ${c.add}` }).first().click();
  await page.getByRole('button', { name: new RegExp(c.shapes.goods) }).click();
  const done = page.getByRole('button', { name: c.done, exact: true });
  await expect(page.getByText(c.missing)).toBeVisible();
  await expect(done).toBeDisabled();
  await page.getByLabel(c.fields.whatSell).fill('Wigs');
  await page.getByLabel(c.fields.shipsTo).fill('Anywhere in Nigeria');
  await done.click();
  await expect(page.getByText('Wigs · 20 to 40 USDC · to Anywhere in Nigeria · 2 to 5 days')).toBeVisible();

  await save.click();
  await expect(page.getByText(c.saved)).toBeVisible();
  expect(saved[0]?.ways.sell.map((w) => w.shape)).toEqual(['one_time', 'goods']);
});
