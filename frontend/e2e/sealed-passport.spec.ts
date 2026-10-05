import { expect, test, type Page } from '@playwright/test';

const API = 'http://127.0.0.1:3199';
const SUBJECT = '0x3b3cf9daad222c452245fb07cf20c3cb56042d61';

async function servePassport(page: Page, passport: Record<string, unknown>) {
  await page.addInitScript(() => localStorage.setItem('karwan:guide:disabled', '1'));
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/auth/bootstrap') return route.fulfill({ json: { user: null, profile: null } });
    if (pathname === '/api/reputation') return route.fulfill({ json: { sealed: true, address: SUBJECT, ...passport } });
    return route.fulfill({ json: {} });
  });
}

test('a visitor sees tier and reasons on the passport, never numbers', async ({ page }) => {
  await servePassport(page, { displayName: 'Ada Obi', tag: 'ada', tier: 'ESTABLISHED', reasons: ['HAS_COMPLETED_DEALS', 'USUALLY_ON_TIME'], memberSince: 1_700_000_000_000 });
  await page.goto(`/credit-passport/${SUBJECT}`);
  await expect(page.getByRole('heading', { name: 'Ada Obi' })).toBeVisible();
  await expect(page.getByText('Usually delivers on time')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start a protected deal' })).toHaveAttribute('href', `/buyer?seller=${SUBJECT}`);
  const text = await page.getByRole('article').innerText();
  expect(text).not.toMatch(/\b\d+ (deals?|USDC)\b/);
});

for (const width of [390, 768, 1440]) {
  test(`the passport fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await servePassport(page, { displayName: 'Ada Obi', tag: 'ada', tier: 'NEW', reasons: ['NEW_ON_KARWAN'], memberSince: null });
    await page.goto(`/credit-passport/${SUBJECT}`);
    await expect(page.getByText('New on Karwan')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
}
