import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import { funded, serveMoney } from './moneyFixtures';

/// Money leaving an account Karwan signs for: the saved addresses on the
/// money page, and the guard's answers on the payment screens.
const HOUR = 3_600_000;
const SAVED = '0x5555555555555555555555555555555555555555';
const WAITING = '0x6666666666666666666666666666666666666666';
const STRANGER = '0x2222222222222222222222222222222222222222';

function status(over: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    enabled: true,
    kind: 'chat',
    hasSession: true,
    paused: false,
    returnCheckDue: false,
    addresses: [
      { id: 'a1', chain: 'arc', address: SAVED, addedAt: now - 48 * HOUR, opensAt: now - 24 * HOUR },
      { id: 'a2', chain: 'baseSepolia', address: WAITING, addedAt: now - HOUR, opensAt: now + 23 * HOUR },
    ],
    limitUsdc: '500',
    leftUsdc: '320',
    moreAt: now + 5 * HOUR,
    ...over,
  };
}

const refusal = (body: Record<string, unknown>) => (route: Route) => route.fulfill({ status: 409, json: body });

const section = (page: Page) => page.getByRole('region', { name: 'Where your money can go' });

test('a chat account sees where its money can go, when each address opens, and the limit left', async ({ page }) => {
  let current = status();
  const removed: string[] = [];
  await serveMoney(page, {
    balances: funded,
    moneyOut: async (route, path) => {
      if (route.request().method() === 'DELETE') {
        removed.push(path);
        current = status({ addresses: current.addresses.filter((a) => !path.endsWith(a.id)) });
        return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({ json: current });
    },
  });
  await page.goto('/account');
  const saved = section(page);
  await expect(saved).toBeVisible();
  await expect(saved).toContainText('Money leaves your account only to these addresses.');
  await expect(saved).toContainText('0x5555…5555 on Arc');
  await expect(saved).toContainText('Ready');
  await expect(saved).toContainText('0x6666…6666 on Base Sepolia');
  await expect(saved).toContainText('Receives money from');
  await expect(saved).toContainText('320 of 500 USDC can leave in the next 24 hours.');
  await expect(saved.getByRole('button', { name: 'Pause payments out' })).toBeVisible();

  await saved.getByRole('listitem').filter({ hasText: '0x6666' }).getByRole('button', { name: 'Remove' }).click();
  await expect(saved).not.toContainText('0x6666…6666');
  expect(removed).toEqual(['/api/money-out/addresses/a2']);

  const scan = await new AxeBuilder({ page }).include('#money-out-title').analyze();
  expect(scan.violations).toEqual([]);
});

test('a paused account says so and offers to resume with World ID', async ({ page }) => {
  await serveMoney(page, { balances: funded, moneyOut: (route) => route.fulfill({ json: status({ paused: true }) }) });
  await page.goto('/account');
  const saved = section(page);
  await expect(saved).toContainText('Payments out are paused.');
  await expect(saved.getByRole('button', { name: 'Resume with World ID' })).toBeVisible();
  await expect(saved.getByRole('button', { name: 'Pause payments out' })).toHaveCount(0);
});

test('an account that holds its own keys sees no saved addresses', async ({ page }) => {
  await serveMoney(page, { balances: funded, moneyOut: (route) => route.fulfill({ json: status({ kind: 'web' }) }) });
  await page.goto('/account');
  await expect(page.getByRole('listitem').filter({ hasText: 'Buying agent' })).toBeVisible();
  await expect(section(page)).toHaveCount(0);
});

test('a send to a new address says so and offers to add it with World ID, for exactly that address', async ({ page }) => {
  const asked: unknown[] = [];
  await serveMoney(page, {
    balances: funded,
    arcSend: refusal({ code: 'MONEY_OUT_ADDRESS_NOT_SAVED', error: 'Add this address with your World ID first.' }),
    moneyOut: async (route, path) => {
      if (path === '/api/money-out/session/request') {
        asked.push(route.request().postDataJSON());
        return route.fulfill({ status: 503, json: { code: 'WORLD_ID_UNAVAILABLE', error: 'World ID is unavailable.' } });
      }
      return route.fulfill({ json: status() });
    },
  });
  await page.goto('/send');
  const sheet = page.getByRole('region', { name: 'Send USDC' });
  await sheet.getByLabel('Amount').fill('25');
  await sheet.getByLabel('Send to').fill(STRANGER);
  await sheet.getByRole('button', { name: 'Send 25.00 USDC' }).click();

  await expect(sheet).toContainText('This address is new to your account. Add it with your World ID and it can receive money 24 hours later.');
  await expect(sheet).not.toContainText('Nothing moved');
  await sheet.getByRole('button', { name: 'Add this address' }).click();
  await expect(sheet).toContainText('World ID is not available right now. Try again shortly.');
  expect(asked).toEqual([{ purpose: 'add_address' }]);
});

test('the daily limit says what can leave now and when more can, with nothing to press', async ({ page }) => {
  await serveMoney(page, {
    balances: funded,
    withdraw: refusal({ code: 'MONEY_OUT_DAILY_LIMIT', error: 'limit', limitUsdc: '500', leftUsdc: '20', moreAt: Date.now() + 5 * HOUR }),
  });
  await page.goto('/account');
  await page.getByRole('listitem').filter({ hasText: 'Buying agent' }).getByRole('button', { name: 'Withdraw', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Amount').fill('60');
  await sheet.getByRole('button', { name: 'Withdraw 60.00 USDC' }).click();
  await expect(sheet).toContainText('Up to 500 USDC can leave your account in 24 hours. 20 USDC can leave now, and more from');
  await expect(sheet.getByRole('button', { name: /World ID|Add this address/ })).toHaveCount(0);
  await expect(sheet.getByText('Close', { exact: true })).toBeVisible();
});

test('a chat account is asked to link its World ID to its money on the person check page', async ({ page }) => {
  await serveMoney(page, { balances: funded, moneyOut: (route) => route.fulfill({ json: status({ hasSession: false }) }) });
  await page.goto('/verify/person');
  await expect(page.getByRole('heading', { name: 'Link your World ID to your money' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Link with World ID' })).toBeVisible();
});

test('a web account, or a chat account already linked, is not asked again', async ({ page }) => {
  for (const over of [{ kind: 'web', hasSession: false }, { hasSession: true }]) {
    await serveMoney(page, { balances: funded, moneyOut: (route) => route.fulfill({ json: status(over) }) });
    await page.goto('/verify/person');
    await expect(page.getByRole('heading', { name: 'Prove you are one real person' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Link your World ID to your money' })).toHaveCount(0);
  }
});

test('the saved addresses read right to left in Arabic, with nothing off the page', async ({ page, context }) => {
  await context.addCookies([{ name: 'karwan-locale', value: 'ar', domain: '127.0.0.1', path: '/' }]);
  await serveMoney(page, { balances: funded, moneyOut: (route) => route.fulfill({ json: status() }) });
  await page.goto('/account');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('region', { name: 'إلى أين يمكن أن يذهب مالك' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

for (const theme of ['light', 'dark'] as const) {
  test(`the saved addresses and the guard's answer are clean in ${theme}`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('karwan-theme', value), theme);
    await serveMoney(page, {
      balances: funded,
      withdraw: refusal({ code: 'MONEY_OUT_PAUSED', error: 'paused' }),
      moneyOut: (route) => route.fulfill({ json: status() }),
    });
    await page.goto('/account');
    await expect(section(page)).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('listitem').filter({ hasText: 'Buying agent' }).getByRole('button', { name: 'Withdraw', exact: true }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Amount').fill('10');
    await sheet.getByRole('button', { name: 'Withdraw 10.00 USDC' }).click();
    await expect(sheet).toContainText('Every payment out of your account is paused.');
    await expect(sheet.getByRole('button', { name: 'Resume with World ID' })).toBeVisible();
    expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
  });
}
