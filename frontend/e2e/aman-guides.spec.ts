import { expect, test, type Page } from '@playwright/test';
import { API, ME, funded, serveMoney } from './moneyFixtures';
import { pointLines } from '../shared/i18n/messages/pointLines';
import { guideCopy } from '../shared/i18n/messages/guide';

/// Aman guides you (view 57, 19 Nov): one part at a time, in plain words,
/// under the part on a phone and a tablet and beside it on a laptop; gone
/// after 8 seconds or a tap; each part once; the first hello once; help can be
/// switched off and Aman says so.

const copy = guideCopy.en.guides;
const partLine = (page: Page) => page.locator('[data-aman-line="part"]');
const helloLine = (page: Page) => page.locator('[data-aman-line="hello"]');

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/// Settings start with nothing heard; `extra` overrides. Every POST is kept.
async function serve(page: Page, extra: Record<string, unknown> = {}) {
  const posts: Array<Record<string, unknown>> = [];
  await serveMoney(page, {
    balances: funded,
    settings: { setupDoneAt: 1, guideHelloOn: today(), guideHi: 'done', guideHeard: [], ...extra },
  });
  await page.route(`${API}/api/settings`, (route) => {
    if (route.request().method() === 'POST') posts.push((route.request().postDataJSON() as { settings: Record<string, unknown> }).settings);
    return route.fallback();
  });
  await page.route(`${API}/api/profile**`, (route) =>
    route.fulfill({ json: { profile: { address: ME, displayName: 'Bola Ade', handle: 'bola', settings: { setupDoneAt: 1 } } } }));
  await page.route(`${API}/api/agents/status`, (route) =>
    route.fulfill({ json: { chain: { id: 5042002, rpc: 'http://127.0.0.1:3198', explorer: 'https://testnet.arcscan.app' }, contracts: {} } }));
  await page.route(`${API}/api/guide/next`, (route) => route.fulfill({ json: { moves: [] } }));
  await page.route(`${API}/api/guide/moment`, (route) => route.fulfill({ json: { moment: null } }));
  await page.route(`${API}/api/guide/setup`, (route) => route.fulfill({ json: { steps: [], next: null, complete: true, known: true } }));
  await page.route(`${API}/api/assistant/**`, (route) => route.fulfill({ json: { conversations: [], pickUp: null, enabled: true, notes: [] } }));
  return posts;
}

/// Brings the alerts row to the middle of the screen and waits for a line.
async function stopOnAlerts(page: Page) {
  await page.goto('/settings');
  const alerts = page.locator('[data-guide="settings-alerts"]');
  await expect(alerts).toBeVisible({ timeout: 15000 });
  await alerts.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await expect(partLine(page)).toBeVisible({ timeout: 10000 });
  return alerts;
}

test('the first hello comes once, with Ask me something and Switch me off', async ({ page }) => {
  const posts = await serve(page, { guideHi: undefined });
  await page.goto('/app');
  await expect(helloLine(page)).toContainText(copy.hello, { timeout: 15000 });
  await expect(helloLine(page).getByRole('button', { name: copy.askMe })).toBeVisible();
  await expect(helloLine(page).getByRole('button', { name: copy.switchOff })).toBeVisible();
  await expect.poll(() => posts.some((p) => p.guideHi === 'done')).toBe(true);
  await page.reload();
  await page.waitForTimeout(4000);
  await expect(helloLine(page)).toHaveCount(0);
});

test('Switch me off keeps the face and says so', async ({ page }) => {
  const posts = await serve(page, { guideHi: undefined });
  await page.goto('/app');
  await helloLine(page).getByRole('button', { name: copy.switchOff }).click({ timeout: 15000 });
  await expect(page.locator('[data-aman-line="switched-off"]')).toContainText(copy.switchedOff);
  await expect.poll(() => posts.some((p) => p.guide === 'face')).toBe(true);
  await expect(page.locator('[data-aman-header]').first()).toBeVisible();
});

test('a part line opens under the part on a phone and pushes the page down', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone layout');
  await serve(page);
  await page.goto('/settings');
  const alerts = page.locator('[data-guide="settings-alerts"]');
  await expect(alerts).toBeVisible({ timeout: 15000 });
  const before = await alerts.evaluate((el) => getComputedStyle(el).marginBlockEnd);
  await alerts.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await expect(partLine(page)).toBeVisible({ timeout: 10000 });
  await expect(partLine(page)).toHaveAttribute('data-mode', 'inline');
  const id = (await partLine(page).getAttribute('data-part'))!;
  await expect(partLine(page)).toContainText(pointLines.en[id as keyof typeof pointLines.en]);
  const part = page.locator(`[data-guide="${id}"]`);
  const widened = await part.evaluate((el) => parseFloat(getComputedStyle(el).marginBlockEnd));
  expect(widened).toBeGreaterThan(parseFloat(before) || 0);
  // The line sits in the gap: it covers no other row.
  const line = (await partLine(page).boundingBox())!;
  for (const other of await page.locator('[data-guide^="settings-"]').all()) {
    if ((await other.getAttribute('data-guide')) === id) continue;
    const box = await other.boundingBox();
    if (box) expect(overlaps(line, box)).toBe(false);
  }
});

test('on a laptop the line sits beside the part', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'laptop layout');
  await serve(page);
  await stopOnAlerts(page);
  await expect(partLine(page)).toHaveAttribute('data-mode', 'beside');
  const id = (await partLine(page).getAttribute('data-part'))!;
  const part = (await page.locator(`[data-guide="${id}"]`).boundingBox())!;
  const line = (await partLine(page).boundingBox())!;
  expect(overlaps(part, line)).toBe(false);
});

test('the line goes after eight seconds and the page closes up', async ({ page }) => {
  await page.clock.install();
  await serve(page);
  await page.goto('/settings');
  const alerts = page.locator('[data-guide="settings-alerts"]');
  await expect(alerts).toBeVisible({ timeout: 15000 });
  await alerts.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.clock.runFor(2500);
  await expect(partLine(page)).toBeVisible({ timeout: 10000 });
  const id = (await partLine(page).getAttribute('data-part'))!;
  await page.clock.runFor(8500);
  await expect(partLine(page)).toHaveCount(0);
  await expect.poll(() => page.locator(`[data-guide="${id}"]`).evaluate((el) => (el as HTMLElement).style.marginBlockEnd)).toBe('');
});

test('a tap puts the line away, and that part is kept as heard', async ({ page }) => {
  const posts = await serve(page);
  await stopOnAlerts(page);
  const id = (await partLine(page).getAttribute('data-part'))!;
  await page.mouse.click(4, 4);
  await expect(partLine(page)).toHaveCount(0);
  await expect.poll(() => posts.some((p) => Array.isArray(p.guideHeard) && (p.guideHeard as string[]).includes(id))).toBe(true);
});

test('a part already heard is not explained again', async ({ page }) => {
  await serve(page, { guideHeard: Object.keys(pointLines.en).filter((id) => id.startsWith('settings-')) });
  await page.goto('/settings');
  await expect(page.locator('[data-guide="settings-alerts"]')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(4000);
  await expect(partLine(page)).toHaveCount(0);
});

test('the third visit to a page is quiet', async ({ page }) => {
  await serve(page, { guideVisits: { '/settings': 2 } });
  await page.goto('/settings');
  await expect(page.locator('[data-guide="settings-alerts"]')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(4000);
  await expect(partLine(page)).toHaveCount(0);
});

test('with help off no line comes, and Settings says where Aman is', async ({ page }) => {
  await serve(page, { guide: 'face' });
  await page.goto('/settings');
  await expect(page.locator('[data-guide-off-note]')).toHaveText(copy.helpOffNote, { timeout: 15000 });
  await page.waitForTimeout(4000);
  await expect(partLine(page)).toHaveCount(0);
  await expect(page.getByRole('switch', { name: copy.helpRow })).toHaveAttribute('aria-checked', 'false');
});

test('nothing comes on a money screen', async ({ page }) => {
  await serve(page);
  await page.goto('/send');
  await page.waitForTimeout(5000);
  await expect(partLine(page)).toHaveCount(0);
  await expect(helloLine(page)).toHaveCount(0);
});
