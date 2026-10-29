import { expect, test, type Page } from '@playwright/test';
import type { WorkRequestView, WorkView, WorkWeekView } from '../core/api';
import { en } from '../shared/i18n/messages/en';
import { ar } from '../shared/i18n/messages/ar';
import { BUYER, SELLER } from './fixtures';

/// Hourly work (view 32): the hirer offers by tag and sees every figure before
/// paying, the worker logs hours by the minute, the hirer approves the exact
/// amount, and no screen says engagement, cycle, unit or escrow.

const API = 'http://127.0.0.1:3199';
const t = en.work;
const DAY = 86_400_000;

const week = (over: Partial<WorkWeekView> = {}): WorkWeekView => {
  const start = Date.now() - DAY;
  return {
    k: 0, fundedMicros: '301500000', loggedMinutes: 0, approvedMinutes: 0, objectedMinutes: 0, log: [], status: 'funded',
    start, end: start + 7 * DAY, logBy: start + 9 * DAY, reviewBy: start + 12 * DAY, settleAt: start + 9 * DAY,
    canLog: false, canApprove: false, canObject: false, ifPaid: { netMicros: '0', backMicros: '301500000', feeMicros: '0' }, ...over,
  };
};
const work = (over: Partial<WorkView> = {}): WorkView => ({
  id: 'w_demo', kind: 'hourly', role: 'hirer', hirer: BUYER, worker: SELLER, hirerName: '@bisi', workerName: '@ada',
  title: 'Virtual assistant', brief: 'Inbox and calendar', rateMicros: '15000000', maxHours: 20, periods: 4, runs: 4,
  startsAt: Date.now() - DAY, feeBps: 100, status: 'active', weeks: [week()], weekTotalMicros: '301500000',
  nextWeek: null, fundBlocked: null, canAccept: false, canTakeBack: false, canGiveNotice: true, ...over,
});

async function serve(page: Page, who: string, view: WorkView, posted?: { body: unknown; path?: string }) {
  await page.addInitScript(() => {
    try { localStorage.setItem('karwan:guide:disabled', '1'); } catch { /* private mode */ }
  });
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();
    if (pathname === '/api/auth/bootstrap') return route.fulfill({ json: { user: { address: who, method: 'web3', hasPasskey: false }, profile: null } });
    if (pathname === '/api/terms/status') return route.fulfill({ json: { currentVersion: '1', acceptedVersion: '1' } });
    if (pathname === '/api/tags/ada') return route.fulfill({ json: { found: true, self: false, tag: 'ada', displayName: 'Ada Obi', address: SELLER } });
    if (pathname.startsWith('/api/tags/')) return route.fulfill({ json: { found: false, tag: pathname.split('/').pop() } });
    if (pathname === '/api/work/draft') {
      return route.fulfill({ json: { card: {
        kind: 'hourly', title: 'Virtual assistant', brief: '', worker: SELLER, rateMicros: '15000000', maxHours: 20, periods: 4,
        startsAt: Date.now() + 2 * DAY, budgetMicros: '300000000', feeHalfMicros: '1500000', totalMicros: '301500000', mostMicros: '1206000000',
        note: 'You pay one week at a time. Hours not worked come back to you each week.',
      } } });
    }
    if (pathname === `/api/work/${view.id}` && method === 'GET') return route.fulfill({ json: { work: view } });
    if (method === 'POST' && pathname.startsWith('/api/work')) {
      if (posted) { posted.body = route.request().postDataJSON(); posted.path = pathname; }
      return route.fulfill({ json: { work: view } });
    }
    if (pathname.startsWith('/api/client-errors')) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ json: { items: [], events: [], movements: [], messages: [] } });
  });
}

test('the hirer names someone by tag and sees the first week and the most it can cost before paying', async ({ page }) => {
  const posted = { body: null as unknown, path: '' as string | undefined };
  await serve(page, BUYER, work(), posted);
  await page.goto('/work/new?title=Virtual%20assistant');
  await page.getByLabel(t.form.who).fill('ada');
  await expect(page.getByText('Ada Obi · @ada on Karwan')).toBeVisible();
  await page.getByLabel(t.form.rate).fill('15');
  await page.getByLabel(t.form.hours).fill('20');
  await page.getByLabel(t.form.weeks).fill('4');
  await page.getByRole('button', { name: t.form.review }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('301.5 USDC');
  await expect(sheet).toContainText('1206 USDC');
  await expect(sheet).toContainText('Ada Obi');
  await sheet.getByRole('button', { name: t.card.confirm.replace('{amount}', '301.5') }).click();
  await expect.poll(() => posted.path).toBe('/api/work');
  expect(posted.body).toMatchObject({ worker: '@ada', kind: 'hourly', rateUsdc: '15', maxHours: 20, periods: 4 });
  await expect(page.getByText(/\b(engagement|cycle|units?|escrow|stake|vault|hash)\b/i)).toHaveCount(0);
});

test('the worker logs hours and minutes, sent as whole minutes', async ({ page }) => {
  const posted = { body: null as unknown, path: '' as string | undefined };
  await serve(page, SELLER, work({ role: 'worker', canGiveNotice: true, weeks: [week({ canLog: true })] }), posted);
  await page.goto('/work/w_demo');
  await expect(page.getByText('@bisi is hiring you')).toBeVisible();
  await page.getByRole('button', { name: t.page.logHours }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel(t.sheets.log.hours).fill('12');
  await sheet.getByLabel(t.sheets.log.minutes).fill('30');
  await sheet.getByLabel(t.sheets.log.note).fill('Inbox cleanup');
  await sheet.getByRole('button', { name: t.sheets.log.confirm.replace('{hours}', '12 h 30 m') }).click();
  await expect.poll(() => posted.path).toBe('/api/work/w_demo/hours');
  expect(posted.body).toEqual({ minutes: 750, note: 'Inbox cleanup', k: 0 });
});

test('the hirer approves and sees exactly what the worker receives', async ({ page }) => {
  const posted = { body: null as unknown, path: '' as string | undefined };
  const logged = week({ status: 'logged', loggedMinutes: 750, canApprove: true, ifPaid: { netMicros: '186562500', backMicros: '113062500', feeMicros: '1875000' } });
  await serve(page, BUYER, work({ weeks: [logged] }), posted);
  await page.goto('/work/w_demo');
  await expect(page.getByText('You are hiring @ada')).toBeVisible();
  await expect(page.getByText('12 h 30 m of 20 h logged')).toBeVisible();
  await page.getByRole('button', { name: t.page.approve.replace('{hours}', '12 h 30 m') }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('186.5625 USDC');
  await sheet.getByRole('button', { name: t.sheets.approve.confirm }).click();
  await expect.poll(() => posted.path).toBe('/api/work/w_demo/approve');
  expect(posted.body).toEqual({ k: 0 });
});

test('hourly work reads right to left in Arabic and fits a phone', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.addCookies([{ name: 'karwan-locale', value: 'ar', url: 'http://127.0.0.1:3100' }]);
  await serve(page, BUYER, work({ nextWeek: { k: 1, totalMicros: '301500000' } }));
  await page.goto('/work/w_demo');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('button', { name: ar.work.page.fundWeek.replace('{n}', '2') })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

const posted = (over: Partial<WorkRequestView> = {}): WorkRequestView => ({
  id: 'wr_demo', kind: 'hourly', title: 'Bookkeeping', brief: 'Monthly books in QuickBooks', maxRateMicros: '10000000', maxHours: 10, periods: 4,
  startsAt: Date.now() + 7 * DAY, offersCloseAt: Date.now() + 6 * DAY, status: 'open', ...over,
});

async function servePosted(page: Page, who: string, view: WorkRequestView, sent?: { body: unknown; path?: string }) {
  await page.addInitScript(() => {
    try { localStorage.setItem('karwan:guide:disabled', '1'); } catch { /* private mode */ }
  });
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();
    if (pathname === '/api/auth/bootstrap') return route.fulfill({ json: { user: { address: who, method: 'web3', hasPasskey: false }, profile: null } });
    if (pathname === '/api/terms/status') return route.fulfill({ json: { currentVersion: '1', acceptedVersion: '1' } });
    if (pathname === `/api/work-requests/${view.id}` && method === 'GET') return route.fulfill({ json: { request: view } });
    if (pathname.endsWith('/hire/card')) {
      return route.fulfill({ json: { card: { kind: 'hourly', title: 'Bookkeeping', brief: '', worker: SELLER, rateMicros: '9000000', maxHours: 10, periods: 4, startsAt: Date.now() + 7 * DAY, budgetMicros: '90000000', feeHalfMicros: '450000', totalMicros: '90450000', mostMicros: '361800000', note: '' } } });
    }
    if (method === 'POST' && pathname.startsWith('/api/work-requests')) {
      if (sent) { sent.body = route.request().postDataJSON(); sent.path = pathname; }
      return route.fulfill({ json: pathname.endsWith('/hire') ? { workId: 'w_demo' } : { request: view } });
    }
    if (pathname.startsWith('/api/client-errors')) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ json: { items: [], events: [], movements: [], messages: [] } });
  });
}

test('the hirer sees offers ranked by fit, with who they are and never a score, and hires the best fit', async ({ page }) => {
  const sent = { body: null as unknown, path: '' as string | undefined };
  await servePosted(page, BUYER, posted({
    mine: true,
    offers: [
      { offerId: 'wo_a', seller: SELLER, name: 'Ada Obi', tag: 'ada', verified: true, tier: 'ESTABLISHED', rating: { kind: 'rated', value: 4.8, count: 23, disputed: 0 }, reasons: ['best_fit', 'verified'], recommended: true, rateMicros: '9000000', note: 'Five years of QuickBooks', overMost: false },
      { offerId: 'wo_t', seller: '0x3333333333333333333333333333333333333333', name: 'Tunde', tag: null, verified: false, tier: 'NEW', rating: { kind: 'new', count: 0 }, reasons: [], recommended: false, rateMicros: '12000000', note: '', overMost: true },
    ],
  }), sent);
  await page.goto('/work/requests/wr_demo');
  await expect(page.getByRole('heading', { name: t.requests.page.offers })).toBeVisible();
  await expect(page.getByText('4.8 from 23 deals')).toBeVisible();
  await expect(page.getByText(t.requests.page.over)).toBeVisible();
  await expect(page.getByText(/\bscore\b|\b23 completed\b/i)).toHaveCount(0);
  await page.getByRole('button', { name: `${t.requests.page.hire} Ada Obi` }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('90.45 USDC');
  await sheet.getByRole('button', { name: t.requests.hireSheet.confirm.replace('{amount}', '90.45') }).click();
  await expect.poll(() => sent.path).toBe('/api/work-requests/wr_demo/hire');
  expect(sent.body).toEqual({ offerId: 'wo_a' });
  await expect(page).toHaveURL(/\/work\/w_demo$/);
});

test('a seller offers a rate and a note on posted work', async ({ page }) => {
  const sent = { body: null as unknown, path: '' as string | undefined };
  await servePosted(page, SELLER, posted(), sent);
  await page.goto('/work/requests/wr_demo');
  await page.getByLabel(t.requests.page.yourRate).fill('9');
  await page.getByLabel(t.requests.page.note).fill('Five years of QuickBooks');
  await page.getByRole('button', { name: t.requests.page.send }).click();
  await expect.poll(() => sent.path).toBe('/api/work-requests/wr_demo/offers');
  expect(sent.body).toEqual({ rateUsdc: '9', note: 'Five years of QuickBooks' });
});
