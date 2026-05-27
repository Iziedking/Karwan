import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { formatUnits, parseUnits } from 'viem';
import { config } from '../config.js';
import { publicClient } from '../chain/client.js';
import { usdc as usdcAddress } from '../chain/contracts.js';
import { executeContractCall } from '../chain/txs.js';
import { fetchDepositedLogsForOwner } from '../chain/vaultLogs.js';
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
  {
    type: 'function',
    name: 'reservedTotal',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
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
  // KarwanVault.sol PositionState enum: { None=0, Active=1, Cooling=2, Withdrawn=3 }.
  // We surface 'claimed' rather than 'withdrawn' as the UI label because the
  // user-facing noun maps better to user intent ("you got your money back").
  if (state === 1) return 'active';
  if (state === 2) return 'cooling';
  if (state === 3) return 'claimed';
  // state === 0 is None (empty slot). The positions endpoint enumerates from
  // Deposited events so it shouldn't appear, but if it does, hide by mapping
  // to a terminal label so the row falls off the UI filter.
  return 'claimed';
}

interface ReadPositionsResult {
  positions: Position[];
  /// False when the vault-log scan didn't reach chain head (page cap or RPC
  /// failure). The served positions are a strict subset of the eventual full
  /// set, never a wrong total — but a UI showing a stake total has to know
  /// when to render a "syncing" pill instead of treating the number as final.
  synced: boolean;
}

async function readPositions(addressRaw: string): Promise<ReadPositionsResult> {
  const vault = vaultAddress();
  if (!vault) {
    logger.warn({ addressRaw }, 'vault.readPositions: KARWAN_VAULT_ADDR unset');
    return { positions: [], synced: true };
  }
  const address = addressRaw.toLowerCase() as `0x${string}`;

  // Paginated read covers the vault's full deployed history, so positions
  // older than the previous ~5h window no longer drop off after a refresh.
  const { logs, synced } = await fetchDepositedLogsForOwner(vault, address);
  if (logs.length === 0) return { positions: [], synced };

  const now = Math.floor(Date.now() / 1000);
  const out: Position[] = [];
  for (const log of logs) {
    const p = (await publicClient.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: 'positions',
      args: [log.positionId],
    })) as readonly [`0x${string}`, bigint, bigint, bigint, bigint, number];
    const [, principal, depositedAt, cooldownStartedAt, claimableAt, state] = p;
    out.push({
      positionId: log.positionId.toString(),
      principalUsdc: formatUnits(principal, USDC_DECIMALS),
      principalWei: principal.toString(),
      depositedAt: Number(depositedAt),
      cooldownStartedAt: Number(cooldownStartedAt),
      claimableAt: Number(claimableAt),
      state: stateLabelFor(state),
      tenureDays: Math.max(0, (now - Number(depositedAt)) / 86_400),
    });
  }
  return {
    positions: out.sort((a, b) => Number(b.positionId) - Number(a.positionId)),
    synced,
  };
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
    const { positions, synced } = await readPositions(parsed.data);
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
    // v2.D: read the owner's reservedTotal so the Stake card can split the
    // header into Free / Reserved / Cooling. Pre-v2.D vaults don't have
    // this view; fall back to 0. Reading reservedTotal as `0` matches the
    // semantic of "no insurance reservations" so existing UIs still work.
    let reservedUsdc = '0';
    try {
      const reservedRaw = (await publicClient.readContract({
        address: vault,
        abi: vaultAbi,
        functionName: 'reservedTotal',
        args: [parsed.data as `0x${string}`],
      })) as bigint;
      reservedUsdc = formatUnits(reservedRaw, USDC_DECIMALS);
    } catch {
      // Legacy vault (no reservation system); reservedUsdc stays at '0'.
    }
    const totalActiveUsdc = sumByState(positions, 'active');
    // freeStakeUsdc = active − reserved, floored at 0 so the UI can't show
    // a negative free balance during reservation/release race conditions.
    const freeStakeUsdc = String(
      Math.max(0, Number(totalActiveUsdc) - Number(reservedUsdc)),
    );
    return c.json({
      vaultAddress: vault,
      positions,
      totalActiveUsdc,
      totalCoolingUsdc: sumByState(positions, 'cooling'),
      /// v2.D insurance state.
      reservedUsdc,
      freeStakeUsdc,
      cooldownDays,
      /// When false, the underlying vault-log scan hasn't reached chain
      /// head — totals are provisional and may rise on the next read. The UI
      /// should render a "syncing" indicator and refresh shortly. Always true
      /// once a cold scan completes; an idle wallet stays synced indefinitely.
      synced,
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
