import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { en } from '../shared/i18n/messages/en';
import { ar } from '../shared/i18n/messages/ar';
import { fr } from '../shared/i18n/messages/fr';
import { hi } from '../shared/i18n/messages/hi';
import { sw } from '../shared/i18n/messages/sw';

const mainnet = process.env.KARWAN_E2E_FIRST_VISIT_MAINNET === '1';
const copies = { en, fr, ar, hi, sw };
const API = 'http://127.0.0.1:3199';
const marketHref = mainnet ? 'https://testnet.karwan.site/market' : '/market';
const agreementHref = (mainnet ? 'https://testnet.karwan.site' : '') + '/buyer?mode=direct#new-deal';

async function open(page: Page, locale: keyof typeof copies = 'en') {
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
  await expect(page.locator('#landing-title')).toContainText(copies[locale].landingEditorial.titleFirst);
}

for (const locale of ['en', 'fr', 'ar', 'hi', 'sw'] as const) {
  test(locale + ': first visit explains the task, availability and correct next step', async ({ page }, info) => {
    await open(page, locale);
    const t = copies[locale].landingEditorial;
    const hero = page.locator('section[aria-labelledby="landing-title"]');
    await expect(hero.getByText(t.trade, { exact: true })).toBeVisible();
    await expect(hero.getByRole('link', { name: mainnet ? t.waitlistCta : t.open, exact: true })).toHaveAttribute('href', mainnet ? '/waitlist' : '/market');
    await expect(hero.getByRole('link', { name: mainnet ? t.waitlistCta : t.open, exact: true })).toBeInViewport();
    await expect(hero.getByRole('link', { name: mainnet ? t.tryTestnet : t.bringLabel, exact: true })).toHaveAttribute('href', mainnet ? marketHref : agreementHref);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    const content = await hero.boundingBox();
    expect(content).not.toBeNull();
    for (const item of await hero.locator('h1, p, a').all()) {
      const box = await item.boundingBox();
      if (box) { expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width); }
    }
    await hero.screenshot({ path: info.outputPath('hero-' + locale + '.png') });
    if (locale === 'en' || locale === 'ar') {
      const scan = await new AxeBuilder({ page }).include('main').analyze();
      expect(scan.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
    }
  });
}

test('primary action opens the task it names without a sign-in detour', async ({ page }) => {
  await open(page);
  const hero = page.locator('section[aria-labelledby="landing-title"]');
  await hero.getByRole('link', { name: mainnet ? en.landingEditorial.waitlistCta : en.landingEditorial.open, exact: true }).click();
  await expect(page).toHaveURL(mainnet ? /\/waitlist$/ : /\/market$/);
});

test('existing-client entry preserves direct mode and the form anchor on the available network', async ({ page }) => {
  await open(page);
  const social = page.locator('#social-trades');
  const action = social.getByRole('link', { name: mainnet ? en.landingEditorial.tryTestnet : en.socialTrade.action, exact: true });
  await expect(action).toHaveAttribute('href', agreementHref);
  if (mainnet) {
    await page.route('https://testnet.karwan.site/buyer?**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Testnet deal entry</h1>' }));
    await action.click();
    await expect(page).toHaveURL(agreementHref);
  } else {
    await action.click();
    await expect(page).toHaveURL(/\/start(?:\?|$)/);
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
