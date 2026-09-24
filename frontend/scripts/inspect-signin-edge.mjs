import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';

const output = await mkdtemp(path.join(tmpdir(), 'karwan-signin-'));
const browser = await chromium.launch({ channel: 'msedge', headless: true });

try {
  const views = [
    { width: 1440, height: 900, theme: 'light', locale: 'en' },
    { width: 768, height: 900, theme: 'light', locale: 'en' },
    { width: 390, height: 844, theme: 'light', locale: 'en' },
    { width: 1440, height: 900, theme: 'dark', locale: 'en' },
    { width: 390, height: 844, theme: 'dark', locale: 'en' },
    { width: 390, height: 844, theme: 'light', locale: 'ar' },
    { width: 390, height: 844, theme: 'dark', locale: 'ar' },
  ];

  for (const view of views) {
    const { width, height, theme, locale } = view;
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
    await context.addInitScript((selectedTheme) => localStorage.setItem('karwan-theme', selectedTheme), theme);
    if (locale !== 'en') {
      await context.addCookies([{ name: 'karwan-locale', value: locale, url: 'http://localhost:3000' }]);
    }
    const page = await context.newPage();
    await page.goto('http://localhost:3000/app', { waitUntil: 'load' });
    await page.locator('[data-auth-gate="hero"]').waitFor();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-auth-gate="hero"]')).backgroundImage !== 'none');
    await page.evaluate(() => document.fonts.ready);

    const state = await page.evaluate(() => {
      const gate = document.querySelector('[data-auth-gate="hero"]');
      const css = getComputedStyle(gate);
      const gateRect = gate.getBoundingClientRect();
      const parentRect = gate.parentElement.getBoundingClientRect();
      const innerRect = gate.querySelector('div').getBoundingClientRect();
      const actionRect = gate.querySelector('button').getBoundingClientRect();
      return {
        canvas: css.backgroundColor,
        grain: css.backgroundImage,
        heading: gate.querySelector('h1')?.textContent,
        copy: gate.querySelector('p:nth-of-type(2)')?.textContent,
        direction: document.documentElement.dir,
        geometry: { viewport: window.innerWidth, parentX: parentRect.x, parentWidth: parentRect.width, gateX: gateRect.x, gateWidth: gateRect.width, innerX: innerRect.x, innerWidth: innerRect.width, actionX: actionRect.x, actionRight: actionRect.right },
        hasOverflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });

    if (theme === 'light') {
      assert.equal(state.canvas, 'rgb(228, 234, 238)');
      assert.match(state.grain, /karwan-matte-grain\.svg/);
    } else {
      assert.doesNotMatch(state.grain, /karwan-matte-grain\.svg/);
    }
    assert.doesNotMatch(state.copy ?? '', /\u2014/);
    assert.equal(state.direction, locale === 'ar' ? 'rtl' : 'ltr');
    assert.equal(state.hasOverflow, false);
    assert.ok(state.geometry.actionX >= 0 && state.geometry.actionRight <= width);

    const screenshot = path.join(output, `signin-${theme}-${locale}-${width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await page.locator('[data-auth-gate="hero"] button').first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await dialog.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {})));
    });
    const modalState = await dialog.evaluate((element) => {
      const input = element.querySelector('input[type="email"]');
      const action = element.querySelector('.auth-email-continue');
      const wallet = Array.from(element.querySelectorAll('button')).find((button) => button !== action && button.textContent?.includes('wallet'));
      const rect = element.getBoundingClientRect();
      return {
        card: getComputedStyle(element).backgroundColor,
        title: getComputedStyle(element.querySelector('h2')).color,
        body: getComputedStyle(element.querySelector('#karwan-auth-description')).color,
        field: getComputedStyle(input).backgroundColor,
        fieldBorder: getComputedStyle(input).borderColor,
        placeholder: getComputedStyle(input, '::placeholder').color,
        disabledAction: getComputedStyle(action).backgroundColor,
        accent: getComputedStyle(element).getPropertyValue('--lp-accent').trim(),
        walletBorder: wallet ? getComputedStyle(wallet).borderColor : null,
        geometry: { x: rect.x, right: rect.right, y: rect.y, bottom: rect.bottom },
        hasOverflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    assert.equal(modalState.hasOverflow, false);
    assert.ok(modalState.geometry.x >= 0 && modalState.geometry.right <= width);
    assert.ok(modalState.geometry.y >= -1 && modalState.geometry.bottom <= height + 1);
    if (theme === 'dark') {
      assert.equal(modalState.card, 'rgb(27, 36, 46)');
      assert.equal(modalState.field, 'rgb(38, 49, 61)');
      assert.equal(modalState.disabledAction, modalState.field);
      assert.equal(modalState.accent.toLowerCase(), '#afc95b');
    } else {
      assert.equal(modalState.card, 'rgb(244, 244, 241)');
    }
    const modalScreenshot = path.join(output, `signin-modal-${theme}-${locale}-${width}.png`);
    await page.screenshot({ path: modalScreenshot });
    if (locale === 'en' && width === 390) {
      const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      assert.equal(accessibility.violations.length, 0, JSON.stringify(accessibility.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) }))));
    }
    let enabledAction = null;
    const emailInput = dialog.locator('input[type="email"]');
    if (await emailInput.isEnabled()) {
      await emailInput.fill('review@example.com');
      const action = dialog.locator('.auth-email-continue');
      assert.equal(await action.isEnabled(), true);
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.auth-email-continue')).backgroundColor === 'rgb(175, 201, 91)');
      enabledAction = await action.evaluate((element) => getComputedStyle(element).backgroundColor);
      assert.equal(enabledAction, 'rgb(175, 201, 91)');
    }
    console.log(JSON.stringify({ view, ...state, modal: modalState, enabledAction, screenshot, modalScreenshot }));
    await context.close();
  }
} finally {
  await browser.close();
}
