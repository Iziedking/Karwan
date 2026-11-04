import { expect, test, type Page } from '@playwright/test';
import { docsAiCopy } from '../shared/i18n/messages/docsAi';
import { escrowDocsCopy } from '../shared/i18n/messages/escrowDocs';

/// The docs in the new look (view 48, batch 9j): Copy for AI, Ask Claude and
/// Ask ChatGPT under the title, and no green on a docs page.
const API = 'http://127.0.0.1:3199';
const t = docsAiCopy.en;

async function world(page: Page) {
  await page.addInitScript(() => localStorage.setItem('karwan:guide:disabled', '1'));
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/auth/bootstrap') return route.fulfill({ json: { user: null, profile: null } });
    return route.fulfill({ json: {} });
  });
}

test('the AI buttons open Claude and ChatGPT with this page, and Copy for AI copies it', async ({ page, context, browserName }) => {
  await world(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/docs/escrow');
  await expect(page.getByRole('heading', { level: 1, name: escrowDocsCopy.en.title })).toBeVisible();

  const group = page.getByRole('group', { name: t.group });
  const claude = group.getByRole('link', { name: new RegExp(t.claude) });
  const chatgpt = group.getByRole('link', { name: new RegExp(t.chatgpt) });
  for (const [link, at] of [[claude, 'https://claude.ai/new'], [chatgpt, 'https://chatgpt.com/']] as const) {
    await expect(link).toHaveAttribute('target', '_blank');
    const href = new URL((await link.getAttribute('href'))!);
    expect(href.origin + href.pathname).toBe(at);
    expect(href.searchParams.get('q')).toContain('/docs/escrow');
  }

  test.skip(browserName !== 'chromium', 'clipboard reads need chromium permissions');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await group.getByRole('button', { name: t.copy }).click();
  await expect(group.getByRole('button', { name: t.copied })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain(`# ${escrowDocsCopy.en.title}`);
  expect(copied).toContain(`## ${escrowDocsCopy.en.sections[0].heading}`);
  expect(copied).not.toContain(t.claude);
  expect(copied).toContain('/docs/escrow');
});

test('a docs page has no green, and on a phone the AI buttons fit on one line', async ({ page }) => {
  await world(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/docs/escrow');
  const group = page.getByRole('group', { name: t.group });
  await expect(group.getByRole('link', { name: new RegExp(t.claudeShort) })).toBeVisible();
  const tops = await group.locator(':scope > *').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  const green = await page.locator('[data-docs-content]').evaluate((root) => {
    const action = getComputedStyle(document.documentElement).getPropertyValue('--action').trim();
    const probe = document.createElement('div');
    probe.style.color = action;
    document.body.appendChild(probe);
    const want = getComputedStyle(probe).color;
    probe.remove();
    return Array.from(root.querySelectorAll('*')).filter((e) => getComputedStyle(e).backgroundColor === want).length;
  });
  expect(green).toBe(0);
});

test.describe('before the page runs', () => {
  test.use({ javaScriptEnabled: false });
  test('the AI links already name this page', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/docs/escrow');
    const link = page.getByRole('group', { name: t.group }).getByRole('link', { name: new RegExp(t.claude) });
    const href = new URL((await link.getAttribute('href'))!);
    expect(href.searchParams.get('q')).toContain('/docs/escrow');
  });
});
