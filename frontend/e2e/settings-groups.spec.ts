import { expect, test, type Page } from '@playwright/test';
import { API, ME, funded, serveMoney } from './moneyFixtures';

/// Settings in three groups, with a switch for each thing an agent does alone
/// (view 87, step 2), and the rows Your agent shows for what is on.

const profile = {
  address: ME, role: 'both', displayName: 'Bola Ade', handle: 'bola', createdAt: 0, updatedAt: 0,
  settings: { setupDoneAt: 1 },
  seller: { skills: ['Logo design'], bio: 'Logos', minBudgetUsdc: 10, maxBudgetUsdc: 60, minDeadlineDays: 1, maxDeadlineDays: 3, usualSet: true },
  buyer: { maxBudgetUsdc: 300, minDeadlineDays: 1, maxDeadlineDays: 14, bidCollectionSeconds: 45, milestonePcts: [100] },
};

type Mandate = {
  on: boolean;
  alone: string;
  switches: Record<string, boolean>;
  weeklyLimitUsdc: number;
  brief: { on: boolean; hour: number; timeZone: string };
  stopped: { at: number; reason: string } | null;
  lock: { perDeal: { usdc: number }; perWeek: { usdc: number }; perDay: number; who: string } | null;
};

const mandate = (over: Partial<Mandate> = {}): Mandate => ({
  on: true,
  alone: 'agree',
  switches: { offers: true, bargain: true, agree: true, lock: false, find: true, data: true, brief: true },
  weeklyLimitUsdc: 0.25,
  brief: { on: true, hour: 7, timeZone: 'Africa/Lagos' },
  stopped: null,
  lock: null,
  ...over,
});

interface World {
  mandate: Mandate;
  lockOpen: boolean;
  posts: Array<{ patch: Record<string, unknown>; cardId: string }>;
  /// The answer to the next change; absent applies it.
  answer?: (patch: Record<string, unknown>, call: number) => { status: number; json: unknown } | null;
}

async function serve(page: Page, world: World) {
  await page.addInitScript(() => {
    try { localStorage.setItem('karwan:guide:disabled', '1'); } catch { /* private mode */ }
  });
  await serveMoney(page, { balances: funded });
  await page.route(`${API}/api/profile**`, (route) => route.fulfill({ json: { profile } }));
  await page.route(`${API}/api/features`, (route) => route.fulfill({ json: { hourlyWork: false, sellerAsked: true, agentSwitch: true, autopilotLock: world.lockOpen } }));
  await page.route(`${API}/api/agents/seller**`, (route) => route.fulfill({ json: { profile: null, activeBids: [] } }));
  await page.route(`${API}/api/agents/orders`, (route) => route.fulfill({ json: { orders: [], max: 5, working: false } }));
  await page.route(`${API}/api/agents/mandate`, (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { mandate: world.mandate, lines: [], lockOpen: world.lockOpen } });
    const body = route.request().postDataJSON() as { patch: Record<string, unknown>; cardId: string };
    world.posts.push(body);
    const forced = world.answer?.(body.patch, world.posts.length);
    if (forced) return route.fulfill({ status: forced.status, json: forced.json });
    const p = body.patch;
    if (p.part === 'switch') world.mandate = { ...world.mandate, switches: { ...world.mandate.switches, [String(p.name)]: p.on === true } };
    if (p.part === 'power') world.mandate = { ...world.mandate, on: p.on === true };
    if (p.part === 'resume') world.mandate = { ...world.mandate, stopped: null };
    if (p.part === 'lock-rules') {
      world.mandate = {
        ...world.mandate,
        lock: { perDeal: { usdc: Number(p.perDealUsdc) }, perWeek: { usdc: Number(p.perWeekUsdc) }, perDay: 3, who: 'record' },
        switches: { ...world.mandate.switches, ...(p.on ? { lock: true } : {}) },
      };
    }
    return route.fulfill({ json: { mandate: world.mandate, lines: [], replan: { judged: 0, offered: 0, closedQuestions: 0, line: 'Done.' } } });
  });
}

const world = (over: Partial<World> = {}): World => ({ mandate: mandate(), lockOpen: false, posts: [], ...over });

test('Settings opens on General and keeps the chosen group in the address', async ({ page }) => {
  await serve(page, world());
  await page.goto('/settings');
  const tabs = page.getByRole('tablist', { name: 'Settings groups' });
  await expect(tabs.getByRole('tab')).toHaveText(['General', 'Money', 'Agent']);
  await expect(tabs.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: /^Language/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Show amounts in/ })).toHaveCount(0);

  await tabs.getByRole('tab', { name: 'Money' }).click();
  await expect(page).toHaveURL(/\/settings\?group=money$/);
  await expect(page.getByRole('button', { name: /Show amounts in/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Start a trade with/ })).toContainText('For myself');
  await expect(page.getByRole('button', { name: /^Language/ })).toHaveCount(0);

  await tabs.getByRole('tab', { name: 'Agent' }).click();
  await expect(page).toHaveURL(/\/settings\?group=agent$/);
  await expect(page.locator('[data-settings-agent]').getByRole('switch')).toHaveCount(8);
  await page.reload();
  await expect(tabs.getByRole('tab', { name: 'Agent' })).toHaveAttribute('aria-selected', 'true');

  await tabs.getByRole('tab', { name: 'General' }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test('a switch saves through the mandate and shows what the server holds', async ({ page }) => {
  const w = world();
  await serve(page, w);
  await page.goto('/settings?group=agent');
  const names = ['Agent on', 'Make offers for me', 'Bargain for me', 'Agree a price for me', 'Lock money for me', 'Find people for me', 'Pay for checks and research', 'Morning brief'];
  for (const name of names) await expect(page.getByRole('switch', { name, exact: true })).toBeVisible();
  const bargain = page.getByRole('switch', { name: 'Bargain for me', exact: true });
  await expect(bargain).toHaveAttribute('aria-checked', 'true');
  await bargain.click();
  await expect(bargain).toHaveAttribute('aria-checked', 'false');
  expect(w.posts[0]!.patch).toEqual({ part: 'switch', name: 'bargain', on: false });
  expect(w.posts[0]!.cardId.length).toBeGreaterThanOrEqual(8);
  await expect(page.getByRole('link', { name: /Budgets and rules/ })).toHaveAttribute('href', '/profile/setup');
});

test('a failed switch goes back and says so', async ({ page }) => {
  const w = world({ answer: () => ({ status: 500, json: { error: 'down' } }) });
  await serve(page, w);
  await page.goto('/settings?group=agent');
  const find = page.getByRole('switch', { name: 'Find people for me', exact: true });
  await find.click();
  await expect(page.locator('[data-settings-agent]').getByRole('alert')).toHaveText('That did not save. Try again.');
  await expect(find).toHaveAttribute('aria-checked', 'true');
});

test('the (i) opens the note without flipping the switch', async ({ page }) => {
  const w = world();
  await serve(page, w);
  await page.goto('/settings?group=agent');
  const row = page.locator('[data-switch-row]').filter({ hasText: 'Bargain for me' });
  await row.getByRole('button').first().click();
  await expect(page.getByText('It answers a counter offer, never below your lowest price or above the most you pay.')).toBeVisible();
  await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  expect(w.posts).toHaveLength(0);
});

test('with the agent off the switches keep their value and cannot be changed', async ({ page }) => {
  await serve(page, world({ mandate: mandate({ on: false }) }));
  await page.goto('/settings?group=agent');
  await expect(page.getByRole('switch', { name: 'Agent on', exact: true })).toHaveAttribute('aria-checked', 'false');
  const offers = page.getByRole('switch', { name: 'Make offers for me', exact: true });
  await expect(offers).toBeDisabled();
  await expect(offers).toHaveAttribute('aria-checked', 'true');
});

test('Lock money is not open yet where the network has it closed', async ({ page }) => {
  const w = world();
  await serve(page, w);
  await page.goto('/settings?group=agent');
  const row = page.locator('[data-switch-row]').filter({ hasText: 'Lock money for me' });
  await expect(row).toContainText('Not open yet');
  await expect(row.getByRole('switch')).toBeDisabled();
  await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
});

test('Lock money asks for its limits, then the passkey', async ({ page }) => {
  const w = world({
    lockOpen: true,
    answer: (patch, call) =>
      patch.part === 'lock-rules' && call === 1
        ? {
            status: 428,
            json: {
              code: 'CONFIRM_REQUIRED', challengeId: 'c-1', text: 'Karwan confirmation', methods: ['passkey', 'pin'], pinSet: true, pinLockedUntil: null, passkeys: 1, enrol: null,
              action: { kind: 'agent_rule', wallet: ME.toLowerCase(), amountMicros: null, recipient: null, detail: { lock: 'on', perDeal: '30000000', perWeek: '90000000', perDay: '3', who: 'record' } },
            },
          }
        : null,
  });
  await serve(page, w);
  await page.goto('/settings?group=agent');
  await page.getByRole('switch', { name: 'Lock money for me', exact: true }).click();
  const sheet = page.locator('[data-lock-sheet]');
  await expect(sheet.getByRole('heading', { name: 'Lock money for me' })).toBeVisible();
  const confirm = sheet.getByRole('button', { name: 'Confirm with passkey' });
  await expect(confirm).toBeDisabled();
  await expect(sheet).toContainText('With a record');
  await sheet.getByLabel('The most for one deal').fill('100');
  await sheet.getByLabel('The most in a week').fill('90');
  await expect(sheet.getByRole('alert')).toHaveText('One deal cannot be more than a week.');
  await expect(confirm).toBeDisabled();
  await sheet.getByLabel('The most for one deal').fill('30');
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByText('Let your agent lock money')).toBeVisible();
  await expect(page.getByText('At most 30 USDC for one deal.')).toBeVisible();
  expect(w.posts[0]!.patch).toEqual({ part: 'lock-rules', perDealUsdc: 30, perWeekUsdc: 90, on: true });
  expect(w.mandate.switches.lock).toBe(false);
});

test('Lock money needs Agree a price first', async ({ page }) => {
  const w = world({ lockOpen: true, mandate: mandate({ switches: { ...mandate().switches, agree: false } }) });
  await serve(page, w);
  await page.goto('/settings?group=agent');
  await page.getByRole('switch', { name: 'Lock money for me', exact: true }).click();
  await expect(page.locator('[data-settings-agent]').getByRole('alert')).toHaveText('Turn on Agree a price first.');
  await expect(page.locator('[data-lock-sheet]')).toHaveCount(0);
  expect(w.posts).toHaveLength(0);
});

test('Your agent lists what is on with its limit and names what is off', async ({ page }) => {
  const w = world({ lockOpen: true, mandate: mandate({ switches: { offers: true, bargain: true, agree: true, lock: true, find: true, data: false, brief: true }, lock: { perDeal: { usdc: 30 }, perWeek: { usdc: 90 }, perDay: 3, who: 'record' } }) });
  await serve(page, w);
  await page.goto('/profile/setup');
  const page_ = page.locator('[data-your-agent]');
  await expect(page_.getByRole('heading', { name: 'What you trade' })).toBeVisible();
  await expect(page_.getByText('Agent permissions', { exact: true })).toHaveCount(0);
  const alone = page.locator('[data-does-alone]');
  await expect(alone.getByRole('heading', { name: 'What it does alone' })).toBeVisible();
  for (const [label, value] of [['Make offers', 'At your price'], ['Bargain', 'Down to your lowest'], ['Agree a price', 'Inside your limits'], ['Find people', 'On'], ['Morning brief', '7:00']]) {
    await expect(alone.getByText(label!, { exact: true })).toBeVisible();
    await expect(alone.getByText(value!, { exact: true })).toBeVisible();
  }
  await expect(alone.getByRole('button', { name: /Lock money/ })).toContainText(/30(\.00)? USDC a deal/);
  const off = alone.getByRole('link', { name: /Checks and research is off/ });
  await expect(off).toHaveAttribute('href', '/settings?group=agent');

  // A lower limit saves with no passkey and no switch change.
  await alone.getByRole('button', { name: /Lock money/ }).click();
  const sheet = page.locator('[data-lock-sheet]');
  await sheet.getByLabel('The most for one deal').fill('20');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toHaveCount(0);
  expect(w.posts[0]!.patch).toEqual({ part: 'lock-rules', perDealUsdc: 20, perWeekUsdc: 90 });
  await expect(alone.getByRole('button', { name: /Lock money/ })).toContainText(/20(\.00)? USDC a deal/);
});

test('an agent that stopped itself says why and turns back on with one tap', async ({ page }) => {
  const w = world({ mandate: mandate({ stopped: { at: 1, reason: 'locks-today' }, lock: { perDeal: { usdc: 30 }, perWeek: { usdc: 90 }, perDay: 3, who: 'record' } }) });
  await serve(page, w);
  await page.goto('/profile/setup');
  const card = page.locator('[data-agent-stopped]');
  await expect(card).toContainText('Your agent stopped. It locked money 3 times today, the most you allow in a day.');
  await card.getByRole('button', { name: 'Turn back on' }).click();
  await expect(card).toHaveCount(0);
  expect(w.posts[0]!.patch).toEqual({ part: 'resume' });
});
