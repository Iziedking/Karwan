import { bus, type KarwanEvent } from '../events.js';
import { circleWalletsClient, SOL_DEVNET_BLOCKCHAIN } from './wallets.js';
import { CCTP_CHAINS, CCTP_CHAIN_KEYS } from '../chain/cctpChains.js';
import { logger } from '../logger.js';
import { listAllAgentWallets } from '../db/agentWallets.js';
import { appendActivity } from '../db/activityLog.js';
import { routeDepositToArc } from './depositRouter.js';

/// Credit a cross-chain deposit the moment Circle tells us it landed.
///
/// The Arc balance watcher polls USDC Transfer logs and covers Arc only, by
/// design: its registry is keyed by address alone, and it carries a tripwire
/// saying so, because Circle derives addresses from a per-chain index and the
/// same address can belong to a different user on another chain.
///
/// A deposit to the user's address on Base, Ethereum, Arbitrum or Polygon is
/// therefore invisible to it. That is the whole gap the deposit flow creates:
/// the user is told "send USDC from any chain" and nothing was watching four of
/// the five chains we name.
///
/// The webhook closes it without inheriting the tripwire, because Circle's
/// notification states the BLOCKCHAIN. Attribution is keyed on
/// `${blockchain}:${address}`, so the collision the watcher warns about cannot
/// happen here.
///
/// ## This never invents money
///
/// The event carries the amount Circle reported, but the BALANCE is still read
/// from chain wherever it is displayed. A webhook that is missed, duplicated or
/// forged past the signature check can therefore make the UI update early or
/// twice; it can never make a number wrong. That is deliberate: a credit path
/// that trusts a webhook as its source of truth is a credit path that can be
/// convinced money arrived when it did not.
///
/// The receiver in `routes/circle-webhook.ts` verifies the signature, dedupes
/// by notificationId and rejects stale deliveries before anything reaches here.

/// Circle sends a transfer several times as it advances through states, each
/// with its own notificationId, so the receiver's dedupe does not cover it.
/// Keyed on the transaction id instead, which is stable across those
/// deliveries. Without this a user watching their balance sees the same deposit
/// announced twice.
const seenTransactions = new Map<string, number>();
/// Long enough to outlive Circle's retry and state-change window, short enough
/// that the map cannot grow without bound in a long-lived process.
const SEEN_TTL_MS = 6 * 60 * 60_000;

function alreadyHandled(txId: string): boolean {
  const now = Date.now();
  for (const [k, at] of seenTransactions) {
    if (now - at > SEEN_TTL_MS) seenTransactions.delete(k);
  }
  if (seenTransactions.has(txId)) return true;
  seenTransactions.set(txId, now);
  return false;
}

/// The shape we care about out of Circle's transaction notification. Read
/// defensively: this is an external payload and a missing field must skip the
/// credit rather than throw inside a bus listener.
interface CircleTxNotification {
  id?: string;
  blockchain?: string;
  tokenId?: string;
  transactionType?: string;
  state?: string;
  amounts?: string[];
  destinationAddress?: string;
  txHash?: string;
}

/// Solana Devnet's USDC mint, from Circle's own contract-address table:
/// https://developers.circle.com/stablecoins/usdc-contract-addresses
///
/// It lives here rather than in CCTP_CHAINS because that table types `usdc` as a
/// hex address and this is base58.
const SOL_DEVNET_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

/// The one contract on this chain whose tokens are dollars, or null if the chain
/// is not one we take deposits on.
function expectedUsdcAddress(blockchain: string): string | null {
  if (blockchain === SOL_DEVNET_BLOCKCHAIN) return SOL_DEVNET_USDC_MINT;
  for (const key of CCTP_CHAIN_KEYS) {
    const chain = CCTP_CHAINS[key];
    if (chain.circleBlockchain === blockchain) return chain.usdc;
  }
  return null;
}

function sameAddress(a: string, b: string): boolean {
  // Hex addresses are case-insensitive; base58 is not, so only fold the hex.
  return a.startsWith('0x') && b.startsWith('0x')
    ? a.toLowerCase() === b.toLowerCase()
    : a === b;
}

/// Definitive answers only. A transient API failure must not be remembered as
/// "that token is not USDC", or one bad minute would reject a chain's deposits
/// for the life of the process.
const tokenVerdicts = new Map<string, boolean>();

/// Is this transfer actually dollars?
///
/// A deposit address is a public address, so anyone can send anything to it. The
/// check is against the USDC CONTRACT ADDRESS, not the token's symbol: a symbol
/// is whatever its deployer typed, so a worthless token calling itself USDC
/// would otherwise be announced to the user as a dollar deposit.
///
/// Circle names the asset only by an opaque per-chain tokenId, so the address
/// behind it comes from Circle, and the address it must equal comes from the
/// chain table this repo already uses to bridge. Nothing here is configured,
/// because a deposit that silently credits nothing until an operator pastes the
/// right ids is a worse failure than one that is simply wrong once and loud.
async function isUsdc(n: CircleTxNotification, fetchToken: FetchToken): Promise<boolean> {
  if (!n.tokenId || !n.blockchain) return false;

  const cached = tokenVerdicts.get(n.tokenId);
  if (cached !== undefined) return cached;

  const expected = expectedUsdcAddress(n.blockchain);
  if (!expected) {
    logger.warn(
      { blockchain: n.blockchain },
      'inbound transfer on a chain with no known USDC contract; not crediting',
    );
    return false;
  }

  const token = await fetchToken(n.tokenId);
  if (!token) return false; // no verdict to cache

  const ok =
    token.isNative === false &&
    !!token.tokenAddress &&
    sameAddress(token.tokenAddress, expected) &&
    token.blockchain === n.blockchain;

  tokenVerdicts.set(n.tokenId, ok);
  return ok;
}

/// What we need to know about a token to decide whether it is a dollar. Narrower
/// than Circle's own type so the decision above does not depend on the shape of
/// the SDK response.
export interface TokenFacts {
  isNative?: boolean;
  tokenAddress?: string;
  blockchain?: string;
}

/// Resolve an opaque Circle tokenId to the facts about it. This is the only part
/// of the credit path that leaves the process.
export type FetchToken = (tokenId: string) => Promise<TokenFacts | null>;

const fetchTokenFromCircle: FetchToken = async (tokenId) => {
  const res = await circleWalletsClient().getToken({ id: tokenId });
  return res.data?.token ?? null;
};

/// Reverse index from `${blockchain}:${address}` to owner.
///
/// Keyed by CHAIN AND ADDRESS, not address alone. The Arc balance watcher is
/// keyed by address and carries a tripwire explaining why that is only safe
/// there: Circle derives addresses from a per-chain index, so one address can
/// belong to different users on different chains. Crediting the wrong user is
/// the failure this key shape exists to prevent.
///
/// Cached because every outbound transfer, agent payout and settlement also
/// arrives on this listener, and reading the whole wallet store on each one
/// would make a busy minute expensive.
let index: Map<string, string> | null = null;
let indexAt = 0;
const INDEX_TTL_MS = 60_000;

async function ownerOfDepositAddress(
  blockchain: string,
  address: string,
): Promise<string | null> {
  if (!index || Date.now() - indexAt > INDEX_TTL_MS) {
    const next = new Map<string, string>();
    for (const w of await listAllAgentWallets()) {
      for (const [chain, entry] of Object.entries(w.bridgeWallets ?? {})) {
        next.set(`${chain}:${entry.address.toLowerCase()}`, w.userAddress.toLowerCase());
      }
    }
    index = next;
    indexAt = Date.now();
  }
  return index.get(`${blockchain}:${address.toLowerCase()}`) ?? null;
}

/// Drop the cache so a freshly provisioned deposit wallet is recognised at once
/// rather than after the TTL. Activation calls this; a deposit that lands in the
/// first minute of an account's life still gets credited.
export function invalidateDepositIndex(): void {
  index = null;
}

/// Start listening. Safe to call once at boot.
///
/// `fetchToken` is the one seam, and it is the process boundary rather than a
/// piece of the decision: everything that decides whether to credit, and who to
/// credit, runs for real either way.
export function startDepositWatcher(fetchToken: FetchToken = fetchTokenFromCircle): () => void {
  return bus.subscribe((event) => {
    if (event.type !== 'circle.webhook') return;
    // bus.subscribe expects a sync handler. Returning a promise here would let a
    // rejection escape the listener loop unhandled, so the async work is wrapped
    // and any failure is logged. A dropped credit is recovered by the balance
    // being read from chain regardless.
    void handle(event, fetchToken).catch((err) =>
      logger.warn({ err: (err as Error).message }, 'deposit watcher failed to handle a webhook'),
    );
  });
}

async function handle(event: KarwanEvent, fetchToken: FetchToken): Promise<void> {
  const p = event.payload as Record<string, unknown> | undefined;
  // Circle nests transaction notifications under `transaction`; tolerate the
  // flat shape too rather than depend on one envelope layout.
  const raw = (p?.notification ?? {}) as Record<string, unknown>;
  const n = ((raw.transaction ?? raw) ?? {}) as CircleTxNotification;

  // Inbound, complete, USDC, to an address we derived, with an amount. Every
  // one of these is a reason to drop, and dropping is silent by default because
  // outbound and agent traffic hits this listener constantly.
  //
  // The ORDER matters twice over. The owner check comes before the token check
  // so an unrecognised token only warns for an address that is actually ours,
  // instead of turning every inbound transfer on the platform into a warning
  // while the allowlist is unset. And the dedupe comes LAST, after everything
  // that could still reject: marking a transaction as seen and then dropping it
  // for a missing field would suppress the redelivery that carries the field.
  if (n.transactionType !== 'INBOUND') return;
  if (n.state !== 'COMPLETE' && n.state !== 'CONFIRMED') return;
  if (!n.id || !n.blockchain || !n.destinationAddress) return;

  const owner = await ownerOfDepositAddress(n.blockchain, n.destinationAddress);
  if (!owner) return; // not a deposit address of ours

  if (!(await isUsdc(n, fetchToken))) {
    logger.warn(
      { tokenId: n.tokenId, blockchain: n.blockchain, txId: n.id },
      'inbound transfer to a deposit address skipped: token is not an allowlisted USDC (set CIRCLE_USDC_TOKEN_IDS)',
    );
    return;
  }

  const amountUsdc = n.amounts?.[0] ?? null;
  if (!amountUsdc) return;

  if (alreadyHandled(n.id)) return;

  logger.info(
    { owner, blockchain: n.blockchain, amountUsdc, txId: n.id, txHash: n.txHash },
    'deposit credited from webhook',
  );

  // `address` is what proves ownership to the SSE projection: events.ts
  // matches on owner/user/address and pulses everything else to {}. Without
  // it this event would reach the user's own feed stripped of its amount.
  bus.emitEvent({
    type: 'wallet.credited',
    actor: 'platform',
    payload: {
      address: owner,
      owner,
      amountUsdc,
      chain: n.blockchain,
      source: 'deposit',
      ...(n.txHash ? { txHash: n.txHash } : {}),
    },
  });

  // Noticing the money is not delivering it. The deposit is sitting on the
  // source chain and cannot fund an escrow from there, so the hop to Arc starts
  // now, without the user asking for it. Circle's transaction id goes to the
  // router and no further: it is the idempotency key, not something a browser
  // needs.
  routeDepositToArc({ owner, amountUsdc, chain: n.blockchain, txId: n.id });

  void appendActivity({
    address: owner,
    kind: 'deposit',
    summary: `Deposited ${amountUsdc} USDC`,
    // Structured too, so the reader's locale decides the wording rather than
    // this file's English. The summary stays as the fallback.
    params: { t: 'depositCredited', amount: amountUsdc },
    amountUsdc,
    ...(n.txHash ? { txHash: n.txHash } : {}),
  });
}
