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

test('on desktop Home invites the person to Telegram until it is linked (view 44, D5)', async ({ page }, testInfo) => {
  await serveHome(page, false);
  await page.goto('/app');
  await expect(page.locator('#home-heading')).toBeVisible();
  const card = page.locator('[data-home-telegram]');
  if (testInfo.project.name === 'desktop') {
    await expect(card).toBeVisible();
    await expect(card.getByRole('button', { name: /Connect Telegram/ })).toBeVisible();
  } else {
    await expect(card).toBeHidden();
  }
});

test('a linked Telegram leaves no card on Home', async ({ page }) => {
  await serveHome(page, true);
  await page.goto('/app');
  await expect(page.locator('#home-heading')).toBeVisible();
  await expect(page.locator('[data-home-telegram]')).toHaveCount(0);
});
