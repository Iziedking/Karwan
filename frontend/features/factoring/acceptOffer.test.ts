import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptErrorKind, acceptOffer } from './acceptOffer';

/// Accepting an early-payment offer fails in a few known ways; each one gets a
/// plain sentence instead of a raw revert. Unknown errors pass through.
///
///   npx tsx --test features/factoring/acceptOffer.test.ts

test('known accept failures are recognised', () => {
  assert.equal(acceptErrorKind('execution reverted: transferWithAuthorization: invalid signature'), 'authorization');
  assert.equal(acceptErrorKind('receipt-reconciliation-required'), 'reconcile');
  assert.equal(acceptErrorKind('AlreadyAssigned()'), 'alreadyAssigned');
  assert.equal(acceptErrorKind('PoDLocked'), 'windowClosed');
  assert.equal(acceptErrorKind('advance and assignment failed'), 'notAccepted');
});

test('anything else is shown as it came', () => {
  assert.equal(acceptErrorKind('network down'), null);
});

test('accepting never sends from the browser wallet: the escrow names the seller agent, so Karwan sends it', async () => {
  const calls: unknown[] = [];
  const accept = async (body: { offerId: string; assignTxHash?: string }) => {
    calls.push(body);
    return { offer: { id: body.offerId, status: 'accepted' } as never };
  };
  await acceptOffer({ id: 'o1' } as never, accept);
  assert.deepEqual(calls, [{ offerId: 'o1', assignTxHash: undefined }]);
});

test('a previous accept that landed on chain is finished, not sent twice', async () => {
  const calls: unknown[] = [];
  const accept = async (body: { offerId: string; assignTxHash?: string }) => {
    calls.push(body);
    return { offer: { id: body.offerId } as never };
  };
  await acceptOffer({ id: 'o2', advanceTxHash: '0xabc' } as never, accept);
  assert.deepEqual(calls, [{ offerId: 'o2', assignTxHash: '0xabc' }]);
});
