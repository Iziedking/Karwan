import { expect, test, type Page } from '@playwright/test';
import { BUYER } from './fixtures';

const API = 'http://127.0.0.1:3199';
const WIDTHS = [320, 360, 375, 390, 414, 430];
const PAGES = ['/', '/market', '/start', '/stake', '/profile'];

async function mockApi(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('karwan:guide:disabled', '1');
  });
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (route.request().method() !== 'GET') return route.fulfill({ status: 403, body: '' });
    if (pathname === '/api/auth/bootstrap') {
      return route.fulfill({ json: { user: { address: BUYER, method: 'circle', hasPasskey: true }, profile: null } });
    }
    if (pathname === '/api/reputation') {
      return route.fulfill({ json: { score: 780, tier: 'GOLD', tierCappedBy: 'concentration', nextTier: 'ESTABLISHED' } });
    }
    return route.fulfill({ json: { items: [], events: [], movements: [], messages: [], listings: [], briefs: [] } });
  });
}

test('every page fits phones from 320 to 430 wide, and row labels never sit under their values', async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== 'phone', 'one pass covers every width');
  test.setTimeout(240_000);
  await mockApi(page);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of PAGES) {
      await page.goto(`${baseURL}${path}`);
      await page.waitForLoadState('networkidle');
      const report = await page.evaluate(() => {
        const html = document.documentElement;
        const overlaps: string[] = [];
        for (const row of document.querySelectorAll('main .divide-y > *')) {
          const parts = Array.from(row.children).filter((el) => (el as HTMLElement).innerText?.trim());
          for (let i = 1; i < parts.length; i += 1) {
            const a = parts[i - 1]!.getBoundingClientRect();
            const b = parts[i]!.getBoundingClientRect();
            const sameLine = a.top < b.bottom && b.top < a.bottom;
            if (sameLine && a.right > b.left + 1) overlaps.push((row as HTMLElement).innerText.slice(0, 40));
          }
        }
        return { overflow: html.scrollWidth - html.clientWidth, overlaps };
      });
      expect(report.overflow, `${path} at ${width}px scrolls sideways`).toBeLessThanOrEqual(0);
      expect(report.overlaps, `${path} at ${width}px`).toEqual([]);
    }
  }
});
