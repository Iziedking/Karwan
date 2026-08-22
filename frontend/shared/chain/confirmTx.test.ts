import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ConfirmationPending,
  confirmTransaction,
  isConfirmationPending,
  isPendingReceiptError,
  requireConfirmedTx,
  type ReceiptReader,
} from './confirmTx';

const HASH = '0x322c6e8d8660e91652015f7509fc12a3591bbfd16a7506ff7fd105769c616e09' as const;

function timeoutError(): Error {
  const err = new Error(
    `Timed out while waiting for transaction with hash "${HASH}" to be confirmed.`,
  );
  err.name = 'WaitForTransactionReceiptTimeoutError';
  return err;
}

function notFoundError(): Error {
  const err = new Error(`Transaction receipt with hash "${HASH}" could not be found.`);
  err.name = 'TransactionReceiptNotFoundError';
  return err;
}

/// A client that answers `getTransactionReceipt` from a script of outcomes, one
/// per call, and always times out the wait.
function reader(script: Array<'missing' | 'success' | 'reverted'>): ReceiptReader & { calls: number } {
  const client = {
    calls: 0,
    async getTransactionReceipt() {
      const next = script[client.calls] ?? 'missing';
      client.calls += 1;
      if (next === 'missing') throw notFoundError();
      return { status: next, blockNumber: 58120502n } as const;
    },
    async waitForTransactionReceipt() {
      throw timeoutError();
    },
  };
  return client;
}

test('a wait that times out is pending, never failed', () => {
  // The whole point. This is the case that was being written into the user's
  // receipt as "Failed" with a viem stack message.
  assert.equal(isPendingReceiptError(timeoutError()), true);
  assert.equal(isPendingReceiptError(notFoundError()), true);
  assert.equal(isPendingReceiptError(new Error('insufficient funds')), false);
});

test('an already-mined transaction is answered without starting a watcher', async () => {
  const client = reader(['success']);
  let waited = false;
  const outcome = await confirmTransaction(
    {
      ...client,
      async waitForTransactionReceipt() {
        waited = true;
        throw timeoutError();
      },
    },
    HASH,
  );
  assert.deepEqual(outcome, { state: 'success', blockNumber: 58120502n });
  assert.equal(waited, false);
});

test('the receipt that lands during the timeout window is still found', async () => {
  // First lookup misses, the wait times out, and the second lookup finds it.
  // Without that second lookup this is the exact race that reported a
  // confirmed transfer as a failure.
  const client = reader(['missing', 'success']);
  const outcome = await confirmTransaction(client, HASH, { timeoutMs: 10 });
  assert.deepEqual(outcome, { state: 'success', blockNumber: 58120502n });
  assert.equal(client.calls, 2);
});

test('a transaction nobody can see yet is pending', async () => {
  const client = reader(['missing', 'missing']);
  const outcome = await confirmTransaction(client, HASH, { timeoutMs: 10 });
  assert.deepEqual(outcome, { state: 'pending' });
});

test('a reverted transaction is reverted, not pending', async () => {
  const client = reader(['reverted']);
  const outcome = await confirmTransaction(client, HASH, { timeoutMs: 10 });
  assert.deepEqual(outcome, { state: 'reverted' });
});

test('a broken RPC still throws rather than reading as pending', async () => {
  const broken: ReceiptReader = {
    async getTransactionReceipt() {
      throw new Error('HTTP request failed: 503');
    },
    async waitForTransactionReceipt() {
      throw new Error('HTTP request failed: 503');
    },
  };
  await assert.rejects(() => confirmTransaction(broken, HASH), /503/);
});

// ------------------------------------------------- the three-state wrapper

test('a confirmed transaction returns its block', async () => {
  const block = await requireConfirmedTx(reader(['success']), HASH, 'reverted');
  assert.equal(block, 58120502n);
});

test('a reverted transaction throws the caller words, not a chain error', async () => {
  await assert.rejects(
    () => requireConfirmedTx(reader(['reverted']), HASH, 'The network rejected it.'),
    (err: Error) => {
      assert.equal(err.message, 'The network rejected it.');
      assert.equal(isConfirmationPending(err), false);
      return true;
    },
  );
});

test('an unconfirmed transaction throws something a caller can recognise', async () => {
  // The distinction the whole module is for: this must not read as a failure.
  await assert.rejects(
    () => requireConfirmedTx(reader(['missing', 'missing']), HASH, 'reverted'),
    (err: Error) => {
      assert.ok(isConfirmationPending(err));
      assert.equal((err as ConfirmationPending).txHash, HASH);
      return true;
    },
  );
});

test('pending is recognised across a module boundary', () => {
  // Bundlers can duplicate a class, so `instanceof` alone is not enough to
  // decide whether a money record gets marked failed.
  const impostor = Object.assign(new Error('nope'), { name: 'ConfirmationPending' });
  assert.ok(isConfirmationPending(impostor));
  assert.equal(isConfirmationPending(new Error('nope')), false);
  assert.equal(isConfirmationPending(null), false);
});
