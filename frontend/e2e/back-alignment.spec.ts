import { expect, test } from '@playwright/test';
import { funded, serveMoney } from './moneyFixtures';

/// Back starts on the same line as the page under it, at every width.
for (const path of ['/activity', '/seller']) {
  test(`Back on ${path} lines up with the page heading`, async ({ page }) => {
    await serveMoney(page, { balances: funded });
    await page.goto(path);
    const heading = page.locator('main h1').first();
    await expect(heading).toBeVisible();
    const back = page.locator('[data-shell-back]');
    await expect(back).toBeVisible();
    const [a, h] = await Promise.all([back.boundingBox(), heading.boundingBox()]);
    // The round Back's edge sits on the heading's edge.
    expect(Math.abs(a!.x - h!.x)).toBeLessThanOrEqual(4);
  });
}

/// The main pages in the rail have no Back; a page inside one has the round one (owner, 12 Nov 2026).
test('no main page shows Back, and an inner page shows a round one with no word', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  for (const path of ['/app', '/market', '/deals', '/account', '/messages', '/financier', '/profile']) {
    await page.goto(path);
    await page.waitForLoadState('load');
    await page.waitForTimeout(600);
    await expect(page.locator('[data-back]').filter({ visible: true }), path).toHaveCount(0);
  }
  await page.goto('/activity');
  const back = page.locator('[data-back]').filter({ visible: true }).first();
  await expect(back).toBeVisible();
  await expect(back).toHaveText('');
  const box = await back.boundingBox();
  expect(Math.round(box!.width)).toBe(44);
  expect(Math.round(box!.height)).toBe(44);
});
