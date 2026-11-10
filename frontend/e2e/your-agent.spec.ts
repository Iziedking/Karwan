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

test('the agent switch turns the agent off and on, only where it is open', async ({ page }) => {
  const saves: { path: string; body: unknown }[] = [];
  await serveAgent(page, saves);
  const changes: unknown[] = [];
  // The saved switch comes back with the profile, as it does from the server.
  let agentOn = true;
  await page.route(`${API}/api/profile**`, (route) => route.fulfill({ json: { profile: { ...profile, agentPrefs: { agentOn } } } }));
  await page.route(`${API}/api/agents/mandate`, (route) => {
    const body = route.request().postDataJSON() as { patch: { on: boolean } };
    changes.push(body);
    agentOn = body.patch.on;
    return route.fulfill({ json: { lines: [], replan: { judged: 0, offered: 0, closedQuestions: 0, line: 'Done.' } } });
  });
  await page.goto('/profile/setup');
  await expect(page.getByRole('heading', { name: 'Your agent' })).toBeVisible();
  // Not open on this network: no switch.
  await expect(page.locator('[data-agent-power]')).toHaveCount(0);

  await page.route(`${API}/api/features`, (route) => route.fulfill({ json: { hourlyWork: false, sellerAsked: true } }));
  await page.reload();
  const power = page.locator('[data-agent-power]').getByRole('switch', { name: /Agent on/ });
  await expect(power).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[data-agent-power]')).toContainText('It offers, bargains and finds people for you.');
  await power.click();
  await expect(power).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('[data-agent-power]')).toContainText('It does nothing for you. Deals already running go on.');
  await expect(page.locator('[data-agent-state="switched-off"]')).toContainText('Switched off');
  expect((changes[0] as { patch: unknown }).patch).toEqual({ part: 'power', on: false });
  expect(String((changes[0] as { cardId: string }).cardId).length).toBeGreaterThanOrEqual(8);
  await power.click();
  await expect(power).toHaveAttribute('aria-checked', 'true');
  expect((changes[1] as { patch: unknown }).patch).toEqual({ part: 'power', on: true });
});
