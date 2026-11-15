import { expect, test, type Page } from '@playwright/test';

/// Smooth on every phone (view 86): one clip plays at a time, Save-Data loads
/// none, a device on the still level keeps the phone facing front, and a
/// device with few cores gets the lite page.
const API = 'http://127.0.0.1:3199';
const TRADES = 'section[aria-labelledby="landing-trades"]';

async function open(page: Page, init?: () => void) {
  await page.addInitScript(() => localStorage.setItem('karwan:guide:disabled', '1'));
  if (init) await page.addInitScript(init);
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/auth/bootstrap') return route.fulfill({ json: { user: null, profile: null } });
    return route.fulfill({ json: {} });
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('#landing-title')).toBeVisible();
}

const motion = (page: Page) => page.evaluate(() => document.documentElement.dataset.motion);

test('scrolling the trades, never more than one clip plays', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, () => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
  });
  await expect.poll(() => motion(page)).toBe('full');
  const top = await page.locator(TRADES).evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  const height = await page.locator(TRADES).evaluate((el) => el.getBoundingClientRect().height);
  let most = 0;
  let any = 0;
  for (let y = top - 400; y < top + height; y += 150) {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await page.waitForTimeout(250);
    const playing = await page.locator(`${TRADES} video`).evaluateAll((vs) => vs.filter((v) => !(v as HTMLVideoElement).paused).length);
    most = Math.max(most, playing);
    any += playing;
  }
  expect(most).toBeLessThanOrEqual(1);
  expect(any).toBeGreaterThan(0);
});

test('with Save-Data on, no clip loads and the page is still', async ({ page }) => {
  const clips: string[] = [];
  page.on('request', (r) => { if (r.url().endsWith('.mp4')) clips.push(r.url()); });
  await open(page, () => {
    Object.defineProperty(navigator, 'connection', { get: () => ({ saveData: true, effectiveType: '4g' }) });
  });
  await expect.poll(() => motion(page)).toBe('still');
  await page.locator(TRADES).scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await expect(page.locator(`${TRADES} video`)).toHaveCount(0);
  expect(clips).toEqual([]);
});

test('a device remembered as still keeps the phone facing front', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, () => {
    localStorage.setItem('karwan.motionLevel', JSON.stringify({ level: 'still', at: Date.now() }));
  });
  await expect.poll(() => motion(page)).toBe('still');
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 1.5));
  await page.waitForTimeout(400);
  const turn = await page.evaluate(() => {
    const el = document.querySelector('[class*="heroSticky"]');
    return el ? getComputedStyle(el).getPropertyValue('--turn').trim() : null;
  });
  expect(turn).toBe('0');
});

test('a device with two cores gets the lite page and the small clip', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page, () => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 });
  });
  await expect.poll(() => motion(page)).toBe('lite');
  await page.locator(TRADES).scrollIntoViewIfNeeded();
  const first = page.locator(`${TRADES} video`).first();
  await expect(first.locator('source')).toHaveAttribute('src', /-720\.mp4$/);
});
