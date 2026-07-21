/// Turns whatever a BACKEND transfer failed with into something a person can
/// act on. The wallet-path equivalent lives in useBridge.ts as
/// `friendlyBridgeError`, which is chain-aware and handles wallet rejections;
/// this one handles failures that came back from the server or were persisted
/// on a bridge record.
///
/// Transfer errors arrive from three places and only one of them was ever
/// written for a human: a backend `detail` string, an SSE `bridge.error`
/// payload, and the `error` column persisted on a bridge record. The last two
/// carry internal operation labels — a real one users saw on screen was
/// `circle-bridge.burn(sepolia-circle-0x7711…-1784624604059): Circle tx FAILED`
/// — which tells them nothing and looks broken.
///
/// So nothing raw is ever rendered. A known cause maps to copy that says what
/// happened and what to do; anything unrecognised falls back to a plain line.
/// The raw text still goes to the console and the backend logs, where it is
/// useful.

/// Ordered: the first pattern that matches wins, so put specific causes above
/// general ones. Matching is done on a lowercased copy of the message.
const RULES: Array<{ match: RegExp; message: string }> = [
  {
    // The deposit wallet has no native token for the source-chain fee. The
    // backend's own 409 says which chain and which address; this covers the
    // same cause arriving through a different path.
    match: /out of gas|insufficient funds for gas|gas required exceeds/,
    message:
      'The wallet on that chain is short of the network fee. Send a little of that chain’s native token to it, then try again.',
  },
  {
    match: /insufficient|balance too low|exceeds balance/,
    message: 'There is not enough USDC to cover this transfer. Lower the amount and try again.',
  },
  {
    // Circle reported the transaction itself failed. On Arc an SCA userOp can
    // report success at the outer layer while the inner call reverts, so this
    // is a real terminal failure and not a timeout.
    match: /circle tx failed|tx failed|transaction failed|reverted/,
    message: 'The transfer did not go through and no money moved. Try again.',
  },
  {
    match: /failed to fetch|network error|econnrefused|timeout|timed out|etimedout/,
    message: 'Could not reach the transfer service. Check your connection and try again.',
  },
  {
    match: /attestation/,
    message:
      'Still waiting on the network to confirm this transfer. It usually clears on its own; recheck in a few minutes.',
  },
  {
    match: /receivemessage|mint/,
    message: 'The transfer left the source chain but has not landed yet. Recheck on chain to retry.',
  },
  {
    match: /unauthorized|forbidden|sign in/,
    message: 'Your session expired. Sign in again and retry.',
  },
  {
    match: /rate.?limit|too many requests/,
    message: 'The network is rate-limiting us right now. Wait a moment and try again.',
  },
  {
    match: /user rejected|user denied|rejected the request/,
    message: 'You dismissed the wallet prompt, so nothing was sent.',
  },
];

const GENERIC = 'This transfer did not complete. Try again in a moment.';

/// True when a string looks like it was written for a human rather than for a
/// log: no internal operation label, no bare hash or id, and not a stack trace.
/// The backend does emit genuinely user-facing `detail` prose (the out-of-gas
/// 409 names the chain, the amount and the address), and that is worth showing
/// verbatim — but only when it actually reads as prose.
function looksHumanWritten(text: string): boolean {
  if (text.length < 15 || text.length > 400) return false;
  if (/\w+\.\w+\(/.test(text)) return false; // circle-bridge.burn(...)
  if (/0x[0-9a-f]{16,}/i.test(text)) return false; // raw hash or long id
  if (/\bat\s+\w+\s+\(/.test(text)) return false; // stack frame
  if (/[{}[\]]/.test(text)) return false; // serialised object
  return /^[A-Z]/.test(text.trim()) && /[.!?]$/.test(text.trim());
}

/// Map a transfer failure to copy worth showing. Pass whatever you have; both
/// arguments are optional and either may be raw.
export function humanTransferError(raw?: unknown, detail?: unknown): string {
  const rawText = typeof raw === 'string' ? raw : raw instanceof Error ? raw.message : '';
  const detailText = typeof detail === 'string' ? detail : '';
  const haystack = `${rawText} ${detailText}`.toLowerCase();

  for (const rule of RULES) {
    if (rule.match.test(haystack)) return rule.message;
  }
  // No known cause. Prefer a backend detail that already reads as prose, since
  // it is more specific than anything generic we could write here.
  if (looksHumanWritten(detailText)) return detailText;
  if (looksHumanWritten(rawText)) return rawText;
  return GENERIC;
}
