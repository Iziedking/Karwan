import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Icon, GlobeIcon, WalletIcon, BuyerIcon, type IconName } from './Icon';
import { ease, dur } from '../motion/tokens';

const css = () => readFileSync(new URL('../../app/design-tokens.css', import.meta.url), 'utf8');

test('canonical theme is the Figma new look: dark ground by default, light on request, one green', () => {
  const source = css();
  const block = (selector: RegExp) => source.slice(source.search(selector), source.indexOf('}', source.search(selector)));
  const light = block(/:root\s*\{/);
  const dark = block(/html\[data-theme="dark"\]\s*\{/);
  for (const declaration of [
    '--canvas: #EEEFEA', '--surface: #F6F6F3', '--raised: #FFFFFF', '--ash: #E2E4DD',
    '--ink: #16202A', '--ink-secondary: #4E5760', '--ink-muted: #656D75',
    '--action: #AFC95B', '--on-action: #16202A',
  ]) assert.ok(light.includes(declaration), `light ${declaration}`);
  for (const declaration of [
    '--canvas: #0F1012', '--surface: #16181B', '--raised: #1D2024', '--ash: #24272B',
    '--ink: #F4F4F1', '--ink-secondary: #A3A8AE', '--ink-muted: #81878E',
  ]) assert.ok(dark.includes(declaration), `dark ${declaration}`);
  assert.ok(light.includes('--line-base: var(--ink)'));
  assert.ok(dark.includes('--line-base: #ECEEE7'));
  assert.ok(light.includes('--line: color-mix(in srgb, var(--line-base) 8%, transparent)'));
  assert.ok(light.includes('--line-strong: color-mix(in srgb, var(--line-base) 14%, transparent)'));
  for (const name of ['--hero-shadow', '--offer-surface', '--glass-card', '--nav-float']) {
    assert.doesNotMatch(dark, new RegExp(`${name}:`), `${name} is one neutral token for both themes`);
  }
  assert.ok(light.includes('--hero-shadow: none'));
  for (const declaration of [
    '--radius-card: 16px', '--radius-input: 12px', '--radius-button: 14px', '--radius-chip: 18px',
    '--radius-sheet: 28px', '--ease-ui: cubic-bezier(0.2, 0, 0, 1)',
    '--dur-push: 350ms', '--dur-sheet: 350ms', '--dur-fade: 180ms', '--dur-press: 120ms',
    '--lp-dark: var(--ink)', '--lp-light: var(--canvas)',
    '--lp-card: var(--surface)', '--color-offer: var(--offer)',
    '--color-request: var(--request)', '--ease-out: var(--ease-ui)',
  ]) assert.ok(source.includes(declaration), declaration);
  assert.match(source, /@theme inline/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.ok(source.includes('--dur-small: 0ms'));
  assert.ok(source.includes('--dur-panel: 0ms'));
});

test('the page is dark in the server markup, before any script runs', () => {
  const layout = readFileSync(new URL('../../app/layout.tsx', import.meta.url), 'utf8');
  assert.match(layout, /<html[^>]*data-theme="dark"/);
});

test('JS easing and durations match the canonical CSS contract', () => {
  assert.deepEqual(ease.out, [0.2, 0, 0, 1]);
  assert.deepEqual(ease.in, ease.out);
  assert.deepEqual(ease.inOut, ease.out);
  assert.equal(dur.fast, 0.18);
  assert.equal(dur.sheet, 0.35);
  assert.equal(dur.push, 0.35);
  assert.equal(dur.press, 0.12);
  assert.equal(dur.reduced, 0);
});

test('all allowed icon sizes use stroke 2 and default to decorative', () => {
  for (const size of [16, 20, 24] as const) {
    const markup = renderToStaticMarkup(createElement(Icon, { name: 'wallet', size }));
    assert.match(markup, new RegExp(`width="${size}"`));
    assert.match(markup, new RegExp(`height="${size}"`));
    assert.match(markup, /stroke-width="2"/);
    assert.match(markup, /stroke-linecap="round"/);
    assert.match(markup, /aria-hidden="true"/);
  }
});

test('named icons preserve callers but cannot override canonical stroke/size', () => {
  for (const Component of [GlobeIcon, WalletIcon, BuyerIcon]) {
    const markup = renderToStaticMarkup(createElement(Component, { width: 14, strokeWidth: 1 }));
    assert.match(markup, /width="16"/);
    assert.match(markup, /stroke-width="2"/);
  }
});

test('direction-aware arrows flip, labelled icons are not hidden', () => {
  const arrow = renderToStaticMarkup(createElement(Icon, {
    name: 'arrow-right', size: 16, directional: true, label: 'Next',
  }));
  assert.match(arrow, /rtl:rotate-180/);
  assert.match(arrow, /aria-label="Next"/);
  assert.match(arrow, /role="img"/);
  assert.doesNotMatch(arrow, /aria-hidden="true"/);
  const names: IconName[] = ['arrow-right', 'arrow-up-right', 'chevron-right', 'chevron-left'];
  for (const name of names) assert.ok(renderToStaticMarkup(createElement(Icon, { name })));
});
