import assert from 'node:assert/strict';
import test from 'node:test';
import { chatDealGate } from './chatDealGate.js';

const work = 'work_verified' as const;
const id = 'id_verified' as const;

test('a deal under 100 USDC between verified people passes', () => {
  assert.deepEqual(chatDealGate({ amountUsdc: 99.99, buyer: 'person_verified', seller: work }), { ok: true });
});

test('a deal of 100 USDC or more waits until both have an ID check', () => {
  const r = chatDealGate({ amountUsdc: 100, buyer: work, seller: work });
  assert.equal(r.ok, false);
  assert.equal((r as { reason: string }).reason, 'needs_id');
  assert.deepEqual(chatDealGate({ amountUsdc: 250, buyer: id, seller: id }), { ok: true });
  assert.equal(chatDealGate({ amountUsdc: 250, buyer: id, seller: work }).ok, false);
});

test('a deal above the 1,000 USDC beta cap is refused', () => {
  const r = chatDealGate({ amountUsdc: 1000.01, buyer: id, seller: id });
  assert.equal((r as { reason: string }).reason, 'over_cap');
  assert.deepEqual(chatDealGate({ amountUsdc: 1000, buyer: id, seller: id }), { ok: true });
});

test('a buyer who has not passed the person check cannot fund', () => {
  assert.equal((chatDealGate({ amountUsdc: 20, buyer: 'registered', seller: work }) as { reason: string }).reason, 'not_verified');
});

test('every refusal explains itself in plain words', () => {
  for (const input of [
    { amountUsdc: 100, buyer: work, seller: work },
    { amountUsdc: 5000, buyer: id, seller: id },
    { amountUsdc: 20, buyer: 'registered' as const, seller: work },
  ]) {
    const r = chatDealGate(input);
    assert.equal(r.ok, false);
    assert.match((r as { message: string }).message, /usdc|verif/i);
  }
});
