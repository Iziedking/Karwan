import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { formatUnits, parseUnits } from 'viem';
import { config } from '../config.js';
import { publicClient } from '../chain/client.js';
import { usdc as usdcAddress } from '../chain/contracts.js';
import { executeContractCall } from '../chain/txs.js';
import { getUserByAddress } from '../db/users.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';

/// USDC is exposed as a 6-decimal ERC-20 on Arc. Same scale the escrow uses.
const USDC_DECIMALS = 6;

const POSITION_STATE_LABELS = ['active', 'cooling', 'claimed'] as const;
type PositionStateLabel = (typeof POSITION_STATE_LABELS)[number];

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');

const depositSchema = z.object({
  address: addrSchema,
  amountUsdc: z.number().positive(),
});

const positionActionSchema = z.object({
  address: addrSchema,
  positionId: z.union([z.string(), z.number()]),
});

const inFlight = new Set<string>();

/// Minimal ABI subset used by both reads (Deposited log filter + positions
/// view) and writes (deposit / withdraw / claim / cancel). Keeping it inline
/// so the backend doesn't import the contracts package.
const vaultAbi = [
  {
    type: 'event',
    name: 'Deposited',
    inputs: [
      { name: 'positionId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'principal', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'positions',
    stateMutability: 'view',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'principal', type: 'uint256' },
      { name: 'depositedAt', type: 'uint64' },
      { name: 'cooldownStartedAt', type: 'uint64' },
      { name: 'claimableAt', type: 'uint64' },
      { name: 'state', type: 'uint8' },
    ],
  },
  {
    type: 'function',
    name: 'COOLDOWN_DAYS',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint32' }],
  },
] as const;

interface Position {
  positionId: string;
  principalUsdc: string;
  principalWei: string;
  depositedAt: number;
  cooldownStartedAt: number;
  claimableAt: number;
  state: PositionStateLabel;
  tenureDays: number;
}

function vaultAddress(): `0x${string}` | null {
  const v = (config as unknown as Record<string, string | undefined>).KARWAN_VAULT_ADDR;
  return v ? (v as `0x${string}`) : null;
}

function stateLabelFor(state: number): PositionStateLabel {
  if (state === 0) return 'active';
  if (state === 1) return 'cooling';
  return 'claimed';
}

async function readPositions(addressRaw: string): Promise<Position[]> {
  const vault = vaultAddress();
  if (!vault) {
    logger.warn({ addressRaw }, 'vault.readPositions: KARWAN_VAULT_ADDR unset');
    return [];
  }
  const address = addressRaw.toLowerCase() as `0x${string}`;

  // Arc testnet's public RPC caps eth_getLogs at a strict 10,000-block
  // range. We stay 500 blocks under that ceiling for safety. The vault is
  // freshly deployed so every position lives in recent blocks; in practice
  // 9,500 blocks at ~2-second cadence is a couple of hours of history,
  // plenty for a hackathon testnet. When we need older positions we'll
  // run the indexer table from todo.md §4.
  const LOG_WINDOW = 9_500n;
  let fromBlock: bigint = 0n;
  try {
    const latest = await publicClient.getBlockNumber();
    fromBlock = latest > LOG_WINDOW ? latest - LOG_WINDOW : 0n;
  } catch {
    // Fall back to 0n; the getLogs call itself will fail loudly below.
  }

  // Fetch ALL Deposited events for the vault then filter by owner in JS.
  // Some testnet RPCs silently return empty when an indexed-args topic
  // filter is applied (especially over a wide block range), even when the
  // event clearly exists on chain. The vault is freshly deployed so the
  // total event count is tiny; client-side filtering is cheap and avoids
  // the topic-filter quirk entirely.
  let rawLogs;
  try {
    rawLogs = await publicClient.getLogs({
      address: vault,
      event: vaultAbi[0],
      fromBlock,
      toBlock: 'latest',
    });
  } catch (err) {
    logger.error(
      {
        err: (err as Error).message,
        vault,
        address,
        fromBlock: fromBlock.toString(),
      },
      'vault.readPositions: getLogs failed',
    );
    throw err;
  }

  const logs = rawLogs.filter((log) => {
    const owner = (log as unknown as { args: { owner?: `0x${string}` } }).args.owner;
    return owner?.toLowerCase() === address;
  });

  logger.info(
    {
      vault,
      address,
      fromBlock: fromBlock.toString(),
      rawCount: rawLogs.length,
      matchedCount: logs.length,
    },
    'vault.readPositions: getLogs returned',
  );

  if (logs.length === 0) return [];

  const now = Math.floor(Date.now() / 1000);
  const out: Position[] = [];
  for (const log of logs) {
    const positionId = (log as unknown as { args: { positionId: bigint } }).args.positionId;
    const p = (await publicClient.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: 'positions',
      args: [positionId],
    })) as readonly [`0x${string}`, bigint, bigint, bigint, bigint, number];
    const [, principal, depositedAt, cooldownStartedAt, claimableAt, state] = p;
    out.push({
      positionId: positionId.toString(),
      principalUsdc: formatUnits(principal, USDC_DECIMALS),
      principalWei: principal.toString(),
      depositedAt: Number(depositedAt),
      cooldownStartedAt: Number(cooldownStartedAt),
      claimableAt: Number(claimableAt),
      state: stateLabelFor(state),
      tenureDays: Math.max(0, (now - Number(depositedAt)) / 86_400),
    });
  }
  return out.sort((a, b) => Number(b.positionId) - Number(a.positionId));
}

function sumByState(positions: Position[], state: PositionStateLabel): string {
  const wei = positions
    .filter((p) => p.state === state)
    .reduce((acc, p) => acc + BigInt(p.principalWei), 0n);
  return formatUnits(wei, USDC_DECIMALS);
}

export const vaultRoutes = new Hono();

/// Lists every position belonging to the address, with state + tenure. Cheap
/// because it enumerates `Deposited` event logs (typically a handful per
/// user) and reads each position view once. The 30s cache on the reputation
/// engine's stake reader is separate; this endpoint always returns fresh
/// data because the staking UI animates state transitions and stale reads
/// would feel laggy.
vaultRoutes.get('/positions', async (c) => {
  const address = c.req.query('address');
  if (!address) return c.json({ error: 'address query param required' }, 400);
  const parsed = addrSchema.safeParse(address);
  if (!parsed.success) return c.json({ error: 'invalid address' }, 400);

  const vault = vaultAddress();
  if (!vault) {
    return c.json({
      vaultAddress: null,
      positions: [],
      totalActiveUsdc: '0',
      totalCoolingUsdc: '0',
      cooldownDays: 7,
    });
  }

  try {
    const positions = await readPositions(parsed.data);
    let cooldownDays = 7;
    try {
      const cd = (await publicClient.readContract({
        address: vault,
        abi: vaultAbi,
        functionName: 'COOLDOWN_DAYS',
      })) as number;
      cooldownDays = Number(cd);
    } catch {
      // Vault contract pre-deploy or transient RPC; keep the documented default.
    }
    return c.json({
      vaultAddress: vault,
      positions,
      totalActiveUsdc: sumByState(positions, 'active'),
      totalCoolingUsdc: sumByState(positions, 'cooling'),
      cooldownDays,
    });
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, address: parsed.data },
      'vault positions read failed',
    );
    return c.json({ error: 'positions read failed', detail: (err as Error).message }, 502);
  }
});

/// Circle-only path: identity DCW approves USDC and deposits into the vault
/// in two transactions. Web3 users sign these themselves from the frontend.
vaultRoutes.post('/deposit', async (c) => {
  let body;
  try {
    body = depositSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }

  const vault = vaultAddress();
  if (!vault) {
    return c.json({ error: 'KarwanVault not deployed (KARWAN_VAULT_ADDR unset)' }, 409);
  }

  const user = getUserByAddress(body.address.toLowerCase());
  if (!user) {
    return c.json(
      {
        error: 'no Circle identity wallet for this address',
        detail: 'Vault deposit through the API is for Circle users. Web3 users sign from the wallet.',
      },
      409,
    );
  }

  const key = `${body.address.toLowerCase()}:deposit`;
  if (inFlight.has(key)) {
    return c.json({ error: 'a deposit is already in progress for this address' }, 409);
  }

  inFlight.add(key);
  try {
    const amountWei = parseUnits(body.amountUsdc.toString(), USDC_DECIMALS);
    const approveResult = await executeContractCall(
      {
        walletId: user.circleIdentityWalletId,
        contractAddress: usdcAddress,
        abiFunctionSignature: 'approve(address,uint256)',
        abiParameters: [vault, amountWei.toString()],
      },
      `vault.approve(${body.address})`,
    );
    const depositResult = await executeContractCall(
      {
        walletId: user.circleIdentityWalletId,
        contractAddress: vault,
        abiFunctionSignature: 'deposit(uint256)',
        abiParameters: [amountWei.toString()],
      },
      `vault.deposit(${body.address}, ${body.amountUsdc})`,
    );

    bus.emitEvent({
      type: 'vault.deposit',
      actor: 'platform',
      payload: {
        address: body.address.toLowerCase(),
        amountUsdc: body.amountUsdc.toString(),
        approveTxHash: approveResult.txHash,
        depositTxHash: depositResult.txHash,
      },
    });
    logger.info(
      { address: body.address, amountUsdc: body.amountUsdc, depositTxHash: depositResult.txHash },
      'vault deposit confirmed (Circle identity DCW)',
    );

    return c.json({
      ok: true,
      approveTxHash: approveResult.txHash,
      depositTxHash: depositResult.txHash,
    });
  } catch (err) {
    logger.error(
      { address: body.address, err: (err as Error).message },
      'vault deposit failed',
    );
    return c.json({ error: 'deposit failed', detail: (err as Error).message }, 502);
  } finally {
    inFlight.delete(key);
  }
});

async function positionActionRoute(
  c: Context,
  fn: 'requestWithdraw' | 'cancelWithdraw' | 'claim',
  signature: string,
  eventType: 'vault.withdraw.requested' | 'vault.withdraw.cancelled' | 'vault.claimed',
) {
  let body;
  try {
    body = positionActionSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }

  const vault = vaultAddress();
  if (!vault) {
    return c.json({ error: 'KarwanVault not deployed (KARWAN_VAULT_ADDR unset)' }, 409);
  }

  const user = getUserByAddress(body.address.toLowerCase());
  if (!user) {
    return c.json(
      {
        error: 'no Circle identity wallet for this address',
        detail: 'Vault writes through the API are for Circle users. Web3 users sign from the wallet.',
      },
      409,
    );
  }

  const positionIdStr = String(body.positionId);
  const key = `${body.address.toLowerCase()}:${fn}:${positionIdStr}`;
  if (inFlight.has(key)) {
    return c.json({ error: 'a vault action is already in progress for this position' }, 409);
  }

  inFlight.add(key);
  try {
    const result = await executeContractCall(
      {
        walletId: user.circleIdentityWalletId,
        contractAddress: vault,
        abiFunctionSignature: signature,
        abiParameters: [positionIdStr],
      },
      `vault.${fn}(${body.address}, ${positionIdStr})`,
    );

    bus.emitEvent({
      type: eventType,
      actor: 'platform',
      payload: {
        address: body.address.toLowerCase(),
        positionId: positionIdStr,
        txHash: result.txHash,
      },
    });
    logger.info(
      { address: body.address, positionId: positionIdStr, fn, txHash: result.txHash },
      'vault action confirmed (Circle identity DCW)',
    );

    return c.json({ ok: true, txHash: result.txHash });
  } catch (err) {
    logger.error(
      { address: body.address, positionId: positionIdStr, fn, err: (err as Error).message },
      'vault action failed',
    );
    return c.json({ error: `${fn} failed`, detail: (err as Error).message }, 502);
  } finally {
    inFlight.delete(key);
  }
}

vaultRoutes.post('/request-withdraw', (c) =>
  positionActionRoute(c, 'requestWithdraw', 'requestWithdraw(uint256)', 'vault.withdraw.requested'),
);

vaultRoutes.post('/cancel-withdraw', (c) =>
  positionActionRoute(c, 'cancelWithdraw', 'cancelWithdraw(uint256)', 'vault.withdraw.cancelled'),
);

vaultRoutes.post('/claim', (c) =>
  positionActionRoute(c, 'claim', 'claim(uint256)', 'vault.claimed'),
);
