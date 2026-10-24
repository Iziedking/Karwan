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

test('canon version records the Canteen window features', () => {
  assert.equal(canonVersion, '0.4.0');
  assert.equal(canonUpdated, '2026-10-24');
});

test('agent record checks and risk-based World ID are statable, with testnet named', () => {
  for (const id of ['agent-record-checks', 'world-id-risk-checks']) {
    const fact = findFacts().find((f) => f.id === id);
    assert.ok(fact, id);
    assert.equal(isStatable(fact), true, id);
    assert.match(fact.summary, /Testnet/, id);
  }
});

test('escrow families and social lookups are discoverable but never stated as live', () => {
  for (const id of ['escrow-families-roadmap', 'social-lookups-roadmap']) {
    const fact = findFacts().find((f) => f.id === id);
    assert.ok(fact, id);
    assert.equal(isStatable(fact), false, id);
  }
});

test('the network fact names both mainnet contracts and says mainnet escrow is off', () => {
  const [doc] = findDocs(['proof-network']);
  assert.ok(doc);
  const text = doc.body;
  assert.match(text, /0xa8E41F941b44CA091E3Ab7b600fe1484838aE27D/);
  assert.match(text, /0x69eA60B6EFd13A126Eb00d25aB0f21A4AfC636eF/);
  assert.match(text, /Mainnet escrow is not enabled/);
});

test('the canon leads with unified reputation and keeps it off the live list', () => {
  const overview = findFacts({ q: 'open market' }).find((fact) => fact.id === 'what-karwan-is');
  assert.match(overview?.summary ?? '', /^Karwan unifies online reputation/);
  const direction = findFacts({ q: 'unified reputation' }).find((fact) => fact.id === 'unified-reputation-roadmap');
  assert.ok(direction);
  assert.equal(isStatable(direction), false);
});
