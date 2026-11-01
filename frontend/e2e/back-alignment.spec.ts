import { expect, test } from '@playwright/test';
import { funded, serveMoney } from './moneyFixtures';

/// Back starts on the same line as the page under it, at every width.
for (const path of ['/deals', '/seller']) {
  test(`Back on ${path} lines up with the page heading`, async ({ page }) => {
    await serveMoney(page, { balances: funded });
    await page.goto(path);
    const heading = page.locator('main h1').first();
    await expect(heading).toBeVisible();
    const arrow = page.locator('[data-shell-back] svg');
    await expect(arrow).toBeVisible();
    const [a, h] = await Promise.all([arrow.boundingBox(), heading.boundingBox()]);
    // The arrow's drawing sits a few pixels inside its box, as a letter does.
    expect(Math.abs(a!.x - h!.x)).toBeLessThanOrEqual(4);
  });
}
