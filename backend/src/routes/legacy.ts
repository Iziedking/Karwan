import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { formatUnits } from 'viem';
import { publicClient } from '../chain/client.js';
import {
  legacyEscrow,
  legacyEscrowAddress,
  legacyVault,
  legacyVaultAddress,
  readLegacyEscrow,
  LEGACY_ESCROW_STATE,
} from '../chain/contracts.js';
import { legacyVaultAbi } from '../chain/abis/legacyVault.js';
import { config } from '../config.js';
import { getLegacyWindow } from '../chain/legacyWindow.js';
import { executeContractCall } from '../chain/txs.js';
import { getUserByAddress } from '../db/users.js';
import { listDealsForAddress, patchDeal, type DirectDeal } from '../db/deals.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';

/// 30-day recovery surface for the pre-v2.D escrow + vault contracts.
///
/// All write routes refuse with 410 once LEGACY_WINDOW_CLOSES_AT passes.
/// Read routes keep working forever so the /legacy page can render a
/// "window closed" state with historical context if someone follows an
/// old link.
///
/// Authentication on writes is identical to the live routes: Circle-user
/// path signs through the address's identity DCW (or, for deal actions,
/// the buyer/seller agent DCW that was bound to the deal at creation).
/// Web3 users sign client-side via wagmi and hit no backend write route.

const USDC_DECIMALS = 6;

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');

const dealActionSchema = z.object({
  address: addrSchema,
  /// 'buyer' | 'seller' tells the route which agent wallet on the deal
  /// record to use for the signing call. Both parties may have writes
  /// available depending on the action and deal state.
  role: z.enum(['buyer', 'seller']),
});

const proposeCancelSchema = dealActionSchema.extend({
  reason: z.string().min(1).max(600),
});

const positionActionSchema = z.object({
  address: addrSchema,
  positionId: z.union([z.string(), z.number()]),
});

const inFlight = new Set<string>();

function refuseIfClosed(c: Context): Response | null {
  const w = getLegacyWindow();
  if (!w.open) {
    return c.json(
      {
        error: 'legacy recovery window closed',
        closesAtMs: w.closesAtMs,
        daysRemaining: w.daysRemaining,
      },
      410,
    );
  }
  return null;
}

export const legacyRoutes = new Hono();

/// Window status — drives the home banner and the /legacy page header.
legacyRoutes.get('/window', (c) => {
  const w = getLegacyWindow();
  return c.json({
    ...w,
    legacyEscrowAddress,
    legacyVaultAddress,
  });
});

// ---------------------------------------------------------------------------
// LEGACY DEALS
// ---------------------------------------------------------------------------

interface LegacyDealView {
  jobId: string;
  role: 'buyer' | 'seller' | 'both';
  buyer: string;
  seller: string;
  dealAmountUsdc: string;
  state: number;
  stateLabel: 'funded' | 'settled' | 'disputed' | 'refunded' | 'unknown';
  deadlineUnix: number;
  pastDeadline: boolean;
  delivered: boolean;
  hasCancellationProposal: boolean;
  cancellationProposal?: DirectDeal['cancellationProposal'];
  /// Off-chain createdAt for sorting.
  createdAt: number;
  releasedUsdc: string;
}

function stateLabel(state: number): LegacyDealView['stateLabel'] {
  if (state === LEGACY_ESCROW_STATE.Funded) return 'funded';
  if (state === LEGACY_ESCROW_STATE.Settled) return 'settled';
  if (state === LEGACY_ESCROW_STATE.Disputed) return 'disputed';
  if (state === LEGACY_ESCROW_STATE.Refunded) return 'refunded';
  return 'unknown';
}

/// Lists every legacy deal where the address is buyer or seller. Reads
/// on-chain state from the legacy escrow so the UI can branch on Funded
/// vs Settled vs Refunded vs Disputed. Each deal is auto-tagged with
/// `legacyEscrow: true` on the off-chain record the first time it's seen.
legacyRoutes.get('/deals', async (c) => {
  const address = c.req.query('address');
  if (!address) return c.json({ error: 'address query param required' }, 400);
  const parsed = addrSchema.safeParse(address);
  if (!parsed.success) return c.json({ error: 'invalid address' }, 400);
  if (!legacyEscrow) {
    return c.json({ deals: [], legacyEscrowAddress: null });
  }

  const a = parsed.data.toLowerCase();
  const deals = await listDealsForAddress(a);
  const out: LegacyDealView[] = [];

  for (const d of deals) {
    const onChain = await readLegacyEscrow(d.jobId);
    if (!onChain) continue;
    // None (0) means the legacy contract genuinely doesn't know this jobId
    // either — the deal was probably never funded. Skip; nothing to recover.
    if (onChain.state === LEGACY_ESCROW_STATE.None) continue;

    // Lazy tag. Subsequent feed reads on the live surface filter these out.
    if (!d.legacyEscrow || d.legacyState !== onChain.state) {
      try {
        await patchDeal(d.jobId, { legacyEscrow: true, legacyState: onChain.state });
      } catch {
        // best-effort tag; do not block the read
      }
    }

    const role: LegacyDealView['role'] =
      d.buyer === a && d.seller === a
        ? 'both'
        : d.buyer === a
          ? 'buyer'
          : 'seller';

    out.push({
      jobId: d.jobId,
      role,
      buyer: d.buyer,
      seller: d.seller,
      dealAmountUsdc: d.dealAmountUsdc,
      state: onChain.state,
      stateLabel: stateLabel(onChain.state),
      deadlineUnix: d.deadlineUnix,
      pastDeadline: Math.floor(Date.now() / 1000) > d.deadlineUnix,
      delivered: d.delivered,
      hasCancellationProposal: Boolean(d.cancellationProposal),
      cancellationProposal: d.cancellationProposal,
      createdAt: d.createdAt,
      releasedUsdc: formatUnits(onChain.released, USDC_DECIMALS),
    });
  }

  return c.json({
    deals: out.sort((x, y) => y.createdAt - x.createdAt),
    legacyEscrowAddress,
  });
});

async function loadDealForLegacyAction(
  c: Context,
  jobId: string,
  body: z.infer<typeof dealActionSchema>,
): Promise<
  | { ok: true; deal: DirectDeal; walletId: string }
  | { ok: false; response: Response }
> {
  const a = body.address.toLowerCase();
  const deals = await listDealsForAddress(a);
  const deal = deals.find((d) => d.jobId.toLowerCase() === jobId.toLowerCase());
  if (!deal) {
    return {
      ok: false,
      response: c.json({ error: 'deal not found for this address' }, 404),
    };
  }
  // The legacy address tag is set lazily by GET /deals. Even if it isn't
  // tagged yet, the readLegacyEscrow check below confirms the deal is on
  // the legacy contract before we route the call there.
  const onChain = await readLegacyEscrow(jobId);
  if (!onChain || onChain.state === LEGACY_ESCROW_STATE.None) {
    return {
      ok: false,
      response: c.json(
        { error: 'this deal is not on the legacy escrow contract' },
        409,
      ),
    };
  }

  if (body.role === 'buyer' && deal.buyer !== a) {
    return { ok: false, response: c.json({ error: 'address is not the buyer of this deal' }, 403) };
  }
  if (body.role === 'seller' && deal.seller !== a) {
    return { ok: false, response: c.json({ error: 'address is not the seller of this deal' }, 403) };
  }

  const walletId =
    body.role === 'buyer' ? deal.buyerAgentWalletId : deal.sellerAgentWalletId;
  if (!walletId) {
    return {
      ok: false,
      response: c.json(
        {
          error:
            'no agent wallet bound to this deal for the requested role; cannot sign legacy action',
        },
        409,
      ),
    };
  }
  return { ok: true, deal, walletId };
}

async function callLegacyEscrowFn(
  c: Context,
  jobId: string,
  fn: 'refund' | 'releaseFinal' | 'acceptCancellation',
  signature: string,
  body: z.infer<typeof dealActionSchema>,
  args: unknown[],
  eventType: string,
): Promise<Response> {
  const closed = refuseIfClosed(c);
  if (closed) return closed;
  if (!legacyEscrow || !legacyEscrowAddress) {
    return c.json({ error: 'legacy escrow not configured' }, 410);
  }

  const loaded = await loadDealForLegacyAction(c, jobId, body);
  if (!loaded.ok) return loaded.response;

  const key = `${body.address.toLowerCase()}:legacy:${fn}:${jobId.toLowerCase()}`;
  if (inFlight.has(key)) {
    return c.json({ error: 'a legacy action is already in progress for this deal' }, 409);
  }
  inFlight.add(key);

  try {
    const result = await executeContractCall(
      {
        walletId: loaded.walletId,
        contractAddress: legacyEscrowAddress,
        abiFunctionSignature: signature,
        abiParameters: args.map((v) => String(v)),
      },
      `legacy.${fn}(${jobId})`,
    );
    bus.emitEvent({
      type: eventType as Parameters<typeof bus.emitEvent>[0]['type'],
      jobId,
      actor: body.role,
      payload: { txHash: result.txHash, legacy: true },
    });
    logger.info(
      { jobId, fn, txHash: result.txHash, role: body.role, address: body.address },
      'legacy escrow action confirmed',
    );
    return c.json({ ok: true, txHash: result.txHash });
  } catch (err) {
    logger.error(
      { jobId, fn, role: body.role, err: (err as Error).message },
      'legacy escrow action failed',
    );
    return c.json({ error: `${fn} failed`, detail: (err as Error).message }, 502);
  } finally {
    inFlight.delete(key);
  }
}

/// Buyer-side refund on the legacy contract. Matches the "Cancel & Reclaim
/// Funds" button surface on deals where the seller never delivered and the
/// deadline passed. The legacy escrow enforces the deadline check on chain.
legacyRoutes.post('/deals/:jobId/refund', async (c) => {
  let body: z.infer<typeof dealActionSchema>;
  try {
    body = dealActionSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  if (body.role !== 'buyer') {
    return c.json({ error: 'refund is buyer-only' }, 403);
  }
  return callLegacyEscrowFn(
    c,
    c.req.param('jobId'),
    'refund',
    'refund(bytes32)',
    body,
    [c.req.param('jobId')],
    'deal.cancelled',
  );
});

/// Buyer-side final release on the legacy contract. For deals where the
/// seller delivered before the contract migration but the buyer never
/// released — funds still on legacy, seller waiting.
legacyRoutes.post('/deals/:jobId/release-final', async (c) => {
  let body: z.infer<typeof dealActionSchema>;
  try {
    body = dealActionSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  if (body.role !== 'buyer') {
    return c.json({ error: 'release-final is buyer-only' }, 403);
  }
  return callLegacyEscrowFn(
    c,
    c.req.param('jobId'),
    'releaseFinal',
    'releaseFinal(bytes32)',
    body,
    [c.req.param('jobId')],
    'escrow.settled',
  );
});

/// Either party may propose a mutual cancellation. The counterparty accepts
/// via /cancel-accept, which transitions the legacy escrow to Refunded and
/// returns USDC to the buyer.
legacyRoutes.post('/deals/:jobId/cancel-propose', async (c) => {
  const closed = refuseIfClosed(c);
  if (closed) return closed;
  if (!legacyEscrow || !legacyEscrowAddress) {
    return c.json({ error: 'legacy escrow not configured' }, 410);
  }

  let body: z.infer<typeof proposeCancelSchema>;
  try {
    body = proposeCancelSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }

  const jobId = c.req.param('jobId');
  const loaded = await loadDealForLegacyAction(c, jobId, {
    address: body.address,
    role: body.role,
  });
  if (!loaded.ok) return loaded.response;

  const key = `${body.address.toLowerCase()}:legacy:cancel-propose:${jobId.toLowerCase()}`;
  if (inFlight.has(key)) {
    return c.json({ error: 'a legacy cancel proposal is already in progress' }, 409);
  }
  inFlight.add(key);

  try {
    const result = await executeContractCall(
      {
        walletId: loaded.walletId,
        contractAddress: legacyEscrowAddress,
        abiFunctionSignature: 'proposeCancellation(bytes32,string)',
        abiParameters: [jobId, body.reason],
      },
      `legacy.proposeCancellation(${jobId})`,
    );
    await patchDeal(jobId, {
      cancellationProposal: {
        proposedBy: body.role,
        kind: 'mutual',
        reason: body.reason,
        proposedAt: Date.now(),
      },
    });
    bus.emitEvent({
      type: 'deal.cancel.proposed',
      jobId,
      actor: body.role,
      payload: { txHash: result.txHash, legacy: true, reason: body.reason },
    });
    return c.json({ ok: true, txHash: result.txHash });
  } catch (err) {
    logger.error(
      { jobId, role: body.role, err: (err as Error).message },
      'legacy proposeCancellation failed',
    );
    return c.json({ error: 'cancel-propose failed', detail: (err as Error).message }, 502);
  } finally {
    inFlight.delete(key);
  }
});

legacyRoutes.post('/deals/:jobId/cancel-accept', async (c) => {
  let body: z.infer<typeof dealActionSchema>;
  try {
    body = dealActionSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  return callLegacyEscrowFn(
    c,
    c.req.param('jobId'),
    'acceptCancellation',
    'acceptCancellation(bytes32)',
    body,
    [c.req.param('jobId')],
    'deal.cancelled',
  );
});

// ---------------------------------------------------------------------------
// LEGACY VAULT
// ---------------------------------------------------------------------------

interface LegacyPosition {
  positionId: string;
  principalUsdc: string;
  depositedAt: number;
  cooldownStartedAt: number;
  claimableAt: number;
  state: 'active' | 'cooling' | 'claimed';
}

function vaultStateLabel(state: number): LegacyPosition['state'] {
  if (state === 1) return 'active';
  if (state === 2) return 'cooling';
  return 'claimed';
}

legacyRoutes.get('/vault/positions', async (c) => {
  const address = c.req.query('address');
  if (!address) return c.json({ error: 'address query param required' }, 400);
  const parsed = addrSchema.safeParse(address);
  if (!parsed.success) return c.json({ error: 'invalid address' }, 400);
  if (!legacyVault || !legacyVaultAddress) {
    return c.json({
      vaultAddress: null,
      positions: [],
      totalActiveUsdc: '0',
      totalCoolingUsdc: '0',
      cooldownDays: 7,
    });
  }

  const a = parsed.data.toLowerCase() as `0x${string}`;
  const vaultAddr = legacyVaultAddress as `0x${string}`;

  // Legacy vault has no nextPositionId or activeStakeOf views; those were
  // added in v2.D. Find this owner's positions by scanning Deposited events
  // filtered by the owner topic. viem batches the block range internally.
  const fromBlock =
    (config as unknown as Record<string, bigint | undefined>).KARWAN_VAULT_LEGACY_DEPLOY_BLOCK ??
    0n;

  let logs: Array<{ args: { positionId?: bigint; owner?: `0x${string}`; principal?: bigint } }>;
  try {
    logs = (await publicClient.getContractEvents({
      address: vaultAddr,
      abi: legacyVaultAbi,
      eventName: 'Deposited',
      args: { owner: a },
      fromBlock,
      toBlock: 'latest',
    })) as typeof logs;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'legacy vault Deposited scan failed');
    return c.json({ error: 'legacy vault read failed' }, 502);
  }

  let cooldownDays = 7;
  try {
    const cd = (await publicClient.readContract({
      address: vaultAddr,
      abi: legacyVaultAbi,
      functionName: 'COOLDOWN_DAYS',
    })) as number;
    cooldownDays = Number(cd);
  } catch {
    // legacy default 7
  }

  if (logs.length === 0) {
    return c.json({
      vaultAddress: vaultAddr,
      positions: [],
      totalActiveUsdc: '0',
      totalCoolingUsdc: '0',
      cooldownDays,
    });
  }

  // Dedup positionIds in case the RPC returned the same event twice across
  // a page boundary; multicall over the unique set stays small.
  const positionIds = Array.from(
    new Set(logs.map((l) => (l.args.positionId ?? 0n).toString())),
  ).map((s) => BigInt(s));

  const calls = positionIds.map(
    (id) =>
      ({
        address: vaultAddr,
        abi: legacyVaultAbi,
        functionName: 'positions',
        args: [id],
      }) as const,
  );

  const results = await publicClient.multicall({ contracts: calls, allowFailure: true });
  const positions: LegacyPosition[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r || r.status !== 'success') continue;
    const tuple = r.result as readonly [
      `0x${string}`,
      bigint,
      bigint,
      bigint,
      bigint,
      number,
    ];
    if (tuple[0].toLowerCase() !== a) continue;
    if (tuple[5] === 0) continue;
    const positionId = positionIds[i];
    if (positionId == null) continue;
    positions.push({
      positionId: positionId.toString(),
      principalUsdc: formatUnits(tuple[1], USDC_DECIMALS),
      depositedAt: Number(tuple[2]),
      cooldownStartedAt: Number(tuple[3]),
      claimableAt: Number(tuple[4]),
      state: vaultStateLabel(tuple[5]),
    });
  }

  const sumByState = (s: LegacyPosition['state']) => {
    const total = positions
      .filter((p) => p.state === s)
      .reduce((acc, p) => acc + Number(p.principalUsdc), 0);
    return total.toFixed(USDC_DECIMALS).replace(/\.?0+$/, '') || '0';
  };

  return c.json({
    vaultAddress: legacyVaultAddress,
    positions: positions.sort((x, y) => Number(y.positionId) - Number(x.positionId)),
    totalActiveUsdc: sumByState('active'),
    totalCoolingUsdc: sumByState('cooling'),
    cooldownDays,
  });
});

async function callLegacyVaultFn(
  c: Context,
  fn: 'requestWithdraw' | 'cancelWithdraw' | 'claim',
  signature: string,
  eventType: 'vault.withdraw.requested' | 'vault.withdraw.cancelled' | 'vault.claimed',
): Promise<Response> {
  const closed = refuseIfClosed(c);
  if (closed) return closed;
  if (!legacyVault || !legacyVaultAddress) {
    return c.json({ error: 'legacy vault not configured' }, 410);
  }

  let body;
  try {
    body = positionActionSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }

  const user = getUserByAddress(body.address.toLowerCase());
  if (!user) {
    return c.json(
      {
        error: 'no Circle identity wallet for this address',
        detail: 'Legacy vault writes through the API are for Circle users. Web3 users sign from the wallet.',
      },
      409,
    );
  }

  const positionIdStr = String(body.positionId);
  const key = `${body.address.toLowerCase()}:legacy-vault:${fn}:${positionIdStr}`;
  if (inFlight.has(key)) {
    return c.json({ error: 'a legacy vault action is already in progress' }, 409);
  }
  inFlight.add(key);

  try {
    const result = await executeContractCall(
      {
        walletId: user.circleIdentityWalletId,
        contractAddress: legacyVaultAddress,
        abiFunctionSignature: signature,
        abiParameters: [positionIdStr],
      },
      `legacy-vault.${fn}(${body.address}, ${positionIdStr})`,
    );
    bus.emitEvent({
      type: eventType,
      actor: 'platform',
      payload: {
        address: body.address.toLowerCase(),
        positionId: positionIdStr,
        txHash: result.txHash,
        legacy: true,
      },
    });
    return c.json({ ok: true, txHash: result.txHash });
  } catch (err) {
    logger.error(
      { address: body.address, positionId: positionIdStr, fn, err: (err as Error).message },
      'legacy vault action failed',
    );
    return c.json({ error: `${fn} failed`, detail: (err as Error).message }, 502);
  } finally {
    inFlight.delete(key);
  }
}

legacyRoutes.post('/vault/request-withdraw', (c) =>
  callLegacyVaultFn(c, 'requestWithdraw', 'requestWithdraw(uint256)', 'vault.withdraw.requested'),
);
legacyRoutes.post('/vault/cancel-withdraw', (c) =>
  callLegacyVaultFn(c, 'cancelWithdraw', 'cancelWithdraw(uint256)', 'vault.withdraw.cancelled'),
);
legacyRoutes.post('/vault/claim', (c) =>
  callLegacyVaultFn(c, 'claim', 'claim(uint256)', 'vault.claimed'),
);
