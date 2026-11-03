import { expect, test } from '@playwright/test';
import { accentControls, API, funded, ME, serveMoney } from './moneyFixtures';

/// Add money and Withdraw in the new look (view 48, batch 9a). The live site
/// serves the current /bridge page, so these open it with ?money=v1.

const STRANGER = '0x2222222222222222222222222222222222222222';

test('Add money asks one question with plain rows, no explainer lines and no green', async ({ page }, info) => {
  await serveMoney(page, { balances: funded });
  await page.goto('/bridge?money=v1');
  await expect(page.getByRole('heading', { name: 'How do you want to add money?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send from an app or exchange' })).toBeVisible();
  await expect(page.getByText('Use the address and network shown on the deposit screen.')).toHaveCount(0);
  await expect(page.getByText('Coming soon')).toBeVisible();
  expect(await accentControls(page)).toBe(0);
  await page.screenshot({ path: info.outputPath('add-choose.png'), fullPage: true });
});

test('the deposit address shows the networks it takes and USDC only, with Copy address the one green button', async ({ page }, info) => {
  await serveMoney(page, { balances: funded });
  await page.goto('/bridge?money=v1');
  await page.getByRole('button', { name: 'Send from an app or exchange' }).click();
  const facts = page.locator('[data-deposit-facts]');
  await expect(facts).toContainText('Supported networks');
  await expect(facts).toContainText('Base Sepolia');
  await expect(facts).toContainText('USDC only');
  await expect(page.getByText(ME, { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy address' })).toBeVisible();
  expect(await accentControls(page)).toBe(1);
  await page.screenshot({ path: info.outputPath('add-address.png'), fullPage: true });
});

test('Withdraw carries the amount and address into the out card, then asks once more before anything moves', async ({ page }, info) => {
  const sent: unknown[] = [];
  await serveMoney(page, {
    balances: funded,
    bridgeOut: async (route) => {
      sent.push(route.request().postDataJSON());
      return route.fulfill({ json: { id: 'b1', status: 'submitted' } });
    },
  });
  await page.goto('/bridge?money=v1&direction=out');
  await page.getByLabel('Amount').fill('25');
  await page.getByRole('radio', { name: /A wallet or exchange/ }).click();
  await page.getByLabel('Paste the address').fill(STRANGER);
  expect(await accentControls(page)).toBe(1);
  await page.getByRole('button', { name: /Withdraw 25/ }).click();

  const out = page.locator('[data-guide="bridge-out"]');
  await expect(out.locator('input[inputmode="decimal"]')).toHaveValue('25');
  await expect(out.getByPlaceholder(/0x/)).toHaveValue(STRANGER);
  await page.screenshot({ path: info.outputPath('withdraw-card.png'), fullPage: true });
  await out.getByRole('button', { name: 'Review', exact: true }).click();

  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: /Withdraw 25 USDC\?/ })).toBeVisible();
  await expect(sheet).toContainText("This can't be undone.");
  await expect(sheet).toContainText('To');
  await expect(sheet).toContainText('Network');
  expect(sent).toEqual([]);
  await page.screenshot({ path: info.outputPath('withdraw-review.png'), fullPage: true });
  await sheet.getByRole('button', { name: /Withdraw 25 USDC/ }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(JSON.stringify(sent[0])).toContain(STRANGER);
});

test('Not now closes the review and nothing moves', async ({ page }) => {
  const sent: unknown[] = [];
  await serveMoney(page, { balances: funded, bridgeOut: async (route) => { sent.push(1); return route.fulfill({ json: {} }); } });
  await page.goto('/bridge?money=v1&direction=out');
  await page.getByLabel('Amount').fill('10');
  await page.getByRole('radio', { name: /A wallet or exchange/ }).click();
  await page.getByLabel('Paste the address').fill(STRANGER);
  await page.getByRole('button', { name: /Withdraw 10/ }).click();
  await page.locator('[data-guide="bridge-out"]').getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(sent).toEqual([]);
});

test('moving USDC in from another network has one green button, the move itself', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  // A wallet account: it holds its own funds, so it moves them in from a network.
  await page.route(`${API}/api/auth/bootstrap`, (route) => route.fulfill({ json: { user: { address: ME, method: 'web3' }, profile: null } }));
  await page.goto('/bridge?money=v1&rail=cctp');
  await expect(page.locator('[data-guide="bridge-submit"]')).toBeVisible();
  expect(await accentControls(page)).toBe(1);
});
