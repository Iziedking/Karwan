import { expect, test } from '@playwright/test';
import { funded, serveMoney } from './moneyFixtures';

/// The desktop frame (view 48, Figma desktop): a 256px rail, then 40px of
/// canvas before the page; collapsed, the page takes the room back.

test('on a wide screen the rail is 256 wide and the page starts 40px after it', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the rail shows on a wide screen only');
  await serveMoney(page, { balances: funded });
  await page.goto('/account');
  const rail = page.locator('#workspace-navigation');
  await expect(rail).toBeVisible();
  await expect(page.locator('.karwan-splash-mark')).toHaveCount(0);
  const r = (await rail.boundingBox())!;
  expect(Math.round(r.width)).toBe(256);
  const start = await page.locator('[data-workspace-main="true"]').evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingInlineStart));
  expect(start - (r.x + r.width)).toBeGreaterThanOrEqual(40);
  await page.screenshot({ path: info.outputPath('desktop-money.png') });
});
