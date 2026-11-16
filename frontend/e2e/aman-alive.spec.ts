import { expect, test, type Page } from '@playwright/test';
import { API, ME, BUYER_AGENT, SELLER_AGENT, funded, serveMoney } from './moneyFixtures';
import { guideCopy } from '../shared/i18n/messages/guide';
import { nextMoveCopy } from '../shared/i18n/messages/nextMove';

/// Aman alive (view 57, 15 Nov evening): every face breathes and blinks, a
/// moment is said once and marked for every device, and Not now on a setup
/// step is kept on the account.

const copy = guideCopy.en;
const EMPTY = { [ME.toLowerCase()]: 0, [BUYER_AGENT.toLowerCase()]: 0, [SELLER_AGENT.toLowerCase()]: 0 };
const line = (page: Page) => page.locator('[data-aman-line]');
/// Home with the page's own controls out of the way, so Aman never steps aside here.
async function openHome(page: Page) {
  await page.goto('/app');
  await page.addStyleTag({ content: 'main button, main input, main textarea, main select, main a { pointer-events: none !important; }' });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
}

const PAID = { id: 'escrow.seller.paid:0xd9:1763200000000', at: 1763200000000, mood: 'excited', line: 'paid', href: '/deals/0xd9', amountUsdc: '120' };

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function serve(page: Page, opts: { moves?: unknown[]; moment?: () => unknown; balances?: Record<string, number> } = {}) {
  await serveMoney(page, { balances: opts.balances ?? funded, settings: { setupDoneAt: 1, guideHelloOn: today() } });
  await page.route(`${API}/api/profile**`, (route) =>
    route.fulfill({ json: { profile: { address: ME, displayName: 'Bola Ade', handle: 'bola', settings: { setupDoneAt: 1 } } } }));
  await page.route(`${API}/api/agents/status`, (route) =>
    route.fulfill({ json: { chain: { id: 5042002, rpc: 'http://127.0.0.1:3198', explorer: 'https://testnet.arcscan.app' }, contracts: {} } }));
  await page.route(`${API}/api/guide/next`, (route) => route.fulfill({ json: { moves: opts.moves ?? [] } }));
  await page.route(`${API}/api/guide/moment`, (route) => route.fulfill({ json: { moment: opts.moment ? opts.moment() : null } }));
  await page.route(`${API}/api/guide/moment/seen`, (route) => route.fulfill({ json: { seenAt: PAID.at } }));
  await page.route(`${API}/api/guide/snooze`, (route) => route.fulfill({ json: { snooze: { until: Date.now() + 3 * 86_400_000, count: 1 } } }));
  await page.route(`${API}/api/guide/asked`, (route) => route.fulfill({ json: { askedOn: today(), step: 'telegram' } }));
  await page.route(`${API}/api/guide/setup`, (route) => route.fulfill({ json: { steps: [], next: null, complete: true, known: true } }));
  await page.route(`${API}/api/assistant/**`, (route) => route.fulfill({ json: { conversations: [], pickUp: null } }));
}

test('the top bar face breathes, and with reduced motion it is still', async ({ page }) => {
  await serve(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 }));
  await page.goto('/app');
  const live = page.locator('[data-aman-header] [data-aman-live]').filter({ visible: true }).first();
  await expect(live).toBeVisible({ timeout: 15000 });
  await expect.poll(() => live.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--aman-breath')), { timeout: 5000 }).not.toBe('');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(live).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(800);
  expect(await live.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--aman-breath'))).toBe('');
});

test('a seller who was paid hears it once, excited, and the moment is marked for every device', async ({ page }) => {
  let moment: unknown = PAID;
  await serve(page, { moment: () => moment });
  const seen = page.waitForRequest((r) => r.url().endsWith('/api/guide/moment/seen') && (r.postData() ?? '').includes(PAID.id));
  await openHome(page);
  await expect(line(page)).toContainText('You were paid 120.00 USDC.', { timeout: 15000 });
  await expect(page.locator('[data-aman-face]')).toHaveAttribute('data-aman-face', 'excited');
  await expect(line(page).getByRole('link', { name: copy.moments.paid.action })).toHaveAttribute('href', '/deals/0xd9');
  await seen;
  moment = null;
  await page.reload();
  await page.waitForTimeout(2500);
  await expect(line(page)).toHaveCount(0);
});

test('a line that grows after it shows is placed again, so its buttons stay on screen', async ({ page }) => {
  await serve(page, { moment: () => PAID });
  await openHome(page);
  await expect(line(page)).toContainText('You were paid 120.00 USDC.', { timeout: 15000 });
  // A late font or a longer wrap makes the line taller without adding anything to the page.
  await line(page).locator('p[role="status"]').evaluate((p) => { p.style.paddingBottom = '96px'; });
  const viewport = page.viewportSize()!;
  await expect.poll(async () => { const b = (await line(page).boundingBox())!; return b.y + b.height <= viewport.height; }).toBe(true);
  await expect(line(page).getByRole('button', { name: copy.notNow })).toBeInViewport({ ratio: 1 });
});

test('Not now on linking Telegram is kept on the account', async ({ page }) => {
  await serve(page, { moves: [{ kind: 'setup_step', step: 'telegram', href: '/profile/contact' }], balances: EMPTY });
  const snoozed = page.waitForRequest((r) => r.url().endsWith('/api/guide/snooze') && (r.postData() ?? '').includes('"telegram"'));
  await openHome(page);
  await expect(line(page)).toContainText(nextMoveCopy.en.setup.telegram.line, { timeout: 15000 });
  await line(page).getByRole('button', { name: copy.notNow }).click();
  await snoozed;
  await expect(line(page)).toHaveCount(0);
});

test('a link from the assistant opens Market with its tour running', async ({ page }) => {
  await serve(page);
  await page.goto('/market?tour=1');
  await expect(page.locator('#page-tour-title')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-tour-aman]')).toContainText('Aman · 1 of');
  await expect.poll(() => new URL(page.url()).search).toBe('');
});
