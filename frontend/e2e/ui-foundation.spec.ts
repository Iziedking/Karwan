import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { funded, API } from './moneyFixtures';
import { serveSearch } from './searchFixtures';

const before = process.env.KARWAN_UI_PHASE === 'before';
const mainnet = process.env.KARWAN_UI_NETWORK === 'mainnet';

for (const route of ['/start', '/market', '/account']) {
  for (const theme of ['light', 'dark'] as const) {
    for (const locale of ['en', 'ar'] as const) {
      test(`${route} ${theme} ${locale}`, async ({ page, context }, testInfo) => {
        await context.addCookies([{ name: 'karwan-locale', value: locale, domain: '127.0.0.1', path: '/' }]);
        await page.addInitScript(value => localStorage.setItem('karwan-theme', value), theme);
        await serveSearch(page, { balances: funded });
        // No external provider request is permitted in this fixture-backed pass.
        await page.route('**/*', async request => {
          const host = new URL(request.request().url()).hostname;
          if (host !== '127.0.0.1' && host !== 'localhost') return request.abort();
          return request.fallback();
        });
        await page.route(`${API}/**`, async request => {
          const path = new URL(request.request().url()).pathname;
          if (route === '/start' && path === '/api/auth/bootstrap') {
            return request.fulfill({ json: { user: null, profile: null } });
          }
          if (path === '/api/listings') {
            return request.fulfill({ json: { listings: Array.from({ length: 7 }, (_, i) => ({
              id: `ui-offer-${i}`, title: i % 2 ? 'Bookkeeping for a small business' : 'Brand identity for a new bakery',
              description: 'A defined scope, delivery date and payment stages agreed before work starts.',
              askingPriceUsdc: 96 + i * 20, postedAt: Date.now() - i * 1000,
              expiresAt: Date.now() + 7 * 86_400_000,
              sellerUser: '0x5555555555555555555555555555555555555555',
              partyKind: 'person', tradeLane: 'service',
            })) } });
          }
          if (path === '/api/jobs/marketplace') {
            return request.fulfill({ json: { briefs: Array.from({ length: 6 }, (_, i) => ({
              jobId: `0x${String(i + 1).padStart(64, '0')}`,
              briefText: 'Find packaging for my shop. We need samples before the full order.',
              budgetUsdc: String(180 + i * 25), postedAt: Date.now() - 8000 - i * 1000,
              deadlineUnix: Math.floor(Date.now() / 1000) + 7 * 86_400,
              buyer: '0x7777777777777777777777777777777777777777',
              partyKind: 'person', tradeLane: 'service', bidsCount: i,
            })) } });
          }
          return request.fallback();
        });
        await page.goto(route);
        await expect.poll(() => page.locator('html').getAttribute('data-theme').then(value => value ?? 'light')).toBe(theme);
        await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        if (route === '/market') {
          if (mainnet) await expect(page).toHaveURL(/\/account$/);
          else await expect(page.locator('.market-card').first()).toBeVisible();
        }
        if (route === '/account') await expect(page.getByRole('heading', { level: 1 })).toContainText('1,240.50');
        await page.evaluate(() => document.fonts.ready);

        const metrics = await page.evaluate(() => {
          const html = document.documentElement;
          const style = getComputedStyle(html);
          const probe = document.createElement('span');
          document.body.appendChild(probe);
          const tokens = Object.fromEntries([
            '--canvas', '--surface', '--ink', '--ink-secondary', '--ink-muted', '--tint',
            '--color-offer', '--color-request', '--lp-dark', '--lp-light', '--lp-card',
            '--lp-text-sub', '--lp-field-border', '--ease-ui', '--dur-small', '--dur-panel',
          ].map(name => [name, style.getPropertyValue(name).trim()]));
          const rgba = (name: string) => {
            probe.style.color = `var(${name})`;
            return getComputedStyle(probe).color;
          };
          const resolved = Object.fromEntries(['--canvas', '--surface', '--ink', '--ink-secondary', '--ink-muted', '--tint', '--color-offer', '--color-request', '--lp-field-border'].map(name => [name, rgba(name)]));
          probe.remove();
          const h1 = document.querySelector('h1');
          return {
            overflow: html.scrollWidth - html.clientWidth, tokens, resolved,
            font: h1 ? getComputedStyle(h1).fontFamily : '',
            cards: Array.from(document.querySelectorAll('.market-card')).map(el => {
              const card = el.getBoundingClientRect();
              const price = el.lastElementChild!.getBoundingClientRect();
              return { top: card.top, bottom: card.bottom, priceTop: price.top, priceBottom: price.bottom };
            }),
            bands: Array.from(document.querySelectorAll('.w-bleed')).map(el => {
              const rect = el.getBoundingClientRect();
              return { left: rect.left, right: rect.right, width: rect.width };
            }),
          };
        });
        const cdp = await context.newCDPSession(page);
        await cdp.send('DOM.enable');
        await cdp.send('CSS.enable');
        const documentNode = await cdp.send('DOM.getDocument');
        const headingNode = await cdp.send('DOM.querySelector', { nodeId: documentNode.root.nodeId, selector: 'h1' });
        const platformFonts = await cdp.send('CSS.getPlatformFontsForNode', { nodeId: headingNode.nodeId });
        await cdp.detach();
        // Start keyboard traversal at the first navigation link, regardless of
        // the sign-in form's intentional autofocus. Rings may use box-shadow.
        await page.locator('a').first().focus();
        await page.keyboard.press('Tab');
        const focus = await page.evaluate(() => {
          const active = document.activeElement;
          if (!(active instanceof HTMLElement)) return null;
          const style = getComputedStyle(active);
          return { tag: active.tagName, label: active.getAttribute('aria-label') || active.textContent,
            outline: style.outlineStyle, width: style.outlineWidth, shadow: style.boxShadow,
            keyboardVisible: active.matches(':focus-visible') };
        });
        const axe = await new AxeBuilder({ page }).analyze();
        await testInfo.attach('metrics', { body: JSON.stringify({ ...metrics, platformFonts, focus, violations: axe.violations }, null, 2), contentType: 'application/json' });
        await page.screenshot({ path: testInfo.outputPath('page.png'), fullPage: true });
        if (!before) {
          expect(metrics.overflow).toBeLessThanOrEqual(1);
          for (const band of metrics.bands) {
            expect(band.left).toBeGreaterThanOrEqual(-1);
            expect(band.right).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
          }
          if (route === '/market' && !mainnet) {
            expect(metrics.cards).toHaveLength(12);
            for (const card of metrics.cards) {
              expect(Math.abs(card.priceBottom - card.bottom)).toBeLessThanOrEqual(2);
              for (const peer of metrics.cards.filter(peer => Math.abs(peer.top - card.top) < 2)) {
                expect(Math.abs(card.priceTop - peer.priceTop)).toBeLessThanOrEqual(2);
              }
            }
          }
          for (const [name, value] of Object.entries(metrics.tokens)) expect(value, name).not.toBe('');
          expect(metrics.tokens['--canvas'].toUpperCase()).toBe(theme === 'light' ? '#EEF2F7' : '#0F161D');
          // The production CSS optimizer can normalize 0ms to 0s.
          expect(parseFloat(metrics.tokens['--dur-small'])).toBe(0);
          expect(parseFloat(metrics.tokens['--dur-panel'])).toBe(0);
          expect(focus).not.toBeNull();
          expect(focus!.keyboardVisible).toBe(true);
          expect(focus!.outline !== 'none' && parseFloat(focus!.width) > 0 || focus!.shadow !== 'none').toBe(true);
          expect(axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
        }
      });
    }
  }
}
