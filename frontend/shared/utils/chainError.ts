import type { Messages } from '@/shared/i18n/messages/en';

/// Turn any on-chain / SDK / wallet failure into one clean line.
///
/// Chain errors are written for engineers. Circle's SDK returns things like
/// "Gateway API error: HTTP 400 - — Insufficient total maxFee across intents to
/// cover forwarding fee. Required additional: 0.05936", and wallets return
/// stack-laden RPC objects. None of that belongs on a card.
///
/// This NEVER returns the raw message. An unrecognised failure falls back to the
/// caller's own copy, so a new SDK string can't leak into the UI just because we
/// have not matched it yet. That is the whole point: the default is safe, and
/// matching only makes the message MORE specific, never more raw.
export function chainErrorMessage(
  err: unknown,
  copy: Messages['chainErrors'],
  fallback: string,
): string {
  const raw = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  if (!raw) return fallback;

  // The user said no in their wallet. Not a failure, and never worth alarming
  // copy.
  if (
    raw.includes('user rejected') ||
    raw.includes('user denied') ||
    raw.includes('rejected the request') ||
    raw.includes('action_rejected')
  ) {
    return copy.declined;
  }

  // Gateway deducts a forwarding fee from the spend, so the full pooled balance
  // is never quite spendable. This is the error behind "Move max".
  if (
    raw.includes('maxfee') ||
    raw.includes('forwarding fee') ||
    raw.includes('required additional')
  ) {
    return copy.feeHeadroom;
  }

  // Native gas, distinct from USDC: worth its own line, because the fix is
  // different (claim gas, not lower the amount).
  if (
    raw.includes('insufficient funds for gas') ||
    raw.includes('gas required exceeds') ||
    raw.includes('out of gas')
  ) {
    return copy.needsGas;
  }

  if (
    raw.includes('insufficient') ||
    raw.includes('exceeds balance') ||
    raw.includes('transfer amount exceeds')
  ) {
    return copy.notEnough;
  }

  if (
    raw.includes('nonce') ||
    raw.includes('replacement transaction underpriced') ||
    raw.includes('already known')
  ) {
    return copy.walletBusy;
  }

  if (
    raw.includes('chain mismatch') ||
    raw.includes('unsupported chain') ||
    raw.includes('wrong network') ||
    raw.includes('does not match the target chain')
  ) {
    return copy.wrongChain;
  }

  if (
    raw.includes('fetch failed') ||
    raw.includes('network error') ||
    raw.includes('timeout') ||
    raw.includes('timed out') ||
    raw.includes('econnreset') ||
    raw.includes('503') ||
    raw.includes('502')
  ) {
    return copy.network;
  }

  return fallback;
}
