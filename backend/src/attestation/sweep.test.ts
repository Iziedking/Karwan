import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DirectDeal } from '../db/deals.js';
import { attestable, settledViaDispute } from './sweep.js';

/// Which settlements we are willing to sign our name to.
///
/// Every case below is a deal that carries a settledAt and must still not produce
/// an attestation. That is the whole risk in this feature: an attestation is a
/// permanent, signed, public statement about a named counterparty, and the sweep
/// runs unattended. A false one costs more than a missing one, so eligibility
/// fails towards silence.
///
///   npx tsx --test src/attestation/sweep.test.ts

function deal(over: Partial<DirectDeal> = {}): DirectDeal {
  return {
    jobId: 'job-1',
    buyer: '0x1111111111111111111111111111111111111111',
    seller: '0x2222222222222222222222222222222222222222',
    dealAmountUsdc: '4200',
    firstReleasePct: 50,
    settledAt: Date.parse('2026-08-06T10:00:00.000Z'),
    createdAt: Date.parse('2026-08-01T10:00:00.000Z'),
    updatedAt: Date.parse('2026-08-06T10:00:00.000Z'),
    ...over,
  } as DirectDeal;
}

function reason(d: DirectDeal): string | null {
  const v = attestable(d);
  return v.ok ? null : v.reason;
}

test('a clean settled deal is attestable', () => {
  assert.equal(attestable(deal()).ok, true);
});

test('an open deal is not', () => {
  assert.match(reason(deal({ settledAt: undefined })) ?? '', /not settled/);
});

test('a cancelled deal is not, even with a settledAt on it', () => {
  // Both stamps can coexist on a deal that settled and was later unwound. Reading
  // settledAt alone would attest to a settlement whose money went back.
  assert.match(reason(deal({ cancelledAt: Date.now() })) ?? '', /cancelled/);
});

test('an unclaimed email invite is not, because the address belongs to nobody', () => {
  // The counterparty field holds a placeholder until the invite is claimed. An
  // attestation naming it would be a signed statement about a wallet that no
  // person controls.
  const d = deal({
    pendingCounterparty: { email: 'a@b.co', role: 'seller', inviteToken: 't' },
  });
  assert.match(reason(d) ?? '', /placeholder/);
});

test('a zero or malformed address is not', () => {
  assert.match(
    reason(deal({ seller: '0x0000000000000000000000000000000000000000' })) ?? '',
    /usable address/,
  );
  assert.match(reason(deal({ buyer: 'not-an-address' })) ?? '', /usable address/);
  assert.match(reason(deal({ buyer: undefined as unknown as string })) ?? '', /usable address/);
});

test('an unusable amount is not, rather than silently banding to the floor', () => {
  // amountBand maps NaN to 'under-100'. Left unguarded, a deal with a corrupt
  // amount would publish as a real settlement in the lowest band.
  assert.match(reason(deal({ dealAmountUsdc: 'abc' })) ?? '', /unusable deal amount/);
  assert.match(reason(deal({ dealAmountUsdc: '0' })) ?? '', /unusable deal amount/);
  assert.match(reason(deal({ dealAmountUsdc: '-5' })) ?? '', /unusable deal amount/);
});

test('a contested settlement is attestable, and marked as one', () => {
  // Not a judgement, an observation. A consumer reading a run of settlements
  // should be able to separate the clean ones from the contested ones; deciding
  // what that difference is worth is their job, not ours.
  assert.equal(settledViaDispute(deal()), false);
  assert.equal(settledViaDispute(deal({ disputed: true })), true);
  assert.equal(settledViaDispute(deal({ disputedAt: Date.now() })), true);
  // The arbiter split path stamps settledAt with cancelKind 'resolved', so it
  // reaches the sweep as a settlement and must not read as a clean one.
  const resolved = deal({ cancelKind: 'resolved', resolvedSellerBps: 6000 });
  assert.equal(attestable(resolved).ok, true);
  assert.equal(settledViaDispute(resolved), true);
});
