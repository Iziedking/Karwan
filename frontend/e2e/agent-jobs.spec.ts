import { expect, test, type Page } from '@playwright/test';
import type { AgentJobView } from '../core/api';
import { en } from '../shared/i18n/messages/en';
import { SELLER } from './fixtures';

/// Deals from agents outside Karwan (view 15): the seller marks the work
/// delivered from its own page, the person's release page opens without an
/// account, and no screen says evaluator, escrow, MCP or AgentKit.

const API = 'http://127.0.0.1:3199';
const t = en.agentJobs;
const DAY = 86_400_000;

const job = (over: Partial<AgentJobView> = {}): AgentJobView => ({
  ref: 'aj_0123456789abcdef', status: 'funded', work: 'Logo for a bakery in Kano', amountUsdc: '110',
  deadline: Date.now() + 5 * DAY, reviewEndsAt: null, rejectedAt: null, unhappyNote: null, disputeBy: null, ...over,
});

async function serve(page: Page, who: string | null, view: AgentJobView, posted: { body?: unknown; path?: string } = {}) {
  await page.addInitScript(() => {
    try { localStorage.setItem('karwan:guide:disabled', '1'); } catch { /* private mode */ }
  });
  let current = view;
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();
    if (pathname === '/api/auth/bootstrap') {
      return route.fulfill({ json: who ? { user: { address: who, method: 'web3', hasPasskey: false }, profile: null } : { user: null, profile: null } });
    }
    if (pathname === '/api/terms/status') return route.fulfill({ json: { currentVersion: '1', acceptedVersion: '1' } });
    if (pathname === `/api/agent-jobs/${view.ref}` && method === 'GET') return route.fulfill({ json: { job: current } });
    if (pathname === '/api/agent-jobs/mine') return route.fulfill({ json: { jobs: [current] } });
    if (pathname === `/api/agent-jobs/${view.ref}/delivered`) {
      posted.body = route.request().postDataJSON();
      posted.path = pathname;
      current = { ...current, status: 'submitted', reviewEndsAt: Date.now() + 5 * DAY };
      return route.fulfill({ json: { job: current } });
    }
    if (pathname === '/api/agent-jobs/release/used-token-0123456789') return route.fulfill({ status: 410, json: { error: 'used', code: 'TOKEN_USED' } });
    if (pathname === '/api/agent-jobs/release/good-token-0123456789') {
      return route.fulfill({ json: { ok: true, seller: '@ada', work: 'Logo for a bakery in Kano', amountUsdc: '110', deliveryNote: 'Three files in the chat', reviewEnds: Date.now() + 4 * DAY } });
    }
    if (pathname.startsWith('/api/client-errors')) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ json: { items: [], events: [], movements: [], messages: [] } });
  });
}

const forbidden = /evaluator|escrow|\bMCP\b|AgentKit/i;

test('the seller marks an outside agent\'s deal delivered after one confirm', async ({ page }) => {
  const posted: { body?: unknown; path?: string } = {};
  await serve(page, SELLER, job(), posted);
  await page.goto('/agent-jobs/aj_0123456789abcdef');
  await expect(page.getByRole('heading', { name: t.seller.title })).toBeVisible();
  await expect(page.getByText('110 USDC').first()).toBeVisible();
  await expect(page.getByText(t.seller.badge)).toBeVisible();
  const deliver = page.getByRole('button', { name: t.seller.deliver });
  await expect(deliver).toBeDisabled();
  await page.getByLabel(t.seller.noteLabel).fill('Three logo files, sent in the chat');
  await deliver.click();
  await expect(page.getByText(t.seller.deliverConsequence)).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: t.seller.deliver }).click();
  await expect(page.getByText(t.seller.status.submitted)).toBeVisible();
  expect(posted.path).toBe('/api/agent-jobs/aj_0123456789abcdef/delivered');
  expect(posted.body).toEqual({ note: 'Three logo files, sent in the chat' });
  await expect(page.locator('main')).not.toContainText(forbidden);
});

test('the person answers delivered work without a Karwan account, and a used link says so', async ({ page }) => {
  await serve(page, null, job());
  await page.goto('/agent-jobs/release/good-token-0123456789');
  await expect(page.getByRole('heading', { name: t.release.title })).toBeVisible();
  await expect(page.getByText('Three files in the chat')).toBeVisible();
  await expect(page.getByRole('button', { name: t.release.happy.replace('{amount}', '110') })).toBeVisible();
  await page.getByRole('button', { name: t.release.notHappy }).click();
  await expect(page.getByRole('button', { name: t.release.sendNotHappy })).toBeDisabled();
  await expect(page.locator('main')).not.toContainText(forbidden);

  await page.goto('/agent-jobs/release/used-token-0123456789');
  await expect(page.getByText(t.errors.used)).toBeVisible();
});
