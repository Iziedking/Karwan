import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import type { Listing, MarketplaceBrief } from '../core/api';
import { ar } from '../shared/i18n/messages/ar';
import { en } from '../shared/i18n/messages/en';
import { API, funded, SELLER_AGENT, watchHydration } from './moneyFixtures';
import { serveSearch } from './searchFixtures';

const mainnet = process.env.KARWAN_UI_NETWORK === 'mainnet';
const messages = { en, ar };
const SELLER = '0x5555555555555555555555555555555555555555';
type Theme = 'light' | 'dark';
type Locale = 'en' | 'ar';
type MarketWorld = { signedOut?: boolean; empty?: boolean; offersUnavailable?: boolean; requestsUnavailable?: boolean; hold?: Promise<void> };

// The same API shapes as ui-foundation, with enough open cards for a second
// page and both business rails. Closed records check the normalization boundary.
function marketData() {
  const now = Date.now();
  const expiresAt = now + 7 * 86_400_000;
  const offer = (id: string, title: string, askingPriceUsdc: number, postedAt: number, overrides: Partial<Listing> = {}): Listing => ({
    id, title, askingPriceUsdc, postedAt, expiresAt, sellerUser: SELLER, sellerAgent: SELLER_AGENT,
    description: 'A defined scope, delivery date and payment stages agreed before work starts.',
    partyKind: 'person', tradeLane: 'service', ...overrides,
  });
  const request = (n: number, briefText: string, budget: number, postedAt: number, overrides: Partial<MarketplaceBrief> = {}): MarketplaceBrief => ({
    jobId: `0x${String(n).padStart(64, '0')}`, briefText, budgetUsdc: String(budget), postedAt,
    deadlineUnix: Math.floor(expiresAt / 1000), buyer: '0x7777…7777', bidsCount: 0, offerCount: 0,
    partyKind: 'person', tradeLane: 'service', ...overrides,
  });
  const personalOffers = Array.from({ length: 9 }, (_, i) => offer(
    `market-offer-${i}`,
    i === 0 ? 'A complete branding studio package for a new bakery with packaging, typography and delivery guidelines'
      : i === 1 ? 'تصميم هوية بصرية لمتجر جديد'
        : i === 2 ? 'Detailed bookkeeping and inventory planning for a growing local shop with monthly reporting and clear delivery stages'
          : `Bookkeeping service ${i}`,
    100 + i * 10, now - i * 2000,
    i === 1 ? { description: 'تصميم الشعار والألوان مع موعد تسليم واضح ومراحل دفع متفق عليها.' }
      : i === 2 ? { description: 'Clear scope.' } : {},
  ));
  const personalRequests = Array.from({ length: 8 }, (_, i) => request(
    i + 1,
    i === 0 ? 'Find packaging for my shop. We need bakery sample packs before the full order.'
      : i === 1 ? 'أحتاج خدمة مراجعة الحسابات. التفاصيل والموعد متفق عليهما قبل بدء العمل.'
        : `Review inventory ${i}. Deliver a clear report with an agreed scope.`,
    180 + i * 20, now - i * 2000 - 1000,
    i === 0 ? { bidsCount: 2, offerCount: 3 } : i === 1 ? { offerCount: 1 } : {},
  ));
  const hiringOffers = Array.from({ length: 2 }, (_, i) => offer(
    `market-hiring-offer-${i}`, `Business design service ${i}`, 500 + i * 100, now - 40_000 - i * 2000,
    { partyKind: 'business' },
  ));
  const hiringRequests = Array.from({ length: 2 }, (_, i) => request(
    21 + i, `Hire a business accountant ${i}. Monthly reporting with staged delivery.`, 800 + i * 100,
    now - 41_000 - i * 2000, { partyKind: 'business', bidsCount: i },
  ));
  const financeOffers = Array.from({ length: 2 }, (_, i) => offer(
    `market-finance-offer-${i}`, `Invoice finance offer ${i}`, i === 0 ? 12_345.67 : 1300, now - 60_000 - i * 2000,
    { partyKind: 'business', tradeLane: 'finance' },
  ));
  const financeRequests = Array.from({ length: 2 }, (_, i) => request(
    31 + i, `Finance an export order ${i}. Delivery documents and milestones are available.`, 1800 + i * 100,
    now - 61_000 - i * 2000, { partyKind: 'business', tradeLane: 'finance' },
  ));
  return {
    personalOffers, personalRequests,
    listings: [...personalOffers, ...hiringOffers, ...financeOffers,
      offer('market-expired', 'Expired offer must not appear', 1, now + 1000, { expiresAt: now - 1000 }),
      offer('market-cancelled', 'Cancelled offer must not appear', 1, now + 2000, { cancelledAt: now - 1000 })],
    briefs: [...personalRequests, ...hiringRequests, ...financeRequests,
      request(99, 'Expired request must not appear.', 1, now + 3000, { deadlineUnix: Math.floor(now / 1000) - 1 })],
  };
}

async function open(page: Page, { theme = 'light', locale = 'en', route = '/market', world = {} }:
  { theme?: Theme; locale?: Locale; route?: '/market' | '/listings'; world?: MarketWorld } = {}) {
  const hydrationErrors = watchHydration(page);
  const data = marketData();
  await page.context().addCookies([{ name: 'karwan-locale', value: locale, domain: '127.0.0.1', path: '/' }]);
  await page.addInitScript(value => localStorage.setItem('karwan-theme', value), theme);
  await serveSearch(page, { balances: funded });
  // Fixtures answer local API/RPC reads; providers and every other remote host
  // are blocked for the entire pass, including after navigation or retries.
  await page.route('**/*', async route => {
    const host = new URL(route.request().url()).hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') return route.abort();
    return route.fallback();
  });
  await page.route(`${API}/**`, async route => {
    const url = new URL(route.request().url());
    if (world.signedOut && url.pathname === '/api/auth/bootstrap') return route.fulfill({ json: { user: null, profile: null } });
    if (world.signedOut && url.pathname === '/api/auth/me') return route.fulfill({ status: 401, json: { error: 'unauthorized' } });
    if (url.pathname === '/api/listings') {
      if (world.hold) await world.hold;
      if (world.offersUnavailable) return route.fulfill({ status: 503, json: { error: 'offers unavailable' } });
      return route.fulfill({ json: { listings: world.empty ? [] : data.listings } });
    }
    if (url.pathname === '/api/jobs/marketplace') {
      if (world.hold) await world.hold;
      if (world.requestsUnavailable) return route.fulfill({ status: 503, json: { error: 'requests unavailable' } });
      return route.fulfill({ json: { briefs: world.empty ? [] : data.briefs } });
    }
    if (url.pathname === '/api/reputation') {
      const address = url.searchParams.get('address');
      return route.fulfill({ json: address?.toLowerCase() === SELLER.toLowerCase() ? {
        address, scoreBps: 9700, successCount: 19, disputedCount: 1, failedCount: 0,
        totalDeals: 20, score: 940, tier: 'STRONG',
      } : {
        address, scoreBps: 0, successCount: 0, disputedCount: 0, failedCount: 0, totalDeals: 0,
      } });
    }
    return route.fallback();
  });
  const bootstrap = page.waitForResponse(response => response.url().startsWith(API) && new URL(response.url()).pathname === '/api/auth/bootstrap');
  await page.goto(route);
  await bootstrap;
  await expect.poll(() => page.locator('html').getAttribute('data-theme').then(value => value ?? 'light')).toBe(theme);
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  if (!world.signedOut) {
    // Desktop shows the profile pill in the header; phones and tablets show it
    // in the bottom bar instead. One of them is the signed-in entry.
    await expect(page.getByRole('link', { name: messages[locale].nav.profile }).filter({ visible: true }).first()).toBeVisible();
  }
  return { data, hydrationErrors };
}

function filterButton(page: Page, locale: Locale, group: 'type' | 'scope' | 'sort', label: string): Locator {
  const copy = messages[locale].listingsBrowse;
  const legend = group === 'type' ? copy.typeFilterLabel : group === 'scope' ? copy.scopeFilterLabel : copy.sortFilterLabel;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return page.getByRole('group', { name: legend, exact: true }).getByRole('button', { name: new RegExp(`^${escaped}`) });
}

async function sideCounts(page: Page, locale: Locale, all: number, offers: number, requests: number) {
  const copy = messages[locale].listingsBrowse;
  for (const [label, count] of [[copy.filters.all, all], [copy.filters.offers, offers], [copy.filters.briefs, requests]] as const) {
    await expect(filterButton(page, locale, 'type', label)).toHaveText(new RegExp(`^${label}\\s*${count}$`));
  }
}

async function sections(page: Page, locale: Locale, personal: number, hiring: number, business: number) {
  const copy = messages[locale].listingsBrowse.sections;
  for (const [id, title, count] of [['p2p', copy.personalTitle, personal], ['hiring', copy.hiringTitle, hiring], ['b2b', copy.businessTitle, business]] as const) {
    const section = page.locator(`#market-${id}`);
    if (count === 0) await expect(section).toHaveCount(0);
    else await expect(section.getByRole('heading', { level: 2 })).toHaveText(new RegExp(`^${title}\\s*${count}$`));
  }
}

async function layoutIsSound(page: Page, testInfo: TestInfo, primaryCount = 0) {
  const root = page.getByTestId('market');
  await expect(root).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  const metrics = await root.evaluate(root => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = 'var(--action)';
    document.body.appendChild(probe);
    const action = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const visible = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      for (let ancestor: Element | null = el; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) <= 0) return false;
      }
      return true;
    };
    // The one-primary rule covers the market's own content. Site chrome (nav,
    // footer, assistant) is shared by every page and is judged there.
    const primary = Array.from(root.querySelectorAll<HTMLElement>('button, a, input, [role="button"]'))
      .filter(el => visible(el) && getComputedStyle(el).backgroundColor === action)
      .map(el => el.textContent?.trim());
    const headings = Array.from(root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'))
      .filter(visible).map(el => ({ text: el.textContent?.trim(), weight: Number(getComputedStyle(el).fontWeight) }));
    const cards = Array.from(root.querySelectorAll<HTMLElement>('.market-card')).map(el => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const footer = el.querySelector<HTMLElement>('[data-market-footer]')!;
      const footerRect = footer.getBoundingClientRect();
      const bounds = (part: Element) => {
        const rect = part.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      const title = el.querySelector<HTMLElement>('h3')!;
      const readingArea = title.parentElement!;
      const body = readingArea.querySelector<HTMLElement>('p');
      const price = footer.querySelector('p')!;
      const right = footer.children[1]!;
      const badge = right.querySelector<HTMLElement>('[aria-label]');
      const parts = [
        ...Array.from(price.children).map((part, i) => ({ name: i === 0 ? 'price' : 'unit', ...bounds(part) })),
        ...(right.tagName === 'SPAN' ? [{ name: 'offer-count', ...bounds(right) }]
          : [{ name: 'party-label', ...bounds(right.firstElementChild!) }, ...(badge ? [{ name: 'reputation', ...bounds(badge) }] : [])]),
      ];
      const badgeStyle = badge ? getComputedStyle(badge) : null;
      return { section: el.closest('section')?.id, top: rect.top, bottom: rect.bottom,
        footerTop: footerRect.top, footerBottom: footerRect.bottom, radius: style.borderRadius,
        borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
        shadow: style.boxShadow, transform: style.transform,
        footer: bounds(footer), parts,
        text: { title: bounds(title), lineHeight: parseFloat(getComputedStyle(title).lineHeight), readingArea: bounds(readingArea),
          body: body ? { ...bounds(body), hidden: getComputedStyle(body).visibility === 'hidden', ariaHidden: body.getAttribute('aria-hidden') } : null },
        badge: badgeStyle ? { fontSize: badgeStyle.fontSize, background: badgeStyle.backgroundColor, shadow: badgeStyle.boxShadow,
          borders: [badgeStyle.borderTopWidth, badgeStyle.borderRightWidth, badgeStyle.borderBottomWidth, badgeStyle.borderLeftWidth] } : null,
        userText: Array.from(el.querySelectorAll<HTMLElement>('h3, p[dir]')).map(text => ({ tag: text.tagName, dir: text.getAttribute('dir') })),
      };
    });
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, primary, headings, cards,
      textArrows: document.body.innerText.match(/[→←↗]/g) ?? [] };
  });
  const axe = await new AxeBuilder({ page }).analyze();
  await testInfo.attach('layout', { body: JSON.stringify({ ...metrics, violations: axe.violations }, null, 2), contentType: 'application/json' });
  expect(metrics.overflow).toBeLessThanOrEqual(0);
  expect(metrics.primary).toHaveLength(primaryCount);
  expect(metrics.textArrows).toEqual([]);
  for (const heading of metrics.headings) expect(heading.weight, heading.text).toBeLessThanOrEqual(500);
  for (const card of metrics.cards) {
    expect(card.radius).toBe('20px');
    expect(card.borders).toEqual(['0px', '0px', '0px', '0px']);
    expect(card.shadow).toBe('none');
    expect(card.transform).toBe('none');
    expect(card.userText.length).toBeGreaterThanOrEqual(1);
    for (const text of card.userText) expect(text.dir).toBe('auto');
    expect(card.text.readingArea.height).toBe(80);
    expect(card.text.title.height).toBeLessThanOrEqual(card.text.lineHeight * 2 + 1);
    if (card.text.body) {
      // The description is never hidden and always ends inside the reading area.
      expect(card.text.body.hidden).toBe(false);
      expect(card.text.body.bottom).toBeLessThanOrEqual(card.text.readingArea.bottom + 1);
    }
    // Check the painted pieces, not just the card's clipped outer bounds.
    // Price/unit and the opposite party/count must remain legible in RTL too.
    for (const part of card.parts) {
      expect(part.width, part.name).toBeGreaterThan(0);
      expect(part.left, part.name).toBeGreaterThanOrEqual(card.footer.left - 1);
      expect(part.right, part.name).toBeLessThanOrEqual(card.footer.right + 1);
      expect(part.top, part.name).toBeGreaterThanOrEqual(card.footer.top - 1);
      expect(part.bottom, part.name).toBeLessThanOrEqual(card.footer.bottom + 1);
      for (const peer of card.parts.filter(peer => peer.name !== part.name)) {
        const intersectionWidth = Math.min(part.right, peer.right) - Math.max(part.left, peer.left);
        const intersectionHeight = Math.min(part.bottom, peer.bottom) - Math.max(part.top, peer.top);
        expect(intersectionWidth > 0.5 && intersectionHeight > 0.5, `${part.name} overlaps ${peer.name}`).toBe(false);
      }
    }
    if (card.badge) {
      expect(card.badge.fontSize).toBe('13px');
      expect(card.badge.background).toBe('rgba(0, 0, 0, 0)');
      expect(card.badge.borders).toEqual(['0px', '0px', '0px', '0px']);
      expect(card.badge.shadow).toBe('none');
    }
    expect(Math.abs(card.footerBottom - card.bottom)).toBeLessThanOrEqual(2);
    for (const peer of metrics.cards.filter(peer => peer.section === card.section && Math.abs(peer.top - card.top) < 2)) {
      expect(Math.abs(card.footerTop - peer.footerTop)).toBeLessThanOrEqual(2);
    }
  }
  expect(axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
}

async function readingCases(page: Page, data: ReturnType<typeof marketData>) {
  // Title up to two lines, description always one line, both inside the card.
  for (const [index, lines] of [[0, 2], [2, 2], [3, 1]] as const) {
    const offer = data.personalOffers[index]!;
    const card = page.locator('.market-card').filter({ has: page.getByRole('heading', { name: offer.title, exact: true }) });
    const title = card.getByRole('heading', { level: 3 });
    const body = card.getByText(offer.description, { exact: true });
    await expect(body).toBeVisible();
    const bodyLines = await body.evaluate(el => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
    expect(bodyLines, offer.description).toBe(1);
    const actualLines = await title.evaluate(el => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
    expect(actualLines, offer.title).toBe(lines);
  }
}

async function iconsAreAccessible(page: Page, locale: Locale) {
  const copy = messages[locale].listingsBrowse;
  const search = page.getByTestId('market').getByRole('search', { name: copy.searchLabel, exact: true }).locator('svg');
  await expect(search).toHaveCount(1);
  const pager = page.locator('#market-p2p').getByRole('navigation', { name: copy.pager.label, exact: true });
  for (const [icon, size, directional] of [
    [search, 20, false],
    [pager.getByRole('button', { name: copy.pager.previous, exact: true }).locator('svg'), 16, true],
    [pager.getByRole('button', { name: copy.pager.next, exact: true }).locator('svg'), 16, true],
  ] as const) {
    await expect(icon).toHaveAttribute('width', String(size));
    await expect(icon).toHaveAttribute('height', String(size));
    await expect(icon).toHaveAttribute('stroke-width', '2');
    await expect(icon).toHaveAttribute('aria-hidden', 'true');
    await expect(icon).toHaveAttribute('focusable', 'false');
    if (directional) {
      const angle = await icon.evaluate(el => {
        const style = getComputedStyle(el);
        const matrix = new DOMMatrix(style.transform === 'none' ? undefined : style.transform);
        const rotation = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI + (parseFloat(style.rotate) || 0);
        return Math.round((rotation + 360) % 360);
      });
      expect(angle).toBe(locale === 'ar' ? 180 : 0);
    }
  }
}

async function keyboardFocus(control: Locator) {
  await expect(control).toBeFocused();
  const focus = await control.evaluate(el => {
    const style = getComputedStyle(el);
    return { label: el.getAttribute('aria-label') || el.textContent?.trim(), visible: el.matches(':focus-visible'),
      outline: style.outlineStyle, width: parseFloat(style.outlineWidth), shadow: style.boxShadow };
  });
  expect(focus.visible).toBe(true);
  expect(focus.outline !== 'none' && focus.width > 0 || focus.shadow !== 'none').toBe(true);
  return focus;
}

async function publicEntry(page: Page, locale: Locale, testInfo: TestInfo) {
  const copy = messages[locale].nav;
  const nav = page.locator('[data-chrome="nav"]');
  const collapsed = page.viewportSize()!.width < 1024;
  const menu = nav.getByRole('button', { name: copy.menuOpenAria, exact: true });
  if (collapsed) {
    await menu.click();
    await expect(nav.getByRole('button', { name: copy.menuCloseAria, exact: true })).toHaveAttribute('aria-expanded', 'true');
    const panel = nav.getByRole('navigation', { name: messages[locale].footer.columns.product, exact: true });
    for (const [label, href] of [
      [messages[locale].footer.productLinks.howItWorks, '/how-it-works'],
      [copy.market, '/market'], [messages[locale].footer.productLinks.docs, '/docs'],
    ] as const) {
      await expect(panel.getByRole('link', { name: label, exact: true })).toBeVisible();
      await expect(panel.getByRole('link', { name: label, exact: true })).toHaveAttribute('href', href);
    }
  }
  const entry = nav.getByRole('link', { name: copy.openApp, exact: true });
  await expect(entry).toBeVisible();
  await expect(entry).toHaveAttribute('href', '/start');
  await expect(entry.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  expect(await page.evaluate(() => document.body.innerText.match(/[→←↗]/g) ?? [])).toEqual([]);
  if (collapsed) {
    await page.screenshot({ path: testInfo.outputPath('public-menu.png') });
    await page.keyboard.press('Escape');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeFocused();
  }
}

for (const theme of ['light', 'dark'] as const) {
  for (const locale of ['en', 'ar'] as const) {
    test(`/market ${theme} ${locale}`, async ({ page }, testInfo) => {
      const { data, hydrationErrors } = await open(page, { theme, locale });
      if (mainnet) {
        await expect(page).toHaveURL(/\/account$/);
        await expect(page.getByTestId('market')).toHaveCount(0);
        await expect(page.getByRole('heading', { level: 1 })).toContainText('1,240.50');
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        const axe = await new AxeBuilder({ page }).analyze();
        await testInfo.attach('redirect-layout', { body: JSON.stringify({ violations: axe.violations }, null, 2), contentType: 'application/json' });
        expect(axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
      } else {
        const copy = messages[locale].listingsBrowse;
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.heroTitle);
        await sideCounts(page, locale, 25, 13, 12);
        await sections(page, locale, 17, 4, 4);
        await expect(page.locator('.market-card')).toHaveCount(20);
        await expect(page.getByTestId('market')).not.toContainText(/Expired|Cancelled/);
        await expect(page.locator('.market-card h3').filter({ hasText: 'تصميم' })).toHaveAttribute('dir', 'auto');
        await expect(page.getByText(data.personalOffers[1]!.description, { exact: true })).toHaveAttribute('dir', 'auto');
        await readingCases(page, data);
        await expect(page.locator('.market-card[data-market-side="offer"]').first().locator('[data-market-footer] [aria-label]')).toContainText('940');
        await expect(page.locator('#market-b2b .market-card').filter({ hasText: 'Invoice finance offer 0' }).locator('[data-market-footer] > p')).toContainText('12,345.67');
        await iconsAreAccessible(page, locale);
        await layoutIsSound(page, testInfo);
        const card = page.locator('.market-card').first();
        const position = (el: Element) => {
          const rect = el.getBoundingClientRect();
          return { x: rect.left + window.scrollX, y: rect.top + window.scrollY, width: rect.width, height: rect.height };
        };
        const before = await card.evaluate(position);
        await card.hover();
        const hover = await card.evaluate(el => ({ transform: getComputedStyle(el).transform, shadow: getComputedStyle(el).boxShadow }));
        expect(hover).toEqual({ transform: 'none', shadow: 'none' });
        expect(await card.evaluate(position)).toEqual(before);
      }
      expect(hydrationErrors()).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(mainnet ? 'account-redirect.png' : 'market.png'), fullPage: true });
    });
  }
}

if (!mainnet) {
  for (const theme of ['light', 'dark'] as const) {
    for (const locale of ['en', 'ar'] as const) {
      test(`signed-out /market ${theme} ${locale} retains browsing and the account entry`, async ({ page }, testInfo) => {
        await open(page, { theme, locale, world: { signedOut: true } });
        await expect(page).toHaveURL(/\/market$/);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages[locale].listingsBrowse.heroTitle);
        await sideCounts(page, locale, 25, 13, 12);
        await sections(page, locale, 17, 4, 4);
        await expect(page.locator('.market-card')).toHaveCount(20);
        await publicEntry(page, locale, testInfo);
        await layoutIsSound(page, testInfo);
      });
    }
  }

  test('signed-out /listings retains the market and its account entry', async ({ page }, testInfo) => {
    await open(page, { route: '/listings', world: { signedOut: true } });
    await expect(page).toHaveURL(/\/listings$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.listingsBrowse.heroTitle);
    await sideCounts(page, 'en', 25, 13, 12);
    await expect(page.locator('.market-card')).toHaveCount(20);
    await publicEntry(page, 'en', testInfo);
    await layoutIsSound(page, testInfo);
  });

  test('a signed-out empty market keeps its sole primary action and quiet account entry', async ({ page }, testInfo) => {
    await open(page, { world: { signedOut: true, empty: true } });
    await expect(page.getByRole('heading', { name: en.listingsBrowse.emptyAllTag, exact: true })).toBeVisible();
    await sideCounts(page, 'en', 0, 0, 0);
    await publicEntry(page, 'en', testInfo);
    await layoutIsSound(page, testInfo, 1);
  });

  for (const locale of ['en', 'ar'] as const) {
    test(`search, filters and pager are usable with visible keyboard focus ${locale}`, async ({ page }, testInfo) => {
      await open(page, { locale, theme: locale === 'ar' ? 'dark' : 'light' });
      await sideCounts(page, locale, 25, 13, 12);
      const copy = messages[locale].listingsBrowse;
      const focus = [];
      const search = page.getByRole('textbox', { name: copy.searchLabel, exact: true });
      await search.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      focus.push(await keyboardFocus(search));
      await page.keyboard.press('Tab');
      const all = filterButton(page, locale, 'type', copy.filters.all);
      focus.push(await keyboardFocus(all));
      await page.keyboard.press('Tab');
      const requests = filterButton(page, locale, 'type', copy.filters.briefs);
      focus.push(await keyboardFocus(requests));
      await page.keyboard.press('Space');
      await expect(requests).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.market-card[data-market-side="offer"]')).toHaveCount(0);
      await page.keyboard.press('Tab');
      const offers = filterButton(page, locale, 'type', copy.filters.offers);
      focus.push(await keyboardFocus(offers));
      await page.keyboard.press('Enter');
      await expect(offers).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.market-card[data-market-side="request"]')).toHaveCount(0);
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Shift+Tab');
      await expect(all).toBeFocused();
      await page.keyboard.press('Enter');
      // The three type buttons lead directly to the scope group.
      for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
      focus.push(await keyboardFocus(filterButton(page, locale, 'scope', copy.scope.all)));
      await page.keyboard.press('Tab');
      const services = filterButton(page, locale, 'scope', copy.scope.services);
      focus.push(await keyboardFocus(services));
      await page.keyboard.press('Space');
      await expect(services).toHaveAttribute('aria-pressed', 'true');
      await sections(page, locale, 17, 4, 0);
      await page.keyboard.press('Tab');
      const business = filterButton(page, locale, 'scope', copy.scope.business);
      focus.push(await keyboardFocus(business));
      await page.keyboard.press('Space');
      await sections(page, locale, 0, 4, 4);
      await page.keyboard.press('Tab');
      focus.push(await keyboardFocus(filterButton(page, locale, 'sort', copy.sort.newest)));
      await page.keyboard.press('Tab');
      const lowest = filterButton(page, locale, 'sort', copy.sort.lowestPrice);
      focus.push(await keyboardFocus(lowest));
      await page.keyboard.press('Enter');
      await expect(lowest).toHaveAttribute('aria-pressed', 'true');
      await page.keyboard.press('Tab');
      const highest = filterButton(page, locale, 'sort', copy.sort.highestPrice);
      focus.push(await keyboardFocus(highest));
      await page.keyboard.press('Space');
      await expect(highest).toHaveAttribute('aria-pressed', 'true');
      await page.keyboard.press('Tab');
      const clear = page.getByRole('button', { name: copy.clearFilters, exact: true });
      focus.push(await keyboardFocus(clear));
      await page.keyboard.press('Enter');
      await sections(page, locale, 17, 4, 4);
      const personal = page.locator('#market-p2p');
      const pager = personal.getByRole('navigation', { name: copy.pager.label, exact: true });
      await personal.locator('.market-card').last().focus();
      await page.keyboard.press('Tab');
      focus.push(await keyboardFocus(pager.getByRole('button', { name: copy.pager.page.replace('{n}', '1'), exact: true })));
      await page.keyboard.press('Tab');
      if (page.viewportSize()!.width >= 640) {
        focus.push(await keyboardFocus(pager.getByRole('button', { name: copy.pager.page.replace('{n}', '2'), exact: true })));
        await page.keyboard.press('Tab');
      }
      const next = pager.getByRole('button', { name: copy.pager.next, exact: true });
      focus.push(await keyboardFocus(next));
      await page.keyboard.press('Enter');
      await expect(personal.locator('.market-card')).toHaveCount(5);
      await personal.locator('.market-card').last().focus();
      await page.keyboard.press('Tab');
      const previous = pager.getByRole('button', { name: copy.pager.previous, exact: true });
      focus.push(await keyboardFocus(previous));
      await page.keyboard.press('Enter');
      await expect(personal.locator('.market-card')).toHaveCount(12);
      await layoutIsSound(page, testInfo);
      await testInfo.attach('keyboard-focus', { body: JSON.stringify(focus, null, 2), contentType: 'application/json' });
    });
  }

  test('loading shows neutral placeholders and unknown counts without lime fills', async ({ page }, testInfo) => {
    let release = () => {};
    const hold = new Promise<void>(resolve => { release = resolve; });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    try {
      await open(page, { world: { hold } });
      const root = page.getByTestId('market');
      await expect(root).toHaveAttribute('aria-busy', 'true');
      expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(false);
      for (const label of [en.listingsBrowse.filters.all, en.listingsBrowse.filters.offers, en.listingsBrowse.filters.briefs]) {
        await expect(filterButton(page, 'en', 'type', label)).toHaveText(label);
      }
      await expect(page.locator('.market-card')).toHaveCount(0);
      const loading = await root.evaluate(root => {
        const probe = document.createElement('span');
        document.body.appendChild(probe);
        const colors = ['--action', '--accent'].map(token => {
          probe.style.backgroundColor = `var(${token})`;
          return getComputedStyle(probe).backgroundColor;
        });
        probe.remove();
        const elements = Array.from(document.querySelectorAll<HTMLElement>('*')).filter(el => {
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return false;
          for (let ancestor: Element | null = el; ancestor; ancestor = ancestor.parentElement) {
            const style = getComputedStyle(ancestor);
            if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) <= 0) return false;
          }
          return true;
        });
        const limeFills = elements.filter(el => colors.includes(getComputedStyle(el).backgroundColor)).map(el => {
          const control = el.closest<HTMLElement>('button, a, input, [role="button"]');
          const rect = el.getBoundingClientRect();
          return { tag: el.tagName, classes: el.className, ariaLabel: el.getAttribute('aria-label'), text: el.textContent?.trim(),
            market: root.contains(el), control: control ? { tag: control.tagName, label: control.getAttribute('aria-label') || control.textContent?.trim(), classes: control.className } : null,
            parent: el.parentElement?.outerHTML.slice(0, 1200), width: rect.width, height: rect.height };
        });
        return {
          placeholders: elements.filter(el => root.contains(el) && el.tagName === 'DIV' && el.getAttribute('aria-hidden') === 'true').map(el => ({
            width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height, background: getComputedStyle(el).backgroundColor,
          })),
          marketLimeFills: limeFills.filter(fill => fill.market),
          globalLimeFills: limeFills,
          primary: elements.filter(el => root.contains(el) && el.matches('button, a, input, [role="button"]') && colors.includes(getComputedStyle(el).backgroundColor))
            .map(el => ({ tag: el.tagName, label: el.getAttribute('aria-label') || el.textContent?.trim(), classes: el.className })),
        };
      });
      await testInfo.attach('loading-layout', { body: JSON.stringify(loading, null, 2), contentType: 'application/json' });
      expect(loading.placeholders.length).toBeGreaterThanOrEqual(18);
      expect(loading.placeholders.filter(placeholder => placeholder.height === 44)).toHaveLength(3);
      for (const placeholder of loading.placeholders) expect(placeholder.background).not.toBe('rgba(0, 0, 0, 0)');
      // The shared page-load bar belongs to the site chrome on every route;
      // the market's own loading state must add no lime of its own.
      expect(loading.marketLimeFills).toEqual([]);
      expect(loading.primary).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath('loading.png'), fullPage: true });
    } finally {
      release();
    }
    await sideCounts(page, 'en', 25, 13, 12);
    await expect(page.getByTestId('market')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('.market-card')).toHaveCount(20);
  });

  for (const locale of ['en', 'ar'] as const) {
    test(`pagination, type and scope filters keep real counts and reset the page ${locale}`, async ({ page }) => {
      const { data } = await open(page, { locale });
      const copy = messages[locale].listingsBrowse;
      await sideCounts(page, locale, 25, 13, 12);
      const personal = page.locator('#market-p2p');
      const pager = personal.getByRole('navigation', { name: copy.pager.label, exact: true });
      await expect(personal.locator('.market-card')).toHaveCount(12);
      await expect(pager).toContainText(copy.pager.range.replace('{from}', '1').replace('{to}', '12').replace('{total}', '17'));
      await expect(pager.getByRole('button', { name: copy.pager.previous, exact: true })).toBeDisabled();
      await pager.getByRole('button', { name: copy.pager.next, exact: true }).click();
      await expect(personal.locator('.market-card')).toHaveCount(5);
      await expect(pager).toContainText(copy.pager.range.replace('{from}', '13').replace('{to}', '17').replace('{total}', '17'));
      await expect(personal.getByRole('heading', { level: 3 }).first()).toHaveText(data.personalOffers[6]!.title);
      await expect(pager.getByRole('button', { name: copy.pager.page.replace('{n}', '2'), exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(pager.getByRole('button', { name: copy.pager.next, exact: true })).toBeDisabled();
      await pager.getByRole('button', { name: copy.pager.previous, exact: true }).click();
      await expect(personal.getByRole('heading', { level: 3 }).first()).toHaveText(data.personalOffers[0]!.title);
      await pager.getByRole('button', { name: copy.pager.next, exact: true }).click();
      const offers = filterButton(page, locale, 'type', copy.filters.offers);
      await offers.click();
      await expect(offers).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.market-card[data-market-side="request"]')).toHaveCount(0);
      await expect(personal.locator('.market-card')).toHaveCount(9);
      await expect(pager).toHaveCount(0);
      await sideCounts(page, locale, 25, 13, 12);
      await filterButton(page, locale, 'type', copy.filters.briefs).click();
      await expect(page.locator('.market-card[data-market-side="offer"]')).toHaveCount(0);
      await expect(page.locator('.market-card[data-market-side="request"]')).toHaveCount(12);
      await filterButton(page, locale, 'type', copy.filters.all).click();
      await expect(personal.locator('.market-card')).toHaveCount(12);
      await expect(pager.getByRole('button', { name: copy.pager.page.replace('{n}', '1'), exact: true })).toHaveAttribute('aria-current', 'page');
      await filterButton(page, locale, 'scope', copy.scope.services).click();
      await sections(page, locale, 17, 4, 0);
      await filterButton(page, locale, 'scope', copy.scope.business).click();
      await sections(page, locale, 0, 4, 4);
      await page.getByRole('button', { name: copy.clearFilters, exact: true }).click();
      await sections(page, locale, 17, 4, 4);
      await expect(page.getByRole('button', { name: copy.clearFilters, exact: true })).toHaveCount(0);
    });
  }

  test('search and price sort preserve request offer counts and truthful empty results', async ({ page }, testInfo) => {
    const { data } = await open(page);
    const copy = en.listingsBrowse;
    await sideCounts(page, 'en', 25, 13, 12);
    const personal = page.locator('#market-p2p');
    await filterButton(page, 'en', 'sort', copy.sort.highestPrice).click();
    await expect(personal.getByRole('heading', { level: 3 }).first()).toHaveText('Review inventory 7.');
    await filterButton(page, 'en', 'sort', copy.sort.lowestPrice).click();
    await expect(personal.getByRole('heading', { level: 3 }).first()).toHaveText(data.personalOffers[0]!.title);
    const search = page.getByRole('textbox', { name: copy.searchLabel, exact: true });
    await search.fill('bakery sample packs');
    await expect(page.locator('.market-card')).toHaveCount(1);
    const request = page.locator('.market-card[data-market-side="request"]');
    await expect(request.getByRole('heading', { level: 3 })).toHaveText('Find packaging for my shop.');
    const offers = en.offers.countMany.replace('{n}', '5');
    await expect(request.locator('[data-market-footer]')).toContainText(offers);
    await expect(request.getByText(offers, { exact: true })).toHaveCount(1);
    await search.fill('تصميم');
    await expect(page.locator('.market-card')).toHaveCount(1);
    await expect(page.locator('.market-card h3')).toHaveText(data.personalOffers[1]!.title);
    await expect(page.locator('.market-card p[dir="auto"]')).toHaveText(data.personalOffers[1]!.description);
    await search.fill('no possible fixture match');
    await expect(page.getByRole('heading', { name: copy.emptyFilteredTitle, exact: true })).toBeVisible();
    await expect(page.locator('.market-card')).toHaveCount(0);
    await sideCounts(page, 'en', 25, 13, 12);
    await layoutIsSound(page, testInfo);
    await page.getByRole('button', { name: copy.clearFilters, exact: true }).first().click();
    await expect(search).toHaveValue('');
    await expect(filterButton(page, 'en', 'sort', copy.sort.newest)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.market-card')).toHaveCount(20);
    await expect(personal.getByRole('heading', { level: 3 }).first()).toHaveText(data.personalOffers[0]!.title);
    const zero = personal.locator('.market-card[data-market-side="request"]').filter({ hasText: 'Review inventory 2.' });
    await expect(zero.locator('[data-market-footer]')).toContainText(en.offers.countNone);
    const one = personal.locator('.market-card[data-market-side="request"]').filter({ hasText: 'أحتاج' });
    await expect(one.locator('[data-market-footer]')).toContainText(en.offers.countOne);
  });

  test('a failed source leaves current requests visible and retry restores both sides', async ({ page }, testInfo) => {
    const world: MarketWorld = { offersUnavailable: true };
    await open(page, { world });
    await sideCounts(page, 'en', 12, 0, 12);
    await expect(page.getByTestId('market').getByRole('status')).toContainText(en.listingsBrowse.partial.offers);
    await sections(page, 'en', 8, 2, 2);
    await expect(page.locator('.market-card')).toHaveCount(12);
    world.offersUnavailable = false;
    await page.getByRole('button', { name: en.listingsBrowse.retry, exact: true }).click();
    await sideCounts(page, 'en', 25, 13, 12);
    await expect(page.getByText(en.listingsBrowse.partial.offers, { exact: true })).toHaveCount(0);
    await expect(page.locator('.market-card')).toHaveCount(20);
    await layoutIsSound(page, testInfo);
  });

  test('an empty market offers one primary action without inventing a card', async ({ page }, testInfo) => {
    await open(page, { world: { empty: true } });
    await expect(page.getByRole('heading', { name: en.listingsBrowse.emptyAllTag, exact: true })).toBeVisible();
    await sideCounts(page, 'en', 0, 0, 0);
    await expect(page.locator('.market-card')).toHaveCount(0);
    await expect(page.getByRole('link', { name: en.listingsBrowse.emptyPostRequest, exact: true })).toHaveAttribute('href', '/buyer');
    await expect(page.getByRole('link', { name: en.listingsBrowse.emptyPublishOffer, exact: true })).toHaveAttribute('href', '/seller#post-listing');
    await layoutIsSound(page, testInfo, 1);
  });

  test('two unavailable sources report failure instead of an empty market', async ({ page }, testInfo) => {
    await open(page, { world: { offersUnavailable: true, requestsUnavailable: true } });
    await expect(page.getByTestId('market').getByRole('status')).toContainText(en.listingsBrowse.partial.all);
    await expect(page.getByRole('heading', { name: en.listingsBrowse.emptyAllTag, exact: true })).toHaveCount(0);
    await expect(page.locator('.market-card')).toHaveCount(0);
    await layoutIsSound(page, testInfo);
  });
}
