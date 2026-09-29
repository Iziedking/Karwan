import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { decodeFunctionData, encodeFunctionResult, erc20Abi, multicall3Abi, type Hex } from 'viem';
import { ar } from '../shared/i18n/messages/ar';
import { en } from '../shared/i18n/messages/en';
import { API, ME, RPC } from './moneyFixtures';

export const topUpMessages = { en, ar };
export const topUpMainnet = process.env.KARWAN_UI_NETWORK === 'mainnet';
export const topUpBefore = process.env.KARWAN_UI_PHASE === 'before';
export type TopUpLocale = 'en' | 'ar';
export type TopUpTheme = 'light' | 'dark';

export function gatewayBalance(confirmed: string, pending = '0') {
  return {
    address: ME,
    confirmed,
    pending,
    chains: [{ chain: topUpMainnet ? 'Arc' : 'Arc_Testnet', key: 'arc', confirmed, pending }],
    fetchedAt: Date.UTC(2026, 8, 29),
  };
}

/// The profile card reads USDC through its six-decimal ERC-20 interface;
/// the money home reads the same balance through Arc's native interface.
/// Keep both fixture reads consistent without touching any transaction RPC.
export async function serveTopUpTokenBalances(page: Page, balances: Record<string, number>) {
  const read = (data: Hex): Hex | null => {
    if (data.startsWith('0x70a08231')) {
      const decoded = decodeFunctionData({ abi: erc20Abi, data });
      const value = balances[String(decoded.args?.[0] ?? '').toLowerCase()] ?? 0;
      return encodeFunctionResult({ abi: erc20Abi, functionName: 'balanceOf', result: BigInt(Math.round(value * 1e6)) });
    }
    if (data.startsWith('0x4d2301cc')) {
      const decoded = decodeFunctionData({ abi: multicall3Abi, data });
      const value = balances[String(decoded.args?.[0] ?? '').toLowerCase()] ?? 0;
      return encodeFunctionResult({ abi: multicall3Abi, functionName: 'getEthBalance', result: BigInt(Math.round(value * 1e6)) * 10n ** 12n });
    }
    return null;
  };
  await page.route(`${RPC}/**`, async route => {
    type Call = { id: number; method: string; params?: unknown[] };
    const body = route.request().postDataJSON() as Call | Call[];
    const calls = Array.isArray(body) ? body : [body];
    if (!calls.every(call => call.method === 'eth_call')) return route.fallback();
    const answers = calls.map(call => {
      const data = (call.params?.[0] as { data?: Hex } | undefined)?.data;
      let result = data ? read(data) : null;
      if (data?.startsWith('0x82ad56cb')) {
        const decoded = decodeFunctionData({ abi: multicall3Abi, data });
        const inner = (decoded.args?.[0] ?? []) as ReadonlyArray<{ callData: Hex }>;
        result = encodeFunctionResult({ abi: multicall3Abi, functionName: 'aggregate3', result: inner.map(item => {
          const value = read(item.callData);
          return { success: value !== null, returnData: value ?? '0x' };
        }) });
      }
      return { jsonrpc: '2.0', id: call.id, result };
    });
    return route.fulfill({ json: Array.isArray(body) ? answers : answers[0] });
  });
}

export async function prepareTopUpAppearance(page: Page, theme: TopUpTheme, locale: TopUpLocale) {
  await page.context().addCookies([{ name: 'karwan-locale', value: locale, domain: '127.0.0.1', path: '/' }]);
  await page.addInitScript(value => {
    localStorage.setItem('karwan-theme', value);
    localStorage.setItem('karwan:guide:disabled', '1');
  }, theme);
}

export async function blockTopUpProviders(page: Page) {
  await page.route('**/*', async route => {
    const host = new URL(route.request().url()).hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') return route.abort();
    return route.fallback();
  });
}

export async function assertTopUpAppearance(page: Page, theme: TopUpTheme, locale: TopUpLocale) {
  await expect.poll(() => page.locator('html').getAttribute('data-theme').then(value => value ?? 'light')).toBe(theme);
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  await page.evaluate(() => document.fonts.ready);
}

export async function noProtocolWords(page: Page) {
  await expect(page.locator('body')).not.toContainText(/Gateway|\bpool\b|pooled|unified balance/i);
}

/// Capture the active interaction surface and the whole document separately.
/// A modal's dimmed background controls are still in the DOM; the document
/// count is retained in evidence rather than passed off as a modal count.
export async function captureTopUpScreen(page: Page, testInfo: TestInfo, phase: string, {
  root = page.locator('.product-surface').last(),
  primary,
  wholePagePrimary,
  maxHeadingWeight = 500,
}: {
  root?: Locator;
  primary?: number;
  wholePagePrimary?: number;
  maxHeadingWeight?: number;
} = {}) {
  await expect(root).toBeVisible();
  const metrics = await root.evaluate(surface => {
    const visible = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0) return false;
      }
      return true;
    };
    const colors = ['--action', '--accent', '--lp-accent'].map(token => {
      const probe = document.createElement('span');
      probe.style.backgroundColor = `var(${token})`;
      document.body.appendChild(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return color;
    });
    const primaries = (container: Element) => Array.from(container.querySelectorAll<HTMLElement>('button,a,input,[role="button"]'))
      .filter(element => visible(element) && colors.includes(getComputedStyle(element).backgroundColor))
      .map(element => ({ text: element.textContent?.trim(), disabled: element.hasAttribute('disabled') }));
    const focus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusStyle = focus ? getComputedStyle(focus) : null;
    return {
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      surfaceOverflow: surface.scrollWidth - surface.clientWidth,
      primary: primaries(surface),
      // With a modal sheet open, the page behind it is dimmed and inert, so the
      // one-primary rule applies to the sheet itself.
      documentPrimary: primaries(document.querySelector('[role="dialog"][aria-modal="true"]') ?? document.body),
      headings: Array.from(surface.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')).filter(visible)
        .map(element => ({ text: element.textContent?.trim(), weight: Number(getComputedStyle(element).fontWeight) })),
      focus: focus ? {
        name: focus.getAttribute('aria-label') || focus.textContent?.trim() || focus.getAttribute('id'),
        inside: surface.contains(focus),
        visible: focus.matches(':focus-visible'),
        outline: focusStyle?.outlineStyle,
        outlineWidth: focusStyle?.outlineWidth,
        shadow: focusStyle?.boxShadow,
      } : null,
    };
  });
  const axe = await new AxeBuilder({ page }).analyze();
  await testInfo.attach(`${phase}-layout`, {
    body: JSON.stringify({ network: topUpMainnet ? 'mainnet' : 'testnet', phase, url: page.url(), ...metrics, violations: axe.violations }, null, 2),
    contentType: 'application/json',
  });
  if (!topUpBefore) {
    expect(metrics.documentOverflow).toBeLessThanOrEqual(0);
    expect(metrics.surfaceOverflow).toBeLessThanOrEqual(1);
    if (primary !== undefined) expect(metrics.primary).toHaveLength(primary);
    if (wholePagePrimary !== undefined) expect(metrics.documentPrimary).toHaveLength(wholePagePrimary);
    for (const heading of metrics.headings) expect(heading.weight, heading.text).toBeLessThanOrEqual(maxHeadingWeight);
    expect(axe.violations.filter(violation => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
    await noProtocolWords(page);
  }
  const screenshot = testInfo.outputPath(`${phase}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach(`${phase}-screen`, { path: screenshot, contentType: 'image/png' });
  return metrics;
}

export async function checkTopUpKeyboardFocus(page: Page, control: Locator, testInfo: TestInfo, label: string) {
  await control.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(control).toBeFocused();
  const focus = await control.evaluate(element => {
    const style = getComputedStyle(element);
    return { visible: element.matches(':focus-visible'), outline: style.outlineStyle, width: Number.parseFloat(style.outlineWidth), shadow: style.boxShadow };
  });
  await testInfo.attach(`${label}-focus`, { body: JSON.stringify(focus), contentType: 'application/json' });
  expect(focus.visible).toBe(true);
  expect(focus.outline !== 'none' && focus.width > 0 || focus.shadow !== 'none').toBe(true);
}

export async function topUpEvidenceManifest(testInfo: TestInfo) {
  await testInfo.attach('instant-topup-evidence-manifest', {
    body: JSON.stringify({
      version: 1,
      network: topUpMainnet ? 'mainnet' : 'testnet',
      project: testInfo.project.name,
      phase: topUpBefore ? 'before' : 'after',
      test: testInfo.title,
      fixtureOnly: true,
      api: API,
      externalProvidersBlocked: true,
      attachments: testInfo.attachments.map(({ name, path, contentType }) => ({ name, path, contentType })),
    }, null, 2),
    contentType: 'application/json',
  });
}
