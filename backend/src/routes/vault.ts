import { Hono, type Context } from 'hono';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { erc20Abi, formatUnits, parseEventLogs } from 'viem';
import { config } from '../config.js';
import { alertIfClaimLiquidityShort } from '../chain/claimLiquidityAlert.js';
import { publicClient } from '../chain/client.js';
import { usdc as usdcAddress } from '../chain/contracts.js';
import { executeContractCall } from '../chain/txs.js';
import {
  getPositionsByOwner,
  refreshVaultScan,
  type PositionRow,
} from '../chain/vaultScanCache.js';
import { getUserByAddress } from '../db/users.js';
import { isSessionSelf } from '../auth/session.js';
import { bus } from '../events.js';
import { appendActivity } from '../db/activityLog.js';
import { getMoneyMovementByOperationKey } from '../db/moneyMovements.js';
import { logger } from '../logger.js';
import { invalidBodyMessage } from './invalidBody.js';
import {
  parseVaultStakeHint,
  proveVaultStake,
  recordVaultStakeMovement,
  executeCircleVaultStake,
  vaultDepositEventAbi,
  prepareWeb3VaultStakeIntent,
  completeWeb3VaultStake,
  vaultStakeIntentOperationKey,
} from '../money/vaultStake.js';
import { fillActivityGaps } from '../db/activityLog.js';
import {
  ensureVaultActionMovement,
  executeVaultActionMovement,
  vaultActionOperationKey,
  prepareWeb3VaultActionIntent,
  completeWeb3VaultAction,
} from '../money/vaultActions.js';

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
  requestId: z.string().trim().min(1).max(120).optional(),
});

const positionActionSchema = z.object({
  address: addrSchema,
  positionId: z.union([z.string(), z.number()]),
  requestId: z.string().trim().min(1).max(120).optional(),
});

const web3DepositIntentSchema = z.object({
  address: addrSchema,
  amountUsdc: z.union([z.number(), z.string()]),
  requestId: z.string().trim().min(1).max(120),
});

const web3DepositCompleteSchema = web3DepositIntentSchema.extend({
  approvalTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  depositTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

const web3VaultActionIntentSchema = z.object({
  address: addrSchema,
  positionId: z.union([z.string(), z.number()]),
  action: z.enum(['requestWithdraw', 'cancelWithdraw', 'claim']),
  requestId: z.string().trim().min(1).max(120),
});
const web3VaultActionCompleteSchema = web3VaultActionIntentSchema.extend({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
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
  // 'claimed' is the UI label for Withdrawn. User intent reads "you got your money back".
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
      /// head, totals are provisional and may rise on the next read. The UI
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
/// Browser-wallet deposits are a two-leg flow. Allocate the KWN receipt and
/// expected approval/deposit legs before opening the wallet so a rejected,
/// dropped, or ambiguous signature remains recoverable instead of becoming an
/// untracked vault movement.
vaultRoutes.post('/deposit/intent', async (c) => {
  let body;
  try {
    body = web3DepositIntentSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (!isSessionSelf(c, body.address)) return c.json({ error: 'You can only stake from your own wallet.', code: 'forbidden' }, 403);
  const vault = vaultAddress();
  if (!vault || !usdcAddress) return c.json({ error: 'staking is not configured on this deployment' }, 503);
  let amountMicros: bigint;
  try {
    amountMicros = parseVaultStakeHint(body.amountUsdc);
    if (amountMicros <= 0n) throw new Error('amount must be positive');
  } catch {
    return c.json({ error: 'stake amount must be a valid USDC amount', code: 'invalid-amount' }, 400);
  }
  const operationKey = vaultStakeIntentOperationKey(body.address, body.requestId);
  try {
    const result = await prepareWeb3VaultStakeIntent({ operationKey, ownerAddress: body.address, vaultAddress: vault, usdcAddress, amountMicros });
    return c.json({
      accepted: true,
      reference: result.movement.reference,
      movementState: result.movement.state,
      amountUsdc: formatUnits(amountMicros, USDC_DECIMALS),
      vaultAddress: vault,
      usdcAddress,
    });
  } catch (err) {
    logger.error({ address: body.address, operationKey, err: (err as Error).message }, 'web3 vault deposit intent failed');
    return c.json({ error: 'vault deposit intent failed', detail: (err as Error).message }, 502);
  }
});

vaultRoutes.post('/deposit/complete', async (c) => {
  let body;
  try {
    body = web3DepositCompleteSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (!isSessionSelf(c, body.address)) return c.json({ error: 'You can only complete your own vault deposit.', code: 'forbidden' }, 403);
  const vault = vaultAddress();
  if (!vault || !usdcAddress) return c.json({ error: 'staking is not configured on this deployment' }, 503);
  let amountMicros: bigint;
  try { amountMicros = parseVaultStakeHint(body.amountUsdc); } catch { return c.json({ error: 'stake amount must be a valid USDC amount', code: 'invalid-amount' }, 400); }
  const operationKey = vaultStakeIntentOperationKey(body.address, body.requestId);
  const existing = await getMoneyMovementByOperationKey(operationKey).catch(() => null);
  if (!existing) return c.json({ error: 'vault deposit intent not found; start again before signing', code: 'intent_not_found' }, 409);
  try {
    const result = await completeWeb3VaultStake({ reference: existing.reference, ownerAddress: body.address, vaultAddress: vault, usdcAddress, amountMicros, approvalTxHash: body.approvalTxHash, depositTxHash: body.depositTxHash });
    const amountUsdc = formatUnits(amountMicros, USDC_DECIMALS);
    void appendActivity({
      id: `vault-stake:web3:${body.requestId}`,
      address: body.address,
      kind: 'stake',
      summary: `Staked ${amountUsdc} USDC in Karwan Vault`,
      params: { t: 'staked', amount: amountUsdc },
      amountUsdc,
      txHash: body.depositTxHash,
      refId: result.movement.reference,
    });
    void refreshVaultScan().catch((err) => logger.warn({ err: (err as Error).message }, 'post-web3-vault-deposit refresh failed'));
    return c.json({ ok: true, reference: result.movement.reference, movementState: result.movement.state, approvalTxHash: body.approvalTxHash, depositTxHash: body.depositTxHash, amountUsdc, positionId: result.positionId?.toString() ?? null });
  } catch (err) {
    const movement = await getMoneyMovementByOperationKey(operationKey).catch(() => null);
    logger.warn({ address: body.address, reference: movement?.reference, err: (err as Error).message }, 'web3 vault deposit completion failed');
    return c.json({ error: 'vault deposit proof failed', reference: movement?.reference, movementState: movement?.state, detail: (err as Error).message }, 409);
  }
});

vaultRoutes.post('/deposit', async (c) => {
  let body;
  try {
    body = depositSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  // This moves the named user's USDC via their Circle wallet, so the session
  // must BE that user. Without this, anyone could stake from a victim's wallet.
  if (!isSessionSelf(c, body.address)) {
    return c.json({ error: 'You can only stake from your own wallet.', code: 'forbidden' }, 403);
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

  const requestKey = body.requestId ?? c.req.header('Idempotency-Key') ?? randomUUID();
  const key = `${body.address.toLowerCase()}:deposit`;
  const operationKey = `vault:stake:circle:${body.address.toLowerCase()}:${requestKey}`;
  if (inFlight.has(key)) {
    return c.json({ error: 'a deposit is already in progress for this address' }, 409);
  }

  inFlight.add(key);
  try {
    const amountMicros = parseVaultStakeHint(body.amountUsdc);
    const result = await executeCircleVaultStake({
      operationKey,
      ownerAddress: body.address,
      walletId: user.circleIdentityWalletId,
      vaultAddress: vault,
      usdcAddress,
      amountMicros,
    });
    const amountUsdc = formatUnits(amountMicros, USDC_DECIMALS);

    bus.emitEvent({
      type: 'vault.deposit',
      actor: 'platform',
      payload: {
        address: body.address.toLowerCase(),
        amountUsdc,
        approveTxHash: result.approveTxHash,
        depositTxHash: result.depositTxHash,
        reference: result.movement.reference,
      },
    });
    // /stake reads live positions off chain, which answers "how much is
    // staked" but not "when did I stake it, and for how much". Without a
    // durable row the deposit had no history the user could revisit.
    void appendActivity({
      id: `vault-stake:circle:${body.address.toLowerCase()}:${requestKey}`,
      address: body.address,
      kind: 'stake',
      summary: `Staked ${amountUsdc} USDC in Karwan Vault`,
      params: {t: 'staked', amount: amountUsdc},
      amountUsdc,
      txHash: result.depositTxHash ?? undefined,
      refId: result.movement.reference,
    });
    logger.info(
      { address: body.address, amountUsdc, depositTxHash: result.depositTxHash, reference: result.movement.reference },
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
      approveTxHash: result.approveTxHash,
      depositTxHash: result.depositTxHash,
      amountUsdc,
      reference: result.movement.reference,
      movementState: result.movement.state,
      positionId: result.positionId?.toString() ?? null,
    });
  } catch (err) {
    const failed = await getMoneyMovementByOperationKey(operationKey).catch(() => null);
    logger.error(
      { address: body.address, reference: failed?.reference, movementState: failed?.state, err: (err as Error).message },
      'vault deposit failed',
    );
    return c.json({
      error: 'deposit failed',
      reference: failed?.reference,
      movementState: failed?.state,
      detail: (err as Error).message,
    }, 502);
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
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  // Moves the named user's staked funds via their Circle wallet — the session
  // must BE that user, or anyone could withdraw/claim against a victim's stake.
  if (!isSessionSelf(c, body.address)) {
    return c.json({ error: 'You can only act on your own vault positions.', code: 'forbidden' }, 403);
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
  let operationKeyForError: string | undefined;
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
    if (principalUsdc === null) return c.json({ error: 'could not read vault position principal; try again' }, 503);
    const amountMicros = parseVaultStakeHint(principalUsdc);
    const requestId = body.requestId ?? randomUUID();
    const operationKey = vaultActionOperationKey(body.address, fn, positionIdStr, requestId);
    operationKeyForError = operationKey;
    const ensured = await ensureVaultActionMovement({ operationKey, action: fn, ownerAddress: body.address, vaultAddress: vault, positionId: positionIdStr, amountMicros });
    const result = await executeVaultActionMovement({
      reference: ensured.movement.reference,
      action: fn,
      ownerAddress: body.address,
      vaultAddress: vault,
      usdcAddress,
      positionId: positionIdStr,
      amountMicros,
      walletId: user.circleIdentityWalletId,
      signature,
      execute: (options) => executeContractCall({
        walletId: options.walletId,
        contractAddress: vault,
        abiFunctionSignature: signature,
        abiParameters: [positionIdStr],
        idempotencyKey: options.idempotencyKey,
        lifecycle: options.lifecycle,
      }, `vault.${fn}(${body.address}, ${positionIdStr})`),
    });

    bus.emitEvent({
      type: eventType,
      actor: 'platform',
      payload: {
        address: body.address.toLowerCase(),
        positionId: positionIdStr,
        txHash: result.txHash,
        reference: result.movement.reference,
        ...(principalUsdc !== null ? { principalUsdc } : {}),
      },
    });
    /// Refresh the shared scan cache so the next /positions read reflects
    /// the new position state immediately (Active -> Cooling on request,
    /// Cooling -> Active on cancel, Cooling -> Withdrawn on claim).
    void refreshVaultScan().catch((err) =>
      logger.warn({ err: (err as Error).message }, 'post-action vault scan refresh failed'),
    );
    // Only the claim actually moves USDC back to the user; request and cancel
    // change a position's state. Record all three, because "when did I start
    // the cooldown" is exactly the question the position view cannot answer.
    void appendActivity({
      address: body.address,
      kind: fn === 'claim' ? 'unstake' : 'stake',
      summary:
        fn === 'claim'
          ? `Claimed ${principalUsdc ?? ''} USDC of unstaked principal`.replace('  ', ' ')
          : fn === 'requestWithdraw'
            ? `Started unstaking ${principalUsdc ?? 'your'} USDC`
            : `Cancelled unstaking ${principalUsdc ?? 'your'} USDC`,
      // Without a principal figure the sentence reads "your USDC", which no
      // template placeholder can carry. Those rows keep the English summary.
      ...(principalUsdc !== null
        ? {
            params: {
              t:
                fn === 'claim'
                  ? 'unstakeClaim'
                  : fn === 'requestWithdraw'
                    ? 'unstakeStart'
                    : 'unstakeCancel',
              amount: String(principalUsdc),
            },
          }
        : {}),
      ...(principalUsdc !== null ? { amountUsdc: principalUsdc } : {}),
      ...(result.txHash ? { txHash: result.txHash } : {}),
      refId: result.movement.reference,
    });

    // A withdrawal request is the only advance warning that a claim is coming.
    // Claims are paid from the vault's liquid USDC, the vault cannot redeem its
    // own USYC, and the wrap job only rebalances once a day, so a cooldown can
    // mature into an empty vault. Check now, while there are still days to act.
    // Fire-and-forget: a failed alert must not fail the user's withdrawal.
    if (fn === 'requestWithdraw') {
      alertIfClaimLiquidityShort(config.KARWAN_VAULT_ADDR);
    }
    logger.info(
      { address: body.address, positionId: positionIdStr, fn, txHash: result.txHash },
      'vault action confirmed (Circle identity DCW)',
    );

    return c.json({ ok: true, txHash: result.txHash ?? null, reference: result.movement.reference, movementState: result.movement.state });
  } catch (err) {
    logger.error(
      { address: body.address, positionId: positionIdStr, fn, err: (err as Error).message },
      'vault action failed',
    );
    const failed = operationKeyForError
      ? await getMoneyMovementByOperationKey(operationKeyForError).catch(() => null)
      : null;
    return c.json({ error: `${fn} failed`, reference: failed?.reference, movementState: failed?.state, detail: (err as Error).message }, 502);
  } finally {
    inFlight.delete(key);
  }
}

/// Record a stake a WEB3 wallet signed for itself.
///
/// Staking is a money path, and for a connected wallet it had no record at all.
/// The Circle path goes through /deposit above, which emits the event and writes
/// the history row; a web3 user signs `deposit` on the vault from their own
/// wallet and the backend never heard about it. So the money moved, the position
/// appeared on /stake, and nothing else knew: no alert, and nothing in
/// transaction history for the one surface that is supposed to hold every
/// movement.
///
/// The client's word is not enough for a money row, so the transaction is read
/// off Arc before anything is written: it has to exist, to have succeeded, and
/// to have been sent to the vault by the caller. `id` is derived from the hash,
/// so a retry or a double-mount records once.
const recordStakeSchema = z.object({
  address: addrSchema,
  amountUsdc: z.union([z.number(), z.string()]),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'expected a transaction hash'),
});

vaultRoutes.post('/record-stake', async (c) => {
  let body;
  try {
    body = recordStakeSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (!isSessionSelf(c, body.address)) {
    return c.json({ error: 'You can only record a stake for your own wallet.', code: 'forbidden' }, 403);
  }
  const vault = vaultAddress();
  if (!vault) return c.json({ error: 'staking is not configured on this deployment' }, 503);

  const hash = body.txHash as `0x${string}`;
  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash });
  } catch {
    // Not mined yet, as far as this RPC can see. A pending hash is not a
    // failure and not a record either; the client retries.
    return c.json({ error: 'that transaction is not confirmed yet', code: 'not-confirmed' }, 409);
  }
  if (receipt.status !== 'success') {
    return c.json({ error: 'that transaction did not succeed', code: 'reverted' }, 409);
  }
  if ((receipt.to ?? '').toLowerCase() !== vault.toLowerCase()) {
    return c.json({ error: 'that transaction is not a stake on this vault', code: 'wrong-target' }, 409);
  }
  if ((receipt.from ?? '').toLowerCase() !== body.address.toLowerCase()) {
    return c.json({ error: 'that transaction was not sent by this wallet', code: 'wrong-sender' }, 409);
  }

  let expectedAmountMicros: bigint;
  try {
    expectedAmountMicros = parseVaultStakeHint(body.amountUsdc);
  } catch {
    return c.json({ error: 'stake amount must be a valid USDC amount', code: 'invalid-amount' }, 400);
  }
  if (expectedAmountMicros <= 0n) {
    return c.json({ error: 'stake amount must be greater than zero', code: 'invalid-amount' }, 400);
  }

  const transfers = parseEventLogs({
    abi: erc20Abi,
    eventName: 'Transfer',
    logs: receipt.logs,
    strict: false,
  }).map((entry) => ({
    tokenAddress: entry.address,
    ...(entry.args as { from?: string; to?: string; value?: bigint }),
  }));
  const deposits = parseEventLogs({
    abi: vaultDepositEventAbi,
    eventName: 'Deposited',
    logs: receipt.logs,
    strict: false,
  }).map((entry) => entry.args as { owner?: string; principal?: bigint; positionId?: bigint });

  let proof;
  try {
    proof = proveVaultStake({
      receiptTo: receipt.to,
      receiptFrom: receipt.from,
      vaultAddress: vault,
      ownerAddress: body.address,
      usdcAddress,
      expectedAmountMicros,
      transfers,
      deposits,
    });
  } catch (err) {
    logger.warn(
      { address: body.address, txHash: hash, err: (err as Error).message },
      'web3 vault stake receipt proof mismatch',
    );
    return c.json({ error: 'transaction proof does not match this stake', code: 'proof_mismatch' }, 409);
  }

  const amountUsdc = formatUnits(proof.amountMicros, USDC_DECIMALS);
  const recorded = await recordVaultStakeMovement({
    ownerAddress: body.address,
    txHash: hash,
    amountMicros: proof.amountMicros,
    vaultAddress: vault,
  });
  bus.emitEvent({
    type: 'vault.deposit',
    actor: 'platform',
    payload: {
      address: body.address.toLowerCase(),
      amountUsdc,
      depositTxHash: hash,
      reference: recorded.movement.reference,
    },
  });
  void appendActivity({
    // One row per transaction, whatever the client does.
    id: `vault-stake:${hash.toLowerCase()}`,
    address: body.address,
    kind: 'stake',
    summary: `Staked ${amountUsdc} USDC`,
    params: { t: 'staked', amount: amountUsdc },
    amountUsdc,
    txHash: hash,
    refId: recorded.movement.reference,
  });
  // Older rows use the same deterministic id but predate durable references.
  // Fill only missing fields so a retry can attach the new receipt without
  // rewriting historical amounts or summaries.
  void fillActivityGaps(`vault-stake:${hash.toLowerCase()}`, {
    amountUsdc,
    txHash: hash,
    refId: recorded.movement.reference,
  }).catch((err) =>
    logger.warn({ txHash: hash, err: (err as Error).message }, 'vault stake activity reference fill failed'),
  );
  void refreshVaultScan().catch((err) =>
    logger.warn({ err: (err as Error).message }, 'post-record vault scan refresh failed'),
  );
  logger.info({ address: body.address, amountUsdc, txHash: hash }, 'recorded web3 vault stake');
  return c.json({
    recorded: true,
    alreadyRecorded: !recorded.created,
    amountUsdc,
    reference: recorded.movement.reference,
    movementState: recorded.movement.state,
    positionId: proof.positionId?.toString() ?? null,
  });
});

async function readVaultPrincipal(positionId: string): Promise<bigint> {
  const vault = vaultAddress();
  if (!vault) throw new Error('vault not configured');
  const tuple = (await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'positions', args: [BigInt(positionId)] })) as readonly [`0x${string}`, bigint, bigint, bigint, bigint, number];
  return tuple[1];
}

vaultRoutes.post('/action/intent', async (c) => {
  let body;
  try { body = web3VaultActionIntentSchema.parse(await c.req.json()); } catch (err) { return c.json({ error: invalidBodyMessage(err) }, 400); }
  if (!isSessionSelf(c, body.address)) return c.json({ error: 'You can only act on your own vault positions.', code: 'forbidden' }, 403);
  const vault = vaultAddress();
  if (!vault || !usdcAddress) return c.json({ error: 'staking is not configured on this deployment' }, 503);
  try {
    const amountMicros = await readVaultPrincipal(String(body.positionId));
    if (amountMicros <= 0n) return c.json({ error: 'vault position is empty', code: 'empty-position' }, 409);
    const operationKey = vaultActionOperationKey(body.address, body.action, String(body.positionId), body.requestId);
    const result = await prepareWeb3VaultActionIntent({ operationKey, action: body.action, ownerAddress: body.address, vaultAddress: vault, positionId: String(body.positionId), amountMicros });
    return c.json({ accepted: true, reference: result.movement.reference, movementState: result.movement.state, amountUsdc: formatUnits(amountMicros, USDC_DECIMALS) });
  } catch (err) { return c.json({ error: 'vault action intent failed', detail: (err as Error).message }, 502); }
});

vaultRoutes.post('/action/complete', async (c) => {
  let body;
  try { body = web3VaultActionCompleteSchema.parse(await c.req.json()); } catch (err) { return c.json({ error: invalidBodyMessage(err) }, 400); }
  if (!isSessionSelf(c, body.address)) return c.json({ error: 'You can only complete your own vault action.', code: 'forbidden' }, 403);
  const vault = vaultAddress();
  if (!vault || !usdcAddress) return c.json({ error: 'staking is not configured on this deployment' }, 503);
  const operationKey = vaultActionOperationKey(body.address, body.action, String(body.positionId), body.requestId);
  const existing = await getMoneyMovementByOperationKey(operationKey).catch(() => null);
  if (!existing) return c.json({ error: 'vault action intent not found; start again before signing', code: 'intent_not_found' }, 409);
  try {
    const amountMicros = await readVaultPrincipal(String(body.positionId));
    const movement = await completeWeb3VaultAction({ reference: existing.reference, action: body.action, ownerAddress: body.address, vaultAddress: vault, usdcAddress, positionId: String(body.positionId), amountMicros, txHash: body.txHash });
    void appendActivity({ id: `vault-action:web3:${body.requestId}`, address: body.address, kind: body.action === 'claim' ? 'unstake' : 'stake', summary: body.action === 'claim' ? `Claimed ${formatUnits(amountMicros, USDC_DECIMALS)} USDC of unstaked principal` : body.action === 'requestWithdraw' ? `Started unstaking ${formatUnits(amountMicros, USDC_DECIMALS)} USDC` : `Cancelled unstaking ${formatUnits(amountMicros, USDC_DECIMALS)} USDC`, amountUsdc: formatUnits(amountMicros, USDC_DECIMALS), txHash: body.txHash, refId: movement.reference });
    void refreshVaultScan().catch(() => undefined);
    return c.json({ ok: true, reference: movement.reference, movementState: movement.state, txHash: body.txHash });
  } catch (err) {
    const failed = await getMoneyMovementByOperationKey(operationKey).catch(() => null);
    return c.json({ error: 'vault action proof failed', reference: failed?.reference, movementState: failed?.state, detail: (err as Error).message }, 409);
  }
});

vaultRoutes.post('/request-withdraw', (c) =>
  positionActionRoute(c, 'requestWithdraw', 'requestWithdraw(uint256)', 'vault.withdraw.requested'),
);

vaultRoutes.post('/cancel-withdraw', (c) =>
  positionActionRoute(c, 'cancelWithdraw', 'cancelWithdraw(uint256)', 'vault.withdraw.cancelled'),
);

vaultRoutes.post('/claim', (c) =>
  positionActionRoute(c, 'claim', 'claim(uint256)', 'vault.claimed'),
);
