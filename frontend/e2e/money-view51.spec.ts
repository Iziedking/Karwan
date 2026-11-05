import { expect, test } from '@playwright/test';
import { RATES, funded, recentActivity, serveMoney } from './moneyFixtures';
import { noProtocolWords } from './instantTopUpFixtures';

/// View 51: Balance and Agents behind one switch, what the agents spent,
/// receipts from Recent, amounts in a chosen currency, and the Add money sheet.

const agentActivity = [
  ...recentActivity,
  {
    id: 'a3', ts: Date.UTC(2026, 10, 4), kind: 'agent_spend', summary: "Checked @musa's record",
    params: { agent: 'buyer' }, amountUsdc: '0.005', txHash: '0xfed', refId: 'KWN-2026-0003', chain: 'arc', jobId: null, status: 'done',
  },
];

test('money has a Balance and Agents switch and remembers the tab', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  await page.goto('/account');
  const tabs = page.getByRole('tablist', { name: 'Show' });
  await expect(tabs.getByRole('tab', { name: 'Balance' })).toHaveAttribute('aria-selected', 'true');
  await tabs.getByRole('tab', { name: 'Agents' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your agents hold');
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Agents' })).toHaveAttribute('aria-selected', 'true');
});

test('the agents tab shows what agents hold, Top up and Withdraw, and what they spent', async ({ page }) => {
  await serveMoney(page, { balances: funded, activity: agentActivity });
  await page.goto('/account');
  await page.getByRole('tab', { name: 'Agents' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('120.00');
  const actions = page.locator('[data-agent-actions]');
  await expect(actions.getByRole('button', { name: 'Top up', exact: true })).toBeVisible();
  await expect(actions.getByRole('button', { name: 'Withdraw', exact: true })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Buying agent' })).toContainText('Pays for what you buy');
  const spent = page.getByRole('region', { name: 'What your agents spent' });
  await expect(spent.locator('[data-recent-row]')).toHaveCount(2);
  await expect(spent).not.toContainText('Received 500 USDC');
  await actions.getByRole('button', { name: 'Top up', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Top up buying agent' })).toBeVisible();
});

test('a recent row opens its receipt with Download image as the one green button', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  await page.goto('/account');
  await page.locator('[data-recent-row]').first().click();
  const receipt = page.getByRole('dialog');
  await expect(receipt).toContainText('KWN-2026-0001');
  const green = await receipt.locator('button, a').evaluateAll((els) => els.filter((el) => getComputedStyle(el).backgroundColor === 'rgb(175, 201, 91)').map((el) => el.textContent?.trim()));
  expect(green).toEqual(['Download image']);
});

test('with naira chosen the balance leads in naira with USDC under it, and Recent shows both', async ({ page }) => {
  await serveMoney(page, { balances: funded, rates: RATES, settings: { displayCurrency: 'NGN' } });
  await page.goto('/account');
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toContainText('₦1,669,849');
  await expect(page.locator('[data-balance-usdc]')).toHaveText('1,240.50 USDC');
  await expect(page.locator('[data-recent-row]').first()).toContainText('+₦673,055');
  await expect(page.locator('[data-recent-row]').first()).toContainText('+500.00 USDC');
});

test('with no fresh rate everything reads in USDC', async ({ page }) => {
  await serveMoney(page, { balances: funded, settings: { displayCurrency: 'NGN' } });
  await page.goto('/account');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('1,240.50');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('USDC');
  await expect(page.getByText(/₦/)).toHaveCount(0);
});

test('add money opens a sheet over money, never leaving the page, with no bridge words', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  await page.goto('/account');
  await page.getByRole('button', { name: 'Add money', exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Add money' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /Connect a wallet/ })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /From an exchange/ })).toBeVisible();
  await expect(sheet).toContainText('Card');
  await expect(sheet).toContainText('Soon');
  await expect(sheet).not.toContainText(/bridge|CCTP|mint|burn/i);
  await noProtocolWords(page);
  await sheet.getByRole('button', { name: /From an exchange/ }).click();
  await expect(sheet).toContainText('Base Sepolia');
});

test('a wallet account moves its Transfer balance to the balance from the card', async ({ page }) => {
  await serveMoney(page, { balances: funded, pool: 105.54, method: 'web3' });
  await page.goto('/account');
  const card = page.locator('[data-gateway-balance]');
  await expect(card).toContainText('105.54 USDC');
  await card.getByRole('button', { name: 'Move to balance' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Move to balance' })).toBeVisible();
  await expect(sheet).toContainText('From');
  await expect(sheet).toContainText('Transfer balance');
  await expect(sheet).toContainText('Your balance');
  await expect(sheet).toContainText('In seconds');
  await expect(sheet.getByRole('button', { name: 'Move 105.54 USDC' })).toBeVisible();
  await page.keyboard.press('Escape');
  await card.getByRole('button', { name: 'Add to it' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Add to Transfer balance' })).toBeVisible();
});

test('an email account has no Transfer balance buttons', async ({ page }) => {
  await serveMoney(page, { balances: funded, pool: 105.54 });
  await page.goto('/account');
  await expect(page.locator('[data-gateway-balance]').getByRole('button', { name: 'Move to balance' })).toHaveCount(0);
});

test('add money reads right to left in Arabic, with numerals left to right', async ({ page }) => {
  await page.context().addCookies([{ name: 'karwan-locale', value: 'ar', domain: '127.0.0.1', path: '/' }]);
  await serveMoney(page, { balances: funded });
  await page.goto('/account');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 }).locator('[dir="ltr"]').first()).toContainText('1,240.50');
  await page.getByRole('button', { name: 'إضافة مال', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'إضافة مال' })).toBeVisible();
});
