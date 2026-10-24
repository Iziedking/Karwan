import { expect, test } from '@playwright/test';
import { API, funded, serveMoney } from './moneyFixtures';

/// A request posted from the assistant is followed in the same conversation
/// (view 30): its update shows at the end, and a newer one replaces it.

const posted = { role: 'assistant', content: 'Your agent is on it, asking sellers for offers.', live: true, actions: [] };
const agreed = {
  role: 'assistant',
  content: 'Agreed for you: your agent agreed 90 USDC with @pamcollins, the seller it recommends, within your budget of 100 USDC. Tap to lock the money in escrow; nothing moves until you do.',
  live: true,
  actions: [],
};

test('an open conversation shows where its request stands, and the newest state replaces the old', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  let liveReads = 0;
  const saved: unknown[] = [];
  await page.route(`${API}/api/assistant/**`, (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === '/api/assistant/conversations' && req.method() === 'GET') {
      return route.fulfill({ json: { conversations: [{ id: 'c1', title: 'Logo', createdAt: 1, updatedAt: 1 }] } });
    }
    if (path === '/api/assistant/conversations/c1') {
      return route.fulfill({ json: { conversation: { id: 'c1', title: 'Logo', createdAt: 1, updatedAt: 1, messages: [{ role: 'user', content: 'Find me a logo designer, 100 USDC' }, posted] } } });
    }
    if (path === '/api/assistant/conversations/c1/live') {
      liveReads += 1;
      return route.fulfill({ json: { turns: [agreed] } });
    }
    if (path === '/api/assistant/conversations' && req.method() === 'POST') {
      saved.push(req.postDataJSON());
      return route.fulfill({ json: { conversation: { id: 'c1', title: 'Logo', createdAt: 1, updatedAt: 2, messages: [] } } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/assistant');
  await expect(page.getByText('Your agent is on it, asking sellers for offers.')).toBeVisible();

  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByText(/^Agreed for you: your agent agreed 90 USDC with @pamcollins/)).toBeVisible();
  await expect(page.getByText('Your agent is on it, asking sellers for offers.')).toHaveCount(0);
  expect(liveReads).toBeGreaterThan(0);
  // Live turns are never saved into the conversation.
  expect(JSON.stringify(saved)).not.toContain('Agreed for you');
});
