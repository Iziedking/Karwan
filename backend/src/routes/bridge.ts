import { Hono } from 'hono';
import { z } from 'zod';
import { createPublicClient, http, formatUnits, parseUnits, type PublicClient } from 'viem';
import { config } from '../config.js';
import { executeContractCall, submitContractCall, getTxState } from '../chain/txs.js';
import { publicClient } from '../chain/client.js';
import {
  createBridge,
  getBridge,
  patchBridge,
  listPendingBridges,
  listBridgesForWallets,
} from '../db/bridges.js';
import { getAgentWallets, saveAgentWallets } from '../db/agentWallets.js';
import { getUserByAddress } from '../db/users.js';
import { provisionUserBridgeWallet, dripTestnetUsdc } from '../circle/wallets.js';
import { usdc as ARC_USDC, readUsdcBalance } from '../chain/contracts.js';
import {
  CCTP_CHAINS,
  CCTP_CHAIN_KEYS,
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

/// Lightweight public clients per CCTP chain for source/destination balance and
/// allowance reads. Created once and reused (viem's HTTP client allocates a
/// fetch pool). Keyed by chain key so any registered chain works.
const sourceClients = Object.fromEntries(
  CCTP_CHAIN_KEYS.map((k) => [
    k,
    createPublicClient({ chain: CCTP_CHAINS[k].viemChain, transport: http() }),
  ]),
) as Record<CctpChainKey, PublicClient>;

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
const SOURCE_DOMAINS = new Set(CCTP_CHAIN_KEYS.map((k) => CCTP_CHAINS[k].domain));

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
  sourceTxHash: z.string().startsWith('0x'),
  amountUsdc: z.string(),
  mintRecipient: z.string().startsWith('0x'),
});

const inFlight = new Set<string>();

const POLL_INTERVAL_MS = 5_000;
// CCTP V2 standard finality is ~13-19 min on testnet, but Circle's IRIS Sandbox
// sometimes lags much longer. Give the relay a long, generous window before
// declaring a hard error; the user can also call /recheck at any point.
const POLL_TIMEOUT_MS = 6 * 60 * 60 * 1000; // 6 hours

export const bridgeRoutes = new Hono();

/// Every Circle bridge this user has started, newest first, with its current
/// status and tx ids. Lets a user (or operator) see whether a bridge is
/// approving / burning / relaying / minted / errored instead of guessing. Keyed
/// off the user's source-chain DCW(s), resolved from their agent-wallet record.
bridgeRoutes.get('/list', async (c) => {
  const address = c.req.query('address');
  if (!address) return c.json({ error: 'address query param required' }, 400);
  const wallets = await getAgentWallets(address.toLowerCase());
  const bridgeAddrs = Object.values(wallets?.bridgeWallets ?? {}).map((w) => w.address);
  if (bridgeAddrs.length === 0) return c.json({ bridges: [] });
  const records = await listBridgesForWallets(bridgeAddrs);
  return c.json({
    bridges: records.map((b) => ({
      bridgeId: b.bridgeId,
      status: b.status,
      amountUsdc: b.amountUsdc,
      sourceChainKey: b.sourceChainKey ?? null,
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

bridgeRoutes.post('/relay', async (c) => {
  if (!config.BUYER_AGENT_WALLET_ID) {
    return c.json({ error: 'BUYER_AGENT_WALLET_ID not configured' }, 500);
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
  // client could still POST a fresh burn for the same bridgeId — that would
  // overwrite the original sourceTxHash and orphan the user's first burn.
  const existing = await getBridge(body.bridgeId);
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
    // Bridge-out: burn is on Arc, mint is on the destination chain. Resume only
    // the destination mint relay (the Arc burn is synchronous, so a record stuck
    // pre-burn after a restart has no on-chain effect and is left to retry).
    if (b.direction === 'out') {
      if (b.sourceTxHash && b.destChainKey && b.bridgeWalletId) {
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
    // the source context we persisted at create time.
    if (
      (b.status === 'approving' || b.status === 'burning') &&
      b.sourceChainKey &&
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
        walletId: config.BUYER_AGENT_WALLET_ID!,
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

/* ============================================================================
   CIRCLE SOURCE PIPELINE.
   Signs approve + burn from the user's source-chain Circle DCW, asynchronously.
   Each step is submitted (id captured + persisted) then polled to settlement in
   the background, so a Circle tx that settles minutes later (Base Sepolia
   testnet has done this) is never thrown away. On a slow stage the loop exits
   leaving the bridge in its source state; resumePendingBridges (next boot) or
   POST /circle-bridge/:id/resume continues it. Only a hard Circle FAILED state
   marks the bridge errored. Once the burn lands we set sourceTxHash and hand
   off to the existing mint relay.
   ========================================================================== */

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
    // STAGE 1 — APPROVE. Skip when the live allowance already covers the amount
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

    // STAGE 2 — BURN.
    record = (await getBridge(input.bridgeId)) ?? record;
    let burnTxId = record.burnTxId;
    if (!burnTxId) {
      await patchBridge(input.bridgeId, { status: 'burning' });
      bus.emitEvent({
        type: 'bridge.burning',
        actor: 'buyer',
        payload: { bridgeId: input.bridgeId, sourceChainKey: input.sourceChainKey, circle: true },
      });
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
            '0',
            FINALITY_THRESHOLD_FAST.toString(),
          ],
          feeLevel: 'HIGH',
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

    // STAGE 3 — hand off to the mint relay.
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
  if (!config.BUYER_AGENT_WALLET_ID) {
    return c.json({ error: 'BUYER_AGENT_WALLET_ID not configured' }, 500);
  }
  const bridgeId = c.req.param('bridgeId');
  const record = await getBridge(bridgeId);
  if (!record) return c.json({ error: 'bridge not found' }, 404);
  if (record.status === 'minted') {
    return c.json({ status: 'minted', mintTxHash: record.mintTxHash ?? null });
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
        walletId: config.BUYER_AGENT_WALLET_ID!,
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

/* ============================================================================
   CIRCLE-USER BRIDGE.
   For users authed via Circle email + passkey, the source-chain burn can't be
   signed by their Arc Circle wallet. This route signs the burn from a
   per-user Circle DCW provisioned on the source chain (Base Sepolia or
   Ethereum Sepolia), then funnels into the same relay loop that mints on Arc.

   Flow:
     1) User funds their source-chain Circle DCW (faucet / external transfer).
     2) Frontend POSTs here with the source chain key + amount + bridge id.
     3) Backend lazy-provisions the source-chain DCW if missing, then signs
        usdc.approve(tokenMessenger, amount) and tokenMessenger.depositForBurn(...)
        from that DCW. Mint recipient is the user's Arc identity address.
     4) Backend records the burn and starts the existing relay loop (poll
        IRIS, sign receiveMessage on Arc via the platform buyer agent).
   ========================================================================== */

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
  let agentWallets = await getAgentWallets(userAddress);
  if (!agentWallets) {
    return c.json({ error: 'user has no agent wallet record; activate first' }, 409);
  }
  const existingBridge = agentWallets.bridgeWallets?.[chainCfg.circleBlockchain];
  let bridgeWalletId: string;
  let bridgeWalletAddress: string;
  if (existingBridge) {
    bridgeWalletId = existingBridge.walletId;
    bridgeWalletAddress = existingBridge.address;
  } else {
    logger.info(
      { userAddress, blockchain: chainCfg.circleBlockchain },
      'lazy-provisioning bridge wallet',
    );
    try {
      const created = await provisionUserBridgeWallet(userAddress, chainCfg.circleBlockchain);
      bridgeWalletId = created.walletId;
      bridgeWalletAddress = created.address;
      // Persist into the agentWallets row.
      const next = {
        ...agentWallets,
        bridgeWallets: {
          ...(agentWallets.bridgeWallets ?? {}),
          [chainCfg.circleBlockchain]: { walletId: bridgeWalletId, address: bridgeWalletAddress },
        },
      };
      await saveAgentWallets(next);
      agentWallets = next;
    } catch (err) {
      logger.error(
        { userAddress, blockchain: chainCfg.circleBlockchain, err: (err as Error).message },
        'lazy bridge-wallet provisioning failed',
      );
      return c.json(
        { error: 'could not provision bridge wallet', detail: (err as Error).message },
        502,
      );
    }
  }

  // Pre-flight balance check. The most common failure mode for fresh Circle
  // users is that the bridge DCW is provisioned but never funded — there's
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
    // error. Block at the door instead, with an actionable message. Skipped when
    // Gas Station sponsorship is on (the DCW then needs no native gas).
    const MIN_GAS_WEI = 200_000_000_000_000n; // ~0.0002 native; covers the approve + burn
    if (!config.CIRCLE_GAS_STATION_ENABLED && gasBalance < MIN_GAS_WEI) {
      return c.json(
        {
          error: 'bridge wallet out of gas',
          detail: `Bridge wallet has ${formatUnits(gasBalance, 18)} ${chainCfg.nativeSymbol} on ${chainCfg.name}, not enough to pay the bridge gas. Tap "Top up gas" on the Wallets panel (or send testnet ${chainCfg.nativeSymbol} to this address), then retry.`,
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

/// Resume a Circle bridge that's mid source-pipeline (approving/burning) or
/// waiting on the mint relay. Idempotent: safe to call repeatedly. Used by the
/// frontend retry/auto-recheck for Circle bridges and as a manual nudge. Web3
/// bridges should use /:bridgeId/recheck instead.
bridgeRoutes.post('/circle-bridge/:bridgeId/resume', async (c) => {
  const bridgeId = c.req.param('bridgeId');
  const record = await getBridge(bridgeId);
  if (!record) return c.json({ error: 'bridge not found' }, 404);
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
  const user = getUserByAddress(userAddress);
  if (!user) {
    return c.json({ error: 'no Circle account for this address' }, 404);
  }
  let agentWallets = await getAgentWallets(userAddress);
  if (!agentWallets) {
    return c.json({ error: 'user has no agent wallet record' }, 409);
  }
  const chainCfg = CCTP_CHAINS[parsed.data.sourceChainKey];
  const existing = agentWallets.bridgeWallets?.[chainCfg.circleBlockchain];
  let bridgeWalletAddress: string;
  if (existing) {
    bridgeWalletAddress = existing.address;
  } else {
    try {
      const created = await provisionUserBridgeWallet(userAddress, chainCfg.circleBlockchain);
      bridgeWalletAddress = created.address;
      const next = {
        ...agentWallets,
        bridgeWallets: {
          ...(agentWallets.bridgeWallets ?? {}),
          [chainCfg.circleBlockchain]: { walletId: created.walletId, address: created.address },
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
    });
  } catch (err) {
    return c.json(
      {
        bridgeWalletAddress,
        sourceChainKey: parsed.data.sourceChainKey,
        usdcBalance: null,
        gasBalance: null,
        error: 'balance read failed',
        detail: (err as Error).message,
      },
      200,
    );
  }
});

/// Returns or lazy-provisions the user's source-chain bridge wallet address
/// so the frontend can display it (faucet target, "send USDC here" copy).
bridgeRoutes.get('/circle-source-address', async (c) => {
  const address = c.req.query('address');
  const sourceChainKey = c.req.query('sourceChainKey');
  if (!address || !sourceChainKey) {
    return c.json({ error: 'address and sourceChainKey are required' }, 400);
  }
  if (!isCctpChainKey(sourceChainKey)) {
    return c.json({ error: 'sourceChainKey must be a supported CCTP chain' }, 400);
  }
  const userAddress = address.toLowerCase();
  const user = getUserByAddress(userAddress);
  if (!user) {
    return c.json({ error: 'not a Circle user' }, 409);
  }
  const chainCfg = CCTP_CHAINS[sourceChainKey];
  const wallets = await getAgentWallets(userAddress);
  if (!wallets) return c.json({ error: 'activate first' }, 409);

  const existing = wallets.bridgeWallets?.[chainCfg.circleBlockchain];
  if (existing) return c.json({ address: existing.address, blockchain: chainCfg.circleBlockchain });

  try {
    const created = await provisionUserBridgeWallet(userAddress, chainCfg.circleBlockchain);
    const next = {
      ...wallets,
      bridgeWallets: {
        ...(wallets.bridgeWallets ?? {}),
        [chainCfg.circleBlockchain]: { walletId: created.walletId, address: created.address },
      },
    };
    await saveAgentWallets(next);
    return c.json({ address: created.address, blockchain: chainCfg.circleBlockchain });
  } catch (err) {
    return c.json(
      { error: 'lazy provisioning failed', detail: (err as Error).message },
      502,
    );
  }
});

/* ============================================================================
   BRIDGE OUT (Arc -> chain). Burn USDC on Arc from the user's Circle identity
   DCW, then relay the mint on the destination chain via that chain's bridge DCW
   (which pays the destination gas). Circle accounts only here: the backend signs
   the Arc burn. Web3 users sign the Arc burn themselves and would post the burn
   txHash to a relay endpoint (a thin follow-up that reuses startOutRelay).
   ========================================================================== */

const bridgeOutSchema = z.object({
  bridgeId: z.string().min(1),
  address: z.string().startsWith('0x'),
  destChainKey: z.enum(CCTP_CHAIN_KEYS),
  amountUsdc: z.number().positive(),
  /// Where the minted USDC lands on the destination chain.
  recipient: z.string().startsWith('0x'),
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
  const user = getUserByAddress(userAddress);
  if (!user?.circleIdentityWalletId) {
    return c.json(
      {
        error: 'bridge-out is for Circle accounts',
        detail: 'Web3 wallets sign the Arc burn themselves; use the wallet bridge-out path.',
      },
      409,
    );
  }
  const dest = CCTP_CHAINS[body.destChainKey];
  const amountWei = parseUnits(body.amountUsdc.toString(), USDC_DECIMALS);

  // Preflight: the identity wallet must hold enough Arc USDC (which is also the
  // Arc gas token, so a little extra is consumed by the burn itself).
  try {
    const bal = await readUsdcBalance(userAddress);
    if (bal < amountWei) {
      return c.json(
        {
          error: 'insufficient balance',
          detail: `Your identity wallet holds ${formatUnits(bal, USDC_DECIMALS)} USDC on Arc, less than the ${body.amountUsdc} you want to bridge out.`,
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

  // Ensure the destination bridge DCW exists (it relays + pays for the mint) and
  // nudge native gas to it. Provision lazily if this is the user's first bridge
  // to that chain.
  const wallets = await getAgentWallets(userAddress);
  if (!wallets) return c.json({ error: 'no agent wallets — activate first' }, 409);
  let destWallet = wallets.bridgeWallets?.[dest.circleBlockchain];
  if (!destWallet) {
    try {
      const created = await provisionUserBridgeWallet(userAddress, dest.circleBlockchain);
      destWallet = { walletId: created.walletId, address: created.address };
      await saveAgentWallets({
        ...wallets,
        bridgeWallets: {
          ...(wallets.bridgeWallets ?? {}),
          [dest.circleBlockchain]: destWallet,
        },
      });
    } catch (err) {
      return c.json(
        { error: 'destination wallet provisioning failed', detail: (err as Error).message },
        502,
      );
    }
  }
  // Best-effort: make sure the destination DCW can pay the mint gas.
  void dripTestnetUsdc(destWallet.address, {
    blockchain: dest.circleBlockchain,
    native: true,
    usdc: false,
  });

  await createBridge({
    bridgeId: body.bridgeId,
    direction: 'out',
    sourceDomain: ARC_DOMAIN,
    sourceTxHash: '',
    amountUsdc: body.amountUsdc.toString(),
    mintRecipient: body.recipient,
    status: 'burning',
    destChainKey: body.destChainKey,
    // Reuse the bridge-wallet fields for the DESTINATION DCW that relays the mint.
    bridgeWalletId: destWallet.walletId,
    bridgeWalletAddress: destWallet.address,
  });

  startOutPipeline({
    bridgeId: body.bridgeId,
    identityWalletId: user.circleIdentityWalletId,
    destChainKey: body.destChainKey,
    amountUsdc: body.amountUsdc.toString(),
    recipient: body.recipient,
    destWalletId: destWallet.walletId,
  });

  return c.json(
    { accepted: true, bridgeId: body.bridgeId, status: 'burning', direction: 'out' },
    202,
  );
});

interface OutPipelineInput {
  bridgeId: string;
  identityWalletId: string;
  destChainKey: CctpChainKey;
  amountUsdc: string;
  recipient: string;
  destWalletId: string;
}

function startOutPipeline(input: OutPipelineInput) {
  if (outInFlight.has(input.bridgeId)) return;
  outInFlight.add(input.bridgeId);
  outPipelineLoop(input).finally(() => outInFlight.delete(input.bridgeId));
}

/// Burn on Arc (approve + depositForBurn from the identity DCW), then hand off to
/// the destination mint relay. Arc has sub-second finality and USDC is gas, so
/// the burn legs run synchronously.
async function outPipelineLoop(input: OutPipelineInput) {
  const dest = CCTP_CHAINS[input.destChainKey];
  const amountStr = parseUnits(input.amountUsdc, USDC_DECIMALS).toString();
  try {
    const record = await getBridge(input.bridgeId);
    if (!record) return;
    if (record.sourceTxHash) {
      // Burn already landed (resume): jump to the mint relay.
      startOutRelay({
        bridgeId: input.bridgeId,
        destChainKey: input.destChainKey,
        sourceTxHash: record.sourceTxHash,
        amountUsdc: input.amountUsdc,
        recipient: input.recipient,
        destWalletId: input.destWalletId,
      });
      return;
    }

    // STAGE 1 — approve Arc USDC to the TokenMessenger.
    await executeContractCall(
      {
        walletId: input.identityWalletId,
        contractAddress: ARC_USDC,
        abiFunctionSignature: 'approve(address,uint256)',
        abiParameters: [TOKEN_MESSENGER_V2, amountStr],
      },
      `bridge-out.approve(${input.bridgeId})`,
    );

    // STAGE 2 — burn on Arc, routed to the destination domain.
    const burn = await executeContractCall(
      {
        walletId: input.identityWalletId,
        contractAddress: TOKEN_MESSENGER_V2,
        abiFunctionSignature:
          'depositForBurn(uint256,uint32,bytes32,address,bytes32,uint256,uint32)',
        abiParameters: [
          amountStr,
          dest.domain.toString(),
          addressToBytes32(input.recipient),
          ARC_USDC,
          `0x${'0'.repeat(64)}`,
          '0',
          FINALITY_THRESHOLD_FAST.toString(),
        ],
      },
      `bridge-out.depositForBurn(${input.bridgeId})`,
    );

    await patchBridge(input.bridgeId, { sourceTxHash: burn.txHash, status: 'relaying' });
    bus.emitEvent({
      type: 'bridge.burned',
      actor: 'buyer',
      payload: {
        bridgeId: input.bridgeId,
        direction: 'out',
        destChainKey: input.destChainKey,
        sourceTxHash: burn.txHash,
        amountUsdc: input.amountUsdc,
      },
    });

    startOutRelay({
      bridgeId: input.bridgeId,
      destChainKey: input.destChainKey,
      sourceTxHash: burn.txHash,
      amountUsdc: input.amountUsdc,
      recipient: input.recipient,
      destWalletId: input.destWalletId,
    });
  } catch (err) {
    reportError('bridge.out.pipeline', err, { bridgeId: input.bridgeId });
    await patchBridge(input.bridgeId, { status: 'error', error: (err as Error).message });
    bus.emitEvent({
      type: 'bridge.error',
      actor: 'buyer',
      payload: { bridgeId: input.bridgeId, scope: 'out-pipeline', message: (err as Error).message },
    });
  }
}

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
