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

test('the find page lists the people, and a tap opens one with Message and their record', async ({ page }, info) => {
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
  await expect(sheet.getByRole('link', { name: 'Message Ngozi' })).toHaveAttribute('href', '/messages/ngozi');
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
