import { expect, test, type Page } from '@playwright/test';
import { API, funded, serveMoney } from './moneyFixtures';

/// A conversation in the new look (view 48, batch 9g): your messages in ink,
/// theirs on ash, and Send as the one green control.

const greenControls = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--action').trim();
    document.body.appendChild(probe);
    const green = getComputedStyle(probe).color;
    probe.remove();
    return [...document.querySelectorAll<HTMLElement>('a, button')]
      .filter((el) => el.offsetParent !== null && getComputedStyle(el).backgroundColor === green)
      .map((el) => el.getAttribute('aria-label') || el.textContent?.trim() || '');
  });

test('a conversation: your messages are ink, theirs ash, and Send is the one green control', async ({ page }, info) => {
  await serveMoney(page, { balances: funded });
  await page.route(`${API}/api/tags/tunde`, (route) => route.fulfill({ json: { found: true, self: false, tag: 'tunde', displayName: 'Tunde Bello', address: '0x00000000000000000000000000000000000000c1' } }));
  await page.route(`${API}/api/messages/tunde`, (route) => route.fulfill({ json: {
    with: { tag: '@tunde', country: 'NG', tier: 'ESTABLISHED' },
    messages: [
      { from: '@tunde', text: 'Hi, can you do a logo for my shop by Friday?', at: '2026-11-02T10:12:00.000Z' },
      { from: 'you', text: 'Yes. 120 USDC, two drafts, final files Friday.', at: '2026-11-02T10:20:00.000Z' },
    ],
  } }));
  await page.goto('/messages/tunde');
  await expect(page.getByRole('heading', { name: 'Tunde Bello' })).toBeVisible();
  await page.getByRole('textbox').fill('Sounds good');
  expect(await greenControls(page)).toEqual(['Send']);
  const fills = await page.evaluate(() => {
    // One probe per colour, beside the bubbles, so each reads the same theme they do.
    const list = document.querySelector('main ol')!;
    const read = (token: string) => {
      const probe = document.createElement('span');
      probe.style.backgroundColor = `var(${token})`;
      list.appendChild(probe);
      const value = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return value;
    };
    const ink = read('--ink');
    const ash = read('--ash');
    const bubble = (text: string) => getComputedStyle([...document.querySelectorAll('li p')].find((p) => p.textContent?.includes(text))!).backgroundColor;
    return { ink, ash, mine: bubble('two drafts'), theirs: bubble('by Friday') };
  });
  expect(fills.mine).toBe(fills.ink);
  expect(fills.theirs).toBe(fills.ash);
  await expect(page.locator('.karwan-splash-mark')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('conversation.png'), fullPage: true });
});
