import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { en } from '../shared/i18n/messages/en';
import { SELLER } from './fixtures';

/// A new person, from the first screen after sign-up to the offer to post
/// their work (view 38). Nothing on the way mentions agents, wallets or
/// activating, every question passes the accessibility scan, and the screens
/// fit a phone in English and Arabic.

const API = 'http://127.0.0.1:3199';
const s = en.setup;
const handOff = 'I sell: Website design. Usually About 100 USDC, a week. Post this as my offer.';
const BANNED = /agent wallet|activate|0x[0-9a-f]{4}|Buying agent/i;

async function serveNewPerson(page: Page) {
  await page.addInitScript(() => {
    try { localStorage.setItem('karwan:guide:disabled', '1'); } catch { /* private mode */ }
  });
  const profile = { address: SELLER, role: 'seller', displayName: 'Ada', handle: 'ada', createdAt: 0, updatedAt: 0, settings: {} };
  await page.route(`${API}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/bootstrap') return route.fulfill({ json: { user: { address: SELLER, method: 'circle', hasPasskey: true }, profile } });
    if (path.startsWith('/api/profile')) return route.fulfill({ json: { profile } });
    if (path === '/api/setup/preview') return route.fulfill({ json: { lines: ['Your agent offers Website design', 'Asks 80 to 120 USDC, delivers in about 7 days'], needs: [] } });
    if (path === '/api/setup/save') {
      return route.fulfill({ json: { profile: { ...profile, settings: { setupDoneAt: 1 } }, firstPost: { kind: 'offer', handOff } } });
    }
    if (path.startsWith('/api/client-errors')) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ json: { items: [], events: [], movements: [], messages: [], jobs: [], listings: [] } });
  });
}

async function clean(page: Page) {
  const results = await new AxeBuilder({ page }).include('main').analyze();
  expect(results.violations).toEqual([]);
  expect(await page.locator('main').innerText()).not.toMatch(BANNED);
}

test.describe('a new person on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('setup goes from the goals to the offer to post, with no wallet talk', async ({ page }) => {
    await serveNewPerson(page);
    await page.goto('/setup');
    await page.getByRole('button', { name: s.welcome.start }).click();

    // The goals question carries no count: its answer decides how many follow.
    await expect(page.getByText(s.goals.title)).toBeVisible();
    await expect(page.getByText(/\d+ of \d+/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Help' })).toHaveCount(0);
    await clean(page);
    await page.getByRole('checkbox', { name: new RegExp(s.goals.options.work.label) }).click();
    await page.getByRole('button', { name: s.buttons.next }).click();

    await expect(page.getByText('1 of 7')).toBeVisible();
    await page.getByRole('textbox').fill('Website design');
    await clean(page);
    await page.getByRole('button', { name: s.buttons.next }).click();

    await expect(page.getByText('2 of 7')).toBeVisible();
    await page.getByRole('textbox').fill('About 100 USDC, a week');
    await page.getByRole('button', { name: s.buttons.next }).click();

    for (const [title, option] of [
      [s.choices.paid.title, s.choices.paid.options.one_time.label],
      [s.choices.clients.title, s.choices.clients.options.own.label],
      [s.choices.own.title, s.choices.own.options.offers.label],
      [s.choices.reach.title, s.choices.reach.options.email.label],
    ] as const) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
      await clean(page);
      await page.getByRole('radio', { name: new RegExp(option) }).click();
      await page.getByRole('button', { name: s.buttons.next }).click();
    }

    await expect(page.getByText('7 of 7')).toBeVisible();
    await page.getByRole('textbox').fill('Lagos, Nigeria');
    await page.getByRole('button', { name: s.buttons.next }).click();

    await expect(page.getByRole('heading', { name: s.summary.title })).toBeVisible();
    await clean(page);
    await page.getByRole('button', { name: s.summary.looksRight }).click();

    await expect(page.getByRole('heading', { name: s.post.offer })).toBeVisible();
    await expect(page.getByText(handOff)).toBeVisible();
    await clean(page);
    await page.getByRole('button', { name: s.post.notNow }).click();
    await expect(page).toHaveURL(/\/app$/);
  });

  test('the goals question fits the screen in Arabic', async ({ page, context }) => {
    await context.addCookies([{ name: 'karwan-locale', value: 'ar', url: test.info().project.use.baseURL ?? 'http://127.0.0.1:3100' }]);
    await serveNewPerson(page);
    await page.goto('/setup');
    await page.locator('main button').first().click();
    const group = page.getByRole('group');
    await expect(group).toBeVisible();
    const box = await group.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  });

  test('the old onboarding address lands on setup', async ({ page }) => {
    await serveNewPerson(page);
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/setup$/);
  });
});
