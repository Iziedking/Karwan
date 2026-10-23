import { expect, test, type Page } from '@playwright/test';
import { SELLER } from './fixtures';
import { en } from '../shared/i18n/messages/en';

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

async function mock(page: Page, opts: { pinSet?: boolean; wrongPins?: number } = {}): Promise<World> {
  const world: World = { outs: [], pins: [], confirms: [], codes: 0 };
  let wrong = opts.wrongPins ?? 0;
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
  await expect(sheet.getByRole('heading', { name: 'Send 56.25 USDC to 0x8f3a…c41e' })).toBeVisible();
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
});
