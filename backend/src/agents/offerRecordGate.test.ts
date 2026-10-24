import assert from 'node:assert/strict';
import test from 'node:test';
import { IdentityNeeded } from '../identity/suiteIdentity.js';
import { createOfferRecordGate, type OfferRecordGateDeps } from './offerRecordGate.js';

const SELLER = `0x${'b1'.repeat(20)}`;
const DAY_MS = 86_400_000;

function world(opts: { enabled?: boolean; hasRecord?: boolean } = {}) {
  const told = new Map<string, number>();
  const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
  let now = 1_800_000_000_000;
  const deps: OfferRecordGateDeps = {
    enabled: () => opts.enabled ?? true,
    requireIdentity: async () => {
      if (!opts.hasRecord) throw new IdentityNeeded('record_setup_needed');
    },
    lastTold: async (user) => told.get(user) ?? null,
    markTold: async (user, at) => {
      told.set(user, at);
    },
    emit: (e) => events.push(e),
    now: () => now,
  };
  return { gate: createOfferRecordGate(deps), events, tick: (ms: number) => (now += ms) };
}

test('a_seller_without_a_record_does_not_offer_and_is_told_once_a_day', async () => {
  const w = world();
  assert.equal(await w.gate.canOffer(SELLER), false);
  assert.equal(await w.gate.canOffer(SELLER), false);
  assert.deepEqual(w.events, [{ type: 'record.setup_needed', payload: { sellerUser: SELLER, reason: 'offers' } }]);
  w.tick(DAY_MS + 1);
  assert.equal(await w.gate.canOffer(SELLER), false);
  assert.equal(w.events.length, 2, 'told again the next day');
});

test('a_seller_with_a_record_offers_as_before', async () => {
  const w = world({ hasRecord: true });
  assert.equal(await w.gate.canOffer(SELLER), true);
  assert.deepEqual(w.events, []);
});

test('nothing_changes_while_the_escrow_family_is_off', async () => {
  const w = world({ enabled: false });
  assert.equal(await w.gate.canOffer(SELLER), true);
  assert.deepEqual(w.events, []);
});
