import { expect, test } from '@playwright/test';
import { SELLER } from './fixtures';
import { en } from '../shared/i18n/messages/en';

const API = 'http://127.0.0.1:3199';
const JOB = '0x' + 'e'.repeat(64);

/// The seller's World ID step lives on /seller, where the email and chat
/// message send them (#world-checks), whichever version of the page is on.
/// Before 9 Nov 2026 it showed only on the newer desk, so a seller sent there
/// on testnet found the offer form and the buyer waited.
test('a seller sent to confirm with World ID finds the step on /seller and can do it', async ({ page }) => {
  let skipped = 0;
  await page.addInitScript(() => localStorage.setItem('karwan:guide:disabled', '1'));
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();
    if (pathname === '/api/auth/bootstrap') return route.fulfill({ json: { user: { address: SELLER, method: 'circle', hasPasskey: false }, profile: null } });
    if (pathname === '/api/agents/seller') {
      return route.fulfill({
        json: {
          profile: null,
          activeBids: [],
          recentBids: [],
          worldChecks: skipped ? [] : [{ jobId: JOB, title: 'Four clothes sewn at home', priceUsdc: '200', reason: 'first_deal', skipAllowed: true }],
        },
      });
    }
    if (pathname === `/api/jobs/${JOB}/world-check/skip` && method === 'POST') {
      skipped += 1;
      return route.fulfill({ json: { skipped: true, role: 'seller', funded: false, worldCheck: null } });
    }
    if (method !== 'GET') return route.fulfill({ status: 403, body: '' });
    return route.fulfill({ json: { items: [], events: [], movements: [], messages: [], listings: [], proposals: [] } });
  });
  await page.goto('/seller#world-checks');
  const section = page.locator('#world-checks');
  await expect(section.getByRole('heading', { name: en.agentNudges.world.sellerTitle })).toBeVisible();
  await expect(section).toContainText('A buyer chose your offer on Four clothes sewn at home at 200 USDC.');
  await section.getByRole('button', { name: en.worldCheck.skip }).click();
  await expect.poll(() => skipped).toBe(1);
  await expect(section).toHaveCount(0);
});
