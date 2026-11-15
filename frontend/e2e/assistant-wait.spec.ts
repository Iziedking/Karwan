import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { API, funded, serveMoney } from './moneyFixtures';

/// View 84: while Aman works the page shows the step it is on and, on a longer
/// wait, one tip; the checked answer then replaces the wait.

const sse = (frames: Array<[string, unknown]>) => frames.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function serveAssistant(page: Page, chat: (route: import('@playwright/test').Route) => Promise<void>, result?: (route: import('@playwright/test').Route) => Promise<void>) {
  await serveMoney(page, { balances: funded });
  await page.route(`${API}/api/assistant/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/assistant/chat') return chat(route);
    if (path.startsWith('/api/assistant/chat/result/')) return result ? result(route) : route.fulfill({ status: 404, json: { error: 'not-found' } });
    if (path === '/api/assistant/conversations' && route.request().method() === 'GET') return route.fulfill({ json: { conversations: [] } });
    return route.fulfill({ json: { conversation: { id: 'c1', title: 'Chat', updatedAt: 0, messages: [] } } });
  });
}

async function ask(page: Page, text: string) {
  await page.goto('/assistant');
  await page.getByRole('textbox').fill(text);
  await page.locator('form:has(#assistant-ask) button[type="submit"]').click();
}

/// Records whether a tip was ever in the page, however briefly.
async function watchTips(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { sawTip: boolean }).sawTip = false;
    new MutationObserver(() => {
      if (document.querySelector('[data-wait-tip]')) (window as unknown as { sawTip: boolean }).sawTip = true;
    }).observe(document, { subtree: true, childList: true });
  });
}

test('the status follows the steps, and a broken stream falls back to the kept turn', async ({ page }) => {
  let release: () => void = () => undefined;
  await serveAssistant(
    page,
    (route) => route.fulfill({ headers: { 'content-type': 'text/event-stream' }, body: sse([['status', { tool: 'get_my_balance' }], ['status', { tool: 'get_deal_status' }]]) }),
    async (route) => {
      await new Promise<void>((resolve) => { release = resolve; });
      await route.fulfill({ json: { ok: true, reply: 'Saved answer' } });
    },
  );
  await ask(page, 'Where is my deal?');
  await expect(page.locator('[data-wait] [aria-live="polite"]')).toHaveText('Checking your deal');
  release();
  await expect(page.getByText('Saved answer')).toBeVisible();
  await expect(page.locator('[data-wait]')).toHaveCount(0);
});

test('a fast answer shows no tip', async ({ page }) => {
  await watchTips(page);
  await serveAssistant(page, async (route) => {
    await sleep(300);
    await route.fulfill({ headers: { 'content-type': 'text/event-stream' }, body: sse([['done', { reply: 'Quick one' }]]) });
  });
  await ask(page, 'Hello');
  await expect(page.getByText('Quick one')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { sawTip: boolean }).sawTip)).toBe(false);
});

test('a longer wait draws one tip after 900 ms, then the answer replaces the wait', async ({ page }) => {
  let release: () => void = () => undefined;
  await serveAssistant(page, async (route) => {
    await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({
      headers: { 'content-type': 'text/event-stream' },
      body: sse([['done', { reply: 'Your money is held safely until you approve the work.', actions: [{ kind: 'navigate', label: 'Open deals', href: '/deals' }] }]]),
    });
  });
  await ask(page, 'Is my money safe?');
  await expect(page.locator('[data-wait]')).toBeVisible();
  await sleep(500);
  await expect(page.locator('[data-wait-tip]')).toHaveCount(0);
  await expect(page.locator('[data-wait-tip]')).toHaveCount(1, { timeout: 2000 });
  const axe = await new AxeBuilder({ page }).include('[data-wait]').analyze();
  expect(axe.violations).toEqual([]);
  release();
  await expect(page.locator('[data-wait]')).toHaveCount(0);
  await expect(page.getByText('Your money is held safely until you approve the work.')).toBeVisible({ timeout: 1500 });
  await expect(page.getByRole('link', { name: 'Open deals' }).or(page.getByRole('button', { name: 'Open deals' }))).toBeVisible();
});

test('a quota answer is not a hang', async ({ page }) => {
  await serveAssistant(page, (route) => route.fulfill({ status: 429, json: { error: "You have reached today's assistant limit. It resets at midnight UTC.", code: 'assistant_quota_exhausted' } }));
  await ask(page, 'Hello');
  await expect(page.locator('[data-wait]')).toHaveCount(0);
  await expect(page.getByRole('textbox')).toBeEnabled();
});

test('with reduced motion the answer shows whole at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await serveAssistant(page, (route) => route.fulfill({ headers: { 'content-type': 'text/event-stream' }, body: sse([['done', { reply: 'One two three four five six seven' }]]) }));
  await ask(page, 'Count');
  await expect(page.getByText('One two three four five six seven')).toBeVisible({ timeout: 300 });
});
