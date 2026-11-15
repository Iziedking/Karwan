import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { API, ME, BUYER_AGENT, SELLER_AGENT, funded, serveMoney } from './moneyFixtures';
import { guideCopy } from '../shared/i18n/messages/guide';

/// Aman, the guide with a face (view 57, 15 Nov 2026): beside the page with the
/// one next move, the way in to the assistant page, and easy to decline.

const copy = guideCopy.en;
const EMPTY = { [ME.toLowerCase()]: 0, [BUYER_AGENT.toLowerCase()]: 0, [SELLER_AGENT.toLowerCase()]: 0 };
const face = (page: Page) => page.locator('[data-aman-face]');
const line = (page: Page) => page.locator('[data-aman-line]');
const back = (page: Page) => page.getByRole('button', { name: 'Go back', exact: true }).first();

async function serveHome(page: Page, opts: { moves?: unknown[]; balances?: Record<string, number>; settings?: Record<string, unknown> } = {}) {
  await serveMoney(page, { balances: opts.balances ?? funded, settings: { setupDoneAt: 1, ...(opts.settings ?? {}) } });
  await page.route(`${API}/api/profile**`, (route) =>
    route.fulfill({ json: { profile: { address: ME, displayName: 'Bola Ade', handle: 'bola', settings: { setupDoneAt: 1 } } } }));
  await page.route(`${API}/api/agents/status`, (route) =>
    route.fulfill({ json: { chain: { id: 5042002, rpc: 'http://127.0.0.1:3198', explorer: 'https://testnet.arcscan.app' }, contracts: {} } }));
  await page.route(`${API}/api/guide/next`, (route) => route.fulfill({ json: { moves: opts.moves ?? [] } }));
  await page.route(`${API}/api/assistant/**`, (route) => route.fulfill({ json: { conversations: [], pickUp: null } }));
}

/// Home with the page's own controls out of the way, so these tests are about
/// what Aman says and does; the stepping aside has its own test.
async function openHome(page: Page) {
  await page.goto('/app');
  await page.addStyleTag({ content: 'main button, main input, main textarea, main select, main a { pointer-events: none !important; }' });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
}

const apart = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;

test('Home with an empty balance: Aman beside the balance asks for money; Not now holds through a reload', async ({ page }) => {
  await serveHome(page, { moves: [{ kind: 'first_post', href: '/buyer' }], balances: EMPTY });
  await openHome(page);
  await expect(line(page)).toBeVisible();
  await expect(line(page)).toContainText('Add money so a deal can start.');
  await expect(line(page).getByRole('link', { name: 'Add money' })).toHaveAttribute('href', '/add');
  await expect(face(page)).toHaveAttribute('data-aman-face', 'talking');
  const balance = (await page.locator('[data-guide-anchor="balance"]').boundingBox())!;
  const at = (await face(page).boundingBox())!;
  expect(at.y).toBeGreaterThanOrEqual(balance.y + balance.height);
  await line(page).getByRole('button', { name: copy.notNow }).click();
  await expect(line(page)).toHaveCount(0);
  await expect(face(page)).toBeVisible();
  await page.reload();
  await expect(face(page)).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1600);
  await expect(line(page)).toHaveCount(0);
});

test('tapping Aman opens the assistant page and Back returns; Ctrl+K does the same from Money', async ({ page }) => {
  await serveHome(page);
  await page.goto('/app');
  await face(page).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/assistant');
  await back(page).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/app');
  await page.goto('/account?tab=agent');
  await expect(face(page)).toBeVisible({ timeout: 15000 });
  await page.keyboard.press('Control+k');
  await expect.poll(() => new URL(page.url()).pathname).toBe('/assistant');
  await back(page).click();
  await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe('/account?tab=agent');
});

test('from a deal, the empty assistant page offers the three deal questions', async ({ page }) => {
  await serveHome(page);
  await page.addInitScript(() => sessionStorage.setItem('karwan:assistant-return', '/deals/0xabc'));
  await page.goto('/assistant');
  const questions = page.locator('[data-assistant-questions]');
  for (const key of ['deal.money', 'deal.approvePart', 'deal.moveDate'] as const) {
    await expect(questions.getByRole('button', { name: copy.questions[key] })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: copy.person })).toBeVisible();
});

test('Hide the guide leaves only the header face, silent, and the account keeps it', async ({ page }) => {
  await serveHome(page, { moves: [{ kind: 'first_post', href: '/buyer' }], balances: EMPTY });
  await openHome(page);
  await expect(face(page)).toBeVisible();
  await face(page).click({ button: 'right' });
  await page.getByRole('menuitem', { name: new RegExp(copy.menu.hide) }).click();
  await expect(face(page)).toHaveCount(0);
  await expect(line(page)).toHaveCount(0);
  await expect(page.locator('[data-aman-header]')).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-aman-header]')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1600);
  await expect(face(page)).toHaveCount(0);
  await page.locator('[data-aman-header]').click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/assistant');
});

test('the guide off: no face anywhere, and Ctrl+K still opens the assistant page', async ({ page }) => {
  await serveHome(page, { moves: [{ kind: 'first_post', href: '/buyer' }], balances: EMPTY, settings: { guide: 'off' } });
  await openHome(page);
  await page.waitForTimeout(1600);
  await expect(face(page)).toHaveCount(0);
  await expect(page.locator('[data-aman-header]')).toHaveCount(0);
  await page.keyboard.press('Control+k');
  await expect.poll(() => new URL(page.url()).pathname).toBe('/assistant');
});

test('reduced motion keeps Aman at the dock', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await serveHome(page, { moves: [{ kind: 'first_post', href: '/buyer' }], balances: EMPTY });
  await openHome(page);
  await expect(line(page)).toBeVisible();
  const view = page.viewportSize()!;
  const at = (await face(page).boundingBox())!;
  const edge = view.width >= 1024 ? 24 : 16;
  expect(Math.round(at.x)).toBe(view.width - edge - 56);
  expect(at.y).toBeGreaterThan(view.height / 2);
});

test('no corner launcher anywhere', async ({ page }) => {
  await serveHome(page);
  for (const path of ['/app', '/account', '/assistant']) {
    await page.goto(path);
    await page.waitForTimeout(800);
    await expect(page.locator('[data-float-launcher]')).toHaveCount(0);
  }
});

test('Aman steps aside while it would sit on a button, and comes back', async ({ page }) => {
  await serveHome(page, { moves: [{ kind: 'first_post', href: '/buyer' }], balances: EMPTY });
  await openHome(page);
  await expect(face(page)).toBeVisible();
  const at = (await face(page).boundingBox())!;
  await page.evaluate((box) => {
    const button = document.createElement('button');
    button.id = 'under';
    button.textContent = 'Record a session';
    button.style.cssText = `position:fixed;left:${box.x - 40}px;top:${box.y + 10}px;width:160px;height:40px;z-index:1`;
    document.body.appendChild(button);
  }, at);
  await expect(face(page)).toHaveAttribute('data-aside', '');
  await page.locator('#under').click();
  await page.evaluate(() => document.getElementById('under')?.remove());
  await expect(face(page)).not.toHaveAttribute('data-aside', '');
});

test('the face and its line never cover each other or leave the screen', async ({ page }) => {
  await serveHome(page, { moves: [{ kind: 'first_post', href: '/buyer' }], balances: EMPTY });
  await openHome(page);
  await expect(line(page)).toBeVisible();
  const view = page.viewportSize()!;
  const f = (await face(page).boundingBox())!;
  const l = (await line(page).boundingBox())!;
  expect(apart(f, l)).toBe(true);
  for (const box of [f, l]) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(view.width);
    expect(box.y + box.height).toBeLessThanOrEqual(view.height);
  }
});

test('Ctrl+K while typing in a field does not navigate', async ({ page }) => {
  await serveHome(page);
  await page.goto('/assistant');
  const box = page.locator('#assistant-ask');
  await box.click();
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(400);
  expect(new URL(page.url()).pathname).toBe('/assistant');
  await page.goto('/app');
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'probe';
    document.body.appendChild(input);
    input.focus();
  });
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(400);
  expect(new URL(page.url()).pathname).toBe('/app');
});

test('axe: no serious or critical issues on Home with Aman and on the assistant page', async ({ page }) => {
  await serveHome(page, { moves: [{ kind: 'first_post', href: '/buyer' }], balances: EMPTY });
  await page.goto('/app');
  await expect(face(page)).toBeVisible({ timeout: 15000 });
  for (const path of ['/app', '/assistant']) {
    if (path !== '/app') await page.goto(path);
    await page.waitForTimeout(1600);
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
  }
});
