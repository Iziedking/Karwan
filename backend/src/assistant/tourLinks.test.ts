import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNavigateAction } from './actions.js';

/// "Show me around" from the assistant (view 57, 15 Nov evening): a button on
/// the website and a link in chat apps that opens the page and starts its tour.

test('the assistant can open Home, Market or Money with its tour running', () => {
  for (const [destination, href] of [['tour_home', '/app?tour=1'], ['tour_market', '/market?tour=1'], ['tour_money', '/account?tour=1']] as const) {
    const built = buildNavigateAction({ destination });
    assert.ok(!('error' in built), destination);
    if (!('error' in built)) {
      assert.equal(built.href, href);
      assert.match(built.label, /show me around/i);
    }
  }
});
