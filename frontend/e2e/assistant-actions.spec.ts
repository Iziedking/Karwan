import { expect, test, type Page } from '@playwright/test';
import { API, funded, serveMoney } from './moneyFixtures';

/// Cards the assistant prepares run the page's own routes when confirmed
/// (view 31): deal insurance, getting paid early.

async function assistantWith(page: Page, card: Record<string, unknown>) {
  await page.route(`${API}/api/assistant/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/assistant/chat') return route.fulfill({ json: { reply: 'Here it is.', actions: [card] } });
    if (path === '/api/assistant/conversations' && route.request().method() === 'GET') return route.fulfill({ json: { conversations: [] } });
    return route.fulfill({ json: { conversation: { id: 'c-1', title: 'New', createdAt: 1, updatedAt: 1, messages: [] } } });
  });
  await page.goto('/assistant');
  await page.locator('#assistant-ask').fill('do it');
  await page.locator('#assistant-ask').press('Enter');
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
