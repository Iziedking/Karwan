import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ME, TX, funded, serveMoney, sseEvent, watchHydration } from './moneyFixtures';

const BRIDGE_ID = `baseSepolia-circle-${ME}-1`;

function inFlight(phase: string, ageMs: number) {
  return {
    id: BRIDGE_ID,
    phase,
    direction: 'in',
    sourceChainKey: 'baseSepolia',
    amountUsdc: '50',
    mintRecipient: ME,
    burnTxHash: TX,
    startedAt: Date.now() - ageMs,
    updatedAt: Date.now() - ageMs,
  };
}

test('an email account adds by address, with nothing to choose', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  await page.goto('/bridge?intent=add');
  await expect(page.getByRole('heading', { level: 1, name: 'Add USDC' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'From an exchange or another app' })).toBeVisible();
  await expect(page.getByText('Card or bank')).toBeVisible();
  await expect(page.getByText('Coming soon')).toBeVisible();
  await expect(page.getByText(/gateway|cctp/i)).toHaveCount(0);
});

test('a send names the place and the amount, and nothing about routes', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  await page.goto('/bridge?intent=send');
  await expect(page.getByRole('heading', { level: 1, name: 'Send USDC' })).toBeVisible();
  await page.getByRole('radio', { name: 'Base Sepolia' }).check();
  await page.getByLabel('Recipient address').fill('0x2222222222222222222222222222222222222222');
  await page.getByLabel('Amount').fill('25');
  await expect(page.getByRole('button', { name: 'Send 25.00 USDC to Base Sepolia' })).toBeEnabled();
  await expect(page.getByText("Sending to an address can't be undone.")).toBeVisible();
  await expect(page.getByText('Usually takes under a minute.')).toBeVisible();
  await expect(page.getByText(/gateway|cctp/i)).toHaveCount(0);
});

test('a send the backend refused says nothing left the wallet', async ({ page }) => {
  await serveMoney(page, {
    balances: funded,
    bridgeOut: (route) => route.fulfill({ status: 400, json: { error: 'invalid recipient' } }),
  });
  await page.goto('/bridge?intent=send');
  await page.getByLabel('Recipient address').fill('0x2222222222222222222222222222222222222222');
  await page.getByLabel('Amount').fill('25');
  await page.getByRole('button', { name: 'Send 25.00 USDC to Base Sepolia' }).click();
  await expect(page.getByText("It didn't go through. Nothing left your wallet.")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('a transfer in flight comes back on return and lands in the balance', async ({ page }) => {
  let landed = false;
  await serveMoney(page, {
    balances: funded,
    bridges: [inFlight('attesting', 20_000)],
    events: () =>
      landed
        ? sseEvent({
            type: 'bridge.minted',
            actor: 'platform',
            ts: Date.now(),
            payload: { bridgeId: BRIDGE_ID, amountUsdc: '50', mintRecipient: ME, txHash: `0x${'cd'.repeat(32)}` },
          })
        : '',
  });
  await page.goto('/bridge?intent=add');
  await expect(page.locator('li[aria-current="step"]')).toHaveText('Leaving Base Sepolia');
  await expect(page.getByText(/You can leave this page/)).toBeVisible();
  landed = true;
  await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('status').filter({ hasText: 'In your balance' })).toBeVisible();
});

test('a slow transfer says so, and nothing reads as failed', async ({ page }) => {
  await serveMoney(page, { balances: funded, bridges: [inFlight('minting', 10 * 60_000)] });
  await page.goto('/bridge?intent=add');
  await expect(page.locator('li[aria-current="step"]')).toHaveText('Arriving on Arc');
  await expect(page.getByText('Taking longer than usual. Nothing is lost.')).toBeVisible();
  await expect(page.getByText(/fail/i)).toHaveCount(0);
});

test('an arriving deposit does not take over the send page', async ({ page }) => {
  await serveMoney(page, { balances: funded, bridges: [inFlight('attesting', 20_000)] });
  await page.goto('/bridge?intent=send');
  await expect(page.getByLabel('Recipient address')).toBeVisible();
  await expect(page.locator('li[aria-current="step"]')).toHaveCount(0);
});

for (const theme of ['light', 'dark'] as const) {
  for (const intent of ['add', 'send'] as const) {
    test(`/bridge?intent=${intent} is clean in ${theme}`, async ({ page }) => {
      const hydrationErrors = watchHydration(page);
      await page.addInitScript((value) => localStorage.setItem('karwan-theme', value), theme);
      await serveMoney(page, { balances: funded });
      await page.goto(`/bridge?intent=${intent}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(hydrationErrors()).toEqual([]);
    });
  }
}
