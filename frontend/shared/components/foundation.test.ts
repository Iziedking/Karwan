import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Icon, GlobeIcon, WalletIcon, BuyerIcon, type IconName } from './Icon';
import { ease, dur } from '../motion/tokens';

const css = () => readFileSync(new URL('../../app/design-tokens.css', import.meta.url), 'utf8');

test('canonical theme has approved palettes, shapes and inline aliases', () => {
  const source = css();
  for (const value of ['#EEF2F7', '#0E141B', '#FFFFFF', '#16202A', '#AFC95B', '#F8FAFC', '#0F161D', '#151E27']) {
    assert.ok(source.includes(value), value);
  }
  for (const declaration of [
    '--radius-card: 20px', '--radius-panel: 28px', '--radius-input: 14px',
    '--lp-dark: var(--ink)', '--lp-light: var(--canvas)',
    '--lp-card: var(--surface)', '--color-offer: var(--offer)',
    '--color-request: var(--request)', '--ease-out: var(--ease-ui)',
  ]) assert.ok(source.includes(declaration), declaration);
  assert.match(source, /@theme inline/);
  assert.match(source, /:root\s*\{/);
  assert.match(source, /html\[data-theme="dark"\]\s*\{/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.ok(source.includes('--dur-small: 0ms'));
  assert.ok(source.includes('--dur-panel: 0ms'));
});

test('JS easing and durations match the canonical CSS contract', () => {
  assert.deepEqual(ease.out, [0.22, 1, 0.36, 1]);
  assert.deepEqual(ease.in, ease.out);
  assert.deepEqual(ease.inOut, ease.out);
  assert.equal(dur.fast, 0.2);
  assert.equal(dur.sheet, 0.4);
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
