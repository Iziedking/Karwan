import assert from 'node:assert/strict';
import test from 'node:test';
import { canonUpdated, canonVersion, findDocs, findFacts, isStatable } from './canon.js';

test('published canon describes Karwan as an open local and cross-border market', () => {
  const overview = findFacts({ q: 'open market' }).find((fact) => fact.id === 'what-karwan-is');
  assert.ok(overview);
  assert.equal(overview.id, 'what-karwan-is');
  assert.equal(isStatable(overview), true);
  assert.match(overview.summary, /open market for secure local and cross-border trade/);

  const [doc] = findDocs([overview.id]);
  assert.ok(doc);
  assert.match(doc.body, /direct deal with a known counterparty/);
  assert.match(doc.body, /open buyer request/);
  assert.match(doc.body, /Local trade does not mean local-currency\s+payment is live/);
});

test('roadmap entries are discoverable but cannot be stated as live', () => {
  const [browser] = findFacts({ q: 'browser companion' });
  const [payout] = findFacts({ q: 'local payout' });
  assert.ok(browser);
  assert.ok(payout);
  assert.equal(browser.status, 'roadmap');
  assert.equal(browser.blockedBy, 'not-live');
  assert.equal(isStatable(browser), false);
  assert.equal(payout.status, 'roadmap');
  assert.equal(isStatable(payout), false);
  assert.deepEqual(findFacts({ q: 'browser companion', liveOnly: true }), []);
  assert.deepEqual(findFacts({ q: 'local payout', liveOnly: true }), []);
});

test('canon version records the market-definition update', () => {
  assert.equal(canonVersion, '0.2.0');
  assert.equal(canonUpdated, '2026-09-01');
});
