import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { formatUnits, parseUnits } from 'viem';
import { config } from '../config.js';
import { publicClient } from '../chain/client.js';
import { usdc as usdcAddress } from '../chain/contracts.js';
import { executeContractCall } from '../chain/txs.js';
import {
  getPositionsByOwner,
  refreshVaultScan,
  type PositionRow,
} from '../chain/vaultScanCache.js';
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

/// Minimal ABI subset used by reads (positions view + cooldown + reserved)
/// and writes (deposit / withdraw / claim / cancel). nextPositionId drives
/// the multicall enumeration that replaced the Deposited-event scan: event
/// logs were silently dropping pages on the Arc RPC, so freshly-deposited
/// positions stopped appearing until the chain history shifted. Enumerating
/// positionIds 1..nextPositionId via multicall is exact.
const vaultAbi = [
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
    name: 'nextPositionId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
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
  // 'claimed' is the UI label for Withdrawn — user intent reads "you got your money back".
  if (state === 1) return 'active';
  if (state === 2) return 'cooling';
  if (state === 3) return 'claimed';
  return 'claimed';
}

interface ReadPositionsResult {
  positions: Position[];
  /// False when the multicall enumeration partially failed for this read.
  /// The served positions are a strict subset of the eventual full set,
  /// never a wrong total. UI renders a "syncing" pill when false and skips
  /// treating the total as final.
  synced: boolean;
}

/// Format a cached row into the API-facing `Position` shape. The cache holds
/// raw on-chain values; UI fields like `principalUsdc` and `tenureDays` derive
/// from the cached `depositedAt`/`principalWei` at format time so the same row
/// can serve many requests without recomputing the chain read.
function formatRow(row: PositionRow, now: number): Position {
  return {
    positionId: row.positionId,
    principalUsdc: formatUnits(BigInt(row.principalWei), USDC_DECIMALS),
    principalWei: row.principalWei,
    depositedAt: row.depositedAt,
    cooldownStartedAt: row.cooldownStartedAt,
    claimableAt: row.claimableAt,
    state: stateLabelFor(row.state),
    tenureDays: Math.max(0, (now - row.depositedAt) / 86_400),
  };
}

/// Read positions for one address from the shared vault scan cache. The
/// cache is refreshed by a periodic watcher (see `vaultScanCache.ts`) and
/// persisted to `data/vaultScan.json` so a process restart serves warm
/// before the first new scan completes. Before this, every request did its
/// own full positionId walk on chain.
async function readPositions(addressRaw: string): Promise<ReadPositionsResult> {
  const vault = vaultAddress();
  if (!vault) {
    logger.warn({ addressRaw }, 'vault.readPositions: KARWAN_VAULT_ADDR unset');
    return { positions: [], synced: true };
  }
  const { positions: rows, synced } = await getPositionsByOwner(addressRaw);
  const now = Math.floor(Date.now() / 1000);
  return {
    positions: rows.map((r) => formatRow(r, now)),
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

  // `?refresh=1` forces a synchronous scan before serving. Web3 deposits
  // sign the tx directly through wagmi and the backend never sees them
  // until the next 5-minute scan tick; the frontend passes refresh=1 on
  // its post-deposit refetch so the new position appears immediately.
  const refresh = c.req.query('refresh');
  if (refresh === '1' || refresh === 'true') {
    await refreshVaultScan().catch((err) =>
      logger.warn(
        { err: (err as Error).message },
        'on-demand vault scan refresh failed',
      ),
    );
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
    /// Refresh the shared scan cache so the next /positions read for this
    /// address reflects the new principal immediately, instead of waiting
    /// out the 5-minute periodic refresh in vaultScanCache.
    void refreshVaultScan().catch((err) =>
      logger.warn({ err: (err as Error).message }, 'post-deposit vault scan refresh failed'),
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
  /// Read the position before the contract call so the event payload can
  /// carry the principal. The notifier needs the amount to write "Cooldown
  /// started on 50 USDC" rather than asking the user to open the app.
  /// requestWithdraw and cancelWithdraw leave the principal unchanged; claim
  /// transitions the state to Withdrawn but the amount we paid out is the
  /// same value we read here.
  let principalUsdc: string | null = null;
  try {
    const tuple = (await publicClient.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: 'positions',
      args: [BigInt(positionIdStr)],
    })) as readonly [`0x${string}`, bigint, bigint, bigint, bigint, number];
    principalUsdc = formatUnits(tuple[1], USDC_DECIMALS);
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, positionId: positionIdStr },
      'vault action: principal read failed, payload will omit principalUsdc',
    );
  }

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
        ...(principalUsdc !== null ? { principalUsdc } : {}),
      },
    });
    /// Refresh the shared scan cache so the next /positions read reflects
    /// the new position state immediately (Active -> Cooling on request,
    /// Cooling -> Active on cancel, Cooling -> Withdrawn on claim).
    void refreshVaultScan().catch((err) =>
      logger.warn({ err: (err as Error).message }, 'post-action vault scan refresh failed'),
    );
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
