import { Hono } from 'hono';
import { z } from 'zod';
import { createPublicClient, http, formatUnits, parseUnits } from 'viem';
import { baseSepolia, sepolia } from 'viem/chains';
import { config } from '../config.js';
import { executeContractCall } from '../chain/txs.js';
import { publicClient } from '../chain/client.js';
import { createBridge, getBridge, patchBridge, listPendingBridges } from '../db/bridges.js';
import { getAgentWallets, saveAgentWallets } from '../db/agentWallets.js';
import { getUserByAddress } from '../db/users.js';
import {
  provisionUserBridgeWallet,
  BASE_SEPOLIA_BLOCKCHAIN,
  ETH_SEPOLIA_BLOCKCHAIN,
  type BridgeBlockchain,
} from '../circle/wallets.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import { reportError } from '../errorTracker.js';

/// Lightweight public clients used for source-chain balance reads. Created
/// once and reused. We avoid spinning these up for every request because
/// viem's HTTP client allocates a fetch pool. Source-chain reads only need
/// `balanceOf` and `getBalance`, so the default public RPC is fine.
const sourceClients = {
  baseSepolia: createPublicClient({ chain: baseSepolia, transport: http() }),
  sepolia: createPublicClient({ chain: sepolia, transport: http() }),
};

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

/// Circle DCW txs on testnet source chains (esp. Base Sepolia) sometimes
/// confirm slower than the default 90s settle window, which made the bridge
/// approve throw "did not settle" even though it landed on chain. Give the
/// bridge approve + burn a longer window and a higher fee level so they
/// actually settle inside the call.
const BRIDGE_POLL_ATTEMPTS = 120; // ~240s

/// Per CCTP V2 source-chain config. Verified addresses live in the frontend
/// at `frontend/features/bridge/config.ts` (the canonical source on both
/// sides). TokenMessengerV2 is the same address across all V2 testnets per
/// Circle's deployment: 0x8FE6B999...2542DAA.
const TOKEN_MESSENGER_V2 = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA';
const FINALITY_THRESHOLD_FAST = 2000;
const ARC_DOMAIN = 26;

interface CircleSourceChain {
  blockchain: BridgeBlockchain;
  usdc: string;
  domain: number;
}

const CIRCLE_SOURCE_CHAINS: Record<'baseSepolia' | 'sepolia', CircleSourceChain> = {
  baseSepolia: {
    blockchain: BASE_SEPOLIA_BLOCKCHAIN,
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    domain: 6,
  },
  sepolia: {
    blockchain: ETH_SEPOLIA_BLOCKCHAIN,
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    domain: 0,
  },
};

const USDC_DECIMALS = 6;

/// CCTP V2 wraps the address recipient in a 32-byte field. The high 12 bytes
/// stay zero; the low 20 are the address.
function addressToBytes32(address: string): `0x${string}` {
  return `0x${'0'.repeat(24)}${address.slice(2).toLowerCase()}` as `0x${string}`;
}

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
// CCTP V2 standard finality is ~13-19 min on testnet, but Circle's IRIS Sandbox
// sometimes lags much longer. Give the relay a long, generous window before
// declaring a hard error; the user can also call /recheck at any point.
const POLL_TIMEOUT_MS = 6 * 60 * 60 * 1000; // 6 hours

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
  sourceChainKey: z.enum(['baseSepolia', 'sepolia']),
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

  if (inFlight.has(body.bridgeId)) {
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
  const chainCfg = CIRCLE_SOURCE_CHAINS[body.sourceChainKey];
  let agentWallets = await getAgentWallets(userAddress);
  if (!agentWallets) {
    return c.json({ error: 'user has no agent wallet record; activate first' }, 409);
  }
  const existingBridge = agentWallets.bridgeWallets?.[chainCfg.blockchain];
  let bridgeWalletId: string;
  let bridgeWalletAddress: string;
  if (existingBridge) {
    bridgeWalletId = existingBridge.walletId;
    bridgeWalletAddress = existingBridge.address;
  } else {
    logger.info(
      { userAddress, blockchain: chainCfg.blockchain },
      'lazy-provisioning bridge wallet',
    );
    try {
      const created = await provisionUserBridgeWallet(userAddress, chainCfg.blockchain);
      bridgeWalletId = created.walletId;
      bridgeWalletAddress = created.address;
      // Persist into the agentWallets row.
      const next = {
        ...agentWallets,
        bridgeWallets: {
          ...(agentWallets.bridgeWallets ?? {}),
          [chainCfg.blockchain]: { walletId: bridgeWalletId, address: bridgeWalletAddress },
        },
      };
      await saveAgentWallets(next);
      agentWallets = next;
    } catch (err) {
      logger.error(
        { userAddress, blockchain: chainCfg.blockchain, err: (err as Error).message },
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
  } catch (err) {
    logger.warn(
      { bridgeId: body.bridgeId, err: (err as Error).message },
      'preflight balance read failed; proceeding to depositForBurn anyway',
    );
    // Don't block the flow on a balance-read failure; the on-chain call
    // will surface the real error if there's no USDC.
  }

  inFlight.add(body.bridgeId);
  try {
    const amountWei = parseUnits(body.amountUsdc.toString(), USDC_DECIMALS);
    const amountStr = amountWei.toString();

    // Step A: approve the TokenMessenger to pull USDC for the burn. Skip it when
    // the bridge wallet already has enough allowance. A prior attempt's approve
    // often lands on chain even after the backend's settle window threw, so
    // re-approving every retry just re-times-out and never reaches the burn.
    // Reading the live allowance lets a funded, already-approved wallet jump
    // straight to depositForBurn.
    let allowanceOk = false;
    try {
      const allowance = (await sourceClients[body.sourceChainKey].readContract({
        address: chainCfg.usdc as `0x${string}`,
        abi: erc20BalanceOfAbi,
        functionName: 'allowance',
        args: [bridgeWalletAddress as `0x${string}`, TOKEN_MESSENGER_V2 as `0x${string}`],
      })) as bigint;
      allowanceOk = allowance >= amountWei;
    } catch (err) {
      logger.warn(
        { bridgeId: body.bridgeId, err: (err as Error).message },
        'allowance read failed; will run approve to be safe',
      );
    }

    let approveTxHash: string | undefined;
    if (!allowanceOk) {
      const approveResult = await executeContractCall(
        {
          walletId: bridgeWalletId,
          contractAddress: chainCfg.usdc,
          abiFunctionSignature: 'approve(address,uint256)',
          abiParameters: [TOKEN_MESSENGER_V2, amountStr],
          feeLevel: 'HIGH',
          pollAttempts: BRIDGE_POLL_ATTEMPTS,
        },
        `circle-bridge.approve(${body.sourceChainKey}, ${body.bridgeId})`,
      );
      approveTxHash = approveResult.txHash;
    }

    // Step B: depositForBurn. Fast finality threshold (~13s on Base/Eth testnets).
    // maxFee = 0 means we don't tip Circle's fast attestation lane; standard
    // is fine for our flow.
    const burnResult = await executeContractCall(
      {
        walletId: bridgeWalletId,
        contractAddress: TOKEN_MESSENGER_V2,
        abiFunctionSignature:
          'depositForBurn(uint256,uint32,bytes32,address,bytes32,uint256,uint32)',
        abiParameters: [
          amountStr,
          ARC_DOMAIN.toString(),
          addressToBytes32(body.mintRecipient),
          chainCfg.usdc,
          // destinationCaller = zero address (anyone can call receiveMessage,
          // including our platform buyer agent which already does so).
          `0x${'0'.repeat(64)}`,
          '0',
          FINALITY_THRESHOLD_FAST.toString(),
        ],
        feeLevel: 'HIGH',
        pollAttempts: BRIDGE_POLL_ATTEMPTS,
      },
      `circle-bridge.depositForBurn(${body.sourceChainKey}, ${body.bridgeId})`,
    );

    // Record the bridge so the standard relay loop can take over the mint.
    await createBridge({
      bridgeId: body.bridgeId,
      sourceDomain: chainCfg.domain,
      sourceTxHash: burnResult.txHash,
      amountUsdc: body.amountUsdc.toString(),
      mintRecipient: body.mintRecipient,
    });

    bus.emitEvent({
      type: 'bridge.burned',
      actor: 'buyer',
      payload: {
        bridgeId: body.bridgeId,
        sourceDomain: chainCfg.domain,
        sourceTxHash: burnResult.txHash,
        amountUsdc: body.amountUsdc.toString(),
        mintRecipient: body.mintRecipient,
        circle: true,
      },
    });

    startRelay({
      bridgeId: body.bridgeId,
      sourceDomain: chainCfg.domain,
      sourceTxHash: burnResult.txHash,
      amountUsdc: body.amountUsdc.toString(),
      mintRecipient: body.mintRecipient,
    });

    return c.json(
      {
        accepted: true,
        bridgeId: body.bridgeId,
        // null when the approve was skipped because allowance already covered
        // the amount (a prior attempt's approve had landed on chain).
        approveTxHash: approveTxHash ?? null,
        burnTxHash: burnResult.txHash,
        sourceAddress: bridgeWalletAddress,
        sourceDomain: chainCfg.domain,
      },
      202,
    );
  } catch (err) {
    reportError('bridge.circle', err, {
      bridgeId: body.bridgeId,
      address: userAddress,
      sourceChainKey: body.sourceChainKey,
      amountUsdc: body.amountUsdc,
    });
    return c.json({ error: 'circle-bridge failed', detail: (err as Error).message }, 502);
  } finally {
    inFlight.delete(body.bridgeId);
  }
});

const walletStatusQuery = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  sourceChainKey: z.enum(['baseSepolia', 'sepolia']),
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
  const chainCfg = CIRCLE_SOURCE_CHAINS[parsed.data.sourceChainKey];
  const existing = agentWallets.bridgeWallets?.[chainCfg.blockchain];
  let bridgeWalletAddress: string;
  if (existing) {
    bridgeWalletAddress = existing.address;
  } else {
    try {
      const created = await provisionUserBridgeWallet(userAddress, chainCfg.blockchain);
      bridgeWalletAddress = created.address;
      const next = {
        ...agentWallets,
        bridgeWallets: {
          ...(agentWallets.bridgeWallets ?? {}),
          [chainCfg.blockchain]: { walletId: created.walletId, address: created.address },
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
  if (sourceChainKey !== 'baseSepolia' && sourceChainKey !== 'sepolia') {
    return c.json({ error: 'sourceChainKey must be baseSepolia or sepolia' }, 400);
  }
  const userAddress = address.toLowerCase();
  const user = getUserByAddress(userAddress);
  if (!user) {
    return c.json({ error: 'not a Circle user' }, 409);
  }
  const chainCfg = CIRCLE_SOURCE_CHAINS[sourceChainKey];
  const wallets = await getAgentWallets(userAddress);
  if (!wallets) return c.json({ error: 'activate first' }, 409);

  const existing = wallets.bridgeWallets?.[chainCfg.blockchain];
  if (existing) return c.json({ address: existing.address, blockchain: chainCfg.blockchain });

  try {
    const created = await provisionUserBridgeWallet(userAddress, chainCfg.blockchain);
    const next = {
      ...wallets,
      bridgeWallets: {
        ...(wallets.bridgeWallets ?? {}),
        [chainCfg.blockchain]: { walletId: created.walletId, address: created.address },
      },
    };
    await saveAgentWallets(next);
    return c.json({ address: created.address, blockchain: chainCfg.blockchain });
  } catch (err) {
    return c.json(
      { error: 'lazy provisioning failed', detail: (err as Error).message },
      502,
    );
  }
});
