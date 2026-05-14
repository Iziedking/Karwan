import { Hono } from 'hono';
import { z } from 'zod';
import { config } from '../config.js';
import { executeContractCall } from '../chain/txs.js';
import { publicClient } from '../chain/client.js';
import { createBridge, patchBridge, listPendingBridges } from '../db/bridges.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';

const SOURCE_DOMAINS = new Set([0, 6]);

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
    message: 'sourceDomain must be 0 (Sepolia) or 6 (Base Sepolia)',
  }),
  sourceTxHash: z.string().startsWith('0x'),
  amountUsdc: z.string(),
  mintRecipient: z.string().startsWith('0x'),
});

const inFlight = new Set<string>();

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 25 * 60 * 1000; // 25 min; CCTP V2 standard finality is ~13-19 min on testnet

export const bridgeRoutes = new Hono();

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
  logger.info({ count: pending.length }, 'resuming pending bridge relays');
  for (const b of pending) {
    startRelay({
      bridgeId: b.bridgeId,
      sourceDomain: b.sourceDomain,
      sourceTxHash: b.sourceTxHash,
      amountUsdc: b.amountUsdc,
      mintRecipient: b.mintRecipient,
    });
  }
}

/// Marks a bridge minted and emits the event. Used both after a successful
/// receiveMessage and when a relay finds the message was already received.
async function markBridgeMinted(input: RelayInput, txHash?: string) {
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
    logger.error({ bridgeId: input.bridgeId, sourceTxHash: input.sourceTxHash }, message);
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
    logger.error({ bridgeId: input.bridgeId, err: message }, 'receiveMessage failed');
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
