import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  createHighSignalVerification,
  highSignalBlockedMessage,
  highSignalForContext,
  isHighSignalVerified,
  requiresHighSignal,
  updateHighSignalParty,
} from './highSignalVerification.js';

test('high-signal deal policy requires only the selected party', () => {
    const seller = createHighSignalVerification('seller');
    assert.equal(requiresHighSignal('seller', 'seller'), true);
    assert.equal(requiresHighSignal('seller', 'buyer'), false);
    assert.equal(seller.buyer, undefined);
    assert.equal(isHighSignalVerified(seller, 'buyer'), true);
    assert.equal(isHighSignalVerified(seller, 'seller'), false);
});

test('high-signal deal policy requires both parties and unlocks independently', () => {
    const initial = createHighSignalVerification('both');
    assert.equal(isHighSignalVerified(initial, 'buyer'), false);
    assert.equal(isHighSignalVerified(initial, 'seller'), false);

    const buyerVerified = updateHighSignalParty(initial, 'buyer', {
      status: 'verified',
      verifiedAt: 123,
    });
    assert.equal(isHighSignalVerified(buyerVerified, 'buyer'), true);
    assert.equal(isHighSignalVerified(buyerVerified, 'seller'), false);
});

test('high-signal deal policy keeps unavailable and rejected proof blocked', () => {
    const pending = createHighSignalVerification('buyer');
    const unavailable = updateHighSignalParty(pending, 'buyer', { status: 'unavailable' });
    const rejected = updateHighSignalParty(pending, 'buyer', { status: 'rejected' });
    assert.equal(isHighSignalVerified(unavailable, 'buyer'), false);
    assert.equal(isHighSignalVerified(rejected, 'buyer'), false);
    assert.match(highSignalBlockedMessage('buyer'), /before funding/);
});

test('verification must match the exact agreement and environment; old receipts are preserved', () => {
  const verified = updateHighSignalParty(createHighSignalVerification('buyer'), 'buyer', {
    status: 'verified', environment: 'staging', agreementKey: '1:digest',
  });
  assert.equal(isHighSignalVerified(highSignalForContext(verified, '1:digest', 'staging'), 'buyer'), true);
  assert.equal(isHighSignalVerified(highSignalForContext(verified, '2:digest', 'staging'), 'buyer'), false);
  assert.equal(isHighSignalVerified(highSignalForContext(verified, '1:digest', 'production'), 'buyer'), false);
  const legacy = updateHighSignalParty(verified, 'buyer', { agreementKey: undefined });
  assert.equal(isHighSignalVerified(highSignalForContext(legacy, '1:digest', 'staging'), 'buyer'), false);
  assert.equal(verified.buyer?.status, 'verified');
});

test('route gate does not waive an agreed requirement based on provider configuration', () => {
    const source = readFileSync(new URL('../routes/deals.ts', import.meta.url), 'utf8');
    const gate = source.slice(source.indexOf('function highSignalGate('), source.indexOf('export const dealsRoutes'));
    assert.match(gate, /highSignalStateFor\(deal\)/);
    assert.match(gate, /isHighSignalVerified\(state, role, \{ allowSkip: WORLD_SKIP_ALLOWED \}\)/);
    // The only waiver is the testnet skip; mainnet never allows it.
    assert.match(source, /const WORLD_SKIP_ALLOWED = ARC\.testnet;/);
    assert.doesNotMatch(gate, /worldIdProofConfigured|WORLD_ID_ENABLED/);
});

test('a skip satisfies the gate only where skipping is allowed, and never counts as verified', () => {
  const state = updateHighSignalParty(createHighSignalVerification('seller'), 'seller', { status: 'skipped', agreementKey: 'v1' });
  assert.equal(isHighSignalVerified(state, 'seller', { allowSkip: true }), true);
  assert.equal(isHighSignalVerified(state, 'seller'), false);
  assert.equal(isHighSignalVerified(state, 'seller', { allowSkip: false }), false);
  // New terms need a new decision.
  assert.equal(highSignalForContext(state, 'v2', 'production').seller?.status, 'pending');
  assert.equal(highSignalForContext(state, 'v1', 'production').seller?.status, 'skipped');
});
