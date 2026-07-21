import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { formatUnits, parseUnits, type PublicClient } from 'viem';
import { config } from '../config.js';
import { executeContractCall, submitContractCall, getTxState } from '../chain/txs.js';
import { publicClient } from '../chain/client.js';
import {
  createBridge,
  getBridge,
  patchBridge,
  listPendingBridges,
  listBridgesForUser,
} from '../db/bridges.js';
import { getAgentWallets, saveAgentWallets } from '../db/agentWallets.js';
import { getUserByAddress } from '../db/users.js';
import { isSessionSelf, sessionAddress } from '../auth/session.js';
import { provisionUserBridgeWallet, dripTestnetUsdc } from '../circle/wallets.js';
import {
  APP_KIT_SOURCE_CHAINS,
  APP_KIT_SOURCE_CHAIN_KEYS,
  bridgeInToArcViaAppKit,
  bridgeOutFromArcViaAppKit,
  isSolanaDestKey,
} from '../circle/bridge-kit.js';
import { usdc as ARC_USDC, readUsdcBalance } from '../chain/contracts.js';
import {
  CCTP_CHAINS,
  CCTP_CHAIN_KEYS,
  depositWalletsByChainKey,
  TOKEN_MESSENGER_V2,
  MESSAGE_TRANSMITTER_V2,
  ARC_DOMAIN,
  FINALITY_THRESHOLD_FAST,
  addressToBytes32,
  isCctpChainKey,
  type CctpChainKey,
} from '../chain/cctpChains.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import { reportError } from '../errorTracker.js';

import { sourceClients } from '../chain/cctpClients.js';

const erc20BalanceOfAbi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// CCTP V2 source-chain config now lives in the shared registry
// (chain/cctpChains.ts): TOKEN_MESSENGER_V2, ARC_DOMAIN, FINALITY_THRESHOLD_FAST,
// addressToBytes32 and CCTP_CHAINS are imported above.

const USDC_DECIMALS = 6;

// Every CCTP domain we relay mints from on Arc (any registered source chain).
// Solana Devnet burns relay through the same pipeline as EVM burns: IRIS looks
// the attestation up by (domain, txHash) and the mint happens on Arc either
// way. Its CCTP domain is 5; it has no entry in the EVM chain registry.
const SOLANA_DOMAIN = 5;
const SOURCE_DOMAINS = new Set([
  ...CCTP_CHAIN_KEYS.map((k) => CCTP_CHAINS[k].domain),
  SOLANA_DOMAIN,
]);

// CCTP V2 MessageTransmitter marks a nonce non-zero once its message has been
// received, so the same burn cannot mint twice. We read this to keep relays
// idempotent across restarts.
const messageTransmitterAbi = [
  {
    type: 'function',
    name: 'usedNonces',
    stateMutability: 'view',
    inputs: [{ name: 'nonce', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

/// True if this CCTP message has already been received on Arc. Used to skip a
/// redundant receiveMessage that would otherwise revert on chain.
async function isMessageAlreadyReceived(eventNonce: string): Promise<boolean> {
  try {
    const used = (await publicClient.readContract({
      address: config.CCTP_MESSAGE_TRANSMITTER_ADDR as `0x${string}`,
      abi: messageTransmitterAbi,
      functionName: 'usedNonces',
      args: [eventNonce as `0x${string}`],
    })) as bigint;
    return used !== 0n;
  } catch (err) {
    // If the read fails we cannot tell; let receiveMessage be authoritative.
    logger.warn({ err: (err as Error).message }, 'usedNonces check failed');
    return false;
  }
}

const relaySchema = z.object({
  bridgeId: z.string().min(1),
  sourceDomain: z.number().int().refine((d) => SOURCE_DOMAINS.has(d), {
    message: 'sourceDomain must be a supported CCTP source chain',
  }),
  // EVM burns are 0x tx hashes; Solana burns are base58 signatures. IRIS
  // accepts either as the transactionHash query param for its domain.
  sourceTxHash: z
    .string()
    .regex(
      /^(0x[0-9a-fA-F]{64}|[1-9A-HJ-NP-Za-km-z]{64,90})$/,
      'expected a 0x tx hash or a base58 Solana signature',
    ),
  amountUsdc: z.string(),
  mintRecipient: z.string().startsWith('0x'),
  /// Optional chain key persisted so /list can render durable history rows
  /// (records without one are skipped by the frontend merge).
  sourceChainKey: z.string().min(1).optional(),
});

const inFlight = new Set<string>();

const POLL_INTERVAL_MS = 5_000;
// CCTP V2 Fast Transfer attestations land in ~seconds; we keep a generous window
// because Circle's IRIS Sandbox can still lag. The user can also call /recheck.
const POLL_TIMEOUT_MS = 6 * 60 * 60 * 1000; // 6 hours

// CCTP V2 Fast Transfer only happens when maxFee >= the route's fast fee; with
// maxFee 0 Circle settles it as a slow Standard Transfer. We query the route's
// fast fee (bps) and set maxFee to it plus headroom. maxFee is only a ceiling,
// the user is charged the real feeExecuted (<= maxFee) at mint, so the headroom
// never costs them; it just guarantees the transfer qualifies as Fast.
const FAST_FEE_FALLBACK_BPS = 10; // generous default when the fee API is unreachable
async function computeFastMaxFee(
  sourceDomain: number,
  destDomain: number,
  amount: bigint,
): Promise<string> {
  let bps = FAST_FEE_FALLBACK_BPS;
  try {
    const res = await fetch(`${config.IRIS_API_BASE}/v2/burn/USDC/fees/${sourceDomain}/${destDomain}`);
    if (res.ok) {
      const rows = (await res.json()) as Array<{ finalityThreshold?: number; minimumFee?: number }>;
      const fast = rows.find((r) => r.finalityThreshold === FINALITY_THRESHOLD_FAST);
      if (fast && typeof fast.minimumFee === 'number' && fast.minimumFee >= 0) bps = fast.minimumFee;
    } else {
      logger.warn({ status: res.status, sourceDomain, destDomain }, 'fast-fee lookup non-2xx; using fallback bps');
    }
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, sourceDomain, destDomain },
      'fast-fee lookup failed; using fallback bps',
    );
  }
  const base = (amount * BigInt(Math.max(0, Math.ceil(bps)))) / 10_000n;
  const withHeadroom = base + base / 2n + 1n; // +50% + 1 unit so it always qualifies as Fast
  const cap = amount / 50n; // never authorize more than 2% as the ceiling
  const maxFee = withHeadroom > cap ? cap : withHeadroom;
  return maxFee.toString();
}

export const bridgeRoutes = new Hono();

/// Every Circle bridge this user has started, newest first, with its current
/// status and tx ids. Lets a user (or operator) see whether a bridge is
/// approving / burning / relaying / minted / errored instead of guessing. Keyed
/// off the user's source-chain DCW(s), resolved from their agent-wallet record.
/// The address that owns a bridge record, for authorization. `owner` is
/// authoritative when set. Falling back to `mintRecipient` is only sound for an
/// INBOUND bridge, where the mint lands on the user's own Arc address; on an
/// OUTBOUND bridge mintRecipient is a DESTINATION-CHAIN address, and because a
/// Circle wallet address can belong to a different user on a different chain,
/// accepting it here let a stranger read or re-drive someone else's bridge.
/// Returns null when ownership cannot be established, which denies access.
function bridgeOwnerFor(record: { owner?: string; mintRecipient: string; direction?: 'in' | 'out' }): string | null {
  if (record.owner) return record.owner;
  return (record.direction ?? 'in') === 'in' ? record.mintRecipient : null;
}

bridgeRoutes.get('/list', async (c) => {
  const address = c.req.query('address');
  if (!address) return c.json({ error: 'address query param required' }, 400);
  // Transfer history is private financial data (amounts, counterparty
  // addresses, timing); only the signed-in owner may read their own.
  if (!isSessionSelf(c, address)) {
    return c.json({ error: 'sign in as this address to read bridge history' }, 403);
  }
  const wallets = await getAgentWallets(address.toLowerCase());
  // The caller's identity is passed as `owner`, NOT merged into the address
  // list: deposit-wallet addresses can collide with another user's identity
  // address (Circle's per-chain index counter), and matching on that leaked
  // one user's history to another. App Kit forwarder bridges still resolve,
  // via mintRecipient.
  const records = await listBridgesForUser({
    owner: address.toLowerCase(),
    sourceWalletsByChain: depositWalletsByChainKey(wallets?.bridgeWallets),
  });
  return c.json({
    bridges: records.map((b) => ({
      bridgeId: b.bridgeId,
      status: b.status,
      amountUsdc: b.amountUsdc,
      sourceChainKey: b.sourceChainKey ?? null,
      destChainKey: b.destChainKey ?? null,
      direction: b.direction ?? 'in',
      mintRecipient: b.mintRecipient || null,
      sourceTxHash: b.sourceTxHash || null,
      mintTxHash: b.mintTxHash ?? null,
      approveTxId: b.approveTxId ?? null,
      burnTxId: b.burnTxId ?? null,
      error: b.error ?? null,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    })),
  });
});

/// Record a bridge that already completed CLIENT-SIDE via Circle's App Kit
/// Forwarding Service. The user signs the source burn in their own wallet and
/// the forwarder mints on Arc, so the backend never sees the flow. This
/// endpoint persists a 'minted' record (durable history) and emits
/// bridge.minted so it shows in the main /activity feed under Top Up /
/// Withdraw. Idempotent by bridgeId. No funds move here; it is a ledger write.
const recordSchema = z.object({
  bridgeId: z.string().min(1),
  sourceChainKey: z.string().min(1),
  amountUsdc: z.union([z.number(), z.string()]),
  mintRecipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'expected a 0x address'),
  burnTxHash: z.string().optional(),
  mintTxHash: z.string().optional(),
  /// 'in' (chain -> Arc, the default App Kit forwarder case) or 'out' (Arc ->
  /// elsewhere, e.g. a web3 self-signed Arc-to-Arc cash-out that has no backend
  /// relay to persist it otherwise).
  direction: z.enum(['in', 'out']).optional(),
});

bridgeRoutes.post('/record', async (c) => {
  let body;
  try {
    body = recordSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  const owner = sessionAddress(c);
  if (!owner) return c.json({ error: 'sign in first' }, 401);

  // Idempotent: a resubmit (retry, double-click, reload) must not double-record.
  const existing = await getBridge(body.bridgeId);
  if (existing) return c.json({ ok: true, alreadyRecorded: true });

  const key = body.sourceChainKey;
  // Solana's CCTP domain is 5; EVM domains come from the registry. An 'out'
  // bridge always burns on Arc, so its source domain is Arc's regardless of what
  // key the client sent, otherwise it would silently record as domain 0
  // (Ethereum) and the history row would name the wrong source.
  const sourceDomain =
    body.direction === 'out'
      ? ARC_DOMAIN
      : key === 'solanaDevnet'
        ? 5
        : isCctpChainKey(key)
          ? CCTP_CHAINS[key].domain
          : 0;
  const amountUsdc = String(body.amountUsdc);

  await createBridge({
    bridgeId: body.bridgeId,
    sourceDomain,
    sourceTxHash: body.burnTxHash ?? '',
    amountUsdc,
    mintRecipient: body.mintRecipient,
    status: 'minted',
    direction: body.direction ?? 'in',
    appKit: true,
    // Bind ownership to `owner`, NOT by writing the identity address into
    // bridgeWalletAddress. That field is matched against other users' deposit
    // wallet addresses, and a deposit wallet can sit at another user's identity
    // address (Circle's per-chain index counter), so using it as an ownership
    // key is what leaked one user's bridge history to another.
    owner: owner.toLowerCase(),
    sourceChainKey: key as never,
    ...(body.mintTxHash ? { mintTxHash: body.mintTxHash } : {}),
  });

  // Mirrors markBridgeMinted's emit so /activity renders it the same way.
  bus.emitEvent({
    type: 'bridge.minted',
    actor: 'buyer',
    payload: {
      bridgeId: body.bridgeId,
      amountUsdc,
      mintRecipient: body.mintRecipient,
      sourceTxHash: body.burnTxHash ?? '',
      ...(body.mintTxHash ? { txHash: body.mintTxHash } : { alreadyMinted: true }),
    },
  });

  logger.info(
    { owner, bridgeId: body.bridgeId, sourceChainKey: key, amountUsdc },
    'recorded app kit forwarder bridge',
  );
  return c.json({ ok: true });
});

bridgeRoutes.post('/relay', async (c) => {
  if (!config.cctpRelayWalletId) {
    return c.json(
      { error: 'CCTP_RELAY_WALLET_ID not configured (legacy alias: BUYER_AGENT_WALLET_ID)' },
      500,
    );
  }
  // Any signed-in session may relay: the CCTP message fixes the mint
  // recipient, so a relay can only deliver the burn's own funds. The gate
  // stops anonymous callers from burning relay-wallet gas and spamming
  // bridge records. Every legitimate caller (web3 EVM flow, Solana flow,
  // recheck) runs with a session cookie.
  if (!sessionAddress(c)) {
    return c.json({ error: 'sign in to relay a bridge' }, 401);
  }

  let body;
  try {
    body = relaySchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }

  if (inFlight.has(body.bridgeId)) {
    return c.json({ accepted: false, reason: 'bridge already in progress' }, 409);
  }

  // Refuse to clobber an existing bridge's burn hash. The frontend retry path
  // diverts to /recheck when a burn already exists, but a stale tab or a bad
  // client could still POST a fresh burn for the same bridgeId, that would
  // overwrite the original sourceTxHash and orphan the user's first burn.
  const existing = await getBridge(body.bridgeId);
  // Already settled: report it instead of re-entering the pipeline, so a
  // recheck re-POST resolves immediately (createBridge also refuses to
  // regress minted records, this is the friendly response for it).
  if (existing?.status === 'minted') {
    return c.json({
      accepted: false,
      status: 'minted',
      bridgeId: body.bridgeId,
      mintTxHash: existing.mintTxHash ?? null,
    });
  }
  if (existing && existing.sourceTxHash.toLowerCase() !== body.sourceTxHash.toLowerCase()) {
    return c.json(
      {
        accepted: false,
        reason: 'bridge already exists with a different sourceTxHash; use /recheck instead',
        existingSourceTxHash: existing.sourceTxHash,
      },
      409,
    );
  }

  // Persist before starting the loop, so a backend restart can resume the relay
  // instead of stranding the burn.
  await createBridge({
    bridgeId: body.bridgeId,
    sourceDomain: body.sourceDomain,
    sourceTxHash: body.sourceTxHash,
    amountUsdc: body.amountUsdc,
    mintRecipient: body.mintRecipient,
    ...(body.sourceChainKey ? { sourceChainKey: body.sourceChainKey as never } : {}),
  });

  bus.emitEvent({
    type: 'bridge.burned',
    actor: 'buyer',
    payload: {
      bridgeId: body.bridgeId,
      sourceDomain: body.sourceDomain,
      sourceTxHash: body.sourceTxHash,
      amountUsdc: body.amountUsdc,
      mintRecipient: body.mintRecipient,
    },
  });

  startRelay(body);
  return c.json({ accepted: true, bridgeId: body.bridgeId }, 202);
});

interface RelayInput {
  bridgeId: string;
  sourceDomain: number;
  sourceTxHash: string;
  amountUsdc: string;
  mintRecipient: string;
}

/// Starts the relay loop for one bridge, guarded so the same bridge is never
/// relayed twice concurrently.
function startRelay(input: RelayInput) {
  if (inFlight.has(input.bridgeId)) return;
  inFlight.add(input.bridgeId);
  relayLoop(input).finally(() => inFlight.delete(input.bridgeId));
}

/// On boot, pick up any bridge that burned but never minted or errored, and
/// resume its relay. This is what keeps a restart from stranding a bridge.
export async function resumePendingBridges(): Promise<void> {
  const pending = await listPendingBridges();
  if (pending.length === 0) return;
  logger.info({ count: pending.length }, 'resuming pending bridges');
  for (const b of pending) {
    // App Kit-managed bridges don't have persisted resumable state yet (no
    // BridgeResult checkpoint). Skip them on boot; an operator marks them
    // 'error' or 'minted' manually after observing the on-chain mint.
    if (b.appKit) {
      logger.info(
        { bridgeId: b.bridgeId, status: b.status },
        'skipping app-kit bridge in resume (no persisted resumable state)',
      );
      continue;
    }
    // Bridge-out: burn is on Arc, mint is on the destination chain. Resume only
    // the destination mint relay (the Arc burn is synchronous, so a record stuck
    // pre-burn after a restart has no on-chain effect and is left to retry).
    if (b.direction === 'out') {
      // Solana out-bridges are App Kit-managed (not startOutRelay); skip them here
      // — this also narrows destChainKey to a CctpChainKey for the relay.
      if (b.sourceTxHash && b.destChainKey && !isSolanaDestKey(b.destChainKey) && b.bridgeWalletId) {
        startOutRelay({
          bridgeId: b.bridgeId,
          destChainKey: b.destChainKey,
          sourceTxHash: b.sourceTxHash,
          amountUsdc: b.amountUsdc,
          recipient: b.mintRecipient,
          destWalletId: b.bridgeWalletId,
        });
      }
      continue;
    }
    // Burned already (web3 path, or Circle past the burn): resume the mint relay.
    if (b.sourceTxHash) {
      startRelay({
        bridgeId: b.bridgeId,
        sourceDomain: b.sourceDomain,
        sourceTxHash: b.sourceTxHash,
        amountUsdc: b.amountUsdc,
        mintRecipient: b.mintRecipient,
      });
      continue;
    }
    // Circle bridge still mid source pipeline: resume approve/burn if we have
    // the source context we persisted at create time. isCctpChainKey narrows
    // the AppKitSourceChainKey union to the EVM CctpChainKey that
    // startSourcePipeline expects; Solana records were already skipped above
    // by the appKit guard, but the type system can't see that without an
    // explicit narrowing.
    if (
      (b.status === 'approving' || b.status === 'burning') &&
      b.sourceChainKey &&
      isCctpChainKey(b.sourceChainKey) &&
      b.bridgeWalletId &&
      b.bridgeWalletAddress
    ) {
      startSourcePipeline({
        bridgeId: b.bridgeId,
        sourceChainKey: b.sourceChainKey,
        bridgeWalletId: b.bridgeWalletId,
        bridgeWalletAddress: b.bridgeWalletAddress,
        amountUsdc: b.amountUsdc,
        mintRecipient: b.mintRecipient,
      });
    }
  }
}

/// Marks a bridge minted and emits the event. Used both after a successful
/// receiveMessage and when a relay finds the message was already received.
///
/// When called with a txHash we verify the on-chain receipt status is success
/// before flipping the DB row. Without a verified receipt we'd report "minted"
/// for a transaction that may have actually reverted, leaving the user's
/// burned USDC stuck on the source chain with the UI showing success.
async function markBridgeMinted(input: RelayInput, txHash?: string): Promise<boolean> {
  if (txHash) {
    try {
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
        timeout: 60_000,
      });
      if (receipt.status !== 'success') {
        const message = `receiveMessage tx ${txHash} reverted on chain (status=${receipt.status})`;
        logger.error({ bridgeId: input.bridgeId, txHash }, message);
        await patchBridge(input.bridgeId, { status: 'error', error: message });
        bus.emitEvent({
          type: 'bridge.error',
          actor: 'buyer',
          payload: { bridgeId: input.bridgeId, scope: 'receiveMessage', message },
        });
        return false;
      }
    } catch (err) {
      const message = `Could not verify receiveMessage receipt: ${(err as Error).message}`;
      logger.error({ bridgeId: input.bridgeId, txHash, err: (err as Error).message }, message);
      await patchBridge(input.bridgeId, { status: 'error', error: message });
      bus.emitEvent({
        type: 'bridge.error',
        actor: 'buyer',
        payload: { bridgeId: input.bridgeId, scope: 'receiveMessage', message },
      });
      return false;
    }
  }
  await patchBridge(input.bridgeId, { status: 'minted', ...(txHash ? { mintTxHash: txHash } : {}) });
  bus.emitEvent({
    type: 'bridge.minted',
    actor: 'buyer',
    payload: {
      bridgeId: input.bridgeId,
      amountUsdc: input.amountUsdc,
      mintRecipient: input.mintRecipient,
      sourceTxHash: input.sourceTxHash,
      ...(txHash ? { txHash } : { alreadyMinted: true }),
    },
  });
  return true;
}

async function relayLoop(input: RelayInput) {
  const startedAt = Date.now();
  const url = `${config.IRIS_API_BASE}/v2/messages/${input.sourceDomain}?transactionHash=${input.sourceTxHash}`;

  let attestation: { message: string; attestation: string; eventNonce?: string } | null = null;

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as {
          messages?: Array<{
            status?: string;
            message?: string;
            attestation?: string;
            eventNonce?: string;
          }>;
        };
        const m = data.messages?.[0];
        if (m?.status === 'complete' && m.message && m.attestation) {
          attestation = { message: m.message, attestation: m.attestation, eventNonce: m.eventNonce };
          break;
        }
      } else if (res.status !== 404) {
        logger.warn({ status: res.status }, 'iris attestation lookup non-2xx');
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'iris attestation poll error');
    }
    await sleep(POLL_INTERVAL_MS);
  }

  if (!attestation) {
    const message = 'Attestation did not arrive within poll window';
    reportError('bridge.relay.attestation', new Error(message), {
      bridgeId: input.bridgeId,
      sourceTxHash: input.sourceTxHash,
    });
    await patchBridge(input.bridgeId, { status: 'error', error: message });
    bus.emitEvent({
      type: 'bridge.error',
      actor: 'buyer',
      payload: { bridgeId: input.bridgeId, scope: 'attestation', message },
    });
    return;
  }

  bus.emitEvent({
    type: 'bridge.attested',
    actor: 'buyer',
    payload: { bridgeId: input.bridgeId, sourceTxHash: input.sourceTxHash },
  });

  // If a prior relay already minted this (e.g. across a restart), skip the call.
  // receiveMessage would just revert on a consumed nonce.
  if (attestation.eventNonce && (await isMessageAlreadyReceived(attestation.eventNonce))) {
    logger.info({ bridgeId: input.bridgeId }, 'message already received on chain, marking minted');
    await markBridgeMinted(input);
    return;
  }

  try {
    const result = await executeContractCall(
      {
        walletId: config.cctpRelayWalletId!,
        contractAddress: config.CCTP_MESSAGE_TRANSMITTER_ADDR,
        abiFunctionSignature: 'receiveMessage(bytes,bytes)',
        abiParameters: [attestation.message, attestation.attestation],
      },
      `cctp.receiveMessage(${input.bridgeId})`,
    );
    await markBridgeMinted(input, result.txHash);
  } catch (err) {
    const message = (err as Error).message;
    // A revert on an already-attested message is almost always a nonce that was
    // consumed by a concurrent relay. Re-check before declaring a real failure.
    if (attestation.eventNonce && (await isMessageAlreadyReceived(attestation.eventNonce))) {
      logger.info(
        { bridgeId: input.bridgeId },
        'receiveMessage reverted but message is already received, marking minted',
      );
      await markBridgeMinted(input);
      return;
    }
    reportError('bridge.relay.receiveMessage', err, { bridgeId: input.bridgeId });
    await patchBridge(input.bridgeId, { status: 'error', error: message });
    bus.emitEvent({
      type: 'bridge.error',
      actor: 'buyer',
      payload: { bridgeId: input.bridgeId, scope: 'receiveMessage', message },
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Circle source pipeline.
// Signs approve + burn from the user's source-chain Circle DCW, asynchronously.
// Each step is submitted (id captured + persisted) then polled to settlement in
// the background, so a Circle tx that settles minutes later (Base Sepolia
// testnet has done this) is never thrown away. On a slow stage the loop exits
// leaving the bridge in its source state; resumePendingBridges (next boot) or
// POST /circle-bridge/:id/resume continues it. Only a hard Circle FAILED state
// marks the bridge errored. Once the burn lands we set sourceTxHash and hand
// off to the existing mint relay.

const SOURCE_POLL_INTERVAL_MS = 5_000;
// Per source stage. Generous because testnet bundler latency runs in minutes.
const SOURCE_POLL_TIMEOUT_MS = 60 * 60 * 1000; // 1h
// Hard cap on how long a Circle source bridge may sit pending before it's marked
// errored, so a transfer that will never settle (e.g. a gas-starved wallet)
// surfaces a failure instead of pending forever. Generous: testnet settles in
// minutes, so this only ever trips on genuinely stuck transfers.
const MAX_SOURCE_AGE_MS = 2 * 60 * 60 * 1000; // 2h
const sourceInFlight = new Set<string>();

function sourceTimedOut(record: { createdAt: number }): boolean {
  return Date.now() - record.createdAt > MAX_SOURCE_AGE_MS;
}

interface SourcePipelineInput {
  bridgeId: string;
  sourceChainKey: CctpChainKey;
  bridgeWalletId: string;
  bridgeWalletAddress: string;
  amountUsdc: string;
  mintRecipient: string;
}

function startSourcePipeline(input: SourcePipelineInput) {
  if (sourceInFlight.has(input.bridgeId)) return;
  sourceInFlight.add(input.bridgeId);
  sourcePipelineLoop(input).finally(() => sourceInFlight.delete(input.bridgeId));
}

interface WaitResult {
  ok: boolean;
  txHash?: string;
  failed?: boolean; // true = Circle reported a terminal failure (do not resume)
  reason?: string;
}

/// Poll a Circle transaction id to COMPLETE. Returns failed=true on a terminal
/// Circle failure, or ok=false (failed undefined) on a soft timeout that should
/// be resumed later rather than errored.
async function waitForCircleTx(txId: string, label: string): Promise<WaitResult> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < SOURCE_POLL_TIMEOUT_MS) {
    try {
      const { state, txHash } = await getTxState(txId);
      if (state === 'COMPLETE') return { ok: true, txHash };
      if (state === 'FAILED' || state === 'CANCELLED' || state === 'DENIED') {
        return { ok: false, failed: true, reason: `${label}: Circle tx ${state}` };
      }
    } catch (err) {
      logger.warn({ txId, err: (err as Error).message }, `${label}: getTxState error`);
    }
    await sleep(SOURCE_POLL_INTERVAL_MS);
  }
  return { ok: false, reason: `${label}: not settled within source poll window` };
}

async function failSource(bridgeId: string, scope: string, message: string) {
  await patchBridge(bridgeId, { status: 'error', error: message });
  bus.emitEvent({
    type: 'bridge.error',
    actor: 'buyer',
    payload: { bridgeId, scope, message, circle: true },
  });
}

async function sourcePipelineLoop(input: SourcePipelineInput) {
  const chainCfg = CCTP_CHAINS[input.sourceChainKey];
  const amountWei = parseUnits(input.amountUsdc, USDC_DECIMALS);
  const amountStr = amountWei.toString();
  const sourceClient = sourceClients[input.sourceChainKey];

  let record = await getBridge(input.bridgeId);
  if (!record) {
    logger.warn({ bridgeId: input.bridgeId }, 'source pipeline: bridge record missing');
    return;
  }
  // Already past the source stage: just make sure the mint relay is running.
  if (record.status === 'minted') return;
  if (record.sourceTxHash) {
    startRelay({
      bridgeId: record.bridgeId,
      sourceDomain: record.sourceDomain,
      sourceTxHash: record.sourceTxHash,
      amountUsdc: record.amountUsdc,
      mintRecipient: record.mintRecipient,
    });
    return;
  }

  try {
    // STAGE 1, APPROVE. Skip when the live allowance already covers the amount
    // (a prior attempt's approve may have landed after its window lapsed; that
    // is exactly the bug this pipeline fixes, and reading allowance recovers it).
    let allowanceOk = false;
    try {
      const allowance = (await sourceClient.readContract({
        address: chainCfg.usdc as `0x${string}`,
        abi: erc20BalanceOfAbi,
        functionName: 'allowance',
        args: [input.bridgeWalletAddress as `0x${string}`, TOKEN_MESSENGER_V2 as `0x${string}`],
      })) as bigint;
      allowanceOk = allowance >= amountWei;
    } catch (err) {
      logger.warn(
        { bridgeId: input.bridgeId, err: (err as Error).message },
        'allowance read failed; will submit approve',
      );
    }

    if (!allowanceOk) {
      await patchBridge(input.bridgeId, { status: 'approving' });
      // Reuse an in-flight approve id across a resume rather than re-submitting.
      let approveTxId = record.approveTxId;
      if (!approveTxId) {
        bus.emitEvent({
          type: 'bridge.approving',
          actor: 'buyer',
          payload: { bridgeId: input.bridgeId, sourceChainKey: input.sourceChainKey, circle: true },
        });
        const { txId } = await submitContractCall(
          {
            walletId: input.bridgeWalletId,
            contractAddress: chainCfg.usdc,
            abiFunctionSignature: 'approve(address,uint256)',
            abiParameters: [TOKEN_MESSENGER_V2, amountStr],
            feeLevel: 'HIGH',
            idempotencyKey: record.approveIdempotencyKey,
          },
          `circle-bridge.approve(${input.sourceChainKey}, ${input.bridgeId})`,
        );
        approveTxId = txId;
        await patchBridge(input.bridgeId, { approveTxId });
      }
      const ar = await waitForCircleTx(approveTxId, `circle-bridge.approve(${input.bridgeId})`);
      if (!ar.ok) {
        if (ar.failed) await failSource(input.bridgeId, 'approve', ar.reason ?? 'approve failed');
        else if (sourceTimedOut(record))
          await failSource(
            input.bridgeId,
            'approve',
            'Approve did not settle in time. Check the bridge wallet has Base/Ethereum gas, then start a new bridge.',
          );
        else logger.warn({ bridgeId: input.bridgeId }, 'approve pending past window; resumable');
        return;
      }
    }

    // STAGE 2, BURN.
    record = (await getBridge(input.bridgeId)) ?? record;
    let burnTxId = record.burnTxId;
    if (!burnTxId) {
      await patchBridge(input.bridgeId, { status: 'burning' });
      bus.emitEvent({
        type: 'bridge.burning',
        actor: 'buyer',
        payload: { bridgeId: input.bridgeId, sourceChainKey: input.sourceChainKey, circle: true },
      });
      const maxFee = await computeFastMaxFee(chainCfg.domain, ARC_DOMAIN, BigInt(amountStr));
      const { txId } = await submitContractCall(
        {
          walletId: input.bridgeWalletId,
          contractAddress: TOKEN_MESSENGER_V2,
          abiFunctionSignature:
            'depositForBurn(uint256,uint32,bytes32,address,bytes32,uint256,uint32)',
          abiParameters: [
            amountStr,
            ARC_DOMAIN.toString(),
            addressToBytes32(input.mintRecipient),
            chainCfg.usdc,
            // destinationCaller = zero so the platform buyer agent can relay.
            `0x${'0'.repeat(64)}`,
            maxFee,
            FINALITY_THRESHOLD_FAST.toString(),
          ],
          feeLevel: 'HIGH',
          idempotencyKey: record.burnIdempotencyKey,
        },
        `circle-bridge.depositForBurn(${input.sourceChainKey}, ${input.bridgeId})`,
      );
      burnTxId = txId;
      await patchBridge(input.bridgeId, { burnTxId });
    }
    const br = await waitForCircleTx(burnTxId, `circle-bridge.burn(${input.bridgeId})`);
    if (!br.ok) {
      if (br.failed) await failSource(input.bridgeId, 'depositForBurn', br.reason ?? 'burn failed');
      else if (sourceTimedOut(record))
        await failSource(
          input.bridgeId,
          'depositForBurn',
          'Burn did not settle in time. Check the bridge wallet gas, then start a new bridge.',
        );
      else logger.warn({ bridgeId: input.bridgeId }, 'burn pending past window; resumable');
      return;
    }
    if (!br.txHash) {
      await failSource(input.bridgeId, 'depositForBurn', 'burn completed without a tx hash');
      return;
    }

    // STAGE 3, hand off to the mint relay.
    await patchBridge(input.bridgeId, { sourceTxHash: br.txHash, status: 'relaying' });
    bus.emitEvent({
      type: 'bridge.burned',
      actor: 'buyer',
      payload: {
        bridgeId: input.bridgeId,
        sourceDomain: chainCfg.domain,
        sourceTxHash: br.txHash,
        amountUsdc: input.amountUsdc,
        mintRecipient: input.mintRecipient,
        circle: true,
      },
    });
    startRelay({
      bridgeId: input.bridgeId,
      sourceDomain: chainCfg.domain,
      sourceTxHash: br.txHash,
      amountUsdc: input.amountUsdc,
      mintRecipient: input.mintRecipient,
    });
  } catch (err) {
    reportError('bridge.circle.pipeline', err, {
      bridgeId: input.bridgeId,
      sourceChainKey: input.sourceChainKey,
    });
    await failSource(input.bridgeId, 'pipeline', (err as Error).message);
  }
}

/// Manual recheck: re-queries IRIS for the attestation and tries to mint, even
/// for bridges that had been marked 'error'. Covers the case where the SSE
/// event was missed by a closed tab, or where the relay loop ended before
/// Circle finally posted the attestation.
bridgeRoutes.post('/:bridgeId/recheck', async (c) => {
  if (!config.cctpRelayWalletId) {
    return c.json(
      { error: 'CCTP_RELAY_WALLET_ID not configured (legacy alias: BUYER_AGENT_WALLET_ID)' },
      500,
    );
  }
  const bridgeId = c.req.param('bridgeId');
  const record = await getBridge(bridgeId);
  if (!record) return c.json({ error: 'bridge not found' }, 404);
  // Auth: only the recipient (owner) may re-trigger their bridge.
  if (!isSessionSelf(c, bridgeOwnerFor(record) ?? '')) {
    return c.json({ error: 'not your bridge', code: 'forbidden' }, 403);
  }
  if (record.status === 'minted') {
    return c.json({ status: 'minted', mintTxHash: record.mintTxHash ?? null });
  }
  // Out-bridges (Arc -> chain) mint on the DESTINATION via the per-user bridge
  // DCW, not on Arc via the relay wallet. Re-arm the out relay instead of
  // running the inbound mint path below (which would try to receiveMessage on
  // Arc with a message destined elsewhere).
  if (record.direction === 'out') {
    // Solana out-bridges are managed by App Kit's kit.bridge (not the hand-rolled
    // startOutRelay), so there is no relay to re-arm here — mirror the App Kit
    // resume guard used for the in-direction App Kit bridges.
    if (record.destChainKey && isSolanaDestKey(record.destChainKey)) {
      return c.json(
        {
          error: 'this bridge is managed by App Kit',
          detail:
            'Solana bridges run through kit.bridge; wait for the in-flight transfer to settle, then verify the mint on Solscan.',
          code: 'APPKIT_MANAGED',
        },
        409,
      );
    }
    if (!record.sourceTxHash || !record.destChainKey || !record.bridgeWalletId) {
      return c.json(
        {
          error: 'out-bridge record is missing relay context',
          detail: 'No burn hash, destination chain, or destination wallet on this record.',
        },
        409,
      );
    }
    await patchBridge(bridgeId, { status: 'relaying', error: undefined });
    startOutRelay({
      bridgeId,
      destChainKey: record.destChainKey,
      sourceTxHash: record.sourceTxHash,
      amountUsdc: record.amountUsdc,
      recipient: record.mintRecipient,
      destWalletId: record.bridgeWalletId,
    });
    return c.json({ status: 'relaying', detail: 'destination mint relay resumed' });
  }
  if (inFlight.has(bridgeId)) {
    return c.json({ status: 'relaying', detail: 'a relay is already in progress' }, 409);
  }

  const url = `${config.IRIS_API_BASE}/v2/messages/${record.sourceDomain}?transactionHash=${record.sourceTxHash}`;
  let attestation: { message: string; attestation: string; eventNonce?: string } | null = null;
  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = (await res.json()) as {
        messages?: Array<{
          status?: string;
          message?: string;
          attestation?: string;
          eventNonce?: string;
        }>;
      };
      const m = data.messages?.[0];
      if (m?.status === 'complete' && m.message && m.attestation) {
        attestation = { message: m.message, attestation: m.attestation, eventNonce: m.eventNonce };
      }
    }
  } catch (err) {
    reportError('bridge.recheck.iris', err, { bridgeId });
    return c.json({ error: 'iris lookup failed', detail: (err as Error).message }, 502);
  }

  if (!attestation) {
    // Attestation still not ready. Kick the relay back into 'relaying' so the
    // loop resumes on the next boot too, and return a friendly status.
    await patchBridge(bridgeId, { status: 'relaying', error: undefined });
    startRelay({
      bridgeId,
      sourceDomain: record.sourceDomain,
      sourceTxHash: record.sourceTxHash,
      amountUsdc: record.amountUsdc,
      mintRecipient: record.mintRecipient,
    });
    return c.json({ status: 'relaying', detail: 'attestation not ready yet, polling resumed' });
  }

  // Attestation is in hand. If the message was already received on chain, just
  // settle the record; otherwise call receiveMessage with the buyer agent.
  if (attestation.eventNonce && (await isMessageAlreadyReceived(attestation.eventNonce))) {
    await markBridgeMinted({
      bridgeId,
      sourceDomain: record.sourceDomain,
      sourceTxHash: record.sourceTxHash,
      amountUsdc: record.amountUsdc,
      mintRecipient: record.mintRecipient,
    });
    return c.json({ status: 'minted', detail: 'message was already received on chain' });
  }

  inFlight.add(bridgeId);
  try {
    const result = await executeContractCall(
      {
        walletId: config.cctpRelayWalletId!,
        contractAddress: config.CCTP_MESSAGE_TRANSMITTER_ADDR,
        abiFunctionSignature: 'receiveMessage(bytes,bytes)',
        abiParameters: [attestation.message, attestation.attestation],
      },
      `cctp.receiveMessage(recheck ${bridgeId})`,
    );
    const ok = await markBridgeMinted(
      {
        bridgeId,
        sourceDomain: record.sourceDomain,
        sourceTxHash: record.sourceTxHash,
        amountUsdc: record.amountUsdc,
        mintRecipient: record.mintRecipient,
      },
      result.txHash,
    );
    if (!ok) {
      // markBridgeMinted has already patched the DB to status:error and
      // emitted bridge.error. Surface the failure to the caller instead of
      // claiming success.
      const fresh = await getBridge(bridgeId);
      return c.json(
        { status: 'error', error: fresh?.error ?? 'mint tx did not confirm on chain' },
        502,
      );
    }
    return c.json({ status: 'minted', mintTxHash: result.txHash });
  } catch (err) {
    const message = (err as Error).message;
    if (attestation.eventNonce && (await isMessageAlreadyReceived(attestation.eventNonce))) {
      await markBridgeMinted({
        bridgeId,
        sourceDomain: record.sourceDomain,
        sourceTxHash: record.sourceTxHash,
        amountUsdc: record.amountUsdc,
        mintRecipient: record.mintRecipient,
      });
      return c.json({ status: 'minted', detail: 'message was already received on chain' });
    }
    reportError('bridge.recheck.receiveMessage', err, { bridgeId });
    await patchBridge(bridgeId, { status: 'error', error: message });
    return c.json({ status: 'error', error: message }, 502);
  } finally {
    inFlight.delete(bridgeId);
  }
});

// Circle-user bridge.
// For users authed via Circle email + passkey, the source-chain burn can't be
// signed by their Arc Circle wallet. This route signs the burn from a
// per-user Circle DCW provisioned on the source chain (Base Sepolia or
// Ethereum Sepolia), then funnels into the same relay loop that mints on Arc.
//
// Flow:
//   1) User funds their source-chain Circle DCW (faucet / external transfer).
//   2) Frontend POSTs here with the source chain key + amount + bridge id.
//   3) Backend lazy-provisions the source-chain DCW if missing, then signs
//      usdc.approve(tokenMessenger, amount) and tokenMessenger.depositForBurn(...)
//      from that DCW. Mint recipient is the user's Arc identity address.
//   4) Backend records the burn and starts the existing relay loop (poll
//      IRIS, sign receiveMessage on Arc via the platform buyer agent).

const circleBridgeSchema = z.object({
  bridgeId: z.string().min(1),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, '0x address required'),
  sourceChainKey: z.enum(CCTP_CHAIN_KEYS),
  amountUsdc: z.number().positive(),
  /// Where the minted USDC arrives on Arc. Usually the user's Arc identity
  /// wallet address (same as `address`), but accepted as a separate field
  /// so the user can route a bridge into their buyer agent in one step.
  mintRecipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/, '0x address required'),
});

bridgeRoutes.post('/circle-bridge', async (c) => {
  let body;
  try {
    body = circleBridgeSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }

  const userAddress = body.address.toLowerCase();
  // Bridges the named user's USDC via their Circle wallet, so the session must
  // BE that user, or anyone could move a victim's funds by naming their address.
  if (!isSessionSelf(c, userAddress)) {
    return c.json({ error: 'You can only bridge your own funds.', code: 'forbidden' }, 403);
  }

  const user = getUserByAddress(userAddress);
  if (!user) {
    return c.json(
      {
        error: 'no Circle identity wallet for this address',
        detail: 'circle-bridge is for Circle email/passkey users. Web3 users sign the burn from their own wallet via the existing relay flow.',
      },
      409,
    );
  }

  if (inFlight.has(body.bridgeId) || sourceInFlight.has(body.bridgeId)) {
    return c.json({ accepted: false, reason: 'bridge already in progress' }, 409);
  }

  const existing = await getBridge(body.bridgeId);
  if (existing) {
    return c.json({
      accepted: false,
      reason: 'bridge id already exists; pass a fresh bridgeId per attempt',
      existing,
    }, 409);
  }

  // Lazy-provision the source-chain DCW. Base Sepolia ships at activation, so
  // this is mostly a fallback for Ethereum Sepolia and for accounts that
  // activated before #102 landed.
  const chainCfg = CCTP_CHAINS[body.sourceChainKey];
  // Web3-only source: Circle has no wallet there, so the backend cannot sign the
  // burn. See CctpChain.circleBlockchain.
  const circleChain = chainCfg.circleBlockchain;
  if (!circleChain) {
    return c.json(
      {
        error: 'chain_not_circle_supported',
        detail: `${chainCfg.name} has no Circle wallet; bridge from it with your own wallet`,
      },
      400,
    );
  }
  let agentWallets = await getAgentWallets(userAddress);
  if (!agentWallets) {
    return c.json({ error: 'user has no agent wallet record; activate first' }, 409);
  }
  const existingBridge = agentWallets.bridgeWallets?.[circleChain];
  let bridgeWalletId: string;
  let bridgeWalletAddress: string;
  if (existingBridge) {
    bridgeWalletId = existingBridge.walletId;
    bridgeWalletAddress = existingBridge.address;
  } else {
    logger.info({ userAddress, blockchain: circleChain }, 'lazy-provisioning bridge wallet');
    try {
      const created = await provisionUserBridgeWallet(userAddress, circleChain);
      bridgeWalletId = created.walletId;
      bridgeWalletAddress = created.address;
      // Persist into the agentWallets row.
      const next = {
        ...agentWallets,
        bridgeWallets: {
          ...(agentWallets.bridgeWallets ?? {}),
          [circleChain]: { walletId: bridgeWalletId, address: bridgeWalletAddress },
        },
      };
      await saveAgentWallets(next);
      agentWallets = next;
    } catch (err) {
      logger.error(
        { userAddress, blockchain: circleChain, err: (err as Error).message },
        'lazy bridge-wallet provisioning failed',
      );
      return c.json(
        { error: 'could not provision bridge wallet', detail: (err as Error).message },
        502,
      );
    }
  }

  // Pre-flight balance check. The most common failure mode for fresh Circle
  // users is that the bridge DCW is provisioned but never funded. There's
  // no USDC for the burn, so depositForBurn reverts on chain. Reading the
  // balance up front and returning an actionable error is cheaper than
  // burning a tx slot to discover it.
  try {
    const sourceClient = sourceClients[body.sourceChainKey];
    const [usdcBalance, gasBalance] = await Promise.all([
      sourceClient.readContract({
        address: chainCfg.usdc as `0x${string}`,
        abi: erc20BalanceOfAbi,
        functionName: 'balanceOf',
        args: [bridgeWalletAddress as `0x${string}`],
      }) as Promise<bigint>,
      sourceClient.getBalance({ address: bridgeWalletAddress as `0x${string}` }),
    ]);
    const neededUsdc = parseUnits(body.amountUsdc.toString(), USDC_DECIMALS);
    if (usdcBalance < neededUsdc) {
      return c.json(
        {
          error: 'bridge wallet under-funded',
          detail: `Bridge wallet has ${formatUnits(usdcBalance, USDC_DECIMALS)} USDC on ${body.sourceChainKey} but needs ${body.amountUsdc}. Send USDC to this address and retry.`,
          bridgeWalletAddress,
          sourceChainKey: body.sourceChainKey,
          usdcBalance: formatUnits(usdcBalance, USDC_DECIMALS),
          usdcNeeded: body.amountUsdc.toString(),
          gasBalance: formatUnits(gasBalance, 18),
        },
        409,
      );
    }
    // Gas precheck. The bridge runs on the source chain, where the CCTP
    // approve + burn are paid in the chain's native token, not Arc USDC. Without
    // this a gas-starved wallet passes the USDC check, starts the pipeline, and
    // the approve never settles, so the bridge sits "pending" forever with no
    // error. Block at the door instead, with an actionable message. Skipped only
    // when Gas Station sponsorship covers THIS specific source chain.
    //
    // Sponsorship resolution:
    //   1. ENABLED=false → no sponsorship, every chain needs gas (precheck on).
    //   2. ENABLED=true + whitelist empty → back-compat: all chains sponsored
    //      (matches the pre-whitelist behavior; safe when the operator has
    //      enabled sponsorship for all CCTP chains in Console).
    //   3. ENABLED=true + whitelist non-empty → only listed chains sponsored.
    //
    // Without (3), a single boolean for a multi-chain Console policy is the
    // source of the long-hanging "APPROVING USDC" on Arbitrum / OP / Polygon
    // Amoy where the SCA has no gas because Console only covers Base + Eth.
    const sponsoredList = config.CIRCLE_GAS_STATION_SPONSORED_CHAINS;
    const sponsored =
      config.CIRCLE_GAS_STATION_ENABLED &&
      (sponsoredList.length === 0 || sponsoredList.includes(body.sourceChainKey));
    const MIN_GAS_WEI = 200_000_000_000_000n; // ~0.0002 native; covers the approve + burn
    if (!sponsored && gasBalance < MIN_GAS_WEI) {
      return c.json(
        {
          error: 'bridge wallet out of gas',
          // Name the address and the amount. This used to point at a "Top up
          // gas" button on the Wallets panel that has never existed, so the one
          // actionable line in the whole failure told the user to press
          // something they could not find.
          detail: `Your ${chainCfg.name} deposit wallet holds ${formatUnits(gasBalance, 18)} ${chainCfg.nativeSymbol}, which is not enough to pay the network fee there. Send a small amount of testnet ${chainCfg.nativeSymbol} to ${bridgeWalletAddress}, then try again.`,
          bridgeWalletAddress,
          sourceChainKey: body.sourceChainKey,
          gasBalance: formatUnits(gasBalance, 18),
        },
        409,
      );
    }
  } catch (err) {
    // Fail closed. Proceeding on a failed read is what lets an under-funded or
    // gas-starved bridge start and then sit pending for hours with no error
    // (an SCA depositForBurn that inner-reverts still lands as a "successful"
    // handleOps tx, so the on-chain call does NOT surface a clear failure). A
    // transient RPC blip is rare and retryable, so ask the user to retry rather
    // than start a doomed bridge.
    logger.warn(
      { bridgeId: body.bridgeId, err: (err as Error).message },
      'preflight balance read failed; refusing to start bridge',
    );
    return c.json(
      {
        error: 'could not verify bridge wallet balance',
        detail: `Could not read the bridge wallet's balance on ${body.sourceChainKey} just now. Try again in a moment.`,
        bridgeWalletAddress,
        sourceChainKey: body.sourceChainKey,
      },
      503,
    );
  }

  // Create the bridge record up front in the 'approving' source stage, then
  // hand off to the async pipeline and return immediately. The pipeline signs
  // the approve + burn from the user's source DCW and polls each Circle tx to
  // settlement in a background loop. Testnet settlement can run minutes past any
  // sane HTTP window, so this is what stops a slow-but-successful Circle tx from
  // surfacing as a hard failure. Persisting first means a restart resumes the
  // pipeline instead of stranding a burned-but-unrecorded transfer.
  // Generate the approve + burn idempotency keys here, before any submit. If
  // the process dies between submit-accepted-at-Circle and our patch persisting
  // the txId, the next attempt re-uses the same key and Circle dedupes server-
  // side, so no second tx is submitted.
  await createBridge({
    bridgeId: body.bridgeId,
    sourceDomain: chainCfg.domain,
    sourceTxHash: '',
    amountUsdc: body.amountUsdc.toString(),
    mintRecipient: body.mintRecipient,
    status: 'approving',
    sourceChainKey: body.sourceChainKey,
    bridgeWalletId,
    bridgeWalletAddress,
    approveIdempotencyKey: randomUUID(),
    burnIdempotencyKey: randomUUID(),
  });

  startSourcePipeline({
    bridgeId: body.bridgeId,
    sourceChainKey: body.sourceChainKey,
    bridgeWalletId,
    bridgeWalletAddress,
    amountUsdc: body.amountUsdc.toString(),
    mintRecipient: body.mintRecipient,
  });

  return c.json(
    {
      accepted: true,
      bridgeId: body.bridgeId,
      status: 'approving',
      sourceAddress: bridgeWalletAddress,
      sourceDomain: chainCfg.domain,
    },
    202,
  );
});

/// App Kit + Forwarding Service variant of the Circle bridge. A single
/// kit.bridge() call drives approve → burn → fetchAttestation → mint;
/// Circle's forwarder broadcasts the destination mint on Arc, so no relay
/// DCW is needed. Supports the 5 EVM CCTP testnet sources AND Solana Devnet
/// (which the hand-rolled /circle-bridge cannot, it is wired only to EVM
/// CCTP V2 contracts).
///
/// Coexists with /circle-bridge: same BridgeRelay record schema, same UI
/// consumers (listBridgesForWallets, the bridge feed). Records created via
/// this route are tagged `appKit: true` so resumePendingBridges skips them
/// on boot (kit.bridge() does not currently checkpoint resumable state
/// across restarts; a future iteration can persist the BridgeResult and
/// call kit.retry()).
const circleBridgeAppKitSchema = z.object({
  bridgeId: z.string().min(1),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, '0x address required'),
  sourceChainKey: z.enum(APP_KIT_SOURCE_CHAIN_KEYS),
  amountUsdc: z.number().positive(),
  mintRecipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/, '0x address required'),
});

bridgeRoutes.post('/circle-bridge-app-kit', async (c) => {
  let body;
  try {
    body = circleBridgeAppKitSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }

  const userAddress = body.address.toLowerCase();
  // The session must BE the named user; this moves their USDC via a Circle wallet.
  if (!isSessionSelf(c, userAddress)) {
    return c.json({ error: 'You can only bridge your own funds.', code: 'forbidden' }, 403);
  }
  const user = getUserByAddress(userAddress);
  if (!user) {
    return c.json(
      {
        error: 'no Circle identity wallet for this address',
        detail: 'circle-bridge-app-kit is for Circle email/passkey users.',
      },
      409,
    );
  }

  if (inFlight.has(body.bridgeId) || sourceInFlight.has(body.bridgeId)) {
    return c.json({ accepted: false, reason: 'bridge already in progress' }, 409);
  }
  const existing = await getBridge(body.bridgeId);
  if (existing) {
    return c.json(
      {
        accepted: false,
        reason: 'bridge id already exists; pass a fresh bridgeId per attempt',
        existing,
      },
      409,
    );
  }

  const chain = APP_KIT_SOURCE_CHAINS[body.sourceChainKey];

  // Lazy-provision the source-chain DCW. Both EVM (SCA) and Solana (EOA)
  // route through provisionUserBridgeWallet, which switches accountType by
  // the blockchain string under the hood.
  let agentWallets = await getAgentWallets(userAddress);
  if (!agentWallets) {
    return c.json({ error: 'user has no agent wallet record; activate first' }, 409);
  }
  const existingBridge = agentWallets.bridgeWallets?.[chain.circleBlockchain];
  let bridgeWalletId: string;
  let bridgeWalletAddress: string;
  if (existingBridge) {
    bridgeWalletId = existingBridge.walletId;
    bridgeWalletAddress = existingBridge.address;
  } else {
    try {
      // chain.circleBlockchain is a BridgeBlockchain union member by
      // construction in APP_KIT_SOURCE_CHAINS (one of the 5 EVM testnets or
      // SOL-DEVNET). The cast is safe because the registry is exhaustive.
      const created = await provisionUserBridgeWallet(
        userAddress,
        chain.circleBlockchain as Parameters<typeof provisionUserBridgeWallet>[1],
      );
      bridgeWalletId = created.walletId;
      bridgeWalletAddress = created.address;
      await saveAgentWallets({
        ...agentWallets,
        bridgeWallets: {
          ...(agentWallets.bridgeWallets ?? {}),
          [chain.circleBlockchain]: { walletId: bridgeWalletId, address: bridgeWalletAddress },
        },
      });
    } catch (err) {
      logger.error(
        { userAddress, blockchain: chain.circleBlockchain, err: (err as Error).message },
        'app-kit lazy bridge-wallet provisioning failed',
      );
      return c.json(
        { error: 'could not provision bridge wallet', detail: (err as Error).message },
        502,
      );
    }
  }

  // EVM pre-checks (USDC balance + native gas) only run on EVM sources.
  // Solana balance is an SPL token on an ATA; App Kit handles that internally
  // and reports balance errors through the returned BridgeResult. We could
  // mirror the pre-check via @solana/web3.js later, but for the first cut
  // we let the SDK surface the failure rather than maintaining a parallel
  // balance-reader.
  if (!chain.isSolana) {
    const evmKey = body.sourceChainKey as CctpChainKey;
    const evmChainCfg = CCTP_CHAINS[evmKey];
    try {
      const sourceClient = sourceClients[evmKey];
      const [usdcBalance, gasBalance] = await Promise.all([
        sourceClient.readContract({
          address: evmChainCfg.usdc as `0x${string}`,
          abi: erc20BalanceOfAbi,
          functionName: 'balanceOf',
          args: [bridgeWalletAddress as `0x${string}`],
        }) as Promise<bigint>,
        sourceClient.getBalance({ address: bridgeWalletAddress as `0x${string}` }),
      ]);
      const neededUsdc = parseUnits(body.amountUsdc.toString(), USDC_DECIMALS);
      if (usdcBalance < neededUsdc) {
        return c.json(
          {
            error: 'bridge wallet under-funded',
            detail: `Your ${chain.name} deposit wallet holds ${formatUnits(usdcBalance, USDC_DECIMALS)} USDC but this transfer needs ${body.amountUsdc}. Send USDC to ${bridgeWalletAddress}, then try again.`,
            bridgeWalletAddress,
            sourceChainKey: body.sourceChainKey,
          },
          409,
        );
      }
      const MIN_GAS_WEI = 200_000_000_000_000n;
      if (!config.CIRCLE_GAS_STATION_ENABLED && gasBalance < MIN_GAS_WEI) {
        return c.json(
          {
            error: 'bridge wallet out of gas',
            detail: `Your ${chain.name} deposit wallet holds ${formatUnits(gasBalance, 18)} ${evmChainCfg.nativeSymbol}, which is not enough to pay the network fee there. Send a small amount of testnet ${evmChainCfg.nativeSymbol} to ${bridgeWalletAddress}, then try again.`,
            bridgeWalletAddress,
            sourceChainKey: body.sourceChainKey,
          },
          409,
        );
      }
    } catch (err) {
      logger.warn(
        { bridgeId: body.bridgeId, err: (err as Error).message },
        'app-kit preflight balance read failed; refusing to start',
      );
      return c.json(
        {
          error: 'could not verify bridge wallet balance',
          detail: `Could not read the bridge wallet's balance on ${chain.name}.`,
        },
        503,
      );
    }
  }

  // Solana's CCTP domain is 5; EVM domains come from CCTP_CHAINS. App Kit
  // doesn't read this off the record (it uses the chain enum directly), but
  // UI consumers persist it in their JSON payload.
  const sourceDomain = chain.isSolana ? 5 : CCTP_CHAINS[body.sourceChainKey as CctpChainKey].domain;

  await createBridge({
    bridgeId: body.bridgeId,
    sourceDomain,
    sourceTxHash: '',
    amountUsdc: body.amountUsdc.toString(),
    mintRecipient: body.mintRecipient,
    status: 'approving',
    sourceChainKey: body.sourceChainKey,
    bridgeWalletId,
    bridgeWalletAddress,
    appKit: true,
  });

  // Fire-and-forget. kit.bridge() runs the full approve/burn/attest/mint
  // lifecycle in the background and patches the bridge record at each step
  // via the SDK event listeners in bridgeInToArcViaAppKit.
  void bridgeInToArcViaAppKit({
    bridgeId: body.bridgeId,
    sourceChainKey: body.sourceChainKey,
    bridgeWalletAddress,
    amountUsdc: body.amountUsdc.toString(),
    mintRecipient: body.mintRecipient,
  });

  return c.json(
    {
      accepted: true,
      bridgeId: body.bridgeId,
      status: 'approving',
      sourceAddress: bridgeWalletAddress,
      sourceChainKey: body.sourceChainKey,
      via: 'app-kit',
    },
    202,
  );
});

/// Resume a Circle bridge that's mid source-pipeline (approving/burning) or
/// waiting on the mint relay. Idempotent: safe to call repeatedly. Used by the
/// frontend retry/auto-recheck for Circle bridges and as a manual nudge. Web3
/// bridges should use /:bridgeId/recheck instead.
/// Lightweight status read used by surfaces that want to render a live
/// progress card without polling /list. Returns the same shape /list does,
/// just for one bridge. Public read: anyone with the bridgeId can poll,
/// since the id itself is the capability.
bridgeRoutes.get('/:bridgeId', async (c) => {
  const bridgeId = c.req.param('bridgeId');
  /// Defensive guard: this single-segment GET pattern matches anything,
  /// including sibling routes registered later in the file like
  /// `/circle-source-address`. Real bridge IDs always contain digits
  /// (a 0x address, a unix-ms timestamp, or a cashout numeric suffix), so
  /// a digit-free name is definitely not a bridge ID. Skipping here lets
  /// Hono fall through to the more specific handler that owns the path.
  if (!/[0-9]/.test(bridgeId)) {
    return c.notFound();
  }
  const record = await getBridge(bridgeId);
  if (!record) return c.json({ error: 'bridge not found' }, 404);
  // Auth: a bridge record is private to its recipient (the owner). Without
  // this, anyone could read another user's bridge status + tx hashes by id.
  if (!isSessionSelf(c, bridgeOwnerFor(record) ?? '')) {
    return c.json({ error: 'not your bridge', code: 'forbidden' }, 403);
  }
  return c.json({
    bridgeId: record.bridgeId,
    direction: record.direction ?? 'in',
    status: record.status,
    amountUsdc: record.amountUsdc,
    sourceChainKey: record.sourceChainKey ?? null,
    destChainKey: record.destChainKey ?? null,
    sourceTxHash: record.sourceTxHash || null,
    mintTxHash: record.mintTxHash ?? null,
    approveTxId: record.approveTxId ?? null,
    burnTxId: record.burnTxId ?? null,
    error: record.error ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
});

bridgeRoutes.post('/circle-bridge/:bridgeId/resume', async (c) => {
  const bridgeId = c.req.param('bridgeId');
  const record = await getBridge(bridgeId);
  if (!record) return c.json({ error: 'bridge not found' }, 404);
  // Auth: only the recipient (owner) may resume their bridge.
  if (!isSessionSelf(c, bridgeOwnerFor(record) ?? '')) {
    return c.json({ error: 'not your bridge', code: 'forbidden' }, 403);
  }
  if (record.status === 'minted') {
    return c.json({ status: 'minted', mintTxHash: record.mintTxHash ?? null });
  }
  // Already burned: just make sure the mint relay is running.
  if (record.sourceTxHash) {
    startRelay({
      bridgeId,
      sourceDomain: record.sourceDomain,
      sourceTxHash: record.sourceTxHash,
      amountUsdc: record.amountUsdc,
      mintRecipient: record.mintRecipient,
    });
    return c.json({ status: 'relaying' });
  }
  // Source stage. Needs the Circle context we persisted at create time.
  if (!record.sourceChainKey || !record.bridgeWalletId || !record.bridgeWalletAddress) {
    return c.json(
      { error: 'bridge has no source context; this is likely a web3 bridge. Use /recheck.' },
      409,
    );
  }
  // App Kit bridges don't have a resumable hand-rolled state to re-enter.
  // Manual operator path: mark the record minted or error after observing
  // the on-chain outcome of the in-flight kit.bridge() call.
  if (record.appKit) {
    return c.json(
      {
        error: 'app-kit bridge has no resumable state',
        detail:
          'This bridge is managed by App Kit. Wait for the in-flight kit.bridge() to settle, then verify the mint on Arcscan and mark the record manually if needed.',
      },
      409,
    );
  }
  if (!isCctpChainKey(record.sourceChainKey)) {
    return c.json(
      {
        error: 'unsupported source chain for hand-rolled resume',
        detail: `source ${record.sourceChainKey} is App Kit-only; the hand-rolled pipeline does not support it`,
      },
      409,
    );
  }
  // Clear a prior error so the row stops showing failed while we re-run.
  if (record.status === 'error') {
    await patchBridge(bridgeId, {
      status: record.burnTxId ? 'burning' : 'approving',
      error: undefined,
    });
  }
  startSourcePipeline({
    bridgeId,
    sourceChainKey: record.sourceChainKey,
    bridgeWalletId: record.bridgeWalletId,
    bridgeWalletAddress: record.bridgeWalletAddress,
    amountUsdc: record.amountUsdc,
    mintRecipient: record.mintRecipient,
  });
  return c.json({ status: 'resuming' });
});

const walletStatusQuery = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  sourceChainKey: z.enum(CCTP_CHAIN_KEYS),
});

/// Returns the user's bridge DCW address and balances on the requested
/// source chain. Lazy-provisions the wallet if missing so the frontend can
/// show "send USDC to this address" before the user even attempts a bridge.
/// Saves users from the "click bridge → on-chain revert → no actionable
/// error" failure mode.
bridgeRoutes.get('/circle-bridge/wallet', async (c) => {
  const parsed = walletStatusQuery.safeParse({
    address: c.req.query('address') ?? '',
    sourceChainKey: c.req.query('sourceChainKey') ?? '',
  });
  if (!parsed.success) {
    return c.json({ error: 'invalid query', detail: parsed.error.message }, 400);
  }
  const userAddress = parsed.data.address.toLowerCase();
  // Auth: a caller may only query/provision their OWN bridge wallet. Without
  // this, an attacker could enumerate addresses and lazily provision Circle
  // bridge wallets for others (and read the resulting addresses).
  if (!isSessionSelf(c, userAddress)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  }
  const user = getUserByAddress(userAddress);
  if (!user) {
    return c.json({ error: 'no Circle account for this address' }, 404);
  }
  let agentWallets = await getAgentWallets(userAddress);
  if (!agentWallets) {
    return c.json({ error: 'user has no agent wallet record' }, 409);
  }
  const chainCfg = CCTP_CHAINS[parsed.data.sourceChainKey];
  const circleChain = chainCfg.circleBlockchain;
  if (!circleChain) {
    return c.json(
      {
        error: 'chain_not_circle_supported',
        detail: `${chainCfg.name} has no Circle wallet; bridge from it with your own wallet`,
      },
      400,
    );
  }
  const existing = agentWallets.bridgeWallets?.[circleChain];
  let bridgeWalletAddress: string;
  if (existing) {
    bridgeWalletAddress = existing.address;
  } else {
    try {
      const created = await provisionUserBridgeWallet(userAddress, circleChain);
      bridgeWalletAddress = created.address;
      const next = {
        ...agentWallets,
        bridgeWallets: {
          ...(agentWallets.bridgeWallets ?? {}),
          [circleChain]: { walletId: created.walletId, address: created.address },
        },
      };
      await saveAgentWallets(next);
    } catch (err) {
      return c.json(
        { error: 'could not provision bridge wallet', detail: (err as Error).message },
        502,
      );
    }
  }
  // Resolved exactly as the bridge route's gas precheck resolves it, so the
  // card can only claim sponsorship the backend will actually honour. Asserting
  // it from a static list on the frontend is what let the banner say "gas
  // sponsored" and the bridge then 409 for an empty gas tank.
  const sponsoredChains = config.CIRCLE_GAS_STATION_SPONSORED_CHAINS;
  const gasSponsored =
    config.CIRCLE_GAS_STATION_ENABLED &&
    (sponsoredChains.length === 0 || sponsoredChains.includes(parsed.data.sourceChainKey));

  try {
    const sourceClient = sourceClients[parsed.data.sourceChainKey];
    const [usdcBalance, gasBalance] = await Promise.all([
      sourceClient.readContract({
        address: chainCfg.usdc as `0x${string}`,
        abi: erc20BalanceOfAbi,
        functionName: 'balanceOf',
        args: [bridgeWalletAddress as `0x${string}`],
      }) as Promise<bigint>,
      sourceClient.getBalance({ address: bridgeWalletAddress as `0x${string}` }),
    ]);
    return c.json({
      bridgeWalletAddress,
      sourceChainKey: parsed.data.sourceChainKey,
      usdcBalance: formatUnits(usdcBalance, USDC_DECIMALS),
      gasBalance: formatUnits(gasBalance, 18),
      gasSponsored,
    });
  } catch (err) {
    return c.json(
      {
        bridgeWalletAddress,
        sourceChainKey: parsed.data.sourceChainKey,
        usdcBalance: null,
        gasBalance: null,
        gasSponsored,
        error: 'balance read failed',
        detail: (err as Error).message,
      },
      200,
    );
  }
});

/// Returns or lazy-provisions the user's source-chain bridge wallet address
/// so the frontend can display it (faucet target, "send USDC here" copy).
/// Accepts both CCTP chain keys (the 5 EVM testnets handled by the hand-rolled
/// pipeline) and App Kit chain keys (currently Solana Devnet, signed via the
/// Circle Wallets adapter on the backend). Resolves the Circle blockchain
/// string from whichever registry owns the key and runs the same
/// provisionUserBridgeWallet path, which switches accountType internally
/// (SCA for EVM, EOA for Solana).
bridgeRoutes.get('/circle-source-address', async (c) => {
  const address = c.req.query('address');
  const sourceChainKey = c.req.query('sourceChainKey');
  if (!address || !sourceChainKey) {
    return c.json({ error: 'address and sourceChainKey are required' }, 400);
  }
  let circleBlockchain: string;
  if (isCctpChainKey(sourceChainKey)) {
    const code = CCTP_CHAINS[sourceChainKey].circleBlockchain;
    // No Circle wallet on this chain, so there is no deposit address to hand
    // back. The user bridges from it with their own wallet instead.
    if (!code) {
      return c.json(
        {
          error: 'chain_not_circle_supported',
          detail: `${CCTP_CHAINS[sourceChainKey].name} has no Circle wallet; bridge from it with your own wallet`,
        },
        400,
      );
    }
    circleBlockchain = code;
  } else if (sourceChainKey in APP_KIT_SOURCE_CHAINS) {
    circleBlockchain =
      APP_KIT_SOURCE_CHAINS[sourceChainKey as keyof typeof APP_KIT_SOURCE_CHAINS]
        .circleBlockchain;
  } else {
    return c.json(
      { error: 'sourceChainKey must be a supported CCTP or App Kit chain' },
      400,
    );
  }

  const userAddress = address.toLowerCase();
  // Auth: only the owner may read their bridge source address.
  if (!isSessionSelf(c, userAddress)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  }
  const user = getUserByAddress(userAddress);
  if (!user) {
    return c.json({ error: 'not a Circle user' }, 409);
  }
  const wallets = await getAgentWallets(userAddress);
  if (!wallets) return c.json({ error: 'activate first' }, 409);

  // Whether Gas Station actually covers THIS chain, resolved the same way the
  // bridge route's gas precheck resolves it. The card used to assert "gas
  // sponsored" from a hardcoded chain list on the frontend, which promised
  // sponsorship the operator had not configured — so the user read "sponsored"
  // and then got a 409 for an empty gas tank. One source of truth: the backend
  // that enforces it.
  const sponsoredList = config.CIRCLE_GAS_STATION_SPONSORED_CHAINS;
  const gasSponsored =
    config.CIRCLE_GAS_STATION_ENABLED &&
    (sponsoredList.length === 0 || sponsoredList.includes(sourceChainKey));

  const existing = wallets.bridgeWallets?.[circleBlockchain];
  if (existing) {
    return c.json({ address: existing.address, blockchain: circleBlockchain, gasSponsored });
  }

  try {
    const created = await provisionUserBridgeWallet(
      userAddress,
      circleBlockchain as Parameters<typeof provisionUserBridgeWallet>[1],
    );
    const next = {
      ...wallets,
      bridgeWallets: {
        ...(wallets.bridgeWallets ?? {}),
        [circleBlockchain]: { walletId: created.walletId, address: created.address },
      },
    };
    await saveAgentWallets(next);
    return c.json({ address: created.address, blockchain: circleBlockchain, gasSponsored });
  } catch (err) {
    return c.json(
      { error: 'lazy provisioning failed', detail: (err as Error).message },
      502,
    );
  }
});

// Bridge out (Arc -> chain). Burn USDC on Arc from the user's Circle identity
// DCW, then relay the mint on the destination chain via that chain's bridge DCW
// (which pays the destination gas). Circle accounts only here: the backend signs
// the Arc burn. Web3 users sign the Arc burn themselves and would post the burn
// txHash to a relay endpoint (a thin follow-up that reuses startOutRelay).

/// Base58 (no 0/O/I/l) sanity check for a Solana address, 32-44 chars.
const SOLANA_ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const bridgeOutSchema = z
  .object({
    bridgeId: z.string().min(1),
    address: z.string().startsWith('0x'),
    // Solana Devnet is a valid destination alongside the CCTP EVM chains — the
    // App Kit forwarder mints there (verified). It is NOT a CCTP source key, so
    // it is added explicitly here rather than in CCTP_CHAIN_KEYS.
    destChainKey: z.enum([...CCTP_CHAIN_KEYS, 'solanaDevnet'] as const),
    amountUsdc: z.number().positive(),
    /// Where the minted USDC lands. A 0x EVM address, or a base58 Solana OWNER
    /// address (App Kit derives its USDC ATA). Validated per destination below.
    recipient: z.string().min(1),
    /// Optional: which Karwan wallet on Arc burns. Defaults to the identity
    /// wallet (the standard /bridge surface). The cashout page passes
    /// 'sellerAgent' with a `sourceJobId` so the deal's seller-agent wallet
    /// burns instead, that's where released escrow USDC actually lives.
    sourceKind: z.enum(['identity', 'sellerAgent', 'buyerAgent']).optional(),
    sourceJobId: z.string().min(1).optional(),
  })
  .superRefine((val, ctx) => {
    const ok = isSolanaDestKey(val.destChainKey)
      ? SOLANA_ADDR_RE.test(val.recipient)
      : /^0x[0-9a-fA-F]{40}$/.test(val.recipient);
    if (!ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recipient'],
        message: isSolanaDestKey(val.destChainKey)
          ? 'recipient must be a base58 Solana address'
          : 'recipient must be a 0x address',
      });
    }
  });

const outInFlight = new Set<string>();

bridgeRoutes.post('/circle-bridge-out', async (c) => {
  let body;
  try {
    body = bridgeOutSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  const userAddress = body.address.toLowerCase();
  // CRITICAL: this burns the named user's USDC and mints to body.recipient. The
  // session must BE that user, or anyone could drain a victim's wallet to an
  // address they control by naming the victim here.
  if (!isSessionSelf(c, userAddress)) {
    return c.json({ error: 'You can only bridge out your own funds.', code: 'forbidden' }, 403);
  }
  const user = getUserByAddress(userAddress);

  // Decide which wallet on Arc will burn. The identity source is custodial only
  // for Circle accounts (web3 users sign their own Arc burn on the wallet path).
  // The seller and buyer agent wallets are Circle DCWs we sign for regardless of
  // account kind, so a web3 seller can still bridge out released escrow USDC or
  // sweep their buyer wallet from here without connecting anything.
  let sourceWalletId: string;
  let sourceWalletAddress: string;
  if (body.sourceKind === 'sellerAgent') {
    if (!body.sourceJobId) {
      return c.json(
        { error: 'sourceJobId required when sourceKind is sellerAgent' },
        400,
      );
    }
    const { getDeal } = await import('../db/deals.js');
    const deal = await getDeal(body.sourceJobId);
    if (!deal) return c.json({ error: 'deal not found' }, 404);
    if (deal.seller.toLowerCase() !== userAddress) {
      return c.json(
        { error: 'only the seller of this deal can use its agent wallet as source' },
        403,
      );
    }
    if (!deal.sellerAgentWalletId || !deal.sellerAgentAddress) {
      return c.json(
        {
          error: 'deal has no seller-agent wallet',
          detail:
            'This deal was opened before per-user agent wallets existed. Use identity wallet instead.',
          code: 'NO_DEAL_WALLET',
        },
        409,
      );
    }
    sourceWalletId = deal.sellerAgentWalletId;
    sourceWalletAddress = deal.sellerAgentAddress.toLowerCase();
  } else if (body.sourceKind === 'buyerAgent') {
    const buyerWallets = await getAgentWallets(userAddress);
    if (!buyerWallets?.buyerWalletId || !buyerWallets.buyerAddress) {
      return c.json(
        {
          error: 'buyer agent wallet not available',
          detail:
            'You have not activated a buyer agent, so there is no buyer wallet to bridge from.',
          code: 'NO_BUYER_WALLET',
        },
        409,
      );
    }
    sourceWalletId = buyerWallets.buyerWalletId;
    sourceWalletAddress = buyerWallets.buyerAddress.toLowerCase();
  } else {
    if (!user?.circleIdentityWalletId) {
      return c.json(
        {
          error: 'bridge-out is for Circle accounts',
          detail: 'Web3 wallets sign the Arc burn themselves; use the wallet bridge-out path.',
        },
        409,
      );
    }
    sourceWalletId = user.circleIdentityWalletId;
    sourceWalletAddress = userAddress;
  }

  // No destination-wallet check any more. This route used to relay the mint from
  // a Circle DCW on the destination chain, which capped withdrawals at the five
  // chains Circle can hold a wallet on. It now goes through App Kit with the
  // Forwarding Service, so CIRCLE submits the destination mint and no wallet
  // exists there to constrain us. Every chain reports
  // cctp.forwarderSupported.destination, so all eleven are reachable.
  //
  // The Arc side is unchanged: the burn is still signed by a Circle DCW, and Arc
  // IS a Circle-supported chain, so that keeps working for the destinations
  // Circle itself cannot reach.
  const amountWei = parseUnits(body.amountUsdc.toString(), USDC_DECIMALS);

  // Preflight: the chosen source wallet must hold enough Arc USDC (which is
  // also the Arc gas token, so a little extra is consumed by the burn).
  try {
    const bal = await readUsdcBalance(sourceWalletAddress);
    if (bal < amountWei) {
      const which =
        body.sourceKind === 'sellerAgent'
          ? 'The deal wallet'
          : body.sourceKind === 'buyerAgent'
            ? 'The buyer wallet'
            : 'Your identity wallet';
      return c.json(
        {
          error: 'insufficient balance',
          detail: `${which} holds ${formatUnits(bal, USDC_DECIMALS)} USDC on Arc, less than the ${body.amountUsdc} you want to bridge out.`,
        },
        409,
      );
    }
  } catch {
    return c.json(
      { error: 'could not verify Arc balance', detail: 'Try again in a moment.' },
      503,
    );
  }

  await createBridge({
    bridgeId: body.bridgeId,
    direction: 'out',
    // Ownership binds to the user's identity. mintRecipient is the destination
    // recipient (not the user's Arc address), so auth reads owner, not it.
    owner: userAddress,
    sourceDomain: ARC_DOMAIN,
    sourceTxHash: '',
    amountUsdc: body.amountUsdc.toString(),
    mintRecipient: body.recipient,
    status: 'burning',
    destChainKey: body.destChainKey,
    appKit: true,
    // The Arc wallet that burns. No destination wallet is recorded any more:
    // Circle's forwarder owns the mint.
    bridgeWalletId: sourceWalletId,
    bridgeWalletAddress: sourceWalletAddress,
  });

  // Fire-and-forget. The Arc DCW signs the burn, and the Forwarding Service
  // fetches the attestation and broadcasts the destination mint, so this reaches
  // every chain including the six Circle cannot hold a wallet on.
  void bridgeOutFromArcViaAppKit({
    bridgeId: body.bridgeId,
    destChainKey: body.destChainKey,
    sourceWalletAddress,
    amountUsdc: body.amountUsdc.toString(),
    recipient: body.recipient,
  });

  return c.json(
    { accepted: true, bridgeId: body.bridgeId, status: 'burning', direction: 'out' },
    202,
  );
});

// --- Web3 bridge-out: the user's own wallet signs the Arc burn -----------------
// A web3 (SIWE) user does not have a Circle wallet to burn from, and the
// /circle-bridge-out path rejects them. Instead they sign approve + depositForBurn
// on Arc from their own wallet, then hand us the burn so we relay the destination
// mint with the same machinery the Circle path uses (startOutRelay).

const web3OutQuoteSchema = z.object({
  destChainKey: z.enum(CCTP_CHAIN_KEYS),
  amountUsdc: z.number().positive(),
  recipient: z.string().startsWith('0x'),
});

/// Hands the frontend the exact parameters to sign on Arc, so a web3 user's
/// depositForBurn matches what the relay expects (right domain, padded
/// recipient, and a Fast maxFee so the transfer settles in seconds, not the
/// ~13-19 min Standard path).
bridgeRoutes.post('/web3-bridge-out/quote', async (c) => {
  let body;
  try {
    body = web3OutQuoteSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  const dest = CCTP_CHAINS[body.destChainKey];
  const amountWei = parseUnits(body.amountUsdc.toString(), USDC_DECIMALS);
  const maxFee = await computeFastMaxFee(ARC_DOMAIN, dest.domain, amountWei);
  return c.json({
    tokenMessenger: TOKEN_MESSENGER_V2,
    usdc: ARC_USDC,
    arcDomain: ARC_DOMAIN,
    destDomain: dest.domain,
    amountWei: amountWei.toString(),
    mintRecipient: addressToBytes32(body.recipient),
    destinationCaller: `0x${'0'.repeat(64)}`,
    maxFee,
    finalityThreshold: FINALITY_THRESHOLD_FAST,
    // depositForBurn(uint256,uint32,bytes32,address,bytes32,uint256,uint32)
    depositForBurnArgs: [
      amountWei.toString(),
      dest.domain,
      addressToBytes32(body.recipient),
      ARC_USDC,
      `0x${'0'.repeat(64)}`,
      maxFee,
      FINALITY_THRESHOLD_FAST,
    ],
  });
});

const web3OutSchema = z.object({
  bridgeId: z.string().min(1),
  address: z.string().startsWith('0x'),
  destChainKey: z.enum(CCTP_CHAIN_KEYS),
  amountUsdc: z.number().positive(),
  recipient: z.string().startsWith('0x'),
  /// The Arc burn the user already signed from their own wallet.
  sourceTxHash: z.string().startsWith('0x'),
});

/// Resume the destination mint after a user-signed Arc burn. We never touch the
/// burn ourselves; we provision the destination relay wallet (which pays the
/// mint gas), persist the record, and run the same outbound relay as the Circle
/// path. The IRIS attestation step gates a bogus burn hash, so an invalid
/// sourceTxHash simply never produces a mint rather than minting wrongly.
bridgeRoutes.post('/web3-bridge-out', async (c) => {
  let body;
  try {
    body = web3OutSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  const userAddress = body.address.toLowerCase();
  // The relay burns destination gas from the named user's bridge DCW and
  // writes bridge records against them; only that signed-in user may start it.
  if (!isSessionSelf(c, userAddress)) {
    return c.json({ error: 'You can only relay your own bridge-out.', code: 'forbidden' }, 403);
  }

  // Don't clobber an existing bridge's burn hash (stale tab / double submit).
  const existing = await getBridge(body.bridgeId);
  if (existing && existing.sourceTxHash && existing.sourceTxHash.toLowerCase() !== body.sourceTxHash.toLowerCase()) {
    return c.json(
      { accepted: false, reason: 'bridge already exists with a different burn; use /:bridgeId/recheck' },
      409,
    );
  }

  const dest = CCTP_CHAINS[body.destChainKey];
  // Even on the web3 path the backend relays the destination mint, so the
  // destination still needs a Circle wallet. Web3-only chains are bridge-in
  // sources, never bridge-out destinations. See CctpChain.circleBlockchain.
  const destCircleChain = dest.circleBlockchain;
  if (!destCircleChain) {
    return c.json(
      {
        error: 'chain_not_circle_supported',
        detail: `Cannot withdraw to ${dest.name}: Circle cannot relay the mint there`,
      },
      400,
    );
  }

  // The destination bridge DCW relays the mint and pays its gas. Provision it
  // lazily on the user's first bridge to that chain, exactly like the Circle path.
  const wallets = await getAgentWallets(userAddress);
  if (!wallets) return c.json({ error: 'no agent wallets — activate first' }, 409);
  let destWallet = wallets.bridgeWallets?.[destCircleChain];
  if (!destWallet) {
    try {
      const created = await provisionUserBridgeWallet(userAddress, destCircleChain);
      destWallet = { walletId: created.walletId, address: created.address };
      await saveAgentWallets({
        ...wallets,
        bridgeWallets: {
          ...(wallets.bridgeWallets ?? {}),
          [destCircleChain]: destWallet,
        },
      });
    } catch (err) {
      return c.json(
        { error: 'destination wallet provisioning failed', detail: (err as Error).message },
        502,
      );
    }
  }
  void dripTestnetUsdc(destWallet.address, {
    blockchain: dest.circleBlockchain,
    native: true,
    usdc: false,
  });

  await createBridge({
    bridgeId: body.bridgeId,
    direction: 'out',
    owner: userAddress,
    sourceDomain: ARC_DOMAIN,
    sourceTxHash: body.sourceTxHash,
    amountUsdc: body.amountUsdc.toString(),
    mintRecipient: body.recipient,
    status: 'relaying',
    destChainKey: body.destChainKey,
    bridgeWalletId: destWallet.walletId,
    bridgeWalletAddress: destWallet.address,
  });

  bus.emitEvent({
    type: 'bridge.burned',
    actor: 'buyer',
    payload: {
      bridgeId: body.bridgeId,
      direction: 'out',
      destChainKey: body.destChainKey,
      sourceTxHash: body.sourceTxHash,
      amountUsdc: body.amountUsdc.toString(),
      web3: true,
    },
  });

  startOutRelay({
    bridgeId: body.bridgeId,
    destChainKey: body.destChainKey,
    sourceTxHash: body.sourceTxHash,
    amountUsdc: body.amountUsdc.toString(),
    recipient: body.recipient,
    destWalletId: destWallet.walletId,
  });

  return c.json(
    { accepted: true, bridgeId: body.bridgeId, status: 'relaying', direction: 'out' },
    202,
  );
});

// The Circle out-pipeline (burn on a DCW, then relay the mint from a DESTINATION
// DCW) is gone. Withdrawals now run through App Kit + the Forwarding Service in
// bridgeOutFromArcViaAppKit: Circle submits the destination mint, so there is no
// destination wallet, and every chain becomes reachable rather than only the
// five Circle can hold a wallet on. startOutRelay survives because the web3
// bridge-out path and the resume/recheck logic still relay a user-signed burn.


interface OutRelayInput {
  bridgeId: string;
  destChainKey: CctpChainKey;
  sourceTxHash: string;
  amountUsdc: string;
  recipient: string;
  destWalletId: string;
}

function startOutRelay(input: OutRelayInput) {
  const key = `out:${input.bridgeId}`;
  if (outInFlight.has(key)) return;
  outInFlight.add(key);
  outRelayLoop(input).finally(() => outInFlight.delete(key));
}

/// True if a CCTP message nonce has already been consumed on the given chain's
/// MessageTransmitter (so we don't double-mint or revert on a used nonce).
async function isMessageReceivedOn(
  client: PublicClient,
  eventNonce: string,
): Promise<boolean> {
  try {
    const used = (await client.readContract({
      address: MESSAGE_TRANSMITTER_V2 as `0x${string}`,
      abi: messageTransmitterAbi,
      functionName: 'usedNonces',
      args: [eventNonce as `0x${string}`],
    })) as bigint;
    return used !== 0n;
  } catch {
    return false;
  }
}

/// Marks an out-bridge minted. Verifies the destination receipt when a txHash is
/// supplied so a reverted mint surfaces as an error rather than false success.
async function markOutMinted(
  input: OutRelayInput,
  destClient: PublicClient,
  txHash?: string,
): Promise<void> {
  if (txHash) {
    try {
      const receipt = await destClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
        timeout: 90_000,
      });
      if (receipt.status !== 'success') {
        const message = `Destination mint ${txHash} reverted on ${input.destChainKey}`;
        await patchBridge(input.bridgeId, { status: 'error', error: message });
        bus.emitEvent({
          type: 'bridge.error',
          actor: 'buyer',
          payload: { bridgeId: input.bridgeId, scope: 'receiveMessage', message },
        });
        return;
      }
    } catch (err) {
      // Could not confirm the receipt; leave the record relaying so a recheck can
      // settle it rather than flipping to a possibly-wrong terminal state.
      logger.warn(
        { bridgeId: input.bridgeId, err: (err as Error).message },
        'out-mint receipt verify failed; leaving relaying',
      );
      return;
    }
  }
  await patchBridge(input.bridgeId, {
    status: 'minted',
    ...(txHash ? { mintTxHash: txHash } : {}),
  });
  bus.emitEvent({
    type: 'bridge.minted',
    actor: 'buyer',
    payload: {
      bridgeId: input.bridgeId,
      direction: 'out',
      destChainKey: input.destChainKey,
      amountUsdc: input.amountUsdc,
      mintRecipient: input.recipient,
      sourceTxHash: input.sourceTxHash,
      ...(txHash ? { txHash } : { alreadyMinted: true }),
    },
  });
}

/// Polls IRIS for the Arc-origin burn's attestation, then calls receiveMessage
/// on the destination chain via that chain's bridge DCW.
async function outRelayLoop(input: OutRelayInput) {
  const destClient = sourceClients[input.destChainKey];
  const startedAt = Date.now();
  const url = `${config.IRIS_API_BASE}/v2/messages/${ARC_DOMAIN}?transactionHash=${input.sourceTxHash}`;
  let attestation: { message: string; attestation: string; eventNonce?: string } | null = null;

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as {
          messages?: Array<{
            status?: string;
            message?: string;
            attestation?: string;
            eventNonce?: string;
          }>;
        };
        const m = data.messages?.[0];
        if (m?.status === 'complete' && m.message && m.attestation) {
          attestation = { message: m.message, attestation: m.attestation, eventNonce: m.eventNonce };
          break;
        }
      } else if (res.status !== 404) {
        logger.warn({ status: res.status }, 'out-relay iris lookup non-2xx');
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'out-relay iris poll error');
    }
    await sleep(POLL_INTERVAL_MS);
  }

  if (!attestation) {
    const message = 'Attestation did not arrive within poll window';
    reportError('bridge.out.attestation', new Error(message), { bridgeId: input.bridgeId });
    await patchBridge(input.bridgeId, { status: 'error', error: message });
    bus.emitEvent({
      type: 'bridge.error',
      actor: 'buyer',
      payload: { bridgeId: input.bridgeId, scope: 'attestation', message },
    });
    return;
  }

  bus.emitEvent({
    type: 'bridge.attested',
    actor: 'buyer',
    payload: { bridgeId: input.bridgeId, sourceTxHash: input.sourceTxHash },
  });

  if (attestation.eventNonce && (await isMessageReceivedOn(destClient, attestation.eventNonce))) {
    await markOutMinted(input, destClient);
    return;
  }

  try {
    const result = await executeContractCall(
      {
        walletId: input.destWalletId,
        contractAddress: MESSAGE_TRANSMITTER_V2,
        abiFunctionSignature: 'receiveMessage(bytes,bytes)',
        abiParameters: [attestation.message, attestation.attestation],
      },
      `bridge-out.receiveMessage(${input.bridgeId})`,
    );
    await markOutMinted(input, destClient, result.txHash);
  } catch (err) {
    if (attestation.eventNonce && (await isMessageReceivedOn(destClient, attestation.eventNonce))) {
      await markOutMinted(input, destClient);
      return;
    }
    const message = (err as Error).message;
    reportError('bridge.out.receiveMessage', err, { bridgeId: input.bridgeId });
    await patchBridge(input.bridgeId, { status: 'error', error: message });
    bus.emitEvent({
      type: 'bridge.error',
      actor: 'buyer',
      payload: { bridgeId: input.bridgeId, scope: 'receiveMessage', message },
    });
  }
}
