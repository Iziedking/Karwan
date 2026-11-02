import { expect, test, type Page } from '@playwright/test';
import { API, ME, funded, serveMoney } from './moneyFixtures';

/// Your agent (view 45): five plain questions on one page, each changed in a
/// panel there, and the missing usual price called out at the top.

const profile = {
  address: ME, role: 'both', displayName: 'Bola Ade', handle: 'bola', createdAt: 0, updatedAt: 0,
  settings: { setupDoneAt: 1 },
  seller: { skills: ['Logo design'], bio: 'Logos', minBudgetUsdc: 10, maxBudgetUsdc: 20000, minDeadlineDays: 1, maxDeadlineDays: 3 },
  buyer: { maxBudgetUsdc: 300, minDeadlineDays: 1, maxDeadlineDays: 14, bidCollectionSeconds: 45, milestonePcts: [100] },
};

async function serveAgent(page: Page, saves: { path: string; body: unknown }[]) {
  await serveMoney(page, { balances: funded });
  await page.route(`${API}/api/profile**`, (route) => route.fulfill({ json: { profile } }));
  await page.route(`${API}/api/agents/seller**`, (route) => route.fulfill({ json: { profile: null, activeBids: [{ jobId: '0x01' }, { jobId: '0x02' }] } }));
  await page.route(`${API}/api/setup/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    saves.push({ path, body: route.request().postDataJSON() });
    return route.fulfill({ json: { profile, lines: [] } });
  });
}

test('the page says the agent is on and asks for a usual price the seller never gave', async ({ page }) => {
  const saves: { path: string; body: unknown }[] = [];
  await serveAgent(page, saves);
  await page.goto('/profile/setup');
  await expect(page.getByRole('heading', { name: 'Your agent' })).toBeVisible();
  await expect(page.locator('[data-agent-state="on"]')).toContainText('2 offers waiting on buyers');
  await expect(page.locator('[data-price-notice]')).toBeVisible();
  for (const row of ['What you sell', 'Your price', 'How you get paid', 'Agent permissions', 'When you buy']) {
    await expect(page.locator('[data-your-agent]').getByText(row, { exact: true })).toBeVisible();
  }
  await expect(page.getByText('Not given yet')).toBeVisible();

  await page.getByRole('button', { name: 'Set price' }).click();
  const panel = page.getByRole('dialog');
  await panel.getByLabel('Your usual price, USDC').fill('50');
  await panel.getByLabel('The lowest you take, USDC').fill('60');
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(panel.getByRole('alert')).toHaveText("The lowest can't be above the usual price.");
  await panel.getByLabel('The lowest you take, USDC').fill('30');
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const price = saves.find((s) => s.path === '/api/setup/ways')!.body as { ways: { sell: Record<string, unknown>[] } };
  expect(price.ways.sell[0]).toEqual({ shape: 'one_time', priceMin: 30, priceUsual: 50, daysMin: 1, daysMax: 3 });
});

test('what the agent does alone is changed in place', async ({ page }) => {
  const saves: { path: string; body: unknown }[] = [];
  await serveAgent(page, saves);
  await page.goto('/profile/setup');
  const row = page.locator('[data-your-agent]').getByRole('button', { name: 'Change' });
  await row.nth(3).click();
  const panel = page.getByRole('dialog');
  await panel.getByRole('radio', { name: /Ask me first/ }).click();
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(saves.find((s) => s.path === '/api/setup/agent-mode')?.body).toEqual({ agentMode: 'ask' });
});

test('how you get paid keeps a carried-over price marked as not given', async ({ page }) => {
  const saves: { path: string; body: unknown }[] = [];
  await serveAgent(page, saves);
  await page.goto('/profile/setup');
  await page.locator('[data-your-agent]').getByRole('button', { name: 'Change' }).nth(2).click();
  const panel = page.getByRole('dialog');
  await panel.getByRole('radio', { name: /In stages/ }).click();
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const paid = saves.find((s) => s.path === '/api/setup/ways')!.body as { ways: { sell: Record<string, unknown>[] } };
  expect(paid.ways.sell[0]).toMatchObject({ shape: 'milestones', usualGuessed: true, stages: 2 });
});
