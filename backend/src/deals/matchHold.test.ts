import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '../db/deals.js';
import { clearMatchHold, holdOpenFor, matchHoldForParty, sharedHoldLine } from './matchHold.js';

/// A match the security agent held: advisory, cleared by a person with a
/// reason, each side reading only its own lines (view 21).
///
///   npx tsx --test src/deals/matchHold.test.ts

const NOW = 1_800_000_000_000;
const REASON = 'Checked the earlier deal: the flagged link was the seller own site, cleared on review.';

function held(over: Partial<DirectDeal> = {}): DirectDeal {
  return {
    jobId: '0xd68f', buyer: '0xbuyer', seller: '0xseller', dealAmountUsdc: '104.66',
    matchRisk: {
      decision: 'hold',
      flags: ['link-offense'],
      reason: 'The buyer has prior unsafe-link offenses on record (1).',
      reasons: [{ text: 'The buyer has prior unsafe-link offenses on record (1).', audience: 'seller' }],
      paidConsulted: false,
      evaluatedAt: NOW - 60_000,
    },
    ...over,
  } as DirectDeal;
}

test('a hold is open until it is cleared or the deal closes', () => {
  assert.ok(holdOpenFor(held()));
  assert.equal(holdOpenFor(held({ settledAt: NOW })), null);
  assert.equal(holdOpenFor(held({ cancelledAt: NOW })), null);
  const cleared = held();
  cleared.matchRisk!.clearedAt = NOW;
  assert.equal(holdOpenFor(cleared), null);
  const flag = held();
  flag.matchRisk!.decision = 'flag';
  assert.equal(holdOpenFor(flag), null);
  assert.equal(holdOpenFor({ matchRisk: undefined }), null);
});

test('one person clears a hold with a reason; the record keeps who, when and why', () => {
  const out = clearMatchHold(held(), { role: 'support', reason: REASON }, NOW);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.matchRisk.clearedAt, NOW);
  assert.equal(out.matchRisk.clearedBy, 'support');
  assert.equal(out.matchRisk.clearReason, REASON);
  assert.equal(out.matchRisk.decision, 'hold', 'the original decision stays for the audit trail');
});

test('a clear is refused on a closed deal, a match that is not held, one already cleared, or without a reason', () => {
  const closed = clearMatchHold(held({ settledAt: NOW }), { role: 'admin', reason: REASON }, NOW);
  assert.deepEqual(closed.ok ? null : closed.code, 'closed');
  const flag = held();
  flag.matchRisk!.decision = 'flag';
  const notHeld = clearMatchHold(flag, { role: 'admin', reason: REASON }, NOW);
  assert.deepEqual(notHeld.ok ? null : notHeld.code, 'not-held');
  const none = clearMatchHold({ matchRisk: undefined }, { role: 'admin', reason: REASON }, NOW);
  assert.deepEqual(none.ok ? null : none.code, 'not-held');
  const twice = held();
  twice.matchRisk!.clearedAt = NOW - 1;
  const again = clearMatchHold(twice, { role: 'admin', reason: REASON }, NOW);
  assert.deepEqual(again.ok ? null : again.code, 'already-cleared');
  const short = clearMatchHold(held(), { role: 'admin', reason: 'ok' }, NOW);
  assert.deepEqual(short.ok ? null : short.code, 'reason-required');
});

test('each side reads the shared line and its own lines, never the other side line', () => {
  const buyer = matchHoldForParty(held(), 'buyer');
  const seller = matchHoldForParty(held(), 'seller');
  assert.deepEqual(buyer, { decision: 'hold', lines: [sharedHoldLine(['link-offense'])], paidConsulted: false });
  assert.deepEqual(seller?.lines, [sharedHoldLine(['link-offense']), 'The buyer has prior unsafe-link offenses on record (1).']);
  assert.ok(!JSON.stringify(buyer).includes('offenses'), 'the buyer never receives the line about their own record');
});

test('legacy bare-string reasons read as shared, a cleared hold shows nothing, a flag shows only when a line fits', () => {
  const legacy = held();
  legacy.matchRisk!.reasons = ['Price is well above similar deals.'];
  legacy.matchRisk!.flags = ['off-market'];
  assert.deepEqual(matchHoldForParty(legacy, 'buyer')?.lines, [sharedHoldLine(['off-market']), 'Price is well above similar deals.']);

  const cleared = held();
  cleared.matchRisk!.clearedAt = NOW;
  assert.equal(matchHoldForParty(cleared, 'buyer'), null);
  assert.equal(matchHoldForParty(cleared, 'seller'), null);

  const flag = held();
  flag.matchRisk!.decision = 'flag';
  assert.equal(matchHoldForParty(flag, 'buyer'), null, 'advisory and nothing addressed to the buyer');
  assert.deepEqual(matchHoldForParty(flag, 'seller'), { decision: 'flag', lines: ['The buyer has prior unsafe-link offenses on record (1).'], paidConsulted: false });
});

test('the shared line names the kind of signal, never the person', () => {
  assert.match(sharedHoldLine(['link-offense']), /delivery link from one side/);
  assert.match(sharedHoldLine(['honey-trap']), /held this match/);
  assert.doesNotMatch(sharedHoldLine(['link-offense']), /buyer|seller/);
});
