import { expect, test } from '@playwright/test';
import { ME, RATES, funded, recentActivity, serveMoney } from './moneyFixtures';
import { noProtocolWords } from './instantTopUpFixtures';

/// View 51: Money is one page with Balance, Agent and Deal guarantee; Add money
/// and Withdraw are pages; receipts from Recent; amounts in a chosen currency.

const agentActivity = [
  ...recentActivity,
  {
    id: 'a3', ts: Date.UTC(2026, 10, 4), kind: 'agent_spend', summary: "Checked @musa's record",
    params: { agent: 'buyer' }, amountUsdc: '0.005', txHash: '0xfed', refId: 'KWN-2026-0003', chain: 'arc', jobId: null, status: 'done',
  },
];
const wide = (page: import('@playwright/test').Page) => (page.viewportSize()?.width ?? 0) >= 768;

test('money is one page with Balance, Agent and Deal guarantee, and the tab lives in the address', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  await page.goto('/account');
  const tabs = page.getByRole('tablist', { name: 'Money' });
  await expect(tabs.getByRole('tab')).toHaveText(['Balance', 'Agent', 'Deal guarantee']);
  await expect(tabs.getByRole('tab', { name: 'Balance' })).toHaveAttribute('aria-selected', 'true');
  await tabs.getByRole('tab', { name: 'Agent' }).click();
  await expect(page).toHaveURL(/\/account\?tab=agent$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('With your agent');
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Agent' })).toHaveAttribute('aria-selected', 'true');
});

test('the agent tab shows the money with the agent, Top up, Withdraw and Change limit, and this week in one card', async ({ page }) => {
  await serveMoney(page, { balances: funded, activity: agentActivity, agentLimit: { weeklyUsdc: 1, spentUsdc: 0.205, recordChecks: 21, webSearches: 1 } });
  await page.goto('/account?tab=agent');
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toContainText('With your agent');
  await expect(heading).toContainText('120.00');
  await expect(page.locator('[data-agent-limit]')).toContainText('Spends up to 1.00 USDC a week on checks.');
  const actions = page.locator('[data-agent-actions]');
  await expect(actions.getByRole('link', { name: 'Top up' })).toHaveAttribute('href', '/account/agent?move=topUp&agent=buyer');
  await expect(actions.getByRole('link', { name: 'Withdraw' })).toHaveAttribute('href', /\/account\/agent\?move=withdraw&agent=/);
  await expect(actions.getByRole('button', { name: 'Change limit' })).toBeVisible();
  await expect(page.locator('[data-spent-week]')).toContainText('0.205 of 1.00');
  await expect(page.locator('[data-left-week]')).toContainText('0.795 left. 21 record checks and 1 searches so far.');
  const spent = page.getByRole('region', { name: 'What your agents spent' });
  await expect(spent.locator('[data-recent-row]')).toHaveCount(2);
  await expect(spent).not.toContainText('Received 500 USDC');
});

test('the weekly limit changes with the person\'s own tap', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  await page.goto('/account?tab=agent');
  await expect(page.locator('[data-agent-limit]')).toContainText('0.25');
  await page.getByRole('button', { name: 'Change limit' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Weekly limit' })).toBeVisible();
  await expect(sheet.getByRole('radio')).toHaveCount(4);
  await expect(sheet.getByRole('radio', { name: /1\.00 USDC/ })).toContainText('About 200 record checks');
  await sheet.getByRole('radio', { name: /1\.00 USDC/ }).click();
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page.locator('[data-agent-limit]')).toContainText('1.00');
});

test('topping up the agent opens its own page', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  await page.goto('/account?tab=agent');
  await page.locator('[data-agent-actions]').getByRole('link', { name: 'Top up' }).click();
  await expect(page).toHaveURL(/\/account\/agent\?move=topUp&agent=buyer$/);
  await expect(page.getByRole('heading', { name: 'Top up your agent' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the deal guarantee tab shows what is in place, Add and Withdraw, and what it does behind a tip', async ({ page }) => {
  await serveMoney(page, { balances: funded, guarantee: { inPlaceUsdc: '500.00', heldUsdc: '0.00', freeUsdc: '500.00' } });
  await page.goto('/account?tab=guarantee');
  await expect(page.getByRole('tab', { name: 'Deal guarantee' })).toHaveAttribute('aria-selected', 'true');
  const tab = page.locator('[data-guarantee-tab]');
  await expect(tab.getByRole('heading', { level: 1 })).toContainText('500.00');
  await expect(tab).toContainText('Not counted in your balance');
  await expect(tab.locator('[data-guarantee-actions]').getByRole('link', { name: 'Add', exact: true })).toHaveAttribute('href', '/account/guarantee?step=put_up');
  await expect(tab.locator('[data-guarantee-actions]').getByRole('link', { name: 'Withdraw' })).toHaveAttribute('href', '/account/guarantee?step=take_out');
  await expect(tab).toContainText('The USYC rate');
  await expect(tab).toContainText('Ready to withdraw');
});

test('the old guarantee page lands on Money', async ({ page }) => {
  await serveMoney(page, { balances: funded, guarantee: { inPlaceUsdc: '500.00', heldUsdc: '0.00', freeUsdc: '500.00' } });
  await page.goto('/guarantee');
  await expect(page).toHaveURL(/\/account\?tab=guarantee$/);
  await expect(page.locator('[data-guarantee-tab]')).toBeVisible();
});

test('one balance counts the agent and the Transfer balance, and Where it is lists each part', async ({ page }) => {
  await serveMoney(page, { balances: funded, pool: 105.54, method: 'web3' });
  await page.goto('/account');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your balance');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('1,466.04');
  await page.getByRole('button', { name: /Where it is/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.locator('[data-part="ready"]')).toContainText('1,240.50');
  await expect(sheet.locator('[data-part="transfer"]')).toContainText('105.54');
  await expect(sheet.locator('[data-part="agent"]')).toContainText('120.00');
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

test('with naira chosen only the block balance shows USDC; Recent amounts read in naira alone', async ({ page }) => {
  await serveMoney(page, { balances: funded, rates: RATES, settings: { displayCurrency: 'NGN' } });
  await page.goto('/account');
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toContainText('₦1,831,383');
  await expect(page.locator('[data-balance-usdc]')).toHaveText('1,360.50 USDC');
  await expect(page.locator('[data-recent-row]').first()).toContainText('+₦673,055');
  await expect(page.locator('[data-recent-row]').first()).not.toContainText('+500.00 USDC');
  // Every price reads the same way (owner, 5 Nov 2026): the Agent tab too.
  await page.goto('/account?tab=agent');
  await expect(page.locator('[data-agent-money]')).toContainText('₦');
  await expect(page.locator('[data-agent-money] [data-price-usdc]')).toHaveText(/^[0-9,.]+ USDC$/);
});

test('with no fresh rate everything reads in USDC', async ({ page }) => {
  await serveMoney(page, { balances: funded, settings: { displayCurrency: 'NGN' } });
  await page.goto('/account');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('1,360.50');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('USDC');
  await expect(page.getByText(/₦/)).toHaveCount(0);
});

test('add money is its own page, the same from Home and Money, with no bridge words', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  await page.goto('/account');
  await page.getByRole('link', { name: 'Add money', exact: true }).click();
  await expect(page).toHaveURL(/\/add$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Add money' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Connect a wallet/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /From an exchange/ })).toBeVisible();
  if (!wide(page)) {
    await expect(page.locator('[data-add-money-sheet]')).toContainText('Card');
    await expect(page.locator('[data-add-money-sheet]')).toContainText('Soon');
  }
  await expect(page.locator('[data-add-money-sheet]')).not.toContainText(/bridge|CCTP|mint|burn/i);
  await noProtocolWords(page);
  await page.getByRole('button', { name: /From an exchange/ }).click();
  await expect(page.locator('[data-add-money-sheet]')).toContainText('Base Sepolia');
  // Back steps out of the exchange address first, then leaves.
  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  await expect(page.getByRole('button', { name: /Connect a wallet/ })).toBeVisible();
});

test('old add and withdraw links open the new pages', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  await page.goto('/bridge?direction=in');
  await expect(page).toHaveURL(/\/add$/);
  await page.goto('/bridge?direction=out');
  await expect(page).toHaveURL(/\/withdraw$/);
});

test('withdraw asks where it goes first, then the address and network, then how much', async ({ page }) => {
  await serveMoney(page, { balances: funded, pool: 105.54 });
  await page.goto('/account');
  await page.getByRole('link', { name: 'Withdraw', exact: true }).click();
  await expect(page).toHaveURL(/\/withdraw$/);
  const flow = page.locator('[data-withdraw-flow]');
  // An email account has no wallet of its own to send to.
  await expect(flow.locator('[data-withdraw-target]')).toHaveCount(2);
  await expect(flow).toContainText('A bank account');
  await expect(flow).toContainText('A card');
  await flow.locator('[data-withdraw-target="otherWallet"]').click();
  await expect(page.getByRole('heading', { name: 'Another wallet or an exchange' })).toBeVisible();
  const go = page.getByRole('button', { name: 'Continue' });
  await expect(go).toBeDisabled();
  await page.getByPlaceholder('0x').fill('0x12');
  await expect(flow).toContainText('Check the address');
  await page.getByPlaceholder('0x').fill('0x52b100000000000000000000000000000000e7A0');
  await go.click();
  await expect(flow).toHaveAttribute('data-stage', 'amount');
  await expect(flow.locator('[data-withdraw-ready]')).toHaveText('1,240.50 USDC ready to withdraw');
  await expect(flow.locator('[data-withdraw-elsewhere]')).toContainText('120.00 USDC more is in your Transfer balance or with your agent.');
  await expect(flow.getByRole('link', { name: 'Bring it here' })).toHaveAttribute('href', '/account?where=1');
});

test('a wallet account can withdraw to its own wallet on another network', async ({ page }) => {
  await serveMoney(page, { balances: funded, method: 'web3' });
  await page.goto('/withdraw');
  const flow = page.locator('[data-withdraw-flow]');
  await expect(flow.locator('[data-withdraw-target]')).toHaveCount(3);
  await flow.locator('[data-withdraw-target="ownWallet"]').click();
  await expect(page.getByPlaceholder('0x')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
});

test('a wallet account moves its Transfer balance from Where it is, on its own page', async ({ page }) => {
  await serveMoney(page, { balances: funded, pool: 105.54, method: 'web3' });
  await page.goto('/account');
  await page.getByRole('button', { name: /Where it is/ }).click();
  const card = page.getByRole('dialog').locator('[data-part="transfer"]');
  await expect(card).toContainText('105.54');
  await card.getByRole('button', { name: 'Move to balance' }).click();
  await expect(page).toHaveURL(/\/add\?mode=moveToBalance$/);
  await expect(page.getByRole('heading', { name: 'Move to balance' })).toBeVisible();
  const flow = page.locator('[data-add-money-sheet]');
  await expect(flow).toContainText('From');
  await expect(flow).toContainText('Transfer balance');
  await expect(flow).toContainText('Your balance');
  await expect(flow).toContainText('In seconds');
  await expect(page.getByRole('button', { name: 'Move 105.54 USDC' })).toBeVisible();
  await page.goto('/account?where=1');
  await page.getByRole('dialog').locator('[data-part="transfer"]').getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page).toHaveURL(/\/add\?mode=addToPool$/);
  await expect(page.getByRole('heading', { name: 'Add to Transfer balance' })).toBeVisible();
});

test('an email account has no Transfer balance part and no Transfer balance buttons', async ({ page }) => {
  await serveMoney(page, { balances: funded, pool: 105.54 });
  await page.goto('/account');
  await page.getByRole('button', { name: /Where it is/ }).click();
  await expect(page.getByRole('dialog').locator('[data-part="transfer"]')).toHaveCount(0);
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Move to balance' })).toHaveCount(0);
});

test('add money reads right to left in Arabic, with numerals left to right', async ({ page }) => {
  await page.context().addCookies([{ name: 'karwan-locale', value: 'ar', domain: '127.0.0.1', path: '/' }]);
  await serveMoney(page, { balances: funded });
  await page.goto('/account');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 }).locator('[dir="ltr"]').first()).toContainText('1,360.50');
  await page.getByRole('link', { name: 'إضافة مال', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'إضافة مال' })).toBeVisible();
});

test('a wallet account adding from an exchange sees its own wallet address, never a wait', async ({ page }) => {
  await serveMoney(page, { balances: funded, method: 'web3' });
  await page.goto('/add');
  await page.getByRole('button', { name: /From an exchange/ }).click();
  const card = page.locator('[data-wallet-deposit]');
  await expect(card).toContainText(ME);
  await expect(card).toContainText('On Arc Testnet it lands in your balance.');
  await expect(card.getByRole('button', { name: 'Copy address' })).toBeVisible();
  await expect(page.getByText('Deposits are being set up for your account.', { exact: false })).toHaveCount(0);
});
