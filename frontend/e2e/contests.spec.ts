import { expect, test, type Page } from '@playwright/test';
import type { ContestView } from '../core/api';
import { en } from '../shared/i18n/messages/en';
import { ar } from '../shared/i18n/messages/ar';
import { BUYER, SELLER } from './fixtures';

/// Contests (view 40): the buyer runs one and picks winners from previews, a
/// seller enters, and no screen says bounty, escrow, evaluator or stake.

const API = 'http://127.0.0.1:3199';
const t = en.contests;
const DAY = 86_400_000;
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

const contest = (over: Partial<ContestView> = {}): ContestView => ({
  id: 'c_demo', title: 'Best logo', brief: 'A logo for a bakery in Kano', tags: [], prizeMicros: '300000000', feeBps: 100,
  shares: [5000, 3000, 2000], entriesBy: Date.now() - DAY, awardBy: Date.now() + 6 * DAY, status: 'open', entries: 2, ...over,
});

async function serve(page: Page, who: string | null, view: ContestView, posted?: { body: unknown; path?: string }) {
  await page.addInitScript(() => {
    try { localStorage.setItem('karwan:guide:disabled', '1'); } catch { /* private mode */ }
  });
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();
    if (pathname === '/api/auth/bootstrap') {
      return route.fulfill({ json: who ? { user: { address: who, method: 'web3', hasPasskey: false }, profile: null } : { user: null, profile: null } });
    }
    if (pathname === '/api/terms/status') return route.fulfill({ json: { currentVersion: '1', acceptedVersion: '1' } });
    if (pathname.endsWith('/preview')) return route.fulfill({ body: PNG, contentType: 'image/png' });
    if (pathname === `/api/contests/${view.id}` && method === 'GET') return route.fulfill({ json: view });
    if (pathname === '/api/contests' && method === 'GET') return route.fulfill({ json: { contests: [view] } });
    if (pathname === `/api/contests/${view.id}/award/card`) return route.fulfill({ json: { card: { netMicros: ['149250000', '89550000'], backMicros: '60300000', totalMicros: '301500000' } } });
    if (pathname === '/api/contests/draft') {
      return route.fulfill({ json: { card: { title: 'Best logo', brief: 'x', prizeMicros: '300000000', feeHalfMicros: '1500000', totalMicros: '301500000', shares: [10000], placeNetMicros: ['298500000'], entriesBy: Date.now() + 7 * DAY, awardBy: Date.now() + 14 * DAY, ifNobody: 'If you pick nobody by then, the prize comes back to you.' } } });
    }
    if (method === 'POST' && pathname.startsWith('/api/contests')) {
      if (posted) { posted.body = route.request().postDataJSON(); posted.path = pathname; }
      return route.fulfill({ json: { contest: view, entry: { id: 'e_new', status: 'in' } } });
    }
    if (pathname.startsWith('/api/client-errors')) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ json: { items: [], events: [], movements: [], messages: [] } });
  });
}

const buyerView = () =>
  contest({
    mine: true,
    entryList: [
      { id: 'e_1', seller: '@ada', note: 'Gold and brown', status: 'in', previewUrl: '/api/contests/c_demo/entries/e_1/preview', files: 2 },
      { id: 'e_2', seller: '@tunde', note: 'Bread mark', status: 'in', previewUrl: '/api/contests/c_demo/entries/e_2/preview', files: 1 },
    ],
  });

test('the buyer picks winners in place order and sees what each is paid before paying', async ({ page }) => {
  const posted = { body: null as unknown };
  await serve(page, BUYER, buyerView(), posted);
  await page.goto('/contests/c_demo');
  await expect(page.getByRole('heading', { name: t.page.pick })).toBeVisible();
  await page.getByRole('button', { name: /@tunde/ }).click();
  await page.getByRole('button', { name: /@ada/ }).click();
  await page.getByRole('button', { name: t.page.pay }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('149.25 USDC');
  await expect(sheet).toContainText('@tunde');
  await expect(sheet).toContainText('60.3 USDC');
  await sheet.getByRole('button', { name: t.award.confirm }).click();
  await expect.poll(() => posted.body).toEqual({ entryIds: ['e_2', 'e_1'] });
});

test('a seller enters with their work; a visitor is asked to sign in', async ({ page }) => {
  const posted = { body: null as unknown, path: '' as string | undefined };
  await serve(page, SELLER, contest({ entriesBy: Date.now() + 3 * DAY, entries: 0 }), posted);
  await page.goto('/contests/c_demo');
  await page.locator('input[type=file]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
  await page.getByRole('button', { name: t.page.enter, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: t.enterSheet.confirm }).click();
  await expect.poll(() => posted.path).toBe('/api/contests/c_demo/entries');
  expect((posted.body as { files: string[] }).files[0]).toMatch(/^data:image\/png;base64,/);
});

test('a visitor sees the prize and is asked to sign in to enter', async ({ page }) => {
  await serve(page, null, contest({ entriesBy: Date.now() + 3 * DAY }));
  await page.goto('/contests/c_demo');
  await expect(page.getByText(t.market.prize.replace('{amount}', '300'))).toBeVisible();
  await expect(page.getByRole('link', { name: t.page.signIn })).toBeVisible();
});

test('running a contest shows the total before the prize is put up, and the copy never says bounty or escrow', async ({ page }) => {
  await serve(page, BUYER, contest());
  await page.goto('/contests/new?title=Best%20logo&brief=A%20bakery%20logo&prize=300&places=1&days=7');
  await page.getByRole('button', { name: t.form.review }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('301.5 USDC');
  await expect(sheet.getByRole('button', { name: t.card.confirm.replace('{amount}', '301.5') })).toBeVisible();
  await expect(page.getByText(/\b(bounty|escrow|evaluator|stake|vault|hash)\b/i)).toHaveCount(0);
});

test('a contest reads right to left in Arabic and fits a phone', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.addCookies([{ name: 'karwan-locale', value: 'ar', url: 'http://127.0.0.1:3100' }]);
  await serve(page, BUYER, buyerView());
  await page.goto('/contests/c_demo');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('button', { name: ar.contests.page.pay })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
