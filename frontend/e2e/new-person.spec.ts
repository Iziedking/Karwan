import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { en } from '../shared/i18n/messages/en';
import { SELLER } from './fixtures';

/// A new person on /start, from About you to Home (view 39). Nothing on the
/// way mentions wallets or activating, the agent says what each answer is for,
/// every screen passes the accessibility scan, and the screens fit a phone in
/// English and Arabic.

const API = 'http://127.0.0.1:3199';
const s = en.setup;
const f = en.startFlow.about;
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

  test('About you goes from the goals to Home, with the agent beside each step', async ({ page }) => {
    await serveNewPerson(page);
    await page.goto('/start?step=about');

    // The agent greets them by their tag; the goals carry no count.
    await expect(page.getByText(f.hello.replace('@{tag}', '@ada'))).toBeVisible();
    await expect(page.getByRole('heading', { name: s.goals.title })).toBeVisible();
    await expect(page.getByText(/\d+ of \d+/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Help' })).toHaveCount(0);
    await clean(page);
    await page.getByRole('checkbox', { name: new RegExp(s.goals.options.work.label) }).click();
    await page.getByRole('button', { name: s.buttons.next }).click();

    // What they do and their price on one screen, read back by the agent.
    await page.getByLabel(f.work.whatLabel).fill('Website design');
    await page.getByLabel(f.work.priceLabel).fill('About 100 USDC, a week');
    await expect(page.getByText(f.work.read)).toBeVisible();
    await expect(page.getByText('Asks 80 to 120 USDC, delivers in about 7 days')).toBeVisible();
    await clean(page);
    await page.getByRole('button', { name: s.buttons.next }).click();

    await expect(page.getByRole('heading', { name: f.contact.title })).toBeVisible();
    await page.getByRole('radio', { name: new RegExp(s.choices.clients.options.own.label) }).click();
    await expect(page.getByText(f.contact.clients.own)).toBeVisible();
    await page.getByRole('radio', { name: s.choices.reach.options.email.label, exact: true }).click();
    await expect(page.getByText(f.contact.reach.email)).toBeVisible();
    await clean(page);
    await page.getByRole('button', { name: s.buttons.next }).click();

    // The summary shows what was not asked as a default they can change.
    await expect(page.getByRole('heading', { name: f.summary.title })).toBeVisible();
    await expect(page.getByText(s.choices.paid.options.one_time.label)).toBeVisible();
    await expect(page.getByText(s.choices.own.options.offers.label)).toBeVisible();
    await expect(page.getByRole('checkbox', { name: f.summary.postNow })).toBeChecked();
    await clean(page);
    await page.getByRole('button', { name: f.summary.done }).click();
    await expect(page).toHaveURL(/\/app$/);
  });

  test('Change on the summary opens that question and comes back', async ({ page }) => {
    await serveNewPerson(page);
    await page.goto('/start?step=about');
    await page.getByRole('checkbox', { name: new RegExp(s.goals.options.work.label) }).click();
    await page.getByRole('button', { name: s.buttons.next }).click();
    await page.getByRole('button', { name: s.buttons.next }).click();
    await page.getByRole('button', { name: s.buttons.next }).click();
    await expect(page.getByRole('heading', { name: f.summary.title })).toBeVisible();
    await page.getByRole('button', { name: `${f.summary.change} ${f.summary.rows.agent}` }).click();
    await page.getByRole('radio', { name: new RegExp(s.choices.own.options.ask.label) }).click();
    await page.getByRole('button', { name: s.buttons.next }).click();
    await expect(page.getByRole('heading', { name: f.summary.title })).toBeVisible();
    await expect(page.getByText(s.choices.own.options.ask.label)).toBeVisible();
  });

  test('the goals question fits the screen in Arabic', async ({ page, context }) => {
    await context.addCookies([{ name: 'karwan-locale', value: 'ar', url: test.info().project.use.baseURL ?? 'http://127.0.0.1:3100' }]);
    await serveNewPerson(page);
    await page.goto('/start?step=about');
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
