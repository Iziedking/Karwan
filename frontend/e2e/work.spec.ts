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
  await expect(sheet).toContainText('1,206 USDC');
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
  await expect(sheet).toContainText('186.56 USDC');
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
  // The new look (view 48, batch 9i): only Hire on the best fit is green.
  const green = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = 'var(--action)';
    document.querySelector('main')!.appendChild(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return [...document.querySelectorAll<HTMLElement>('main a, main button')]
      .filter((el) => el.offsetParent !== null && getComputedStyle(el).backgroundColor === color)
      .map((el) => el.getAttribute('aria-label') || el.textContent?.trim() || '');
  });
  expect(green).toEqual([`${t.requests.page.hire} Ada Obi`]);
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

/// Monthly work counted in sessions (view 76).
const s = en.work.sessions;
const sessionLog = (n: number) => Array.from({ length: n }, (_, i) => ({ at: Date.now() - (n - i) * DAY, minutes: 1, note: `Lesson ${i + 1}`, ...(i === 2 ? { link: 'https://example.com/lesson-3' } : {}) }));
const lessons = (over: Partial<WorkView> = {}, w: Partial<WorkWeekView> = {}): WorkView =>
  work({ kind: 'monthly', title: 'Maths lessons', rateMicros: '300000000', maxHours: 1, periods: 3, runs: 3, sessions: 12,
    weeks: [week({ status: 'logged', loggedMinutes: 5, log: sessionLog(5), ...w })], ...over });

test('the worker records one session with a note and a link', async ({ page }) => {
  const posted = { body: null as unknown, path: '' as string | undefined };
  await serve(page, SELLER, lessons({ role: 'worker' }, { canLog: true }), posted);
  await page.goto('/work/w_demo');
  await expect(page.getByText('5 of 12 sessions')).toBeVisible();
  await expect(page.locator('[data-sessions] > li')).toHaveCount(5);
  await expect(page.locator('[data-sessions] > li').first()).toContainText('Session 5');
  await page.getByRole('button', { name: s.record }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('Session 6 of 12');
  await sheet.getByLabel(s.logNote).fill('Fractions');
  await sheet.getByLabel(s.logLink).fill('example.com');
  await expect(sheet.getByRole('button', { name: s.logConfirm })).toBeDisabled();
  await sheet.getByLabel(s.logLink).fill('https://example.com/lesson-6');
  await sheet.getByRole('button', { name: s.logConfirm }).click();
  await expect.poll(() => posted.path).toBe('/api/work/w_demo/hours');
  expect(posted.body).toEqual({ minutes: 1, note: 'Fractions', k: 0, link: 'https://example.com/lesson-6' });
});

test('before the month starts, each side reads the hour it opens (S-07)', async ({ page }) => {
  const start = Date.now() + 3 * 3_600_000;
  const soon = { status: 'funded' as const, loggedMinutes: 0, log: [], start, end: start + 30 * DAY, logBy: start + 32 * DAY, reviewBy: start + 35 * DAY };
  await serve(page, SELLER, lessons({ role: 'worker', startsAt: start }, soon));
  await page.goto('/work/w_demo');
  await expect(page.getByText(/^Record sessions from .*\d{1,2}:\d{2}/)).toBeVisible();
  await expect(page.getByRole('button', { name: s.record })).toHaveCount(0);
});

test('before the month starts, the hirer reads when it starts, to the minute', async ({ page }) => {
  const start = Date.now() + 3 * 3_600_000;
  const soon = { status: 'funded' as const, loggedMinutes: 0, log: [], start, end: start + 30 * DAY, logBy: start + 32 * DAY, reviewBy: start + 35 * DAY };
  await serve(page, BUYER, lessons({ startsAt: start }, soon));
  await page.goto('/work/w_demo');
  await expect(page.getByText(/^Starts .*\d{1,2}:\d{2}/)).toBeVisible();
});

test('the hirer says which session did not happen, and it is only a note', async ({ page }) => {
  const posted = { body: null as unknown, path: '' as string | undefined };
  await serve(page, BUYER, lessons({}, { canFlag: true }), posted);
  await page.goto('/work/w_demo');
  await expect(page.getByRole('link', { name: s.link })).toHaveAttribute('href', 'https://example.com/lesson-3');
  await page.getByRole('button', { name: s.didNot }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText(s.flagBody);
  await expect(sheet.getByRole('button', { name: s.flagConfirm })).toBeDisabled();
  await sheet.getByRole('radio', { name: 'Session 4' }).click();
  await sheet.getByLabel(s.flagWhat).fill('Nobody came');
  await sheet.getByRole('button', { name: s.flagConfirm }).click();
  await expect.poll(() => posted.path).toBe('/api/work/w_demo/flag');
  expect(posted.body).toEqual({ k: 0, n: 4, note: 'Nobody came' });
});

test('a session in question shows in the count, and the worker reads who was told (S-12, S-15)', async ({ page }) => {
  const log = sessionLog(5).map((x, i) => (i === 3 ? { ...x, flagged: { at: Date.now(), note: 'Nobody came' } } : x));
  await serve(page, SELLER, lessons({ role: 'worker' }, { status: 'funded', log, canLog: true }));
  await page.goto('/work/w_demo');
  await expect(page.getByText('5 of 12 sessions · 1 in question')).toBeVisible();
  await expect(page.locator('[data-told]')).toHaveText(/^@bisi was told\. They review after /);
});

test('the hirer reads the count with the session in question, and no line about being told', async ({ page }) => {
  const log = sessionLog(5).map((x, i) => (i === 3 ? { ...x, flagged: { at: Date.now(), note: 'Nobody came' } } : x));
  await serve(page, BUYER, lessons({}, { status: 'funded', log, canFlag: true }));
  await page.goto('/work/w_demo');
  await expect(page.getByText('5 of 12 sessions · 1 in question')).toBeVisible();
  await expect(page.locator('[data-told]')).toHaveCount(0);
});

test('the hirer takes a note back, and a session with a note cannot be given another (S-16, S-18)', async ({ page }) => {
  const posted = { body: null as unknown, path: '' as string | undefined };
  const log = sessionLog(5).map((x, i) => (i === 3 ? { ...x, flagged: { at: Date.now(), note: 'Nobody came' } } : x));
  await serve(page, BUYER, lessons({}, { status: 'funded', log, canFlag: true, canUnflag: true }), posted);
  await page.goto('/work/w_demo');
  await page.getByRole('button', { name: s.didNot }).click();
  const flag = page.getByRole('dialog');
  await expect(flag.getByRole('radio', { name: 'Session 4 · note sent' })).toBeDisabled();
  await expect(flag.getByRole('radio', { name: 'Session 5', exact: true })).toBeEnabled();
  await flag.getByRole('button', { name: t.notNow }).click();
  await expect(page.locator('[data-take-back]')).toHaveCount(1);
  await page.locator('[data-take-back="4"]').click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('@ada is told and the session counts as held again. No money moves.');
  await sheet.getByRole('button', { name: s.unflagConfirm }).click();
  await expect.poll(() => posted.path).toBe('/api/work/w_demo/unflag');
  expect(posted.body).toEqual({ k: 0, n: 4 });
  await expect(page.locator('[data-work-saved]')).toHaveText('Note taken back. @ada has been told.');
});

test('the worker sees the note but cannot take it back', async ({ page }) => {
  const log = sessionLog(5).map((x, i) => (i === 3 ? { ...x, flagged: { at: Date.now(), note: 'Nobody came' } } : x));
  await serve(page, SELLER, lessons({ role: 'worker' }, { status: 'funded', log, canLog: true }));
  await page.goto('/work/w_demo');
  await expect(page.getByText('Nobody came')).toBeVisible();
  await expect(page.locator('[data-take-back]')).toHaveCount(0);
});

/// A slow answer: the button says it is working, and the page says what was saved (S-10, S-17).
async function slowly(page: Page, path: string, view: WorkView) {
  await page.route(`${API}${path}`, async (route) => {
    await new Promise((done) => setTimeout(done, 1500));
    await route.fulfill({ json: { work: view } });
  });
}

test('recording a session says it is working, then that it was saved and the hirer told', async ({ page }) => {
  const view = lessons({ role: 'worker' }, { canLog: true });
  await serve(page, SELLER, view);
  await slowly(page, '/api/work/w_demo/hours', view);
  await page.goto('/work/w_demo');
  await page.getByRole('button', { name: s.record }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel(s.logNote).fill('Fractions');
  await sheet.getByRole('button', { name: s.logConfirm }).click();
  await expect(sheet.locator('button[aria-busy="true"]')).toHaveText(en.dealWorkspace.confirm.working);
  await expect(sheet.getByRole('button', { name: t.notNow })).toBeDisabled();
  await expect(page.locator('[data-work-saved]')).toHaveText('Session saved. @bisi has been told.');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('sending a note on a session says it is working, then that it was sent and the worker told', async ({ page }) => {
  const view = lessons({}, { canFlag: true });
  await serve(page, BUYER, view);
  await slowly(page, '/api/work/w_demo/flag', view);
  await page.goto('/work/w_demo');
  await page.getByRole('button', { name: s.didNot }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('radio', { name: 'Session 4' }).click();
  await sheet.getByLabel(s.flagWhat).fill('Nobody came');
  await sheet.getByRole('button', { name: s.flagConfirm }).click();
  await expect(sheet.locator('button[aria-busy="true"]')).toHaveText(en.dealWorkspace.confirm.working);
  await expect(page.locator('[data-work-saved]')).toHaveText('Note sent. @ada has been told.');
  // Opening the next sheet clears the line.
  await page.getByRole('button', { name: s.didNot }).click();
  await expect(page.locator('[data-work-saved]')).toHaveCount(0);
});

test('after the month the hirer approves the recorded sessions or says how many did not happen', async ({ page }) => {
  const posted = { body: null as unknown, path: '' as string | undefined };
  const log = sessionLog(10).map((x, i) => (i === 3 ? { ...x, flagged: { at: Date.now(), note: 'Nobody came' } } : x));
  await serve(page, BUYER, lessons({}, { loggedMinutes: 10, log, canApprove: true, canObject: true, canFlag: true, ifPaid: { netMicros: '248750000', backMicros: '50250000', feeMicros: '1250000' } }), posted);
  await page.goto('/work/w_demo');
  await expect(page.getByText('You said this did not happen: Nobody came')).toBeVisible();
  await expect(page.getByRole('button', { name: s.didNot })).toHaveCount(0);
  await page.getByRole('button', { name: s.someNot }).click();
  let sheet = page.getByRole('dialog');
  await sheet.getByLabel(s.objectCount).fill('1');
  await sheet.getByLabel(t.sheets.object.why).fill('Session 4, nobody came');
  await sheet.getByRole('button', { name: t.sheets.object.confirm }).click();
  await expect.poll(() => posted.path).toBe('/api/work/w_demo/object');
  expect(posted.body).toEqual({ k: 0, minutes: 1, reason: 'Session 4, nobody came' });
  await page.getByRole('button', { name: s.approve.replace('{n}', '10') }).click();
  sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('248.75 USDC');
  await expect(sheet).toContainText('50.25 USDC');
  await sheet.getByRole('button', { name: t.sheets.approve.confirm }).click();
  await expect.poll(() => posted.path).toBe('/api/work/w_demo/approve');
});

test('posted monthly work can be counted in sessions', async ({ page }) => {
  const posted = { body: null as unknown, path: '' as string | undefined };
  await serve(page, BUYER, work(), posted);
  await page.goto('/work/requests/new?kind=monthly&brief=Three%20lessons%20a%20week');
  await expect(page.getByRole('heading', { name: s.postTitle })).toBeVisible();
  await page.getByLabel(t.form.what).fill('Maths tutor');
  await page.getByLabel(t.requests.form.mostMonthly).fill('300');
  await page.getByLabel(s.field).fill('12');
  await expect(page.getByText('25 USDC a session')).toBeVisible();
  await page.getByLabel(t.form.months).fill('3');
  await page.getByRole('button', { name: t.requests.form.post }).click();
  await expect.poll(() => posted.path).toBe('/api/work-requests');
  expect(posted.body).toMatchObject({ kind: 'monthly', brief: 'Three lessons a week', maxRateUsdc: '300', periods: 3, sessions: 12 });
});
