import { expect, test, type Page } from '@playwright/test';
import { API, funded, serveMoney } from './moneyFixtures';

/// A picture pasted into the assistant waits in the box like in a chat app,
/// goes with the words on Send, and shows in the message (owner, 24 Oct 2026).

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function open(page: Page) {
  const calls = { attach: [] as string[], chat: [] as Array<Array<{ role: string; content: string }>> };
  await serveMoney(page, { balances: funded });
  await page.route(`${API}/api/assistant/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === '/api/assistant/attach') {
      const body = req.postDataBuffer()?.toString('latin1') ?? '';
      if (/name="purpose"\s+auto/.test(body)) {
        calls.attach.push('auto');
        return route.fulfill({ json: { note: '[I sent a photo, no caption. It shows a red sneaker.]', turn: true } });
      }
      calls.attach.push(body.includes('offer') ? 'offer' : 'invoice');
      return route.fulfill({ json: { reply: 'Photo added for your next offer (1 of 4).' } });
    }
    if (path === '/api/assistant/chat') {
      calls.chat.push((req.postDataJSON() as { messages: Array<{ role: string; content: string }> }).messages);
      return route.fulfill({ json: { reply: 'Your offer is ready to post.' } });
    }
    if (path === '/api/assistant/conversations' && req.method() === 'GET') return route.fulfill({ json: { conversations: [] } });
    return route.fulfill({ json: { conversation: { id: 'c-1', title: 'New', createdAt: 1, updatedAt: 1, messages: [] } } });
  });
  await page.goto('/assistant');
  return calls;
}

async function pastePicture(page: Page) {
  await page.locator('#assistant-ask').evaluate((el, b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], 'shot.png', { type: 'image/png' }));
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, PNG);
}

test('a pasted picture waits in the box, then goes with the words and shows in the message', async ({ page }) => {
  const calls = await open(page);
  await pastePicture(page);
  await expect(page.getByRole('img', { name: 'shot.png' })).toBeVisible();
  expect(calls.attach).toEqual([]);

  await page.locator('#assistant-ask').fill('selling this for 50 USDC');
  await page.locator('form:has(#assistant-ask) button[type="submit"]').click();

  await expect(page.getByText('Your offer is ready to post.')).toBeVisible();
  await expect(page.locator('img[src^="blob:"]')).toHaveCount(1);
  await expect(page.getByText('selling this for 50 USDC')).toBeVisible();
  await expect(page.getByRole('img', { name: 'shot.png' })).toHaveCount(0);
  expect(calls.attach).toEqual(['offer']);
  expect(calls.chat.at(-1)?.at(-1)).toEqual({ role: 'user', content: 'selling this for 50 USDC' });
});

test('a picture sent alone goes to the assistant with what it shows, and can be removed before sending (view 66)', async ({ page }) => {
  const calls = await open(page);
  await pastePicture(page);
  await page.getByRole('button', { name: 'Remove photo 1' }).click();
  await expect(page.getByRole('img', { name: 'shot.png' })).toHaveCount(0);

  await pastePicture(page);
  await page.locator('form:has(#assistant-ask) button[type="submit"]').click();
  await expect(page.getByText('Your offer is ready to post.')).toBeVisible();
  expect(calls.attach).toEqual(['auto']);
  expect(calls.chat.at(-1)?.at(-1)).toEqual({ role: 'user', content: '[I sent a photo, no caption. It shows a red sneaker.]' });
  await expect(page.locator('img[src^="blob:"]')).toHaveCount(1);
});
