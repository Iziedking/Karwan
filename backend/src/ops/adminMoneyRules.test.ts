import assert from 'node:assert/strict';
import test from 'node:test';
import { ESCROW_STATE } from '../chain/contracts.js';
import { forceCancelVerdict, resetHistoryVerdict } from './adminMoneyRules.js';

///   npx tsx --test src/ops/adminMoneyRules.test.ts

test('force-cancel is refused while the escrow holds money, or cannot be read', () => {
  for (const state of [ESCROW_STATE.Funded, ESCROW_STATE.Accepted, ESCROW_STATE.Disputed]) {
    const v = forceCancelVerdict({ everFunded: true, escrow: { state } });
    assert.equal(v.ok, false, String(state));
    assert.equal(!v.ok && v.code, 'ESCROW_HOLDS_MONEY');
  }
  const unread = forceCancelVerdict({ everFunded: true, escrow: 'unreadable' });
  assert.equal(!unread.ok && unread.code, 'ESCROW_UNREADABLE');
});

test('force-cancel closes a deal whose escrow holds nothing', () => {
  for (const state of [ESCROW_STATE.None, ESCROW_STATE.Settled, ESCROW_STATE.Refunded]) {
    assert.equal(forceCancelVerdict({ everFunded: true, escrow: { state } }).ok, true, String(state));
  }
  assert.equal(forceCancelVerdict({ everFunded: false, escrow: null }).ok, true);
});

test('reset-history needs the address typed again and never runs on mainnet', () => {
  const address = '0xAbC0000000000000000000000000000000000001';
  assert.equal(resetHistoryVerdict({ address, confirm: undefined, network: 'testnet' }).ok, false);
  assert.equal(resetHistoryVerdict({ address, confirm: '0xabc', network: 'testnet' }).ok, false);
  assert.equal(resetHistoryVerdict({ address, confirm: address.toLowerCase(), network: 'testnet' }).ok, true);
  const main = resetHistoryVerdict({ address, confirm: address, network: 'mainnet' });
  assert.equal(!main.ok && main.code, 'MAINNET');
});
