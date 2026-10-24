import { expect, test, type Page } from '@playwright/test';

/// A mouse wheel glides the page to a stop on desktop (owner, 24 Oct 2026), and
/// nothing changes for someone who asks for less motion.

const API = 'http://127.0.0.1:3199';
const SUBJECT = '0x3b3cf9daad222c452245fb07cf20c3cb56042d61';

async function open(page: Page) {
  await page.setViewportSize({ width: 1280, height: 420 });
  await page.addInitScript(() => localStorage.setItem('karwan:guide:disabled', '1'));
  await page.route(`${API}/**`, (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/auth/bootstrap') return route.fulfill({ json: { user: null, profile: null } });
    if (pathname === '/api/reputation') {
      return route.fulfill({ json: { sealed: true, address: SUBJECT, displayName: 'Ada Obi', tag: 'ada', tier: 'ESTABLISHED', reasons: ['HAS_COMPLETED_DEALS', 'USUALLY_ON_TIME'], memberSince: 1_700_000_000_000 } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto(`/credit-passport/${SUBJECT}`);
  await expect(page.getByRole('heading', { name: 'Ada Obi' })).toBeVisible();
}

test.describe('with motion allowed', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('one turn of the wheel glides the page to a stop', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop pointer only');
    await open(page);
    await expect(page.locator('html')).toHaveClass(/\blenis\b/);
    await page.mouse.move(640, 300);
    // Smooth scrolling loads just after the page; let it settle before the wheel.
    await page.waitForTimeout(600);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(60);
    const early = await page.evaluate(() => window.scrollY);
    await page.waitForTimeout(1500);
    const settled = await page.evaluate(() => window.scrollY);
    expect(settled).toBeGreaterThan(0);
    expect(early).toBeLessThan(settled);
  });
});

test('someone who asks for less motion keeps native scrolling', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop pointer only');
  await open(page);
  await page.waitForTimeout(300);
  await expect(page.locator('html')).not.toHaveClass(/\blenis\b/);
});
