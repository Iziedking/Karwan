import { expect, test, type Page } from '@playwright/test';
import { API, ME, funded, serveMoney } from './moneyFixtures';

async function serveHome(page: Page, linked: boolean) {
  await serveMoney(page, { balances: funded });
  await page.route(`${API}/api/profile**`, (route) =>
    route.fulfill({ json: { profile: { address: ME, displayName: 'Bola Ade', handle: 'bola', settings: { setupDoneAt: 1 } } } }));
  await page.route(`${API}/api/agents/status`, (route) =>
    route.fulfill({ json: { chain: { id: 5042002, rpc: 'http://127.0.0.1:3198', explorer: 'https://testnet.arcscan.app' }, contracts: {} } }));
  await page.route(`${API}/api/telegram/status**`, (route) =>
    route.fulfill({ json: { enabled: true, botUsername: 'karwan_bot', linked, chatId: linked ? 1 : null, username: linked ? 'bola' : null, linkedAt: linked ? 1 : null } }));
}

test('Home has no Telegram card; Telegram is linked from Contact on Profile', async ({ page }) => {
  await serveHome(page, false);
  await page.goto('/app');
  await expect(page.locator('#home-heading')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Telegram' })).toHaveCount(0);
});

test('asking on Home opens assistant mode with the question sent, not Help', async ({ page }) => {
  await serveHome(page, true);
  const asked: string[] = [];
  await page.route(`${API}/api/assistant/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/assistant/chat') {
      const body = route.request().postDataJSON() as { messages: { content: string }[] };
      asked.push(body.messages.at(-1)?.content ?? '');
      return route.fulfill({ json: { reply: 'Tell me what you sell.' } });
    }
    if (path === '/api/assistant/conversations' && route.request().method() === 'GET') return route.fulfill({ json: { conversations: [{ id: 'old', title: 'Old chat', updatedAt: 1 }] } });
    return route.fulfill({ json: { conversation: { id: 'c1', title: 'Chat', updatedAt: 2, messages: [] } } });
  });
  await page.goto('/app');
  await page.getByRole('button', { name: 'Post my offer' }).click();
  await expect(page).toHaveURL(/\/assistant$/);
  await expect(page.getByText('Post my offer', { exact: true })).toBeVisible();
  await expect(page.getByText('Tell me what you sell.')).toBeVisible();
  expect(asked).toEqual(['Post my offer']);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

/// Owner notes, 3 Nov 2026: the round money buttons are back, Add money the green one (4 Nov), and
/// a record that is not on yet is the one nudge under them.
for (const locale of ['en', 'fr', 'sw'] as const) {
  test(`Home has four round money buttons that fit, and nudges a record that is off (${locale})`, async ({ page, context }, testInfo) => {
    await context.addCookies([{ name: 'karwan-locale', value: locale, domain: '127.0.0.1', path: '/' }]);
    await serveHome(page, true);
    await page.route(`${API}/api/record/setup`, (route) => route.fulfill({ json: { available: true, complete: false } }));
    await page.goto('/app');
    const moves = page.locator('[data-money-move]');
    await expect(moves).toHaveCount(4);
    expect(await moves.evaluateAll((els) => els.map((el) => el.getAttribute('href')))).toEqual(['/add', '/send', '/request', '/withdraw']);
    // Add money is the one green circle (owner notes, 4 Nov 2026).
    for (const [i, move] of (await moves.all()).entries()) {
      expect(await move.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), await move.innerText()).toBe(true);
      const fill = await move.locator('span').first().evaluate((el) => getComputedStyle(el).backgroundColor);
      if (i === 0) expect(fill).toBe('rgb(175, 201, 91)');
      else expect(fill).not.toBe('rgb(175, 201, 91)');
    }
    await expect(page.locator('[data-home-nudge]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath(`home-moves-${locale}.png`) });
  });
}

test('Home shows no record nudge once the record is on', async ({ page }) => {
  await serveHome(page, true);
  await page.route(`${API}/api/record/setup`, (route) => route.fulfill({ json: { available: true, complete: true } }));
  await page.goto('/app');
  await expect(page.locator('[data-money-move]')).toHaveCount(4);
  await expect(page.locator('[data-home-nudge]')).toHaveCount(0);
});
