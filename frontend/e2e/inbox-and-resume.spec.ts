import { expect, test } from '@playwright/test';
import { API, funded, ME, serveMoney } from './moneyFixtures';

/// Messages read in the app, the deposit address on one line, the send screen's
/// other-network link only for wallets, and the assistant reopening where you were.

test('messages people sent you are read in the app, the ones waiting for you first', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  await page.route(`${API}/api/messages`, (route) =>
    route.fulfill({
      json: {
        conversations: [
          { with: '@bo', last: 'Thanks, talk soon', at: '2026-10-24T09:00:00.000Z', yourTurn: false },
          { with: '@matiephol', last: 'Do you sell outlier.ai accounts?', at: '2026-10-24T06:07:00.000Z', yourTurn: true },
        ],
      },
    }),
  );
  await page.goto('/messages');
  await expect(page.getByRole('heading', { name: 'Messages', level: 1 })).toBeVisible();
  await expect(page.getByText('1 waiting for your reply').first()).toBeVisible();
  const rows = page.getByRole('listitem');
  await expect(rows.first()).toContainText('@matiephol');
  await expect(rows.first()).toContainText('Your turn');
  await expect(rows.first().getByRole('link')).toHaveAttribute('href', '/messages/matiephol');

  await page.getByRole('button', { name: /Notifications|Alerts/ }).first().click();
  const panelRow = page.getByRole('dialog').getByRole('link', { name: /Messages/ });
  await expect(panelRow).toContainText('1 waiting for your reply');
  await expect(panelRow).toHaveAttribute('href', '/messages');
});

test('an email account has no send from another network; its money is already on Arc', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  await page.goto('/send');
  await expect(page.getByRole('region', { name: 'Send USDC' })).toBeVisible();
  await expect(page.getByRole('link', { name: /another network/ })).toHaveCount(0);
});

test('the deposit address reads on one line, never below 13px, never cut short', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  await page.goto('/bridge?direction=in');
  const address = page.locator('p[dir="ltr"]', { hasText: ME }).first();
  await expect(address).toBeVisible();
  const fit = await address.evaluate((el) => ({
    size: parseFloat(getComputedStyle(el).fontSize),
    nowrap: getComputedStyle(el).whiteSpace === 'nowrap',
    fits: el.scrollWidth <= el.clientWidth + 1,
    text: el.textContent,
  }));
  expect(fit.size).toBeGreaterThanOrEqual(13);
  expect(fit.text).toBe(ME);
  // The size is worked out after layout; on one line it ends up fitting.
  await expect
    .poll(() => address.evaluate((el) => getComputedStyle(el).whiteSpace !== 'nowrap' || el.scrollWidth <= el.clientWidth + 1))
    .toBe(true);
  // Once fitted it holds still: the page scrollbar coming and going must not
  // set it resizing every frame.
  const sizes = await address.evaluate(async (el) => {
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      seen.add(`${getComputedStyle(el).fontSize} ${getComputedStyle(el).whiteSpace}`);
      await new Promise((done) => requestAnimationFrame(done));
    }
    return [...seen];
  });
  expect(sizes).toHaveLength(1);
});

test('coming back to the assistant reopens the conversation you were in', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  await page.route(`${API}/api/assistant/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/assistant/conversations' && route.request().method() === 'GET') {
      return route.fulfill({ json: { conversations: [{ id: 'c-old', title: 'Older', createdAt: 1, updatedAt: 1 }, { id: 'c-last', title: 'Matie', createdAt: 2, updatedAt: 2 }] } });
    }
    if (path === '/api/assistant/conversations/c-last') {
      return route.fulfill({ json: { conversation: { id: 'c-last', title: 'Matie', createdAt: 2, updatedAt: 2, messages: [{ role: 'user', content: 'lookup @matiephol for me' }, { role: 'assistant', content: 'That is Matie (@matiephol) on Karwan.' }] } } });
    }
    return route.fulfill({ json: { conversation: { id: 'c-new', title: 'New', createdAt: 3, updatedAt: 3, messages: [] } } });
  });
  await page.goto('/assistant');
  await expect(page.getByText('That is Matie (@matiephol) on Karwan.')).toBeVisible();
});
