import { expect, test } from '@playwright/test';
import { API, funded, serveMoney } from './moneyFixtures';

const longReply = (n: number) => Array.from({ length: 24 }, (_, i) => `Reply ${n}, line ${i + 1}.`).join('\n\n');

test('a sent message comes into view, and the jump button returns to the newest', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  let replies = 0;
  let release: () => void = () => undefined;
  await page.route(`${API}/api/assistant/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/assistant/chat') {
      replies += 1;
      const n = replies;
      // Held, so the test sees the sent message before the reply lands.
      await new Promise<void>((resolve) => { release = resolve; });
      return route.fulfill({ json: { reply: longReply(n) } });
    }
    if (path === '/api/assistant/conversations' && route.request().method() === 'GET') return route.fulfill({ json: { conversations: [] } });
    return route.fulfill({ json: { conversation: { id: 'c1', title: 'Chat', updatedAt: 0, messages: [] } } });
  });
  await page.goto('/assistant');
  const ask = page.getByRole('textbox');

  for (const n of [1, 2, 3]) {
    await ask.fill(`Question ${n}`);
    await page.locator('form:has(#assistant-ask) button[type="submit"]').click();
    await expect(page.getByText(`Question ${n}`, { exact: true })).toBeInViewport();
    await expect.poll(() => replies).toBe(n);
    release();
    await expect(page.getByText(`Reply ${n}, line 24.`)).toBeInViewport();
  }

  const jump = page.getByRole('button', { name: 'Go to latest message' });
  await expect(jump).toHaveCount(0);
  await page.mouse.wheel(0, -4000);
  await expect(jump).toBeVisible();
  await jump.click();
  await expect(page.getByText('Reply 3, line 24.')).toBeInViewport();
  await expect(jump).toHaveCount(0);
});
