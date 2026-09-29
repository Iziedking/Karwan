import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { signupCopy } from '../shared/i18n/messages/signup';
import { API, funded } from './moneyFixtures';
import { serveSearch } from './searchFixtures';

const mainnet = process.env.KARWAN_UI_NETWORK === 'mainnet';
const EMAIL = 'signin-fixture@example.com';
const TAG = 'signin_fixture';
const en = signupCopy.en;
type Theme = 'light' | 'dark';
type Locale = 'en' | 'ar';
type AuthWorld = {
  lookup?: { exists: boolean; hasPasskey: boolean };
  invited?: boolean;
};
type CapturedRequest = { path: string; body: unknown };

async function open(page: Page, {
  theme = 'light', locale = 'en', route = '/start', world = {},
}: { theme?: Theme; locale?: Locale; route?: string; world?: AuthWorld } = {}) {
  await page.context().addCookies([{ name: 'karwan-locale', value: locale, domain: '127.0.0.1', path: '/' }]);
  await page.addInitScript(value => localStorage.setItem('karwan-theme', value), theme);
  await serveSearch(page, { balances: funded });
  // Even opening the wallet chooser must not contact an external provider.
  await page.route('**/*', async route => {
    const host = new URL(route.request().url()).hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') return route.abort();
    return route.fallback();
  });
  const requests: CapturedRequest[] = [];
  await page.route(`${API}/**`, async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (route.request().method() === 'POST') {
      requests.push({ path, body: route.request().postDataJSON() });
    }
    switch (path) {
      case '/api/auth/bootstrap':
        return route.fulfill({ json: { user: null, profile: null } });
      case '/api/auth/me':
        return route.fulfill({ status: 401, json: { error: 'unauthorized' } });
      case '/api/auth/lookup':
        return route.fulfill({ json: world.lookup ?? { exists: false, hasPasskey: false } });
      case '/api/signup/tag':
        return route.fulfill({ json: { tag: url.searchParams.get('tag'), available: true } });
      case '/api/auth/otp/request':
      case '/api/waitlist/request':
        return route.fulfill({ json: { sent: true } });
      case '/api/auth/otp/verify':
        return route.fulfill({ status: 400, json: { error: 'wrong code' } });
      case '/api/waitlist/verify':
        return route.fulfill({ json: {
          joined: true, alreadyJoined: false, joinedAt: Date.UTC(2026, 8, 29),
          invited: world.invited ?? false, position: world.invited ? null : 7,
          answerToken: 'fixture-waitlist-answer',
        } });
      case '/api/waitlist/use-case':
        return route.fulfill({ json: { saved: true } });
      default:
        return route.fallback();
    }
  });
  await page.goto(route);
  await expect.poll(() => page.locator('html').getAttribute('data-theme').then(value => value ?? 'light')).toBe(theme);
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return requests;
}

async function layoutIsSound(page: Page, testInfo: TestInfo) {
  const panel = page.getByTestId('signin-media');
  await expect(panel).toHaveCount(1);
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.locator('#site-footer')).toHaveCount(0);
  if (page.viewportSize()!.width >= 1024) await expect(panel).toBeVisible();
  else await expect(panel).toBeHidden();
  // The owner-approved film has not been produced; the current panel is SVG art.
  await expect(panel.locator('video')).toHaveCount(0);
  await expect(panel.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.locator('body')).not.toContainText(/[→←↗]/);
  const metrics = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = 'var(--action)';
    document.body.appendChild(probe);
    const action = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const visible = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    // Disabled controls still have a primary fill. SVG artwork (including its
    // required capsule stripe) is not a second competing action.
    const primary = Array.from(document.querySelectorAll<HTMLElement>('button, a, input, [role="button"]'))
      .filter(el => visible(el) && getComputedStyle(el).backgroundColor === action)
      .map(el => ({ tag: el.tagName, label: el.textContent?.trim(), disabled: el.matches(':disabled') }));
    const headings = Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'))
      .filter(visible).map(el => ({ text: el.textContent?.trim(), weight: Number(getComputedStyle(el).fontWeight) }));
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, primary, headings };
  });
  const axe = await new AxeBuilder({ page }).analyze();
  await testInfo.attach('layout', { body: JSON.stringify({ ...metrics, violations: axe.violations }, null, 2), contentType: 'application/json' });
  expect(metrics.overflow).toBeLessThanOrEqual(0);
  expect(metrics.primary).toHaveLength(1);
  const card = page.getByRole('heading', { level: 1 }).locator('..');
  const cardStyle = await card.evaluate(el => {
    const style = getComputedStyle(el);
    return { radius: style.borderRadius, border: style.borderTopWidth, shadow: style.boxShadow };
  });
  expect(cardStyle).toEqual({ radius: '20px', border: '0px', shadow: 'none' });
  for (const heading of metrics.headings) expect(heading.weight, heading.text).toBeLessThanOrEqual(500);
  expect(axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
}

async function signIn(page: Page) {
  if (mainnet) await page.getByRole('button', { name: en.waitlist.signIn, exact: true }).click();
  await expect(page.getByRole('heading', { name: en.signIn.title, exact: true })).toBeVisible();
}

for (const theme of ['light', 'dark'] as const) {
  for (const locale of ['en', 'ar'] as const) {
    test(`/start ${theme} ${locale}`, async ({ page }, testInfo) => {
      const copy = signupCopy[locale];
      await open(page, { theme, locale });
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(mainnet ? copy.waitlist.title : copy.signIn.title);
      const primary = page.getByRole('button', { name: mainnet ? copy.waitlist.join : copy.signIn.continue, exact: true });
      await expect(primary).toBeDisabled();
      await layoutIsSound(page, testInfo);
      await page.screenshot({ path: testInfo.outputPath('start.png'), fullPage: true });
      await page.getByLabel(mainnet ? copy.waitlist.emailLabel : copy.signIn.emailLabel, { exact: true }).fill(EMAIL);
      await expect(primary).toBeEnabled();
    });
  }
}

test('an unknown email offers sign-up and keeps the tag step reachable', async ({ page }, testInfo) => {
  const requests = await open(page);
  await signIn(page);
  await page.getByLabel(en.signIn.emailLabel, { exact: true }).fill(`  ${EMAIL.toUpperCase()}  `);
  await page.getByRole('button', { name: en.signIn.continue, exact: true }).click();
  await expect(page.getByText(en.signIn.notFound, { exact: true })).toBeVisible();
  expect(requests.find(r => r.path === '/api/auth/lookup')?.body).toEqual({ email: EMAIL });
  await page.getByRole('button', { name: en.signIn.createInstead, exact: true }).click();
  await expect(page.getByRole('heading', { name: en.signUp.tagLabel, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: en.signUp.next, exact: true })).toBeDisabled();
  await layoutIsSound(page, testInfo);
});

test('sign-up keeps tag availability, code errors and back navigation', async ({ page }, testInfo) => {
  const requests = await open(page, { route: '/start?mode=signup' });
  await page.getByLabel(en.signUp.tagLabel, { exact: true }).fill(TAG);
  await expect(page.getByText(en.signUp.tagAvailable.replace('{tag}', TAG), { exact: true })).toBeVisible();
  await page.getByRole('button', { name: en.signUp.next, exact: true }).click();
  await expect(page.getByRole('heading', { name: en.signUp.title, exact: true })).toBeVisible();
  await page.getByLabel(en.signUp.emailLabel, { exact: true }).fill(EMAIL);
  await page.getByRole('button', { name: en.signUp.sendCode, exact: true }).click();
  await expect(page.getByRole('heading', { name: en.signUp.codeTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: en.signUp.verify, exact: true })).toBeDisabled();
  await page.getByLabel(en.signUp.codeLabel, { exact: true }).fill('123456');
  await page.getByRole('button', { name: en.signUp.verify, exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: en.errors.codeRejected })).toHaveText(en.errors.codeRejected);
  expect(requests.find(r => r.path === '/api/auth/otp/verify')?.body).toEqual({ email: EMAIL, code: '123456' });
  await layoutIsSound(page, testInfo);
  await page.getByRole('button', { name: en.signUp.back, exact: true }).click();
  await expect(page.getByLabel(en.signUp.emailLabel, { exact: true })).toHaveValue(EMAIL);
  await page.getByRole('button', { name: en.signUp.back, exact: true }).click();
  await expect(page.getByLabel(en.signUp.tagLabel, { exact: true })).toHaveValue(TAG);
});

test('passkey lookup waits for the person to choose sign-in', async ({ page }, testInfo) => {
  const requests = await open(page, { world: { lookup: { exists: true, hasPasskey: true } } });
  await signIn(page);
  await page.getByLabel(en.signIn.emailLabel, { exact: true }).fill(EMAIL);
  await page.getByRole('button', { name: en.signIn.continue, exact: true }).click();
  await expect(page.getByRole('heading', { name: en.signIn.passkeyTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: en.signIn.passkeyButton, exact: true })).toBeEnabled();
  expect(requests.some(r => r.path === '/api/auth/login/options')).toBe(false);
  await layoutIsSound(page, testInfo);
});

test('the wallet chooser opens and can be dismissed without signing', async ({ page }) => {
  const requests = await open(page);
  await signIn(page);
  await page.getByRole('button', { name: en.signIn.wallet, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('heading', { name: en.signIn.title, exact: true })).toBeVisible();
  expect(requests.some(r => /\/api\/siwe\/(nonce|verify)$/.test(r.path))).toBe(false);
});

for (const invited of [false, true]) {
  test(`mainnet waitlist verifies an email, invited=${invited}`, async ({ page }, testInfo) => {
    test.skip(!mainnet, 'The waitlist is the mainnet entry flow.');
    const requests = await open(page, { world: { invited } });
    await page.getByLabel(en.waitlist.emailLabel, { exact: true }).fill(EMAIL);
    await page.getByRole('button', { name: en.waitlist.join, exact: true }).click();
    await expect(page.getByRole('heading', { name: en.waitlist.codeTitle, exact: true })).toBeVisible();
    await page.getByLabel(en.waitlist.codeLabel, { exact: true }).fill('123456');
    await page.getByRole('button', { name: en.waitlist.verify, exact: true }).click();
    await expect(page.getByRole('heading', { name: en.waitlist.doneTitle, exact: true })).toBeVisible();
    expect(requests.find(r => r.path === '/api/waitlist/request')?.body).toEqual({ email: EMAIL, locale: 'en' });
    expect(requests.find(r => r.path === '/api/waitlist/verify')?.body).toEqual({ email: EMAIL, code: '123456' });
    await layoutIsSound(page, testInfo);
    if (invited) {
      await expect(page.getByText(en.waitlist.invitedBody, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: en.waitlist.createAccount, exact: true }).click();
      await expect(page.getByRole('heading', { name: en.signUp.tagLabel, exact: true })).toBeVisible();
    } else {
      await expect(page.getByText(en.waitlist.position.replace('{n}', '7'), { exact: true })).toBeVisible();
      const choice = page.getByRole('button', { name: en.waitlist.useCases.sell_services, exact: true });
      await choice.click();
      await expect(choice).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => requests.find(r => r.path === '/api/waitlist/use-case')?.body)
        .toEqual({ token: 'fixture-waitlist-answer', useCases: ['sell_services'] });
      await expect(page.getByRole('link', { name: en.waitlist.tryTestnet, exact: true })).toHaveAttribute('href', /\/start\?mode=signup$/);
    }
  });
}
