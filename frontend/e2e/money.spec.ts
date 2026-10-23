import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ME, TX, accentControls, funded, serveMoney, watchHydration } from './moneyFixtures';

const agentRow = (page: Page, name: string) => page.getByRole('listitem').filter({ hasText: name });

async function openTopUp(page: Page) {
  await agentRow(page, 'Buying agent').getByRole('button', { name: 'Top up', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Top up buying agent' })).toBeVisible();
  return sheet;
}

test('the balance is the loudest thing on the page, with one primary action', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  await page.goto('/account');
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toContainText('USDC balance');
  await expect(heading).toContainText('1,240.50');
  await expect(page.getByText('Ready to use on Arc')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Withdraw', exact: true })).toHaveAttribute('href', '/bridge?direction=out');
  await expect(page.getByRole('link', { name: 'Send', exact: true })).toHaveAttribute('href', '/send');
  expect(await accentControls(page)).toBe(1);
});

test('agents show what they can spend, with top up and withdraw', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  await page.goto('/account');
  const row = agentRow(page, 'Buying agent');
  await expect(row).toContainText('120.00 USDC');
  await expect(row.getByRole('button', { name: 'Top up', exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Withdraw', exact: true })).toBeVisible();
});

test('recent money reads in words, signed, with its reference', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  await page.goto('/account');
  await expect(page.getByText('Added 50 USDC to the buyer trade account from the main account')).toBeVisible();
  await expect(page.getByText('-50.00 USDC')).toBeVisible();
  await expect(page.getByText('+500.00 USDC')).toBeVisible();
  await expect(page.getByText('KWN-2026-0002')).toBeVisible();
});

test('a top-up confirms in place with its reference', async ({ page }) => {
  await serveMoney(page, {
    balances: funded,
    fundAgent: (route) => route.fulfill({ json: { accepted: true, txHash: TX, reference: 'KWN-2026-0100', movementState: 'completed' } }),
  });
  await page.goto('/account');
  const sheet = await openTopUp(page);
  await sheet.getByLabel('Amount').fill('50');
  await expect(sheet).toContainText('50.00 USDC moves to your buying agent. You can withdraw it at any time.');
  await sheet.getByRole('button', { name: 'Top up 50.00 USDC' }).click();
  await expect(sheet).toContainText('50.00 USDC is with your buying agent.');
  await expect(sheet).toContainText('KWN-2026-0100');
  // The result replaces the form: no stale amount or "Available" above it.
  await expect(sheet.getByLabel('Amount')).toHaveCount(0);
  await expect(sheet).not.toContainText('Available');
  await sheet.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(sheet).toBeHidden();
});

test('a slow top-up says it is waiting and never failed', async ({ page }) => {
  await serveMoney(page, {
    balances: funded,
    fundAgent: (route) => route.fulfill({
      status: 202,
      json: { accepted: true, code: 'funding_unconfirmed', txHash: TX, reference: 'KWN-2026-0101' },
    }),
  });
  await page.goto('/account');
  const sheet = await openTopUp(page);
  await sheet.getByLabel('Amount').fill('50');
  await sheet.getByRole('button', { name: 'Top up 50.00 USDC' }).click();
  await expect(sheet).toContainText('Sent. Waiting for the network. Nothing is lost.');
  await expect(sheet.getByRole('button', { name: 'Check again' })).toBeVisible();
  await expect(sheet.getByText(/fail/i)).toHaveCount(0);
});

test('a failed top-up says nothing moved and offers to try again', async ({ page }) => {
  await serveMoney(page, {
    balances: funded,
    fundAgent: (route) => route.fulfill({ status: 502, json: { error: 'funding failed', code: 'funding_failed' } }),
  });
  await page.goto('/account');
  const sheet = await openTopUp(page);
  await sheet.getByLabel('Amount').fill('50');
  await sheet.getByRole('button', { name: 'Top up 50.00 USDC' }).click();
  await expect(sheet).toContainText("It didn't go through. Nothing moved.");
  await sheet.getByRole('button', { name: 'Try again' }).click();
  await expect(sheet.getByRole('button', { name: 'Top up 50.00 USDC' })).toBeEnabled();
});

test('a top-up that got no clear answer waits and never offers a second send', async ({ page }) => {
  let calls = 0;
  await serveMoney(page, {
    balances: funded,
    fundAgent: (route) => {
      calls += 1;
      return calls === 1
        ? route.fulfill({ status: 504, body: 'gateway timeout' })
        : route.fulfill({ json: { accepted: true, alreadyRecorded: true, txHash: TX, reference: 'KWN-2026-0104', movementState: 'completed' } });
    },
  });
  await page.goto('/account');
  const sheet = await openTopUp(page);
  await sheet.getByLabel('Amount').fill('50');
  await sheet.getByRole('button', { name: 'Top up 50.00 USDC' }).click();
  await expect(sheet).toContainText('Sent. Waiting for the network. Nothing is lost.');
  await expect(sheet.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Check again' }).click();
  await expect(sheet).toContainText('50.00 USDC is with your buying agent.');
  expect(calls).toBe(2);
});

test('a top-up larger than the balance shows the exact shortfall', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  await page.goto('/account');
  const sheet = await openTopUp(page);
  await sheet.getByLabel('Amount').fill('2000');
  await expect(sheet).toContainText('You need 759.50 USDC more.');
  await expect(sheet.getByRole('link', { name: 'Add USDC' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Top up 2,000.00 USDC' })).toBeDisabled();
});

test('a withdrawal brings money back to the balance', async ({ page }) => {
  await serveMoney(page, {
    balances: funded,
    withdraw: (route) => route.fulfill({ json: { accepted: true, txHash: TX, reference: 'KWN-2026-0200', movementState: 'completed' } }),
  });
  await page.goto('/account');
  await agentRow(page, 'Buying agent').getByRole('button', { name: 'Withdraw', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Withdraw from buying agent' })).toBeVisible();
  await sheet.getByLabel('Amount').fill('20');
  await sheet.getByRole('button', { name: 'Withdraw 20.00 USDC' }).click();
  await expect(sheet).toContainText('20.00 USDC is back in your balance.');
  await expect(sheet).toContainText('KWN-2026-0200');
});

test('a double press moves money once', async ({ page }) => {
  let calls = 0;
  await serveMoney(page, {
    balances: funded,
    fundAgent: async (route) => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.fulfill({ json: { accepted: true, txHash: TX, reference: 'KWN-2026-0102', movementState: 'completed' } });
    },
  });
  await page.goto('/account');
  const sheet = await openTopUp(page);
  await sheet.getByLabel('Amount').fill('50');
  await sheet.getByRole('button', { name: 'Top up 50.00 USDC' }).dblclick();
  await expect(sheet).toContainText('50.00 USDC is with your buying agent.');
  expect(calls).toBe(1);
});

test('the sheet cannot be dismissed while money is in flight', async ({ page }) => {
  await serveMoney(page, {
    balances: funded,
    fundAgent: async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({ json: { accepted: true, txHash: TX, reference: 'KWN-2026-0103', movementState: 'completed' } });
    },
  });
  await page.goto('/account');
  const sheet = await openTopUp(page);
  await sheet.getByLabel('Amount').fill('50');
  await sheet.getByRole('button', { name: 'Top up 50.00 USDC' }).click();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
  await expect(sheet).toContainText('50.00 USDC is with your buying agent.');
});

test('the sheet keeps focus inside and gives it back', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  await page.goto('/account');
  const opener = agentRow(page, 'Buying agent').getByRole('button', { name: 'Top up', exact: true });
  await opener.click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByLabel('Amount')).toBeFocused();
  for (let i = 0; i < 12; i += 1) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(opener).toBeFocused();
});

test('the money home reads right to left in Arabic', async ({ page, context }) => {
  await context.addCookies([{ name: 'karwan-locale', value: 'ar', domain: '127.0.0.1', path: '/' }]);
  await serveMoney(page, { balances: funded });
  await page.goto('/account');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('رصيد USDC');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

for (const theme of ['light', 'dark'] as const) {
  test(`the money home and its sheet are clean in ${theme}`, async ({ page }) => {
    const hydrationErrors = watchHydration(page);
    await page.addInitScript((value) => localStorage.setItem('karwan-theme', value), theme);
    await serveMoney(page, { balances: funded });
    await page.goto('/account');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('1,240.50');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await openTopUp(page);
    expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
    expect(hydrationErrors()).toEqual([]);
  });
}

test('send is its own page and finds a person by Karwan tag before paying', async ({ page }) => {
  await serveMoney(page, {
    balances: funded,
    tags: {
      ada: { displayName: 'Ada Obi', address: '0x2222222222222222222222222222222222222222' },
      me: { displayName: 'Me', address: ME },
    },
  });
  await page.goto('/send');
  const sheet = page.getByRole('region', { name: 'Send USDC' });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await sheet.getByLabel('Amount').fill('25');
  const to = sheet.getByLabel('Send to');

  await to.fill('@nobody');
  await expect(sheet).toContainText('No one on Karwan uses @nobody.');
  await expect(sheet.getByRole('button', { name: 'Send 25.00 USDC' })).toBeDisabled();

  await to.fill('@me');
  await expect(sheet).toContainText('That is your own tag.');
  await expect(sheet.getByRole('button', { name: 'Send 25.00 USDC' })).toBeDisabled();

  await to.fill('@ada');
  await expect(sheet).toContainText('Ada Obi · @ada');
  await expect(sheet).not.toContainText('0x2222');
  await expect(sheet).toContainText('25.00 USDC goes to @ada.');
  await expect(sheet.getByRole('button', { name: 'Send 25.00 USDC' })).toBeEnabled();
});

test('an email account sends from its own wallet; a pool is never counted', async ({ page }) => {
  await serveMoney(page, {
    balances: { ...funded, [ME.toLowerCase()]: 100 },
    pool: 50,
    tags: { ada: { displayName: 'Ada Obi', address: '0x2222222222222222222222222222222222222222' } },
  });
  await page.goto('/send');
  const sheet = page.getByRole('region', { name: 'Send USDC' });
  await expect(sheet).toContainText('Available 100.00 USDC');
  await expect(sheet).not.toContainText('150.00');
});

test('add money has one Back: inside an answer it returns to the question', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  // The live site shows the question first (money v1).
  await page.goto('/bridge?direction=in&money=v1');
  const back = page.getByRole('button', { name: 'Go back', exact: true }).filter({ visible: true });
  const question = page.getByRole('heading', { name: 'How do you want to add money?' });
  await expect(question).toBeVisible();
  await expect(back).toHaveCount(1);

  await page.getByRole('button', { name: /Send from an app or exchange/ }).click();
  await expect(question).toHaveCount(0);
  await expect(back).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toHaveCount(0);

  await back.click();
  await expect(question).toBeVisible();
  await expect(page).toHaveURL(/\/bridge\?direction=in&money=v1/);
});

test('no page draws two Back controls', async ({ page }) => {
  test.setTimeout(180_000);
  await serveMoney(page, { balances: funded });
  const routes = [
    '/account', '/bridge?direction=in', '/bridge?direction=in&money=v1', '/bridge?direction=out&money=v1', '/send', '/activity', '/profile', '/profile/wallets',
    '/profile/edit', '/settings', '/stake', '/financier', '/market', '/p2p/requests', '/p2p/offers', '/profile/open-deals',
  ];
  const backs = page.getByRole('link', { name: /^(←\s*)?Back\b/ }).or(page.getByRole('button', { name: /^(Go back|Back\b)/ })).filter({ visible: true });
  for (const route of routes) {
    await page.goto(route);
    await page.waitForLoadState('load');
    await page.waitForTimeout(700);
    expect(await backs.count(), route).toBeLessThanOrEqual(1);
  }
});
