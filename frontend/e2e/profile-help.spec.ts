import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { en } from '../shared/i18n/messages/en';
import { API, funded, serveMoney } from './moneyFixtures';

/// Help and support in Profile (view 78): the help bot answers and opens a
/// case, the case is listed, and the person reads the team's reply and writes
/// more on the case page. Get help with this starts the bot on that record.

const REF = 'KT-1042';
const DEAL = `0x${'d1'.repeat(32)}`;
const T0 = Date.UTC(2026, 10, 12, 10, 0);
const copy = en.supportPage;

async function serveSupport(page: import('@playwright/test').Page, sent: string[], asked: Array<{ body: unknown }>) {
  await page.route(`${API}/api/assistant/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/assistant/chat') {
      asked.push({ body: route.request().postDataJSON() });
      return route.fulfill({ json: { reply: `Case ${REF}. Someone from Karwan replies within 2 hours.` } });
    }
    return route.fulfill({ json: { conversations: [] } });
  });
  await page.route(`${API}/api/support/cases**`, (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === '/api/support/cases' && req.method() === 'GET') {
      return route.fulfill({ json: { cases: [{ ref: REF, kind: 'transfer_missing', state: 'waiting_person', dueAt: T0, records: [], createdAt: T0, updatedAt: T0, lastLine: 'We found it. It is back in your balance.' }] } });
    }
    if (path === `/api/support/cases/${REF}` && req.method() === 'GET') {
      return route.fulfill({
        json: {
          case: { ref: REF, kind: 'transfer_missing', state: 'waiting_person', dueAt: T0, records: [], createdAt: T0, updatedAt: T0 },
          messages: [
            { role: 'person', text: 'My payout never arrived', at: T0, channel: 'web' },
            { role: 'teammate', text: 'We found it. It is back in your balance.', at: T0 + 60_000, channel: 'desk' },
            ...sent.map((text, i) => ({ role: 'person', text, at: T0 + 120_000 + i, channel: 'web' })),
          ],
        },
      });
    }
    if (path === `/api/support/cases/${REF}/messages`) {
      sent.push((req.postDataJSON() as { text: string }).text);
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ status: 404, json: { error: 'not-found' } });
  });
}

test('the help bot opens a case and the case reads as a conversation with the team', async ({ page }, testInfo) => {
  const sent: string[] = [];
  const asked: Array<{ body: unknown }> = [];
  await page.addInitScript(() => localStorage.setItem('karwan:guide:disabled', '1'));
  await serveMoney(page, { balances: funded });
  await serveSupport(page, sent, asked);
  await page.goto('/profile/help');

  await expect(page.getByRole('heading', { name: copy.title })).toBeVisible();
  await page.getByRole('textbox', { name: copy.askLabel }).fill('My payout never arrived and I want a person');
  await page.getByRole('button', { name: copy.send }).click();
  await expect(page.getByText(`Case ${REF}. Someone from Karwan replies within 2 hours.`)).toBeVisible();
  expect((asked[0]!.body as { mode: string }).mode).toBe('help');

  const row = page.locator('[data-cases] a').first();
  await expect(row).toContainText(`Case ${REF}`);
  await expect(row).toContainText(copy.states.waiting_person);

  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(wide).toBeLessThanOrEqual(0);
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('help-and-support.png'), fullPage: true });

  await row.click();
  await expect(page).toHaveURL(new RegExp(`/profile/help/${REF}$`));
  const messages = page.locator('[data-case-messages] li');
  await expect(messages).toHaveCount(2);
  await expect(messages.nth(1)).toContainText(copy.who.teammate);
  await page.getByRole('textbox', { name: copy.writeLabel }).fill('Thank you, I see it now.');
  await page.getByRole('button', { name: copy.send }).click();
  await expect(messages).toHaveCount(3);
  expect(sent).toEqual(['Thank you, I see it now.']);
  await page.screenshot({ path: testInfo.outputPath('case-page.png'), fullPage: true });
});

test('Get help with this starts the bot on the deal', async ({ page }) => {
  const asked: Array<{ body: unknown }> = [];
  await page.addInitScript(() => localStorage.setItem('karwan:guide:disabled', '1'));
  await serveMoney(page, { balances: funded });
  await serveSupport(page, [], asked);
  await page.goto(`/profile/help?deal=${DEAL}&ref=D1D1-D1D1`);
  await expect(page.getByRole('textbox', { name: copy.askLabel })).toHaveValue('About my deal D1D1-D1D1');
  await page.getByRole('button', { name: copy.send }).click();
  await expect(page.getByText(`Case ${REF}.`, { exact: false })).toBeVisible();
  expect((asked[0]!.body as { viewingDeal?: string }).viewingDeal).toBe(DEAL);
});
