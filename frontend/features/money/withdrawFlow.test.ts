import test from 'node:test';
import assert from 'node:assert/strict';
import { shortAddr, withdrawCheck, withdrawSplit, withdrawTargets } from './withdrawFlow';

const ADDR = '0x52b100000000000000000000000000000000e7A0';

test('anEmailAccountHasNoWalletOfItsOwnToSendTo', () => {
  assert.deepEqual(withdrawTargets('email'), ['otherWallet', 'karwan']);
  assert.deepEqual(withdrawTargets('wallet'), ['ownWallet', 'otherWallet', 'karwan']);
});

test('withdrawCountsOnlyWhatIsReadyAndNamesTheRest', () => {
  assert.deepEqual(withdrawSplit({ ready: 837.902799, pool: 105.54, agents: 599.15 }), { ready: 837.9, elsewhere: 704.69 });
  assert.deepEqual(withdrawSplit({ ready: null, pool: 0, agents: 0 }), { ready: 0, elsewhere: 0 });
});

test('aWithdrawalNeedsAnAddressAnAmountAndNoMoreThanIsReady', () => {
  assert.deepEqual(withdrawCheck({ address: '0x12', amount: 5, ready: 10 }), { ok: false, reason: 'address' });
  assert.deepEqual(withdrawCheck({ address: ADDR, amount: null, ready: 10 }), { ok: false, reason: 'amount' });
  assert.deepEqual(withdrawCheck({ address: ADDR, amount: 0, ready: 10 }), { ok: false, reason: 'amount' });
  assert.deepEqual(withdrawCheck({ address: ADDR, amount: 10.01, ready: 10 }), { ok: false, reason: 'over' });
  assert.deepEqual(withdrawCheck({ address: ` ${ADDR} `, amount: 10, ready: 10 }), { ok: true });
});

test('theAddressReadsShortOnTheReview', () => {
  assert.equal(shortAddr(ADDR), '0x52b1…e7A0');
});
