import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { formatUnits, type Address } from 'viem';
import { publicClient } from '../chain/client.js';
import {
  legacyEscrowAddress,
  legacyVaultAddress,
  legacyGenerations,
  readLegacyEscrow,
  readLegacyEscrowWithGen,
  LEGACY_ESCROW_STATE,
  type LegacyGeneration,
} from '../chain/contracts.js';
import { legacyVaultAbi } from '../chain/abis/legacyVault.js';
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
  /// Which legacy vault to target. Defaults to Gen 1 for backward compat with
  /// older clients that don't yet send it; the page sends it explicitly so we
  /// always hit the right contract.
  generation: z.union([z.literal(1), z.literal(2)]).optional(),
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

/// Window status — drives the home banner and the /legacy page header. The
/// composite (open / closesAtMs) reflects the soonest still-open deadline
/// across all generations. `generations` carries per-gen detail + addresses
/// so the page can render a section per legacy contract bundle.
legacyRoutes.get('/window', (c) => {
  const w = getLegacyWindow();
  const generationsWithAddresses = w.generations.map((g) => {
    const gen = legacyGenerations.find((lg) => lg.index === g.index);
    return {
      ...g,
      legacyVaultAddress: gen?.vaultAddress ?? null,
      legacyEscrowAddress: gen?.escrowAddress ?? null,
    };
  });
  return c.json({
    open: w.open,
    closesAtMs: w.closesAtMs,
    daysRemaining: w.daysRemaining,
    hasLegacyEscrow: w.hasLegacyEscrow,
    hasLegacyVault: w.hasLegacyVault,
    // Keep the legacy single-slot fields for backward compat with the banner.
    legacyEscrowAddress,
    legacyVaultAddress,
    generations: generationsWithAddresses,
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
  /// Which legacy generation this deal lives on (1 or 2). Sent back to the
  /// client so action routes get tagged with the right gen on follow-up calls.
  generation: 1 | 2 | 3;
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
  if (legacyGenerations.every((g) => !g.escrow)) {
    return c.json({ deals: [], legacyEscrowAddress: null, generations: [] });
  }

  const a = parsed.data.toLowerCase();
  const deals = await listDealsForAddress(a);
  const out: LegacyDealView[] = [];

  for (const d of deals) {
    const hit = await readLegacyEscrowWithGen(d.jobId);
    if (!hit) continue;
    const { account: onChain, generation } = hit;

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
      deadlineUnix: d.deadlineUnix ?? 0,
      pastDeadline: d.deadlineUnix != null && Math.floor(Date.now() / 1000) > d.deadlineUnix,
      delivered: d.delivered,
      hasCancellationProposal: Boolean(d.cancellationProposal),
      cancellationProposal: d.cancellationProposal,
      createdAt: d.createdAt,
      releasedUsdc: formatUnits(onChain.released, USDC_DECIMALS),
      generation,
    });
  }

  return c.json({
    deals: out.sort((x, y) => y.createdAt - x.createdAt),
    // Keep this field for backward compat with older clients reading the Gen 1
    // address; the per-deal `generation` is the source of truth from now on.
    legacyEscrowAddress,
    generations: legacyGenerations
      .filter((g) => g.escrowAddress)
      .map((g) => ({ index: g.index, legacyEscrowAddress: g.escrowAddress })),
  });
});

async function loadDealForLegacyAction(
  c: Context,
  jobId: string,
  body: z.infer<typeof dealActionSchema>,
): Promise<
  | { ok: true; deal: DirectDeal; walletId: string; generation: LegacyGeneration }
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
  const hit = await readLegacyEscrowWithGen(jobId);
  if (!hit) {
    return {
      ok: false,
      response: c.json(
        { error: 'this deal is not on any legacy escrow contract' },
        409,
      ),
    };
  }
  const generation = legacyGenerations.find((g) => g.index === hit.generation);
  if (!generation || !generation.escrow || !generation.escrowAddress) {
    return {
      ok: false,
      response: c.json({ error: 'legacy escrow not configured for this generation' }, 410),
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
  return { ok: true, deal, walletId, generation };
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

  const loaded = await loadDealForLegacyAction(c, jobId, body);
  if (!loaded.ok) return loaded.response;
  const escrowAddress = loaded.generation.escrowAddress as Address;

  const key = `${body.address.toLowerCase()}:legacy:${fn}:${jobId.toLowerCase()}`;
  if (inFlight.has(key)) {
    return c.json({ error: 'a legacy action is already in progress for this deal' }, 409);
  }
  inFlight.add(key);

  try {
    const result = await executeContractCall(
      {
        walletId: loaded.walletId,
        contractAddress: escrowAddress,
        abiFunctionSignature: signature,
        abiParameters: args.map((v) => String(v)),
      },
      `legacy.${fn}(gen${loaded.generation.index} ${jobId})`,
    );
    bus.emitEvent({
      type: eventType as Parameters<typeof bus.emitEvent>[0]['type'],
      jobId,
      actor: body.role,
      payload: { txHash: result.txHash, legacy: true, generation: loaded.generation.index },
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

/// Buyer-side refund on the legacy contract. Pre-v2.D escrow required a
/// two-step buyer cancel: dispute(jobId, reason) moves Funded to Disputed,
/// then refund(jobId) moves Disputed to Refunded and returns USDC. This
/// route chains both calls so the user clicks once and the backend signs
/// twice with the buyer agent DCW.
legacyRoutes.post('/deals/:jobId/refund', async (c) => {
  const closed = refuseIfClosed(c);
  if (closed) return closed;

  let body: z.infer<typeof dealActionSchema>;
  try {
    body = dealActionSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  if (body.role !== 'buyer') {
    return c.json({ error: 'refund is buyer-only' }, 403);
  }

  const jobId = c.req.param('jobId');
  const loaded = await loadDealForLegacyAction(c, jobId, body);
  if (!loaded.ok) return loaded.response;
  const escrowAddress = loaded.generation.escrowAddress as Address;

  const onChain = await readLegacyEscrow(jobId);
  if (!onChain) {
    return c.json({ error: 'legacy escrow record not found' }, 404);
  }

  const key = `${body.address.toLowerCase()}:legacy:refund:${jobId.toLowerCase()}`;
  if (inFlight.has(key)) {
    return c.json({ error: 'a legacy refund is already in progress for this deal' }, 409);
  }
  inFlight.add(key);

  try {
    let disputeTxHash: string | null = null;
    // Funded means refund alone reverts InvalidState; dispute first.
    if (onChain.state === LEGACY_ESCROW_STATE.Funded) {
      const disputeResult = await executeContractCall(
        {
          walletId: loaded.walletId,
          contractAddress: escrowAddress,
          abiFunctionSignature: 'dispute(bytes32,string)',
          abiParameters: [jobId, 'Recovery: seller did not deliver by deadline'],
        },
        `legacy.dispute(gen${loaded.generation.index} ${jobId})`,
      );
      disputeTxHash = disputeResult.txHash;
      bus.emitEvent({
        type: 'deal.disputed',
        jobId,
        actor: 'buyer',
        payload: { txHash: disputeTxHash, legacy: true, generation: loaded.generation.index },
      });
    } else if (onChain.state !== LEGACY_ESCROW_STATE.Disputed) {
      return c.json(
        {
          error: 'legacy escrow is not in a refundable state',
          state: onChain.state,
        },
        409,
      );
    }

    const refundResult = await executeContractCall(
      {
        walletId: loaded.walletId,
        contractAddress: escrowAddress,
        abiFunctionSignature: 'refund(bytes32)',
        abiParameters: [jobId],
      },
      `legacy.refund(gen${loaded.generation.index} ${jobId})`,
    );
    bus.emitEvent({
      type: 'deal.cancelled',
      jobId,
      actor: 'buyer',
      payload: { txHash: refundResult.txHash, legacy: true, disputeTxHash, generation: loaded.generation.index },
    });
    logger.info(
      { jobId, refundTxHash: refundResult.txHash, disputeTxHash },
      'legacy buyer refund confirmed',
    );
    return c.json({ ok: true, txHash: refundResult.txHash, disputeTxHash });
  } catch (err) {
    logger.error(
      { jobId, err: (err as Error).message },
      'legacy buyer refund failed',
    );
    return c.json({ error: 'refund failed', detail: (err as Error).message }, 502);
  } finally {
    inFlight.delete(key);
  }
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
  const escrowAddress = loaded.generation.escrowAddress as Address;

  const key = `${body.address.toLowerCase()}:legacy:cancel-propose:${jobId.toLowerCase()}`;
  if (inFlight.has(key)) {
    return c.json({ error: 'a legacy cancel proposal is already in progress' }, 409);
  }
  inFlight.add(key);

  try {
    const result = await executeContractCall(
      {
        walletId: loaded.walletId,
        contractAddress: escrowAddress,
        abiFunctionSignature: 'proposeCancellation(bytes32,string)',
        abiParameters: [jobId, body.reason],
      },
      `legacy.proposeCancellation(gen${loaded.generation.index} ${jobId})`,
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
      payload: { txHash: result.txHash, legacy: true, reason: body.reason, generation: loaded.generation.index },
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
  /// Which legacy generation this position is on. The client passes it back in
  /// the action body so we route the request-withdraw / cancel / claim to the
  /// matching vault contract.
  generation: 1 | 2 | 3;
}

function vaultStateLabel(state: number): LegacyPosition['state'] {
  if (state === 1) return 'active';
  if (state === 2) return 'cooling';
  return 'claimed';
}

async function readPositionsFromVault(
  vaultAddr: Address,
  owner: string,
  generation: 1 | 2 | 3,
): Promise<{ positions: LegacyPosition[]; cooldownDays: number }> {
  let nextId: bigint;
  try {
    nextId = (await publicClient.readContract({
      address: vaultAddr,
      abi: legacyVaultAbi,
      functionName: 'nextPositionId',
    })) as bigint;
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, vault: vaultAddr, generation },
      'legacy nextPositionId read failed',
    );
    return { positions: [], cooldownDays: 7 };
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

  if (nextId === 0n) {
    return { positions: [], cooldownDays };
  }

  const positionIds: bigint[] = [];
  for (let i = 0n; i <= nextId; i++) positionIds.push(i);

  const results = await Promise.allSettled(
    positionIds.map((id) =>
      publicClient.readContract({
        address: vaultAddr,
        abi: legacyVaultAbi,
        functionName: 'positions',
        args: [id],
      }),
    ),
  );
  const positions: LegacyPosition[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r || r.status !== 'fulfilled') continue;
    const tuple = r.value as readonly [
      `0x${string}`,
      bigint,
      bigint,
      bigint,
      bigint,
      number,
    ];
    if (tuple[0].toLowerCase() !== owner) continue;
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
      generation,
    });
  }
  return { positions, cooldownDays };
}

legacyRoutes.get('/vault/positions', async (c) => {
  const address = c.req.query('address');
  if (!address) return c.json({ error: 'address query param required' }, 400);
  const parsed = addrSchema.safeParse(address);
  if (!parsed.success) return c.json({ error: 'invalid address' }, 400);

  const configuredGens = legacyGenerations.filter((g) => g.vaultAddress && g.vault);
  if (configuredGens.length === 0) {
    return c.json({
      vaultAddress: null,
      positions: [],
      totalActiveUsdc: '0',
      totalCoolingUsdc: '0',
      cooldownDays: 7,
      generations: [],
    });
  }

  const a = parsed.data.toLowerCase();
  const perGen = await Promise.all(
    configuredGens.map((g) =>
      readPositionsFromVault(g.vaultAddress as Address, a, g.index).then((r) => ({
        index: g.index,
        vaultAddress: g.vaultAddress as Address,
        positions: r.positions,
        cooldownDays: r.cooldownDays,
      })),
    ),
  );

  const positions = perGen.flatMap((g) => g.positions);

  const sumByState = (s: LegacyPosition['state']) => {
    const total = positions
      .filter((p) => p.state === s)
      .reduce((acc, p) => acc + Number(p.principalUsdc), 0);
    return total.toFixed(USDC_DECIMALS).replace(/\.?0+$/, '') || '0';
  };

  return c.json({
    // Backward compat: surface the Gen 1 vault address at the top level so
    // older clients still get something sensible. The per-position generation
    // field is the source of truth from now on.
    vaultAddress: legacyVaultAddress,
    positions: positions.sort((x, y) =>
      x.generation === y.generation
        ? Number(y.positionId) - Number(x.positionId)
        : x.generation - y.generation,
    ),
    totalActiveUsdc: sumByState('active'),
    totalCoolingUsdc: sumByState('cooling'),
    // Backward compat. Newer clients should read per-gen cooldownDays from
    // generations[].cooldownDays since the two contracts can have different
    // cooldown windows (7d on Gen 1, 3d on Gen 2 after v2.D).
    cooldownDays: perGen[0]?.cooldownDays ?? 7,
    generations: perGen.map((g) => ({
      index: g.index,
      vaultAddress: g.vaultAddress,
      cooldownDays: g.cooldownDays,
      positionCount: g.positions.length,
    })),
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

  let body;
  try {
    body = positionActionSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }

  const genIndex = body.generation ?? 1;
  const generation = legacyGenerations.find((g) => g.index === genIndex);
  if (!generation || !generation.vault || !generation.vaultAddress) {
    return c.json(
      { error: `legacy vault for generation ${genIndex} not configured` },
      410,
    );
  }
  const vaultAddress = generation.vaultAddress as Address;

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
  const key = `${body.address.toLowerCase()}:legacy-vault-g${genIndex}:${fn}:${positionIdStr}`;
  if (inFlight.has(key)) {
    return c.json({ error: 'a legacy vault action is already in progress' }, 409);
  }
  inFlight.add(key);

  try {
    const result = await executeContractCall(
      {
        walletId: user.circleIdentityWalletId,
        contractAddress: vaultAddress,
        abiFunctionSignature: signature,
        abiParameters: [positionIdStr],
      },
      `legacy-vault.${fn}(gen${genIndex} ${body.address}, ${positionIdStr})`,
    );
    bus.emitEvent({
      type: eventType,
      actor: 'platform',
      payload: {
        address: body.address.toLowerCase(),
        positionId: positionIdStr,
        txHash: result.txHash,
        legacy: true,
        generation: genIndex,
      },
    });
    return c.json({ ok: true, txHash: result.txHash });
  } catch (err) {
    logger.error(
      { address: body.address, positionId: positionIdStr, fn, generation: genIndex, err: (err as Error).message },
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
