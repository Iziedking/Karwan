import { expect, test, type Page } from '@playwright/test';
import { API, ME, funded, serveMoney } from './moneyFixtures';
import { pointLines } from '../shared/i18n/messages/pointLines';

/// Show me (view 57, 17 Nov): a link with ?point=<id> lights that part of the
/// page with our own line beside it, for 8 seconds or until a tap.

const ring = (page: Page) => page.locator('[data-point-ring]');
const pointLine = (page: Page) => page.locator('[data-aman-line="point"]');

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function serve(page: Page) {
  await serveMoney(page, { balances: funded, settings: { setupDoneAt: 1, guideHelloOn: today(), guideNewHere: 'off' } });
  await page.route(`${API}/api/profile**`, (route) =>
    route.fulfill({ json: { profile: { address: ME, displayName: 'Bola Ade', handle: 'bola', settings: { setupDoneAt: 1, guideNewHere: 'off' } } } }));
  await page.route(`${API}/api/agents/status`, (route) =>
    route.fulfill({ json: { chain: { id: 5042002, rpc: 'http://127.0.0.1:3198', explorer: 'https://testnet.arcscan.app' }, contracts: {} } }));
  await page.route(`${API}/api/guide/next`, (route) => route.fulfill({ json: { moves: [] } }));
  await page.route(`${API}/api/guide/moment`, (route) => route.fulfill({ json: { moment: null } }));
  await page.route(`${API}/api/guide/setup`, (route) => route.fulfill({ json: { steps: [], next: null, complete: true, known: true } }));
  await page.route(`${API}/api/assistant/**`, (route) => route.fulfill({ json: { conversations: [], pickUp: null } }));
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test('Show me lights the part, says our line and takes the point out of the link', async ({ page }) => {
  await serve(page);
  await page.goto('/app?point=home-money');
  await expect(ring(page)).toBeVisible({ timeout: 15000 });
  await expect(pointLine(page)).toContainText(pointLines.en['home-money']);
  const part = (await page.locator('[data-guide="home-money"]').first().boundingBox())!;
  const lit = (await ring(page).boundingBox())!;
  expect(overlaps(part, lit)).toBe(true);
  await expect.poll(() => new URL(page.url()).searchParams.has('point')).toBe(false);
});

test('a tap anywhere puts the light out', async ({ page }) => {
  await serve(page);
  await page.goto('/app?point=home-money');
  await expect(ring(page)).toBeVisible({ timeout: 15000 });
  await page.mouse.click(4, 4);
  await expect(ring(page)).toHaveCount(0);
  await expect(pointLine(page)).toHaveCount(0);
});

test('with no tap the light goes after eight seconds', async ({ page }) => {
  await page.clock.install();
  await serve(page);
  await page.goto('/app?point=home-money');
  await expect(ring(page)).toBeVisible({ timeout: 15000 });
  await page.clock.runFor(8500);
  await expect(ring(page)).toHaveCount(0);
});

test('an unknown point, or a point from another page, shows nothing', async ({ page }) => {
  await serve(page);
  for (const point of ['nope', 'market-search']) {
    await page.goto(`/app?point=${point}`);
    await page.waitForTimeout(3500);
    await expect(ring(page)).toHaveCount(0);
    await expect(pointLine(page)).toHaveCount(0);
  }
});

test('point for a hidden part shows nothing', async ({ page }) => {
  await serve(page);
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent = '[data-guide="home-money"] { display: none !important; }';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
  });
  await page.goto('/app?point=home-money');
  await page.waitForTimeout(3500);
  await expect(ring(page)).toHaveCount(0);
});

test('with reduced motion Aman holds still beside the part', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await serve(page);
  await page.goto('/app?point=home-money');
  await expect(ring(page)).toBeVisible({ timeout: 15000 });
  const face = page.locator('[data-aman-face]');
  await expect(face).toBeVisible();
  const first = (await face.boundingBox())!;
  await page.waitForTimeout(300);
  const second = (await face.boundingBox())!;
  expect(Math.abs(first.x - second.x)).toBeLessThan(1);
});

test('no tour button anywhere, and an old tour link opens the plain page', async ({ page }) => {
  await serve(page);
  for (const path of ['/app', '/market', '/account', '/bridge', '/settings']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /tour|guide de la page|page guide/i })).toHaveCount(0);
  }
  await page.goto('/app?tour=1');
  await page.waitForTimeout(2500);
  await expect(page.locator('#page-tour-title')).toHaveCount(0);
});
