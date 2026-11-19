import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { en } from '../shared/i18n/messages/en';
import { SELLER } from './fixtures';

/// A new person on /start, from About you to Home (view 39, "Set up in two
/// minutes", 19 Nov): sell, buy or both with one line, then where they are and
/// how we reach them, then the summary. Nothing on the way mentions wallets or
/// activating, every screen passes the accessibility scan, and the screens fit
/// a phone in English and Arabic.

const API = 'http://127.0.0.1:3199';
const s = en.setup;
const q = en.setup.quick;
const handOff = 'I sell: Website design. Usually About 100 USDC, a week. Post this as my offer.';
const BANNED = /agent wallet|activate|0x[0-9a-f]{4}|Buying agent/i;
const card = { what: 'Website design', buy: null, priceMin: 80, priceMax: 120, daysMin: 7, daysMax: 7, buyMax: null };

async function serveNewPerson(page: Page, opts: { nearby?: number } = {}) {
  await page.addInitScript(() => {
    try { localStorage.setItem('karwan:guide:disabled', '1'); } catch { /* private mode */ }
  });
  const profile = { address: SELLER, role: 'seller', displayName: 'Ada', handle: 'ada', createdAt: 0, updatedAt: 0, settings: {}, location: { country: 'NG', city: null, area: null } };
  const saved: Array<Record<string, unknown>> = [];
  const near: unknown[] = [];
  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === '/api/auth/bootstrap') return route.fulfill({ json: { user: { address: SELLER, method: 'circle', hasPasskey: true }, profile } });
    if (path.startsWith('/api/profile')) return route.fulfill({ json: { profile } });
    if (path === '/api/setup/preview') return route.fulfill({ json: { lines: ['Your agent offers Website design'], needs: [], card } });
    if (path === '/api/setup/nearby') {
      const count = opts.nearby ?? 0;
      return route.fulfill({ json: count ? { count, rows: [{ what: 'Website for a bakery', budgetUsdc: 90 }, { what: 'Shop website', budgetUsdc: 150 }] } : { count: 0, rows: [] } });
    }
    if (path === '/api/places/cities') return route.fulfill({ json: { towns: [{ name: 'Lagos', admin: 'Lagos' }, { name: 'Lafia', admin: 'Nasarawa' }] } });
    if (path === '/api/places/near') { near.push(req.postDataJSON()); return route.fulfill({ json: { country: 'NG', city: 'Lagos', admin: 'Lagos' } }); }
    if (path === '/api/setup/save') {
      saved.push((req.postDataJSON() as { answers: Record<string, unknown> }).answers);
      return route.fulfill({ json: { profile: { ...profile, settings: { setupDoneAt: 1 } }, firstPost: { kind: 'offer', handOff } } });
    }
    if (path.startsWith('/api/client-errors')) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ json: { items: [], events: [], movements: [], messages: [], jobs: [], listings: [] } });
  });
  return { saved, near };
}

async function clean(page: Page) {
  const results = await new AxeBuilder({ page }).include('main').analyze();
  expect(results.violations).toEqual([]);
  expect(await page.locator('main').innerText()).not.toMatch(BANNED);
}

const roleRadio = (page: Page, label: string) => page.getByRole('radio', { name: new RegExp(`^${label}`) });
const city = (page: Page) => page.getByRole('combobox', { name: q.city });

/// Sell, the line, and on to "Where are you".
async function sellAndGoOn(page: Page) {
  await roleRadio(page, q.roles.sell.label).click();
  await page.getByLabel(q.sellLabel).fill('Website design, about 100 USDC, a week');
  await page.getByRole('button', { name: s.buttons.next }).click();
  await expect(page.getByRole('heading', { name: q.whereTitle })).toBeVisible();
}

test.describe('a new person on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('About you goes from what brings them to Home in four screens', async ({ page }) => {
    const { saved } = await serveNewPerson(page, { nearby: 8 });
    await page.goto('/start?step=about');

    await expect(page.getByRole('heading', { name: q.roleTitle })).toBeVisible();
    await expect(page.getByRole('button', { name: s.buttons.next })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Help' })).toHaveCount(0);
    await clean(page);

    // One line, read back before Next so a wrong price is caught here.
    await roleRadio(page, q.roles.sell.label).click();
    await page.getByLabel(q.sellLabel).fill('Website design, about 100 USDC, a week');
    await expect(page.getByText(q.readAs)).toBeVisible();
    await expect(page.getByText(q.days.replace('{n}', '7'))).toBeVisible();
    await clean(page);
    await page.getByRole('button', { name: s.buttons.next }).click();

    // Where they are: the country from the tag, a town in one tap, the real count.
    await expect(page.getByRole('heading', { name: q.whereTitle })).toBeVisible();
    await expect(page.getByRole('button', { name: s.buttons.next })).toBeDisabled();
    await city(page).fill('La');
    await page.getByRole('button', { name: /^Lagos/ }).click();
    await expect(city(page)).toHaveValue('Lagos');
    await expect(page.locator('[data-nearby]')).toContainText('8');
    await expect(page.locator('[data-nearby]')).toContainText('people in Lagos are asking for website design');
    await expect(page.getByText(q.amanWhere)).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Telegram/ })).toBeChecked();
    await clean(page);
    await page.getByRole('button', { name: s.buttons.next }).click();

    // The summary: the first offer as the market shows it, and how money is held.
    await expect(page.getByRole('heading', { name: s.summary.title })).toBeVisible();
    await expect(page.locator('[data-first-post="offer"]')).toContainText('Website design');
    await expect(page.getByRole('checkbox', { name: q.postNow })).toBeChecked();
    await expect(page.getByText(q.held)).toBeVisible();
    await expect(page.getByText(q.agentOffers)).toBeVisible();
    await clean(page);
    await page.getByRole('button', { name: q.done }).click();
    await expect(page).toHaveURL(/\/app$/);
    expect(saved[0]).toMatchObject({ role: 'sell', sellLine: 'Website design, about 100 USDC, a week', place: { country: 'NG', city: 'Lagos', admin: 'Lagos' }, reach: 'both' });
    expect(typeof saved[0]!.startedAt).toBe('number');

    // On testnet free test USDC is a drop in the corner of Home, not a strip:
    // a tap opens the card with Claim, Escape closes it.
    const home = en.accountHome;
    const drop = page.getByRole('button', { name: `${home.faucetLabel}. ${home.faucetBody}` });
    await expect(drop).toBeVisible();
    await drop.click();
    await expect(page.getByRole('link', { name: home.faucetClaim })).toHaveAttribute('href', '/profile/wallets');
    await page.keyboard.press('Escape');
    await expect(drop).toHaveAttribute('aria-expanded', 'false');
  });

  test('Use my location fills the town from the phone, and the point goes with the answers', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 6.5244, longitude: 3.3792 });
    const { saved, near } = await serveNewPerson(page);
    await page.goto('/start?step=about');
    await sellAndGoOn(page);
    await page.getByRole('button', { name: q.useLocation }).click();
    await expect(city(page)).toHaveValue('Lagos');
    expect(near).toEqual([{ lat: 6.5244, lng: 3.3792 }]);
    await expect(page.locator('[data-nearby]')).toHaveCount(0);
    await page.getByRole('button', { name: s.buttons.next }).click();
    await page.getByRole('button', { name: q.done }).click();
    await expect(page).toHaveURL(/\/app$/);
    expect(saved[0]!.place).toEqual({ country: 'NG', city: 'Lagos', admin: 'Lagos', point: { lat: 6.5244, lng: 3.3792 } });
  });

  test('a refused location says so quietly, and a town can still be picked', async ({ page, context }) => {
    await context.clearPermissions();
    await serveNewPerson(page);
    await page.goto('/start?step=about');
    await sellAndGoOn(page);
    await page.getByRole('button', { name: q.useLocation }).click();
    await expect(page.getByText(q.notFound)).toBeVisible();
    await city(page).fill('Ikorodu');
    await page.getByRole('button', { name: q.keepTyped.replace('{city}', 'Ikorodu') }).click();
    await expect(page.getByRole('button', { name: s.buttons.next })).toBeEnabled();
  });

  test('Change on the summary opens where they are and comes back', async ({ page }) => {
    await serveNewPerson(page);
    await page.goto('/start?step=about');
    await sellAndGoOn(page);
    await city(page).fill('La');
    await page.getByRole('button', { name: /^Lagos/ }).click();
    await page.getByRole('button', { name: s.buttons.next }).click();
    await expect(page.getByRole('heading', { name: s.summary.title })).toBeVisible();
    await page.getByRole('button', { name: `${q.change} ${q.rows.where}` }).click();
    await city(page).fill('La');
    await page.getByRole('button', { name: /^Lafia/ }).click();
    await page.getByRole('button', { name: s.buttons.next }).click();
    await expect(page.getByRole('heading', { name: s.summary.title })).toBeVisible();
    await expect(page.getByText('Lafia, Nigeria')).toBeVisible();
  });

  test('the first question fits the screen in Arabic', async ({ page, context }) => {
    await context.addCookies([{ name: 'karwan-locale', value: 'ar', url: test.info().project.use.baseURL ?? 'http://127.0.0.1:3100' }]);
    await serveNewPerson(page);
    await page.goto('/start?step=about');
    const group = page.getByRole('radiogroup');
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
