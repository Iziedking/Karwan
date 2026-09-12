import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TRADE_ENTRY_COPY, tradeEntryRoutes } from './tradeEntry';
import { TradeStart } from './components/TradeStart';

test('entry routes reach real personal and business surfaces without changing workspace', () => {
  assert.equal(tradeEntryRoutes(false).buy, '/buyer?mode=managed#new-deal');
  assert.equal(tradeEntryRoutes(false).sell, '/seller#post-listing');
  assert.equal(tradeEntryRoutes(true).sell, '/supply');
  assert.equal(tradeEntryRoutes(true).buy, '/partners');
  assert.equal(tradeEntryRoutes(true).agreement, '/buyer?mode=direct#bring-a-deal');
  assert.equal(tradeEntryRoutes(false).agreement, '/buyer?mode=direct#new-deal');
});

test('business entry describes the business catalogue, not the personal brief form', () => {
  const html = renderToStaticMarkup(createElement(TradeStart, { business: true }));
  assert.match(html, /Browse what businesses offer/);
  assert.match(html, /href="\/partners"/);
  assert.doesNotMatch(html, /Describe what you need, your budget and your deadline/);
});

test('home explains both sides of trade with one heading and no prerequisite jargon', () => {
  const html = renderToStaticMarkup(createElement(TradeStart));
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.equal((html.match(/<a\b/g) ?? []).length, 3);
  assert.match(html, /Find customers/);
  assert.match(html, /Find something to buy/);
  assert.match(html, /other websites is planned/);
  assert.doesNotMatch(html, /stake|pooled|workspace|research credit|<button/);
});

test('every supported language includes all entry labels', () => {
  const keys = Object.keys(TRADE_ENTRY_COPY.en).sort();
  for (const copy of Object.values(TRADE_ENTRY_COPY)) {
    assert.deepEqual(Object.keys(copy).sort(), keys);
    assert.ok(Object.values(copy).every((value) => value.trim()));
  }
});
