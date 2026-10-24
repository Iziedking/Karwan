import { expect, test, type Page } from '@playwright/test';
import { SELLER } from './fixtures';
import { en } from '../shared/i18n/messages/en';
import { ar } from '../shared/i18n/messages/ar';
import { assertTopUpAppearance, prepareTopUpAppearance } from './instantTopUpFixtures';

const API = 'http://127.0.0.1:3199';
const JOB = '0x' + 'c'.repeat(64);
const OTHER = '0x8f3a' + '0'.repeat(32) + 'c41e';
const copy = en.confirmPresence;
const cash = en.cashoutFlow;
const PIN = '402917';

const info = {
  jobId: JOB,
  sellerAddress: SELLER,
  dealAmountUsdc: '56.25',
  settledAt: Date.now() - 60_000,
  legacyEscrow: false,
  accountKind: 'circle',
  identityWallet: { address: SELLER, arcBalanceUsdc: '12', available: true },
  sellerAgentWallet: { address: '0x' + 'd'.repeat(40), arcBalanceUsdc: '56.25', available: true },
  buyerAgentWallet: { address: null, arcBalanceUsdc: null, available: false },
};

const required = (over: Record<string, unknown> = {}) => ({
  code: 'CONFIRM_REQUIRED',
  challengeId: 'challenge-1',
  action: { kind: 'move_out', wallet: SELLER, amountMicros: '56250000', recipient: OTHER.toLowerCase(), detail: { chain: 'baseSepolia' } },
  text: 'Karwan confirmation',
  methods: ['passkey', 'pin'],
  pinSet: false,
  pinLockedUntil: null,
  passkeys: 0,
  enrol: 'email_code',
  ...over,
});

interface World {
  outs: { confirm: string | null }[];
  pins: { pin: string; emailCode?: string }[];
  confirms: { pin?: string }[];
  codes: number;
}

async function mock(page: Page, opts: { pinSet?: boolean; wrongPins?: number; wrongCodes?: number } = {}): Promise<World> {
  const world: World = { outs: [], pins: [], confirms: [], codes: 0 };
  let wrong = opts.wrongPins ?? 0;
  let wrongCodes = opts.wrongCodes ?? 0;
  await page.addInitScript(() => localStorage.setItem('karwan:guide:disabled', '1'));
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();
    if (pathname === '/api/auth/bootstrap') return route.fulfill({ json: { user: { address: SELLER, method: 'circle', hasPasskey: false }, profile: null } });
    if (pathname === `/api/cashout/${JOB}`) return route.fulfill({ json: info });
    if (pathname === '/api/bridge/circle-bridge-out' && method === 'POST') {
      const confirm = route.request().headers()['x-karwan-confirm'] ?? null;
      world.outs.push({ confirm });
      if (confirm !== 'grant-1') return route.fulfill({ status: 428, json: required(opts.pinSet ? { pinSet: true, enrol: null } : {}) });
      return route.fulfill({ json: { bridgeId: 'b-1', reference: 'KWN-OUT1-OUT2-OUT3' } });
    }
    if (pathname === '/api/bridge/b-1') return route.fulfill({ json: { bridgeId: 'b-1', status: 'minted', movementState: 'completed', burnTxHash: '0x' + 'b'.repeat(64) } });
    if (pathname === '/api/confirm/email-code' && method === 'POST') {
      world.codes += 1;
      return route.fulfill({ json: { sent: true } });
    }
    if (pathname === '/api/confirm/pin' && method === 'POST') {
      world.pins.push(route.request().postDataJSON());
      if (wrongCodes > 0) {
        wrongCodes -= 1;
        return route.fulfill({ status: 400, json: { error: 'That code is not right.', code: 'EMAIL_CODE_WRONG' } });
      }
      return route.fulfill({ json: { ok: true } });
    }
    if (pathname === '/api/confirm' && method === 'POST') {
      const body = route.request().postDataJSON() as { pin?: string };
      world.confirms.push(body);
      if (wrong > 0) {
        wrong -= 1;
        return route.fulfill({ status: 400, json: { code: 'WRONG_PIN', left: 4 } });
      }
      return route.fulfill({ json: { grant: 'grant-1' } });
    }
    if (method !== 'GET') return route.fulfill({ status: 403, body: '' });
    return route.fulfill({ json: { items: [], events: [], movements: [], messages: [] } });
  });
  return world;
}

async function startSend(page: Page) {
  await page.goto(`/cashout/${JOB}`);
  await page.getByRole('radio', { name: new RegExp(cash.optWallet) }).click();
  await page.getByRole('radio', { name: /Base Sepolia/ }).click();
  await page.getByLabel(cash.address).fill(OTHER);
  await page.getByRole('button', { name: /Send 56.25 USDC to Base/ }).click();
}

test('a first send sets a PIN with the email code, confirms it, and the money goes', async ({ page }) => {
  const world = await mock(page);
  await startSend(page);
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: /Send 56\.25 USDC to .*0x8f3a.*c41e/ })).toBeVisible();
  await sheet.getByRole('button', { name: copy.sendCode }).click();
  await expect.poll(() => world.codes).toBe(1);
  await sheet.getByLabel(copy.emailCode).fill('135790');
  await sheet.getByLabel(copy.setHint).fill(PIN);
  await sheet.getByTestId('confirm-set-pin').click();
  await expect.poll(() => world.pins).toEqual([{ pin: PIN, emailCode: '135790' }]);
  await sheet.getByLabel(copy.pinLabel).fill(PIN);
  await sheet.getByTestId('confirm-pin-submit').click();
  await expect(sheet.getByText(copy.done)).toBeVisible();
  await expect.poll(() => world.outs.map((o) => o.confirm)).toEqual([null, 'grant-1']);
  await expect(page.getByRole('button', { name: en.money.cross.done, exact: true })).toBeVisible({ timeout: 20_000 });
});

test('a wrong email code says so, keeps the new PIN, and a new code can be sent', async ({ page }) => {
  const world = await mock(page, { wrongCodes: 1 });
  await startSend(page);
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: copy.sendCode }).click();
  await sheet.getByLabel(copy.emailCode).fill('111111');
  await sheet.getByLabel(copy.setHint).fill(PIN);
  await sheet.getByTestId('confirm-set-pin').click();
  await expect(sheet.getByRole('alert')).toHaveText(copy.codeWrong);
  await expect(sheet.getByLabel(copy.setHint)).toHaveValue(PIN);
  await sheet.getByRole('button', { name: copy.resendCode }).click();
  await expect.poll(() => world.codes).toBe(2);
  await expect(sheet.getByRole('status')).toHaveText(copy.codeResent);
  await sheet.getByLabel(copy.emailCode).fill('246802');
  await sheet.getByTestId('confirm-set-pin').click();
  await expect.poll(() => world.pins.at(-1)).toEqual({ pin: PIN, emailCode: '246802' });
  await expect(sheet.getByLabel(copy.pinLabel)).toBeVisible();
});

test('a wrong PIN says how many tries are left, then the right one sends', async ({ page }) => {
  const world = await mock(page, { pinSet: true, wrongPins: 1 });
  await startSend(page);
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel(copy.pinLabel).fill('111222');
  await sheet.getByTestId('confirm-pin-submit').click();
  await expect(sheet.getByRole('alert')).toHaveText(copy.wrongPin.replace('{left}', '4'));
  await sheet.getByLabel(copy.pinLabel).fill(PIN);
  await sheet.getByTestId('confirm-pin-submit').click();
  await expect.poll(() => world.outs.map((o) => o.confirm)).toEqual([null, 'grant-1']);
});

test('closing the sheet moves nothing', async ({ page }) => {
  const world = await mock(page, { pinSet: true });
  await startSend(page);
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByLabel(copy.pinLabel)).toBeVisible();
  await sheet.getByRole('button', { name: copy.cancel }).click();
  await expect(sheet).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(world.outs).toHaveLength(1);
  expect(world.confirms).toHaveLength(0);
  // A quiet cancel: no error line, and the send can start again.
  // Next.js keeps an empty route announcer with the alert role; any alert with words is an error line.
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(0);
  await expect(page.getByText(/confirmation cancelled/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Send 56.25 USDC to Base/ })).toBeEnabled();
});

for (const [theme, locale] of [['dark', 'en'], ['light', 'ar'], ['dark', 'ar']] as const) {
  test(`the sheet reads right in ${theme} ${locale}`, async ({ page }, testInfo) => {
    await prepareTopUpAppearance(page, theme, locale);
    await page.route(`${API}/**`, async (route) => {
      const { pathname } = new URL(route.request().url());
      if (pathname === '/api/auth/bootstrap') return route.fulfill({ json: { user: { address: SELLER, method: 'circle', hasPasskey: true }, profile: null } });
      if (pathname === `/api/cashout/${JOB}`) return route.fulfill({ json: info });
      if (pathname === '/api/bridge/circle-bridge-out') return route.fulfill({ status: 428, json: required({ pinSet: true, enrol: null, passkeys: 1 }) });
      if (route.request().method() !== 'GET') return route.fulfill({ status: 403, body: '' });
      return route.fulfill({ json: { items: [], events: [], movements: [], messages: [] } });
    });
    await page.goto(`/cashout/${JOB}`);
    await assertTopUpAppearance(page, theme, locale);
    const flow = locale === 'ar' ? ar.cashoutFlow : cash;
    await page.getByRole('radio', { name: new RegExp(flow.optWallet) }).click();
    await page.getByRole('radio', { name: /Base Sepolia/ }).click();
    await page.getByLabel(flow.address).fill(OTHER);
    await page.getByRole('button', { name: /Base Sepolia/ }).click();
    const sheet = page.getByRole('dialog');
    const words = locale === 'ar' ? ar.confirmPresence : copy;
    await expect(sheet.getByText(words.title)).toBeVisible();
    await expect(sheet.getByRole('button', { name: words.usePasskey })).toBeVisible();
    await expect(sheet.getByLabel(words.pinLabel)).toBeVisible();
    const fit = await sheet.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, width: window.innerWidth, scroll: el.scrollWidth - el.clientWidth, page: document.documentElement.scrollWidth - window.innerWidth };
    });
    expect(fit.left).toBeGreaterThanOrEqual(0);
    expect(fit.right).toBeLessThanOrEqual(fit.width + 1);
    expect(fit.scroll).toBeLessThanOrEqual(1);
    expect(fit.page).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`confirm-${theme}-${locale}.png`) });
  });
}
