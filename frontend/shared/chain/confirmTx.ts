/// Deciding what happened to a submitted transaction.
///
/// A confirmation WAIT that runs out of time says nothing about the
/// transaction. It says the watcher stopped watching. Every web3 flow here used
/// to treat the two as the same thing: `waitForTransactionReceipt` with a 60
/// second cap, and its timeout error written straight into the record as a
/// failure. So a transfer that landed on Arc and sat there with hundreds of
/// confirmations was shown to the user as
///
///   Failed. Timed out while waiting for transaction with hash "0x…" to be
///   confirmed.
///
/// which is not merely a bad message, it is the wrong outcome. The money moved.
///
/// This module is the one place that answers the question, and it answers with
/// three states instead of two: the transaction succeeded, it reverted, or it is
/// not confirmed YET. Only a broken RPC throws.

export type ConfirmationOutcome =
  | { state: 'success'; blockNumber: bigint }
  | { state: 'reverted' }
  /// Not on chain yet, as far as this RPC can see. Never a failure: the caller
  /// keeps the movement open and asks again.
  | { state: 'pending' };

/// viem throws `WaitForTransactionReceiptTimeoutError` when its own wait window
/// closes, and `TransactionReceiptNotFoundError` when a direct lookup finds
/// nothing. Both mean "not yet", never "no".
export function isPendingReceiptError(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name ?? '';
  if (
    name === 'WaitForTransactionReceiptTimeoutError' ||
    name === 'TransactionReceiptNotFoundError' ||
    name === 'TransactionNotFoundError'
  ) {
    return true;
  }
  const message = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  return (
    message.includes('timed out while waiting for transaction') ||
    message.includes('transaction receipt with hash') ||
    message.includes('could not be found') ||
    message.includes('transaction with hash') && message.includes('could not be found')
  );
}

/// The minimum a client has to provide. Kept structural rather than importing
/// viem's `PublicClient` so this stays testable without a chain.
export interface ReceiptReader {
  getTransactionReceipt(args: { hash: `0x${string}` }): Promise<{
    status: 'success' | 'reverted';
    blockNumber: bigint;
  }>;
  waitForTransactionReceipt(args: {
    hash: `0x${string}`;
    timeout?: number;
    pollingInterval?: number;
    retryCount?: number;
  }): Promise<{ status: 'success' | 'reverted'; blockNumber: bigint }>;
}

export interface ConfirmOptions {
  /// How long to hold the wait open, in ms. Arc settles in under a second on a
  /// good day; this is sized for a bad one.
  timeoutMs?: number;
  pollingIntervalMs?: number;
}

export async function confirmTransaction(
  client: ReceiptReader,
  hash: `0x${string}`,
  options: ConfirmOptions = {},
): Promise<ConfirmationOutcome> {
  const timeout = options.timeoutMs ?? 90_000;
  const pollingInterval = options.pollingIntervalMs ?? 1_500;

  // Ask directly first. A transaction that is already mined (a resumed record,
  // a page reload, a retry after a timeout) is answered in one call, and the
  // watcher never starts.
  const direct = await lookup(client, hash);
  if (direct) return direct;

  try {
    const receipt = await client.waitForTransactionReceipt({
      hash,
      timeout,
      pollingInterval,
      retryCount: 8,
    });
    return receipt.status === 'success'
      ? { state: 'success', blockNumber: receipt.blockNumber }
      : { state: 'reverted' };
  } catch (err) {
    if (!isPendingReceiptError(err)) throw err;
    // The wait gave up. Ask once more before saying anything: the receipt very
    // often lands in the window between the last poll and the timeout, and this
    // is exactly the race that was being reported to users as a failure.
    const afterTimeout = await lookup(client, hash);
    return afterTimeout ?? { state: 'pending' };
  }
}

async function lookup(
  client: ReceiptReader,
  hash: `0x${string}`,
): Promise<ConfirmationOutcome | null> {
  try {
    const receipt = await client.getTransactionReceipt({ hash });
    return receipt.status === 'success'
      ? { state: 'success', blockNumber: receipt.blockNumber }
      : { state: 'reverted' };
  } catch (err) {
    if (isPendingReceiptError(err)) return null;
    throw err;
  }
}
