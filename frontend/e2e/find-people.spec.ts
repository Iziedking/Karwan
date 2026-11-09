import { expect, test } from '@playwright/test';
import { API, funded, serveMoney } from './moneyFixtures';

/// The people an agent found (view 72): the find page in the approved look,
/// one person's sheet, and nothing that gives a wallet or an address away.

const ID = '6f1c2a3b-0000-4000-8000-000000000001';
const DOT = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#8a6d55"/></svg>');

const row = (over: Record<string, unknown>) => ({
  tag: 'ngozi', name: 'Ngozi Okafor', verified: true, tier: 'ESTABLISHED', rating: '4.8 from 12 deals', stars: 4.8, ratings: 12,
  distance: { key: 'about', km: 3 }, meet: { atMyPlace: true, comeToYouKm: null, online: false }, priceUsdc: '60', days: 5,
  reasons: ['best_fit', 'nearby', 'verified'], recommended: true, photo: DOT, ...over,
});

const FIND = {
  id: ID, side: 'buyer', mode: 'choose', need: 'A tailor to make a dress', budgetUsdc: '75', kind: 'in_person', where: { scope: 'near' },
  jobId: null, needId: null, status: 'shortlisted', createdAt: Date.now(), endsAt: Date.now() + 5 * 86_400_000,
  rows: [
    row({}),
    row({ tag: 'amaka', name: 'Amaka Obi', stars: 4.6, ratings: 8, distance: { key: 'about', km: 6 }, priceUsdc: null, days: null, recommended: false, reasons: ['nearby'] }),
    row({ tag: 'tunde', name: 'Tunde Bello', verified: false, stars: null, ratings: 2, distance: { key: 'about', km: 9 }, priceUsdc: '50', recommended: false, reasons: ['within_budget'], photo: null }),
  ],
};

test('the find page lists the people, and a tap opens one to pick, with their record', async ({ page }, info) => {
  await serveMoney(page, { balances: funded });
  await page.route(`${API}/api/find/finds/${ID}`, (route) => route.fulfill({ json: { find: FIND } }));
  await page.goto(`/find/${ID}`);
  await expect(page.getByRole('heading', { name: '3 people near you' })).toBeVisible();
  const rows = page.locator('[data-found-person]');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('4.8 from 12 deals · 3 km');
  await expect(rows.nth(0)).toContainText('Best match');
  await expect(rows.nth(1)).toContainText('Asks a price');
  await expect(rows.nth(2)).toContainText('New on Karwan · 9 km');
  await expect(rows.nth(0).locator('img')).toHaveCount(1);
  await expect(rows.nth(2).locator('img')).toHaveCount(0);
  await expect(page.locator('.karwan-splash-mark')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('find-page.png'), fullPage: true });

  await rows.nth(0).click();
  const sheet = page.locator('[data-found-sheet]');
  await expect(sheet.getByRole('heading', { name: 'Ngozi Okafor' })).toBeVisible();
  await expect(sheet).toContainText('@ngozi · Verified · Established');
  await expect(sheet.getByRole('button', { name: 'Pick Ngozi' })).toBeVisible();
  await expect(sheet.getByRole('link', { name: 'See full record' })).toHaveAttribute('href', '/r/ngozi');
  await page.screenshot({ path: info.outputPath('find-sheet.png') });
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/0x[0-9a-f]{6}/i);
});

test('a find that is not yours reads as nothing here', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  await page.route(`${API}/api/find/finds/${ID}`, (route) => route.fulfill({ status: 404, json: { error: 'find not found' } }));
  await page.goto(`/find/${ID}`);
  await expect(page.getByText('Nothing here. A list of people found is only for the person who asked.')).toBeVisible();
});

test('pick two, ask them, and see how each answered', async ({ page }, info) => {
  await serveMoney(page, { balances: funded });
  let sent: Record<string, unknown> | null = null;
  await page.route(`${API}/api/find/finds/${ID}`, (route) => route.fulfill({ json: { find: sent
    ? { ...FIND, jobId: '0xjob', status: 'contacting', rows: [
        { ...FIND.rows[0], asked: { answer: 'interested', nextAt: null, closed: false } },
        { ...FIND.rows[1], asked: { answer: null, nextAt: Date.now() + 2 * 3_600_000, closed: false } },
        { ...FIND.rows[2], asked: null },
      ] }
    : FIND } }));
  await page.route(`${API}/api/jobs`, async (route) => {
    sent = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ json: { jobId: '0xjob', deadlineUnix: 0, asked: ['Ngozi Okafor', 'Amaka Obi'], notAsked: [] } });
  });
  await page.goto(`/find/${ID}`);
  const rows = page.locator('[data-found-person]');
  await rows.nth(0).click();
  await page.locator('[data-found-sheet]').getByRole('button', { name: 'Pick Ngozi' }).click();
  await rows.nth(1).click();
  await page.locator('[data-found-sheet]').getByRole('button', { name: 'Pick Amaka' }).click();
  await expect(rows.nth(0)).toHaveAttribute('data-picked', 'true');
  await expect(page.locator('[data-ask-bar]')).toContainText('2 of 3 picked');
  await page.locator('[data-ask]').click();
  const ask = page.locator('[data-ask-sheet]');
  await expect(ask.getByRole('heading', { name: 'Ask Ngozi and Amaka' })).toBeVisible();
  await expect(ask).toContainText('How far you are, not where');
  await page.screenshot({ path: info.outputPath('ask-sheet.png') });
  await ask.getByRole('button', { name: 'Send to 2 people' }).click();
  await expect.poll(() => sent).not.toBeNull();
  expect((sent as unknown as { find: unknown }).find).toEqual({ id: ID, picks: [0, 1] });
  await expect(page.getByRole('heading', { name: 'Asked 2 people' })).toBeVisible();
  const asked = page.locator('[data-found-person]');
  await expect(asked).toHaveCount(2);
  await expect(asked.nth(0)).toContainText('Sent an offer');
  await expect(asked.nth(1)).toContainText('Not answered yet · Reminder at');
  await expect(page.getByRole('link', { name: 'Review offers' })).toHaveAttribute('href', '/jobs/0xjob');
  await expect(page.locator('.karwan-splash-mark')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('asked.png'), fullPage: true });
});

const SELLER_ID = '6f1c2a3b-0000-4000-8000-000000000002';
const lead = (over: Record<string, unknown>) => ({
  kind: 'need', ref: 'n1', what: 'Lunch for 20, Fridays', budgetUsdc: '40', every: 'week', deliveryKind: 'in_person', dueDays: null,
  distance: { key: 'about', km: 3 }, buyerVerified: true, buyerTier: 'ESTABLISHED', pitched: false, ...over,
});
const SELLER_FIND = {
  id: SELLER_ID, side: 'seller', mode: 'choose', need: 'Buyers for what I sell', budgetUsdc: '0', kind: 'remote', where: { scope: 'anywhere' },
  jobId: null, needId: null, status: 'shortlisted', createdAt: Date.now(), endsAt: Date.now() + 5 * 86_400_000, rows: [],
  leads: [
    lead({}),
    lead({ kind: 'request', ref: '0xjob1', what: 'Office lunch for 40', budgetUsdc: '90', every: null, dueDays: 6, distance: { key: 'about', km: 5 }, buyerVerified: false }),
    lead({ ref: 'n3', what: 'Party small chops', budgetUsdc: '30', every: 'month', distance: { key: 'about', km: 8 }, buyerVerified: false }),
  ],
};

test('a seller sees buyers unnamed, picks a regular need and offers to help', async ({ page }, info) => {
  await serveMoney(page, { balances: funded });
  let sent: Record<string, unknown> | null = null;
  await page.route(`${API}/api/find/finds/${SELLER_ID}`, (route) => route.fulfill({ json: { find: SELLER_FIND } }));
  await page.route(`${API}/api/find/pitches`, async (route) => {
    sent = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ json: { pitched: 1, refused: [] } });
  });
  await page.goto(`/find/${SELLER_ID}`);
  await expect(page.getByRole('heading', { name: '3 buyers near you' })).toBeVisible();
  const leads = page.locator('[data-found-lead]');
  await expect(leads).toHaveCount(3);
  await expect(leads.nth(0)).toContainText('Every week · 3 km · Verified');
  await expect(leads.nth(1)).toHaveAttribute('href', '/jobs/0xjob1');
  await leads.nth(0).click();
  await expect(leads.nth(0)).toHaveAttribute('data-picked', 'true');
  await page.locator('[data-offer]').click();
  const sheet = page.locator('[data-offer-sheet]');
  await expect(sheet.getByRole('heading', { name: 'Offer to help 1 buyer' })).toBeVisible();
  await sheet.getByLabel('Your price').fill('33');
  await sheet.locator('input[inputmode=numeric]').fill('2');
  await expect(page.locator('.karwan-splash-mark')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('offer-sheet.png') });
  await sheet.getByRole('button', { name: 'Send to 1 buyer' }).click();
  await expect.poll(() => sent).not.toBeNull();
  const body = sent as unknown as { findId: string; picks: number[]; days: number; priceUsdc: string };
  expect(body.findId).toBe(SELLER_ID);
  expect(body.picks).toEqual([0]);
  expect(body.days).toBe(2);
  expect(Number(body.priceUsdc)).toBeGreaterThan(0);
  await expect(page.locator('[data-pitch-sent]')).toContainText('Sent.');
  expect(JSON.stringify(await page.content())).not.toContain('0xrestaurant');
});

const PITCH = {
  id: 'pitch-1', what: 'Lunch for 20, Fridays', kind: 'in_person', distance: { key: 'about', km: 3 },
  seller: { name: 'Ngozi Okafor', verified: true, stars: 4.8, tag: 'ngozi', photo: DOT }, priceUsdc: '33.43', days: 2, note: 'Jollof and chicken, delivered hot',
  sentAt: Date.now(), answer: null, jobId: null, closed: false,
};

test('a buyer opens an offer for their need, says interested and posts it privately', async ({ page }, info) => {
  await serveMoney(page, { balances: funded });
  let posted: Record<string, unknown> | null = null;
  await page.route(`${API}/api/find/pitches/pitch-1`, (route) => route.fulfill({ json: { pitch: posted ? { ...PITCH, answer: 'interested', jobId: '0xjob9' } : PITCH } }));
  await page.route(`${API}/api/jobs`, async (route) => {
    posted = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ json: { jobId: '0xjob9', deadlineUnix: 0 } });
  });
  await page.goto('/find/pitch/pitch-1');
  await expect(page.getByRole('heading', { name: 'Lunch for 20, Fridays' })).toBeVisible();
  const card = page.locator('[data-pitch]');
  await expect(card).toContainText('Ngozi Okafor');
  await expect(card).toContainText('Jollof and chicken, delivered hot');
  await expect(page.locator('.karwan-splash-mark')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('pitch.png'), fullPage: true });
  await page.locator('[data-interested]').click();
  const ask = page.locator('[data-ask-seller]');
  await expect(ask.getByRole('heading', { name: 'Ask Ngozi for it' })).toBeVisible();
  await expect(ask).toContainText('Only you and Ngozi');
  await ask.getByRole('button', { name: 'Post privately' }).click();
  await expect.poll(() => posted).not.toBeNull();
  const body = posted as unknown as { pitch: unknown; budgetUsdc: number; brief: string };
  expect(body.pitch).toEqual({ id: 'pitch-1' });
  expect(body.budgetUsdc).toBe(33.43);
  expect(body.brief).toBe('Lunch for 20, Fridays');
  await expect(page.getByRole('heading', { name: 'Posted privately to Ngozi' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Review Ngozi’s offer' })).toHaveAttribute('href', '/jobs/0xjob9');
  await page.screenshot({ path: info.outputPath('posted.png'), fullPage: true });
});

test('not interested answers at once and says what it means', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  let answered: string | null = null;
  await page.route(`${API}/api/find/pitches/pitch-1`, (route) => route.fulfill({ json: { pitch: answered ? { ...PITCH, answer: answered } : PITCH } }));
  await page.route(`${API}/api/find/pitches/pitch-1/answer`, async (route) => {
    answered = (route.request().postDataJSON() as { answer: string }).answer;
    await route.fulfill({ json: { ok: true, state: 'answered' } });
  });
  await page.goto('/find/pitch/pitch-1');
  await page.locator('[data-not-interested]').click();
  await expect.poll(() => answered).toBe('no');
  await expect(page.locator('[data-pitch-answered]')).toContainText('They will not offer for this need again.');
});
