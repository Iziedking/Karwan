import { expect, test, type Page } from '@playwright/test';

/// Sharing the full passport (view 29): the owner makes and stops a share, the
/// person they shared it with sees everything, and an ended share shows the
/// sealed passport with one plain line.

const API = 'http://127.0.0.1:3199';
const OWNER = '0xa045e8104bc066fff5bfc673abf354871edc03c5';
const UNTIL = Date.UTC(2026, 9, 31, 14, 0);

const full = {
  address: OWNER, score: 518, tier: 'ESTABLISHED', scoreTier: 'ESTABLISHED', terms: { breadth: 0.67 },
  inputs: { distinctCounterparties: 20, lifetimeVolumeUsdc: 3046.85, lastActionAt: Date.UTC(2026, 9, 24), registeredAt: Date.UTC(2026, 4, 14) },
  successCount: 30, disputedCount: 0, failedCount: 0, totalDeals: 30, scoreBps: 5000,
};
const profile = { address: OWNER, displayName: 'Kingizie', handle: 'kingizie' };

async function serve(page: Page, viewer: string | null, reputation: Record<string, unknown>, shares: Array<Record<string, unknown>> = []) {
  await page.addInitScript(() => localStorage.setItem('karwan:guide:disabled', '1'));
  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    const { pathname } = new URL(req.url());
    if (pathname === '/api/auth/bootstrap') {
      return route.fulfill({ json: viewer ? { user: { address: viewer, method: 'circle', hasPasskey: true }, profile: null } : { user: null, profile: null } });
    }
    if (pathname === '/api/reputation') return route.fulfill({ json: reputation });
    if (pathname === '/api/reputation/shares' && req.method() === 'GET') return route.fulfill({ json: { shares } });
    if (pathname === '/api/reputation/shares' && req.method() === 'POST') {
      const body = req.postDataJSON() as { with: string | null; hours: number };
      const share = { id: 's1', with: body.with ? `@${body.with.replace(/^@/, '')}` : null, until: UNTIL, views: 0, createdAt: UNTIL - body.hours * 3_600_000 };
      shares.push(share);
      return route.fulfill({ json: { share, link: `https://testnet.karwan.site/credit-passport/${OWNER}?share=tok123` } });
    }
    if (pathname.startsWith('/api/reputation/shares/') && req.method() === 'DELETE') {
      shares.splice(0, shares.length);
      return route.fulfill({ json: { stopped: true } });
    }
    if (pathname === '/api/vault/positions') return route.fulfill({ json: { vaultAddress: null, positions: [], totalActiveUsdc: '7050', totalCoolingUsdc: '0', cooldownDays: 7, synced: true } });
    if (pathname.startsWith('/api/profile')) return route.fulfill({ json: { profile } });
    return route.fulfill({ json: {} });
  });
}

test('the owner shares their full record with one person, sees it listed, and stops it', async ({ page }) => {
  await serve(page, OWNER, full);
  await page.goto(`/credit-passport/${OWNER}`);
  await page.getByRole('button', { name: 'Share full record' }).click();
  await page.getByRole('button', { name: 'Create link' }).click();
  await expect(page.getByText('Enter their Karwan tag.')).toBeVisible();
  await page.getByLabel('Their Karwan tag').fill('@lawful');
  await page.getByRole('button', { name: '7 days' }).click();
  const posted = page.waitForRequest((r) => r.url().endsWith('/api/reputation/shares') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Create link' }).click();
  expect((await posted).postDataJSON()).toEqual({ with: '@lawful', hours: 168 });
  await expect(page.getByText(/Only @lawful can open it, signed in, until/)).toBeVisible();
  await expect(page.getByText(`https://testnet.karwan.site/credit-passport/${OWNER}?share=tok123`)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Shared now' })).toBeVisible();
  await expect(page.getByText('Not opened yet', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Stop sharing' }).click();
  await expect(page.getByRole('heading', { name: 'Shared now' })).toHaveCount(0);
});

test('the person it was shared with sees everything the owner sees, and who shared it until when', async ({ page }) => {
  await serve(page, null, { ...full, shared: { by: '@kingizie', until: UNTIL } });
  const repRead = page.waitForRequest((r) => r.url().includes('/api/reputation?') && r.url().includes('share=tok123'));
  await page.goto(`/credit-passport/${OWNER}?share=tok123`);
  await repRead;
  await expect(page.getByText(/^Shared by @kingizie until/)).toBeVisible();
  await expect(page.getByText('Trade record')).toBeVisible();
  await expect(page.getByText('3,046.85 USDC')).toBeVisible();
  await expect(page.getByText(/^7,050(\.00)? USDC$/)).toBeVisible();
  await expect(page.getByText(/^Deals so far are with 20 different people/)).toBeVisible();
  await expect(page.getByText(/^Your deals/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Share full record' })).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('an ended share shows the sealed passport and says so', async ({ page }) => {
  await serve(page, null, { sealed: true, address: OWNER, displayName: 'Kingizie', tag: 'kingizie', tier: 'ESTABLISHED', reasons: ['HAS_COMPLETED_DEALS'], memberSince: null });
  await page.goto(`/credit-passport/${OWNER}?share=old`);
  await expect(page.getByRole('status')).toHaveText('This share has ended, so you see the public passport.');
  await expect(page.getByRole('heading', { name: 'Kingizie', level: 1 })).toBeVisible();
  await expect(page.getByText('Trade record')).toHaveCount(0);
});
