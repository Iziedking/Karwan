import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { en } from '../shared/i18n/messages/en';
import { ar } from '../shared/i18n/messages/ar';
import { API, funded, serveMoney } from './moneyFixtures';

/// A reply from a person on the support team reads as a person (owner, 8 Nov
/// 2026): its own bubble with a face, a name and a time, never the assistant's
/// plain text, and the live part of Help says a person is on the other end.

const TICKET = 'KSUP-74C13599EA';
const SENT = Date.UTC(2026, 10, 8, 14, 14);

for (const [locale, copy] of [['en', en], ['ar', ar]] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`a support reply has its own bubble, name and time, ${locale} ${theme}`, async ({ page }, testInfo) => {
      await page.context().addCookies([{ name: 'karwan-locale', value: locale, domain: '127.0.0.1', path: '/' }]);
      await page.addInitScript(([ticket, theme]) => {
        localStorage.setItem('karwan.support.convo', ticket);
        localStorage.setItem('karwan-theme', theme);
        localStorage.setItem('karwan:guide:disabled', '1');
      }, [TICKET, theme] as const);
      await serveMoney(page, { balances: funded });
      await page.route(`${API}/api/support/**`, (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/api/support/status') return route.fulfill({ json: { enabled: true } });
        if (path === `/api/support/${TICKET}/messages`) {
          const since = Number(new URL(route.request().url()).searchParams.get('since') ?? 0);
          const messages = [
            { role: 'user', text: 'My delivery link was flagged as unsafe, but it is safe.', ts: SENT - 60_000 },
            { role: 'operator', text: 'You can proceed with your transaction', ts: SENT },
          ].filter((m) => m.ts > since);
          return route.fulfill({ json: { status: 'open', messages } });
        }
        return route.fulfill({ json: { ok: true } });
      });
      await page.goto('/account');
      // Help loads after the page, so ask again until it is there to answer.
      const help = page.getByRole('dialog', { name: copy.assistant.title });
      await expect(async () => {
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('karwan:help-open', { detail: {} })));
        await expect(help).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 20_000 });

      const reply = help.locator('[data-bubble="operator"]');
      await expect(reply).toHaveCount(1);
      await expect(reply).toContainText('You can proceed with your transaction');
      await expect(reply).toContainText(copy.assistant.operatorName);
      const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(SENT);
      await expect(reply).toContainText(time);
      await expect(help.getByText(copy.assistant.liveHeader, { exact: true })).toBeVisible();
      await expect(help.getByText(copy.assistant.ticketLine.replace('{id}', TICKET), { exact: true })).toBeVisible();

      // The person's reply is filled and edged; the assistant's text is not.
      const bubble = reply.locator('div.rounded-\\[16px\\]');
      const look = await bubble.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderTopWidth }));
      expect(look.bg).not.toBe('rgba(0, 0, 0, 0)');
      expect(look.border).not.toBe('0px');
      const userBg = await help.locator('[data-bubble="user"] > div').last().evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(look.bg).not.toBe(userBg);

      // Sentence case only: no shouted, tracked labels left in the live part.
      const shouted = await help.evaluate((el) => Array.from(el.querySelectorAll<HTMLElement>('*'))
        .filter((node) => getComputedStyle(node).textTransform === 'uppercase' && node.textContent?.trim())
        .map((node) => node.textContent?.trim()));
      expect(shouted).toEqual([]);

      const axe = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
      expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
      await help.screenshot({ path: testInfo.outputPath(`support-reply-${locale}-${theme}.png`) });
    });
  }
}
