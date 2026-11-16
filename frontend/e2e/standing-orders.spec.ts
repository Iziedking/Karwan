import { expect, test, type Page } from '@playwright/test';
import { API, ME, funded, serveMoney } from './moneyFixtures';

/// Standing orders on Your agent (view 87, step 4): the group, adding an
/// order, and pausing, resuming and stopping one.

const profile = {
  address: ME, role: 'both', displayName: 'Bola Ade', handle: 'bola', createdAt: 0, updatedAt: 0,
  settings: { setupDoneAt: 1 },
  location: { country: 'NG', city: 'Abuja', area: 'Wuse', reach: {} },
  seller: { skills: ['Catering'], bio: 'Catering', minBudgetUsdc: 10, maxBudgetUsdc: 60, minDeadlineDays: 1, maxDeadlineDays: 3, usualSet: true },
  buyer: { maxBudgetUsdc: 300, minDeadlineDays: 1, maxDeadlineDays: 14, bidCollectionSeconds: 45, milestonePcts: [100] },
};

interface Order {
  id: string;
  side: 'buy' | 'sell';
  need: string;
  budgetUsdc: string | null;
  kind: string;
  perDay: number;
  until: number | null;
  state: 'on' | 'paused' | 'done' | 'ended';
  jobId: string | null;
  findId: string | null;
  createdAt: number;
  askedToday: number;
  week: { asked: number; offers: number; locked: number };
  waitsFor: 'location' | 'money' | null;
}

const order = (over: Partial<Order> = {}): Order => ({
  id: 'so_1', side: 'buy', need: 'Buy rice, 50 kg bags', budgetUsdc: '40', kind: 'goods', perDay: 5, until: null, state: 'on', jobId: null, findId: null,
  createdAt: 1, askedToday: 3, week: { asked: 9, offers: 2, locked: 0 }, waitsFor: null, ...over,
});

interface World {
  find: boolean;
  working: boolean;
  orders: Order[];
  starts: Array<Record<string, unknown>>;
  changes: Array<{ id: string; body: Record<string, unknown> }>;
}

const world = (over: Partial<World> = {}): World => ({ find: true, working: true, orders: [], starts: [], changes: [], ...over });

async function serve(page: Page, w: World) {
  await page.addInitScript(() => {
    try { localStorage.setItem('karwan:guide:disabled', '1'); } catch { /* private mode */ }
  });
  await serveMoney(page, { balances: funded });
  await page.route(`${API}/api/profile**`, (route) => route.fulfill({ json: { profile } }));
  await page.route(`${API}/api/features`, (route) => route.fulfill({ json: { hourlyWork: false, sellerAsked: true, agentSwitch: true, autopilotLock: false } }));
  await page.route(`${API}/api/agents/seller**`, (route) => route.fulfill({ json: { profile: null, activeBids: [] } }));
  await page.route(`${API}/api/agents/mandate`, (route) =>
    route.fulfill({
      json: {
        mandate: { on: true, alone: 'agree', switches: { offers: true, bargain: true, agree: true, lock: false, find: w.find, data: true, brief: true }, weeklyLimitUsdc: 0.25, brief: { on: true, hour: 7, timeZone: 'Africa/Lagos' }, stopped: null, lock: null },
        lines: [],
        lockOpen: false,
      },
    }),
  );
  await page.route(`${API}/api/agents/orders`, (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { orders: w.orders, max: 5, working: w.working } });
    const body = route.request().postDataJSON() as Record<string, unknown>;
    w.starts.push(body);
    const made = order({
      id: `so_${w.orders.length + 1}`, side: body.side as Order['side'], need: String(body.need), budgetUsdc: body.budgetUsdc == null ? null : String(body.budgetUsdc),
      kind: String(body.kind), perDay: Number(body.perDay), until: body.untilDays ? Date.now() + Number(body.untilDays) * 86_400_000 : null, askedToday: 0, week: { asked: 0, offers: 0, locked: 0 },
    });
    w.orders = [...w.orders, made];
    return route.fulfill({ json: { order: made, working: w.working } });
  });
  await page.route(`${API}/api/agents/orders/*`, (route) => {
    const id = route.request().url().split('/').pop()!;
    const body = route.request().postDataJSON() as Record<string, unknown>;
    w.changes.push({ id, body });
    if (body.action === 'stop') {
      w.orders = w.orders.filter((o) => o.id !== id);
      return route.fulfill({ json: { ok: true, stopped: true } });
    }
    w.orders = w.orders.map((o) => (o.id !== id ? o : { ...o, ...(body.action === 'pause' ? { state: 'paused' as const } : body.action === 'resume' ? { state: 'on' as const } : {}), ...(body.perDay ? { perDay: Number(body.perDay) } : {}) }));
    return route.fulfill({ json: { order: w.orders.find((o) => o.id === id) } });
  });
}

const group = (page: Page) => page.locator('[data-standing-orders]');

test('the group lists each order with its limit and what it did, then Add an order', async ({ page }) => {
  await serve(page, world({ orders: [order(), order({ id: 'so_2', side: 'sell', need: 'Customers for my catering', budgetUsdc: null, state: 'paused' })] }));
  await page.goto('/profile/setup');
  const g = group(page);
  await expect(g.getByRole('heading', { name: 'Standing orders' })).toBeVisible();
  const rice = g.getByRole('button', { name: /Buy rice, 50 kg bags/ });
  await expect(rice).toContainText('each, until you stop it');
  await expect(rice).toContainText('3 asked today');
  const catering = g.getByRole('button', { name: /Customers for my catering/ });
  await expect(catering).toContainText('In Abuja, until you stop it');
  await expect(catering).toContainText('Paused');
  await expect(g.getByRole('button', { name: 'Add an order' })).toBeVisible();
  await expect(page.locator('[data-orders-resting]')).toHaveCount(0);
  // Nothing spills past the screen at this size.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('adding an order needs words and a figure, then starts it and shows its row', async ({ page }) => {
  const w = world();
  await serve(page, w);
  await page.goto('/profile/setup');
  await group(page).getByRole('button', { name: 'Add an order' }).click();
  const sheet = page.locator('[data-order-sheet="new"]');
  await expect(sheet.getByRole('heading', { name: 'New order' })).toBeVisible();
  const start = sheet.getByRole('button', { name: 'Start the order' });
  await expect(start).toBeDisabled();
  await sheet.getByLabel('What it should find').fill('Rice, 50 kg bags');
  await expect(start).toBeDisabled();
  await sheet.getByLabel('The most for one').fill('40');
  await sheet.getByLabel('People a day').selectOption('3');
  await sheet.getByLabel('Until').selectOption('4');
  await expect(start).toBeEnabled();
  await start.click();
  await expect(sheet).toHaveCount(0);
  expect(w.starts).toEqual([{ side: 'buy', need: 'Rice, 50 kg bags', budgetUsdc: 40, kind: 'goods', perDay: 3, untilDays: 4 }]);
  await expect(group(page).getByRole('button', { name: /Rice, 50 kg bags/ })).toContainText('0 asked today');
});

test('a selling order asks for no figure', async ({ page }) => {
  const w = world();
  await serve(page, w);
  await page.goto('/profile/setup');
  await group(page).getByRole('button', { name: 'Add an order' }).click();
  const sheet = page.locator('[data-order-sheet="new"]');
  await sheet.getByLabel('Buying or selling').selectOption('sell');
  await expect(sheet.getByLabel('The most for one')).toHaveCount(0);
  await sheet.getByLabel('What it should sell').fill('Customers for my catering');
  await sheet.getByLabel('How it reaches you').selectOption('in_person');
  await sheet.getByRole('button', { name: 'Start the order' }).click();
  await expect(sheet).toHaveCount(0);
  expect(w.starts).toEqual([{ side: 'sell', need: 'Customers for my catering', budgetUsdc: null, kind: 'in_person', perDay: 5 }]);
});

test('an open order shows what it did and pauses, resumes and stops', async ({ page }) => {
  const w = world({ orders: [order()] });
  await serve(page, w);
  await page.goto('/profile/setup');
  const row = group(page).getByRole('button', { name: /Buy rice, 50 kg bags/ });
  await row.click();
  const sheet = page.locator('[data-order-sheet="one"]');
  await expect(sheet.getByRole('heading', { name: 'Buy rice, 50 kg bags' })).toBeVisible();
  await expect(sheet).toContainText('Asked today');
  await expect(sheet).toContainText('9 asked, 2 offers');
  await sheet.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(row).toContainText('Paused');

  await row.click();
  await sheet.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(row).toContainText('3 asked today');

  await row.click();
  await sheet.getByRole('button', { name: 'Stop this order' }).click();
  await expect(group(page).getByRole('button', { name: /Buy rice, 50 kg bags/ })).toHaveCount(0);
  expect(w.changes).toEqual([{ id: 'so_1', body: { action: 'pause' } }, { id: 'so_1', body: { action: 'resume' } }, { id: 'so_1', body: { action: 'stop' } }]);
});

test('changing people a day saves only that', async ({ page }) => {
  const w = world({ orders: [order()] });
  await serve(page, w);
  await page.goto('/profile/setup');
  await group(page).getByRole('button', { name: /Buy rice, 50 kg bags/ }).click();
  const sheet = page.locator('[data-order-sheet="one"]');
  await expect(sheet.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await sheet.getByLabel('People a day').selectOption('2');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  expect(w.changes).toEqual([{ id: 'so_1', body: { perDay: 2 } }]);
});

test('the group is absent while Find people is off, and five orders leave no Add row', async ({ page }) => {
  await serve(page, world({ find: false, orders: [order()] }));
  await page.goto('/profile/setup');
  await expect(page.locator('[data-does-alone]')).toBeVisible();
  await expect(group(page)).toHaveCount(0);

  const five = [1, 2, 3, 4, 5].map((n) => order({ id: `so_${n}`, need: `Order number ${n}` }));
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await serve(page, world({ orders: five, working: false }));
  await page.reload();
  await expect(group(page).getByRole('button', { name: /Order number/ })).toHaveCount(5);
  await expect(group(page).getByRole('button', { name: 'Add an order' })).toHaveCount(0);
  await expect(page.locator('[data-orders-resting]')).toBeVisible();
});
