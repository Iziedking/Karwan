import { expect, test, type Page } from '@playwright/test';
import { API, ME, BUYER_AGENT, SELLER_AGENT, funded, serveMoney } from './moneyFixtures';

/// The next-move nudge (view 57, owner 6 Nov 2026): one line and one button,
/// quiet once closed.

async function serveHome(page: Page, moves: unknown[], balances = funded) {
  await serveMoney(page, { balances });
  await page.route(`${API}/api/profile**`, (route) =>
    route.fulfill({ json: { profile: { address: ME, displayName: 'Bola Ade', handle: 'bola', settings: { setupDoneAt: 1 } } } }));
  await page.route(`${API}/api/agents/status`, (route) =>
    route.fulfill({ json: { chain: { id: 5042002, rpc: 'http://127.0.0.1:3198', explorer: 'https://testnet.arcscan.app' }, contracts: {} } }));
  await page.route(`${API}/api/guide/next`, (route) => route.fulfill({ json: { moves } }));
}

test('a delivered deal shows one line and one button that opens the deal; closed, it stays closed', async ({ page }) => {
  await serveHome(page, [{ kind: 'approve_delivery', ref: '0xd1', href: '/deals/0xd1', amountUsdc: '120' }]);
  await page.goto('/app');
  const nudge = page.locator('[data-next-move="approve_delivery"]');
  await expect(nudge).toBeVisible();
  await expect(nudge).toContainText('Delivery is in for your');
  await expect(nudge.getByRole('link', { name: 'Check delivery' })).toHaveAttribute('href', '/deals/0xd1');
  await nudge.getByRole('button', { name: 'Close' }).click();
  await expect(nudge).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#home-heading')).toBeVisible();
  await page.waitForTimeout(1600);
  await expect(page.locator('[data-next-move]')).toHaveCount(0);
});

test('with nothing to do and no money, it asks for money first', async ({ page }) => {
  const empty = { [ME.toLowerCase()]: 0, [BUYER_AGENT.toLowerCase()]: 0, [SELLER_AGENT.toLowerCase()]: 0 };
  await serveHome(page, [{ kind: 'first_post', href: '/buyer' }], empty);
  await page.goto('/app');
  const nudge = page.locator('[data-next-move="add_money"]');
  await expect(nudge).toBeVisible();
  await expect(nudge.getByRole('link', { name: 'Add money' })).toHaveAttribute('href', '/add');
});

test('it steps aside while typing', async ({ page }) => {
  await serveHome(page, [{ kind: 'choose_offer', ref: '0xj1', href: '/jobs/0xj1', count: 2 }]);
  await page.goto('/app');
  const nudge = page.locator('[data-next-move="choose_offer"]');
  await expect(nudge).toContainText('2 offers came in on your request.');
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'probe';
    document.body.appendChild(input);
    input.focus();
  });
  await expect(nudge).toHaveCount(0);
});
