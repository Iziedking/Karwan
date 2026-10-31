import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { API, ME, funded, serveMoney } from './moneyFixtures';
import { JOB, deliveredDeal, serveDeal } from './fixtures';

/// Every redesigned page at 1440 (view 44, Batch 9): the rail is there, nothing
/// scrolls sideways and axe finds nothing, in light, dark and Arabic.
const PAGES = ['/app', '/deals', '/market', '/account', '/profile', '/guarantee'];
const LOOKS = [
  { theme: 'light', locale: 'en' },
  { theme: 'dark', locale: 'en' },
  { theme: 'light', locale: 'ar' },
] as const;

async function serveSignedIn(page: Page) {
  await serveMoney(page, { balances: funded });
  await page.route(`${API}/api/profile**`, (route) =>
    route.fulfill({ json: { profile: { address: ME, displayName: 'Bola Ade', handle: 'bola', settings: { setupDoneAt: 1 } } } }));
  await page.route(`${API}/api/agents/status`, (route) =>
    route.fulfill({ json: { chain: { id: 5042002, rpc: 'http://127.0.0.1:3198', explorer: 'https://testnet.arcscan.app' }, contracts: {} } }));
}

async function look(page: Page, theme: string, locale: string) {
  await page.context().addCookies([{ name: 'karwan-locale', value: locale, url: 'http://127.0.0.1:3100' }]);
  await page.addInitScript((value) => {
    try {
      localStorage.setItem('karwan-theme', value);
      localStorage.setItem('karwan:guide:disabled', '1');
    } catch { /* private mode */ }
  }, theme);
}

async function checkPage(page: Page, name: string) {
  await page.waitForLoadState('load');
  await page.waitForTimeout(800);
  await expect(page.getByRole('navigation', { name: 'Workspace' }).or(page.locator('nav[aria-label]').first())).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, name).toBeLessThanOrEqual(0);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`), name).toEqual([]);
}

for (const { theme, locale } of LOOKS) {
  test(`redesigned pages fit a desktop in ${theme} ${locale}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the desktop sweep');
    test.setTimeout(180_000);
    await look(page, theme, locale);
    await serveSignedIn(page);
    for (const path of PAGES) {
      await page.goto(path);
      await checkPage(page, `${path} ${theme} ${locale}`);
      await page.screenshot({ path: testInfo.outputPath(`desktop${path.replace(/\//g, '-')}-${theme}-${locale}.png`), fullPage: true });
    }
  });

  test(`the deal page fits a desktop in ${theme} ${locale}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the desktop sweep');
    await look(page, theme, locale);
    await serveDeal(page, deliveredDeal);
    await page.goto(`/deals/${JOB}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await checkPage(page, `deal ${theme} ${locale}`);
    await page.screenshot({ path: testInfo.outputPath(`desktop-deal-${theme}-${locale}.png`), fullPage: true });
  });
}
