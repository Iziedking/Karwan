import { expect, test } from '@playwright/test';
import { RATES, funded, serveMoney, type MoneyWorld } from './moneyFixtures';

/// Show amounts in (view 51): ten currencies with today's rate, the
/// explanation behind an info icon, and the choice kept on the account.

test('show amounts in lists ten currencies with a rate and saves the choice', async ({ page }) => {
  const world: MoneyWorld = { balances: funded, rates: RATES };
  await serveMoney(page, world);
  await page.goto('/settings');
  await page.getByRole('button', { name: /Show amounts in/ }).click();
  const sheet = page.getByRole('dialog');
  const list = sheet.getByRole('radiogroup', { name: 'Show amounts in' });
  await expect(list.getByRole('radio')).toHaveCount(10);
  await expect(list.getByRole('radio', { name: /Digital dollar/ })).toHaveAttribute('aria-checked', 'true');
  await expect(list.getByRole('radio', { name: /Nigerian naira/ })).toContainText('1 USDC = ₦1,346');
  await expect(list.getByRole('radio', { name: /Euro/ })).toContainText('1 USDC = €0.89');
  await expect(sheet.getByText('Rates update every minute.')).toBeVisible();
  await expect(sheet.getByText('Your money stays in USDC. This only changes how amounts read.')).toHaveCount(0);

  await list.getByRole('radio', { name: /Nigerian naira/ }).click();
  await expect(sheet).toBeHidden();
  expect(world.settings?.displayCurrency).toBe('NGN');
  await expect(page.getByRole('button', { name: /Show amounts in/ })).toContainText('Nigerian naira (NGN)');

  await page.reload();
  await expect(page.getByRole('button', { name: /Show amounts in/ })).toContainText('Nigerian naira (NGN)');
});

test('no fresh rate shows the list without rates and keeps USDC', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  await page.goto('/settings');
  await page.getByRole('button', { name: /Show amounts in/ }).click();
  const list = page.getByRole('dialog').getByRole('radiogroup', { name: 'Show amounts in' });
  await expect(list.getByRole('radio', { name: /Nigerian naira/ })).toContainText('Rate not available right now');
  await expect(list.getByRole('radio', { name: /Digital dollar/ })).toHaveAttribute('aria-checked', 'true');
});
