import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { en } from '../shared/i18n/messages/en';
import { landingCopy } from '../shared/i18n/messages/landing';

const mainnet = process.env.KARWAN_E2E_FIRST_VISIT_MAINNET === '1';
const API = 'http://127.0.0.1:3199';
const marketHref = mainnet ? 'https://testnet.karwan.site/market' : '/market';
const agreementHref = (mainnet ? 'https://testnet.karwan.site' : '') + '/buyer?mode=direct#new-deal';

async function open(page: Page, locale: keyof typeof landingCopy = 'en') {
  await page.context().addCookies([{ name: 'karwan-locale', value: locale, domain: '127.0.0.1', path: '/' }]);
  await page.addInitScript(() => {
    localStorage.setItem('karwan:guide:disabled', '1');
    localStorage.setItem('karwan-theme', 'dark');
  });
  await page.route(API + '/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/bootstrap') return route.fulfill({ json: { user: null, profile: null } });
    if (path === '/api/listings') return route.fulfill({ json: { listings: [], next: null } });
    return route.fulfill({ json: {} });
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.locator('#landing-title')).toContainText(landingCopy[locale].hero.titleFirst);
}

for (const locale of ['en', 'fr', 'ar', 'hi', 'sw'] as const) {
  test(locale + ': first visit says what Karwan does and offers the right next step', async ({ page }, info) => {
    await open(page, locale);
    const t = landingCopy[locale].hero;
    const hero = page.locator('section[aria-labelledby="landing-title"]');
    const primary = hero.getByRole('link', { name: mainnet ? t.waitlist : t.create, exact: true });
    await expect(primary).toHaveAttribute('href', mainnet ? '/waitlist' : agreementHref);
    await expect(primary).toBeInViewport();
    await expect(hero.getByRole('link', { name: mainnet ? t.seeDemo : t.explore })).toHaveAttribute('href', marketHref);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    for (const item of await hero.locator('[data-on] h1, [data-on] p, [data-on] a').all()) {
      const box = await item.boundingBox();
      if (box) { expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1); }
    }
    await page.screenshot({ path: info.outputPath('hero-' + locale + '.png') });
    if (locale === 'en' || locale === 'ar') {
      const scan = await new AxeBuilder({ page }).include('main').analyze();
      expect(scan.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
    }
  });
}

test('the main action opens the task it names without a sign-in detour', async ({ page }) => {
  await open(page);
  const hero = page.locator('section[aria-labelledby="landing-title"]');
  if (mainnet) {
    await hero.getByRole('link', { name: landingCopy.en.hero.waitlist, exact: true }).click();
    await expect(page).toHaveURL(/\/waitlist$/);
  } else {
    await hero.getByRole('link', { name: landingCopy.en.hero.explore }).click();
    await expect(page).toHaveURL(/\/market$/);
  }
});

test('returning customers have a separate sign-in entry', async ({ page }) => {
  await open(page);
  const header = page.locator('header[data-chrome="nav"]');
  if (page.viewportSize()!.width < 768) await header.getByRole('button', { name: en.nav.menuOpenAria }).click();
  await expect(header.getByRole('link', { name: en.common.signIn, exact: true })).toBeVisible();
  await expect(header.getByRole('link', { name: en.common.signIn, exact: true })).toHaveAttribute('href', '/start');
});

test('share metadata and About distinguish current testnet trading from planned portability', async ({ page }, info) => {
  await open(page);
  await expect(page).toHaveTitle('Karwan · online and cross-border trade');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /test funds/);
  const preview = await page.request.get('/opengraph-image');
  expect(preview.ok()).toBe(true);
  expect(preview.headers()['content-type']).toContain('image/png');
  await writeFile(info.outputPath('link-preview.png'), await preview.body());
  await page.goto('/brand');
  await expect(page.getByText(/Reputation sharing across platforms is being developed/)).toBeVisible();
});
