import { expect, test, type Page } from '@playwright/test';
import { API, funded, serveMoney } from './moneyFixtures';

/// Cards the assistant prepares run the page's own routes when confirmed
/// (view 31): deal insurance, getting paid early, deal steps.

async function assistantWith(page: Page, card: Record<string, unknown>) {
  await page.route(`${API}/api/assistant/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/assistant/chat') return route.fulfill({ json: { reply: 'Here it is.', actions: [card] } });
    if (path === '/api/assistant/conversations' && route.request().method() === 'GET') return route.fulfill({ json: { conversations: [] } });
    return route.fulfill({ json: { conversation: { id: 'c-1', title: 'New', createdAt: 1, updatedAt: 1, messages: [] } } });
  });
  await page.goto('/assistant');
  await page.locator('#assistant-ask').fill('do it');
  await page.locator('form:has(#assistant-ask) button[type="submit"]').click();
}

test('a deal insurance card takes out each position on it, as the deal insurance page does', async ({ page }) => {
  const withdrawn: string[] = [];
  await serveMoney(page, { balances: funded });
  await page.route(`${API}/api/vault/request-withdraw`, (route) => {
    withdrawn.push((route.request().postDataJSON() as { positionId: string }).positionId);
    return route.fulfill({ json: { ok: true, txHash: `0x${'c'.repeat(64)}` } });
  });
  await assistantWith(page, {
    kind: 'confirm', id: 'insurance_take_out:7-9:n1', intent: 'insurance_take_out', title: 'Take out deal insurance',
    summary: 'Start the 7-day wait on 50.00 USDC. You collect it on 31 Oct.', fields: [{ label: 'Amount', value: '50.00 USDC' }],
    payload: { address: `0x${'a'.repeat(40)}`, positionIds: ['7', '9'], amountUsdc: '50.00', signer: 'karwan' },
    confirmLabel: 'Start the wait', cancelLabel: 'Not now',
  });
  await page.getByRole('button', { name: 'Start the wait' }).click();
  await expect(page.getByText('The wait has started. Ask me to collect it when it ends.')).toBeVisible();
  expect(withdrawn).toEqual(['7', '9']);
});

test('asking to be paid early from the assistant sends the deal page request', async ({ page }) => {
  const JOB = `0x${'1'.repeat(64)}`;
  const sent: unknown[] = [];
  await serveMoney(page, { balances: funded });
  await page.route(`${API}/api/factoring/request`, (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ json: { deal: null } });
  });
  await assistantWith(page, {
    kind: 'confirm', id: `finance_ask:${JOB}:n1`, intent: 'finance_ask', title: 'Ask to be paid early',
    summary: 'Financiers see this request and can make offers.', fields: [{ label: 'You ask for', value: '400.00 USDC' }],
    payload: { invoiceId: JOB, requestedAdvanceUsdc: '400', minAdvanceUsdc: '380' }, confirmLabel: 'Ask financiers', cancelLabel: 'Not now',
  });
  await page.getByRole('button', { name: 'Ask financiers' }).click();
  await expect(page.getByText('Asked. Financiers can make offers now.')).toBeVisible();
  expect(sent).toEqual([{ invoiceId: JOB, requestedAdvanceUsdc: '400', minAdvanceUsdc: '380' }]);
});

test('a counter from the assistant goes to the counter route, without the side', async ({ page }) => {
  const JOB = `0x${'2'.repeat(64)}`;
  const ME = `0x${'a'.repeat(40)}`;
  const sent: unknown[] = [];
  await serveMoney(page, { balances: funded });
  await page.route(`${API}/api/deals/direct/${JOB}/counter`, (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ json: { accepted: true, jobId: JOB, deal: { jobId: JOB } } });
  });
  await assistantWith(page, {
    kind: 'confirm', id: `change_deal_terms:${JOB}:n1`, intent: 'change_deal_terms', title: 'Send a counter',
    summary: 'The buyer sees your terms and agrees or answers.', fields: [{ label: 'New price', value: '250 USDC' }],
    payload: { jobId: JOB, caller: ME, as: 'seller', dealAmountUsdc: 250 }, confirmLabel: 'Send counter', cancelLabel: 'Keep as is',
  });
  await page.getByRole('button', { name: 'Send counter' }).click();
  await expect(page.getByText('Sent. The other side sees the new terms.')).toBeVisible();
  expect(sent).toEqual([{ caller: ME, dealAmountUsdc: 250 }]);
});

test("taking a seller's own offer from the assistant runs the request page route", async ({ page }) => {
  const JOB = `0x${'3'.repeat(64)}`;
  let accepted = 0;
  await serveMoney(page, { balances: funded });
  await page.route(`${API}/api/jobs/${JOB}/offers/o-1/accept`, (route) => {
    accepted += 1;
    return route.fulfill({ json: { ok: true, txHash: `0x${'d'.repeat(64)}` } });
  });
  await assistantWith(page, {
    kind: 'confirm', id: 'accept_offer:o-1:n1', intent: 'accept_offer', title: "Take @ada's offer",
    summary: '81.6 USDC goes into escrow from your buying agent and the deal starts.', fields: [{ label: 'Price', value: '80 USDC' }],
    payload: { jobId: JOB, offerId: 'o-1' }, confirmLabel: 'Take it and pay 81.6 USDC', cancelLabel: 'Not now',
  });
  await page.getByRole('button', { name: 'Take it and pay 81.6 USDC' }).click();
  await expect(page.getByText('Offer taken. The escrow is paid and the deal is live.')).toBeVisible();
  expect(accepted).toBe(1);
});

test('paying a payment link from the assistant sends from the balance, then marks the link paid', async ({ page }) => {
  const TOKEN = '6f1c2a3b-0000-4000-8000-000000000000';
  const ADA = `0x${'b'.repeat(40)}`;
  const TX = `0x${'e'.repeat(64)}`;
  const sent: unknown[] = [];
  const reported: unknown[] = [];
  await serveMoney(page, { balances: funded });
  await page.route(`${API}/api/cashout/arc-send`, (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, txHash: TX, explorerUrl: '', reference: 'KWN-1', movementState: 'completed' } });
  });
  await page.route(`${API}/api/deposit/requests/${TOKEN}/paid`, (route) => {
    reported.push(route.request().postDataJSON());
    return route.fulfill({ json: { request: { requestId: TOKEN, status: 'matched' } } });
  });
  await assistantWith(page, {
    kind: 'confirm', id: `pay_payment_link:${TOKEN}:n1`, intent: 'pay_payment_link', title: 'Pay @ada 25.00 USDC',
    summary: 'Paid from your balance straight to them. This is not a protected deal.', fields: [{ label: 'Amount', value: '25.00 USDC' }],
    payload: { token: TOKEN, recipient: ADA, amountUsdc: 25 }, confirmLabel: 'Pay 25.00 USDC', cancelLabel: 'Not now',
  });
  await page.getByRole('button', { name: 'Pay 25.00 USDC' }).click();
  await expect(page.getByText('Paid. They see it on their payment link.')).toBeVisible();
  expect(sent).toEqual([{ recipient: ADA, amountUsdc: 25, bridgeId: `pay-pay_payment_link-${TOKEN}-n1` }]);
  expect(reported).toEqual([{ txHash: TX, chain: 'Arc' }]);
});

test('Enter sends on a computer and adds a line on a phone', async ({ page }, testInfo) => {
  let asked = 0;
  await serveMoney(page, { balances: funded });
  await page.route(`${API}/api/assistant/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/assistant/chat') { asked += 1; return route.fulfill({ json: { reply: 'Hello.' } }); }
    if (path === '/api/assistant/conversations' && route.request().method() === 'GET') return route.fulfill({ json: { conversations: [] } });
    return route.fulfill({ json: { conversation: { id: 'c-1', title: 'New', createdAt: 1, updatedAt: 1, messages: [] } } });
  });
  await page.goto('/assistant');
  const ask = page.locator('#assistant-ask');
  await ask.fill('first line');
  await ask.press('Enter');
  if (testInfo.project.name === 'phone') {
    await expect(ask).toHaveValue('first line\n');
    expect(asked).toBe(0);
  } else {
    await expect(page.getByText('Hello.')).toBeVisible();
    expect(asked).toBe(1);
  }
});

test('a test USDC card from the assistant asks the faucet for the wallet it names', async ({ page }) => {
  const ME = `0x${'a'.repeat(40)}`;
  const asked: unknown[] = [];
  await serveMoney(page, { balances: funded });
  await page.route(`${API}/api/activation/faucet`, (route) => {
    asked.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, target: 'buyer', address: `0x${'b'.repeat(40)}` } });
  });
  await assistantWith(page, {
    kind: 'confirm', id: 'test_usdc:buyer:n1', intent: 'test_usdc', title: 'Get test USDC',
    summary: "Circle's testnet faucet sends about 20 test USDC.", fields: [{ label: 'To', value: 'Your buying agent' }],
    payload: { address: ME, target: 'buyer' }, confirmLabel: 'Get test USDC', cancelLabel: 'Not now',
  });
  await page.getByRole('button', { name: 'Get test USDC', exact: true }).click();
  await expect(page.getByText('Asked the faucet. Test USDC usually lands within a minute.')).toBeVisible();
  expect(asked).toEqual([{ address: ME, target: 'buyer' }]);
});

test('a settings card from the assistant saves only what it names', async ({ page }) => {
  const ME = `0x${'a'.repeat(40)}`;
  const saved: unknown[] = [];
  await serveMoney(page, { balances: funded });
  await page.route(`${API}/api/settings`, (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    saved.push(route.request().postDataJSON());
    return route.fulfill({ json: { settings: { locale: 'en', notificationsMuted: true } } });
  });
  await assistantWith(page, {
    kind: 'confirm', id: 'change_settings:notificationsMuted:n1', intent: 'change_settings', title: 'Change your settings',
    summary: 'This changes only what is listed.', fields: [{ label: 'Alerts', value: 'Off' }],
    payload: { address: ME, settings: { notificationsMuted: true } }, confirmLabel: 'Save', cancelLabel: 'Keep as is',
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  expect(saved).toEqual([{ address: ME, settings: { notificationsMuted: true } }]);
});
