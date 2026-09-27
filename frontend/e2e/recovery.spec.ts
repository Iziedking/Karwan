import { expect, test, type Page, type Route } from '@playwright/test';

// Runs only in the mainnet recovery build (KARWAN_E2E_RECOVERY=1, see
// playwright.config.ts). The chain and Circle steps are proven on Arc mainnet
// by scripts/spikes/recovery-spike.mts; this covers the screens and their
// wiring to the recovery API.

const API = 'http://127.0.0.1:3199';
const EMAIL = 'ada@example.com';
// Tiny Argon2id cost so the browser work is instant in tests.
const FAST_KDF = { alg: 'argon2id', m: 1024, t: 2, p: 1, salt: 'c2FsdHNhbHRzYWx0c2FsdA' };

type World = {
  request?: null | { state: 'waiting' | 'released'; releasableAt: number };
  kdf?: 'ok' | 'not_registered';
  start?: (route: Route) => Promise<void>;
  cancel?: (route: Route) => Promise<void>;
};

async function serve(page: Page, world: World) {
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    switch (pathname) {
      case '/api/auth/lookup': return json({ exists: true, hasPasskey: true, modular: true });
      case '/api/recovery/code/request': return json({ sent: true });
      case '/api/recovery/code/verify': return json({ ticket: 'ticket-0123456789abcdefghij' });
      case '/api/recovery/state': return json({ request: world.request ?? null });
      case '/api/recovery/kdf':
        return world.kdf === 'not_registered'
          ? json({ error: 'not_registered', code: 'not_registered' }, 400)
          : json({ kdf: FAST_KDF });
      case '/api/recovery/start': return world.start ? world.start(route) : json({ state: 'waiting', releasableAt: Date.UTC(2026, 9, 1, 12), created: true });
      case '/api/recovery/cancel': return world.cancel ? world.cancel(route) : json({ cancelled: true });
      case '/api/auth/me': return json({ error: 'unauthorized' }, 401);
      default: return json({});
    }
  });
}

async function openRecovery(page: Page) {
  await page.goto('/start');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Lost your passkey?' }).click();
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Continue' }).click();
}

test('starting a recovery shows when it can finish', async ({ page }) => {
  let sentVerifier = '';
  await serve(page, {
    start: async (route) => {
      sentVerifier = (route.request().postDataJSON() as { verifier: string }).verifier;
      await route.fulfill({ json: { state: 'waiting', releasableAt: Date.UTC(2026, 9, 1, 12), created: true } });
    },
  });
  await openRecovery(page);
  await page.getByLabel('Recovery password').fill('mango river lamp 42');
  await page.getByRole('button', { name: 'Start recovery' }).click();
  await expect(page.getByRole('heading', { name: 'Recovery started' })).toBeVisible();
  await expect(page.getByText(/You can finish on/)).toBeVisible();
  expect(sentVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(sentVerifier).not.toContain('mango');
});

test('a wrong password says how many tries are left and asks for a new code', async ({ page }) => {
  await serve(page, {
    start: (route) => route.fulfill({ status: 400, json: { error: 'wrong_password', code: 'wrong_password', remaining: 3 } }),
  });
  await openRecovery(page);
  await page.getByLabel('Recovery password').fill('not the one at all');
  await page.getByRole('button', { name: 'Start recovery' }).click();
  await expect(page.getByText("That password doesn't match. 3 tries left today.")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send code' })).toBeVisible();
});

test('a wallet that never turned recovery on is told plainly', async ({ page }) => {
  await serve(page, { kdf: 'not_registered' });
  await openRecovery(page);
  await expect(page.getByText(/Recovery was never turned on for this wallet/)).toBeVisible();
});

test('coming back before the wait is over shows the finish time, not a password field', async ({ page }) => {
  await serve(page, { request: { state: 'waiting', releasableAt: Date.now() + 5 * 60 * 60 * 1000 } });
  await openRecovery(page);
  await expect(page.getByText(/Recovery is in progress. You can finish on/)).toBeVisible();
  await expect(page.getByLabel('Recovery password')).toHaveCount(0);
});

test('the cancel link in the email cancels and says so', async ({ page }) => {
  let token = '';
  await serve(page, {
    cancel: async (route) => {
      token = (route.request().postDataJSON() as { token: string }).token;
      await route.fulfill({ json: { cancelled: true } });
    },
  });
  await page.goto('/recover/cancel?token=abcdefghijklmnopqrstuvwx');
  await page.getByRole('button', { name: 'Cancel recovery' }).click();
  await expect(page.getByRole('heading', { name: 'Recovery cancelled' })).toBeVisible();
  expect(token).toBe('abcdefghijklmnopqrstuvwx');
});

test('a cancel link that was already used says so', async ({ page }) => {
  await serve(page, { cancel: (route) => route.fulfill({ status: 400, json: { error: 'nothing_to_cancel', code: 'nothing_to_cancel' } }) });
  await page.goto('/recover/cancel?token=abcdefghijklmnopqrstuvwx');
  await page.getByRole('button', { name: 'Cancel recovery' }).click();
  await expect(page.getByText('This link has expired or was already used.')).toBeVisible();
});
