import { expect, test, type Page } from '@playwright/test';
import { BUYER, JOB, deliveredDeal } from './fixtures';

/// Runs against the mainnet build (KARWAN_E2E_RECOVERY=1). The web deal rail is
/// closed on mainnet, but a deal's own page opens, because the Karwan agent in
/// chat sends people there to confirm a money step.
const API = 'http://127.0.0.1:3199';
const CHAT_EMAIL = 'tg-ab12cd34ef56ab12cd34ef56@telegram.invalid';

async function serve(page: Page, email: string) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('karwan:guide:disabled', '1');
    } catch {
      /* private mode */
    }
  });
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/auth/bootstrap' || pathname === '/api/auth/me') {
      return route.fulfill({ json: { user: { address: BUYER, method: 'circle', email, hasPasskey: false }, profile: null } });
    }
    if (pathname === '/api/terms/status') return route.fulfill({ json: { currentVersion: '1', acceptedVersion: '1' } });
    if (pathname === '/api/profile') return route.fulfill({ json: { profile: null } });
    if (pathname === `/api/deals/direct/${JOB}`) return route.fulfill({ json: { deal: deliveredDeal } });
    if (pathname.startsWith('/api/client-errors')) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ json: { items: [], events: [], movements: [], messages: [] } });
  });
}

test('a deal’s own page opens on mainnet for the link the agent sends', async ({ page }) => {
  await serve(page, CHAT_EMAIL);
  await page.goto(`/deals/${JOB}`);
  await expect(page).toHaveURL(new RegExp(`/deals/${JOB}$`));
});

test('the rest of the web deal rail still goes to the wallet', async ({ page }) => {
  await serve(page, CHAT_EMAIL);
  for (const path of ['/market', '/app', '/deals/0xabc']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/account$/);
  }
});

test('a chat account on the wallet page is not sent to sign-up', async ({ page }) => {
  await serve(page, CHAT_EMAIL);
  await page.goto('/account');
  await page.waitForTimeout(2_500);
  await expect(page).toHaveURL(/\/account$/);
});

test('a web account with no profile still finishes sign-up first', async ({ page }) => {
  await serve(page, 'ada@example.com');
  await page.goto('/account');
  await expect(page).toHaveURL(/\/start\?mode=signup$/, { timeout: 10_000 });
});
