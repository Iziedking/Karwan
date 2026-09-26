import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SOCIAL_TRADE_EXAMPLES, SOCIAL_EXAMPLE_INTERVAL_MS } from './socialTradeExamples';
import { socialTradeCopy } from '../../shared/i18n/messages/socialTrade';
import { canRotateStory } from './capabilityStory';
import { nextTradeIntentIndex } from './tradeIntentRotation';
import { tradeEntryRoutes } from './tradeEntry';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('social examples are identified only as illustrative trades', () => {
  assert.deepEqual(SOCIAL_TRADE_EXAMPLES.map(item => item.id), ['tiktok','instagram','facebook','x','linkedin']);
  assert.equal(SOCIAL_TRADE_EXAMPLES[0].amount, 1240);
  assert.match(socialTradeCopy.en.examples.tiktok.title, /200.*tote bags/);
  assert.equal(socialTradeCopy.en.disclaimer, 'Illustrative trades');
  assert.match(socialTradeCopy.en.draft, /Draft/);
});

test('all social trade examples are fully translated and have valid illustrative terms', () => {
  const keys = Object.keys(socialTradeCopy.en).sort();
  for (const copy of Object.values(socialTradeCopy)) {
    assert.deepEqual(Object.keys(copy).sort(), keys);
    assert.deepEqual(Object.keys(copy.examples), SOCIAL_TRADE_EXAMPLES.map(item => item.id));
    for (const item of SOCIAL_TRADE_EXAMPLES) {
      for (const value of Object.values(copy.examples[item.id])) assert.ok(value.trim());
      assert.ok(Number.isInteger(item.amount) && item.amount > 0);
      assert.ok(Number.isInteger(item.days) && item.days > 0);
    }
  }
});

test('rotation supports every interruption and wraps safely at a slow reading pace', () => {
  const state = { paused:false, reduced:false, hovered:false, visible:true, inView:true };
  assert.ok(SOCIAL_EXAMPLE_INTERVAL_MS >= 9000);
  assert.ok(canRotateStory(state));
  for (const key of ['paused','reduced','hovered'] as const) assert.equal(canRotateStory({...state,[key]:true}), false);
  for (const key of ['visible','inView'] as const) assert.equal(canRotateStory({...state,[key]:false}), false);
  assert.equal(nextTradeIntentIndex(4, SOCIAL_TRADE_EXAMPLES.length), 0);
});

test('the real entry is separate from the phone, with no sample money or terms in the URL', () => {
  assert.equal(tradeEntryRoutes(false).agreement, '/buyer?mode=direct#new-deal');
  const component = read('./components/SocialTradeSection.tsx');
  assert.match(component, /href=\{tradeEntryRoutes\(false\).agreement\}/);
  assert.equal((component.match(/<Link\s/g) || []).length, 1);
  assert.doesNotMatch(component, /api\.|fetch\(|sourceRef|amount=|terms=/);
});

test('selection and keyboard focus stop autoplay, and the observer/timer clean up', () => {
  const component = read('./components/SocialTradeSection.tsx');
  assert.match(component, /onFocusCapture=\{event =>/);
  assert.match(component, /event.target.closest\('button'\)\) setPaused\(true\)/);
  assert.doesNotMatch(component, /data-playback-control|t\.pause|t\.play/);
  assert.match(component, /setIndex\(itemIndex\); setPaused\(true\)/);
  assert.match(component, /aria-pressed=\{index === itemIndex\}/);
  assert.match(component, /aria-live=\{paused \? 'polite' : 'off'\}/);
  assert.match(component, /visibilitychange/);
  assert.match(component, /observer.disconnect\(\)/);
  assert.match(component, /window.clearInterval\(timer\)/);
});

test('the reference composition uses Karwan green, with readable stopped frames and motion-off support', () => {
  const css = read('./components/SocialTradeSection.module.css');
  assert.match(css, /min-height: 100svh/);
  assert.match(css, /--social-action: var\(--karwan-green\)/);
  assert.match(css, /--social-draft: var\(--karwan-green\)/);
  assert.doesNotMatch(css, /#d4ff00|#e2ff57|#c18aff/i);
  assert.match(css, /\.platformButton:hover:not\(\[aria-pressed='true'\]\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /data-running='false'[^\n]+animation: none/);
  assert.doesNotMatch(css, /animation-play-state: paused|backdrop-filter/);
  assert.match(css, /:dir\(rtl\)/);
});

test('platform marks get clear space and the landing has no playback controls', () => {
  const css = read('./components/SocialTradeSection.module.css');
  const component = read('./components/SocialTradeSection.tsx');
  const page = read('../../app/page.tsx');
  const landingCss = read('../../app/landing.module.css');
  const footer = read('../../shared/components/SiteFooter.tsx');
  assert.match(css, /data-platform='linkedin'\] \{ inset-inline-end: 1%; top: 2%/);
  assert.match(css, /@media \(max-width: 1320px\)/);
  assert.match(css, /\.stage \{ padding-block: 96px; \}/);
  assert.doesNotMatch(component, /'▷'|'Ⅱ'/);
  assert.doesNotMatch(page + component + footer + landingCss, /videoControl|motionControl|data-playback-control|messages\.common\.pause/);
  assert.match(landingCss, /background: var\(--karwan-green\)/);
});
