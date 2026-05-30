/// Post-settlement withdraw for the seller. Two surfaces today:
///
///   POST /api/cashout/arc-withdraw     — direct USDC.transfer on Arc to any
///                                        address. Same-chain, fast path.
///   POST /api/bridge/circle-bridge-out — existing CCTP bridge-out for the
///                                        Arc → Solana/Eth/Polygon path. The
///                                        frontend calls it directly when
///                                        the user picks a non-Arc chain.
///
/// Both surfaces share the same guard: the caller must be the seller of a
/// settled deal that lives on the v2.E escrow (legacy generations cash out
/// through their own /legacy surface). Web3-wallet sellers can't use the
/// Arc-withdraw route — their USDC already landed in their connected wallet
/// when the escrow released, so they have no Circle DCW to spend from. The
/// frontend renders that path as "coming soon" today.
import { Hono } from 'hono';
import { z } from 'zod';
import { parseUnits, formatUnits } from 'viem';
import { getDeal } from '../db/deals.js';
import { getUserByAddress } from '../db/users.js';
import { readUsdcBalance, usdc as ARC_USDC } from '../chain/contracts.js';
import { executeContractCall } from '../chain/txs.js';
import { readSession } from '../auth/session.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';

const USDC_DECIMALS = 6;
const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');

const arcWithdrawSchema = z.object({
  jobId: z.string().min(1),
  recipient: addrSchema,
  amountUsdc: z.number().positive().max(1_000_000),
});

export const cashoutRoutes = new Hono();

cashoutRoutes.post('/arc-withdraw', async (c) => {
  let body;
  try {
    body = arcWithdrawSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  const session = readSession(c);
  if (!session) return c.json({ error: 'sign in to withdraw' }, 401);

  const deal = await getDeal(body.jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);

  if (deal.seller.toLowerCase() !== session.address.toLowerCase()) {
    return c.json({ error: 'only the seller can cash out this deal' }, 403);
  }
  if (!deal.settledAt) {
    return c.json(
      { error: 'deal is not settled yet', code: 'NOT_SETTLED' },
      409,
    );
  }
  if (deal.legacyEscrow) {
    return c.json(
      {
        error: 'this deal lives on a legacy escrow',
        detail: 'Cash out from the /legacy surface for legacy-escrow deals.',
        code: 'LEGACY_ESCROW',
      },
      409,
    );
  }

  const user = getUserByAddress(session.address);
  if (!user?.circleIdentityWalletId) {
    // Web3-wallet sellers: USDC has already landed in their connected wallet
    // when the escrow released. They have no Circle DCW to spend from.
    return c.json(
      {
        error: 'wallet-account withdraw is coming soon',
        detail:
          'Your USDC already landed in your connected wallet on Arc. Bridge it out from your wallet for now; in-product wallet withdraw is on the roadmap.',
        code: 'WALLET_ACCOUNT',
      },
      409,
    );
  }

  const amountWei = parseUnits(body.amountUsdc.toString(), USDC_DECIMALS);

  // Preflight against the live Arc balance so we don't burn a Circle tx
  // submission on a deal whose funds the seller already moved.
  let bal: bigint;
  try {
    bal = await readUsdcBalance(session.address);
  } catch (err) {
    return c.json(
      {
        error: 'could not read your Arc balance',
        detail: (err as Error).message,
      },
      503,
    );
  }
  if (bal < amountWei) {
    return c.json(
      {
        error: 'insufficient balance',
        detail: `Your Arc balance is ${formatUnits(bal, USDC_DECIMALS)} USDC, less than the ${body.amountUsdc} you want to withdraw.`,
        code: 'INSUFFICIENT_BALANCE',
      },
      409,
    );
  }

  try {
    const { txHash, explorerUrl } = await executeContractCall(
      {
        walletId: user.circleIdentityWalletId,
        contractAddress: ARC_USDC,
        abiFunctionSignature: 'transfer(address,uint256)',
        abiParameters: [body.recipient, amountWei.toString()],
      },
      `cashout-arc-${body.jobId.slice(0, 10)}`,
    );
    bus.emitEvent({
      type: 'cashout.arc.completed',
      jobId: body.jobId,
      actor: 'seller',
      payload: {
        recipient: body.recipient,
        amountUsdc: body.amountUsdc.toString(),
        txHash,
      },
    });
    logger.info(
      {
        jobId: body.jobId,
        recipient: body.recipient,
        amount: body.amountUsdc,
        txHash,
      },
      'cashout Arc transfer ok',
    );
    return c.json({ ok: true, txHash, explorerUrl });
  } catch (err) {
    const message = (err as Error).message;
    logger.warn(
      { jobId: body.jobId, err: message },
      'cashout Arc transfer failed',
    );
    return c.json({ error: 'withdraw failed', detail: message }, 502);
  }
});

/// Lightweight "can this user use cashout?" probe the frontend calls on the
/// /cashout/[jobId] page mount. Returns the per-deal context the page needs
/// to render without hitting the chain on every keystroke (eligible paths,
/// arc balance, deal amount, seller identity).
cashoutRoutes.get('/:jobId', async (c) => {
  const jobId = c.req.param('jobId');
  const session = readSession(c);
  if (!session) return c.json({ error: 'sign in first' }, 401);

  const deal = await getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);
  if (deal.seller.toLowerCase() !== session.address.toLowerCase()) {
    return c.json({ error: 'not your deal' }, 403);
  }

  const user = getUserByAddress(session.address);
  const accountKind: 'circle' | 'wallet' = user?.circleIdentityWalletId
    ? 'circle'
    : 'wallet';

  let arcBalanceUsdc: string | null = null;
  try {
    const bal = await readUsdcBalance(session.address);
    arcBalanceUsdc = formatUnits(bal, USDC_DECIMALS);
  } catch {
    // Non-fatal — the page renders with arcBalanceUsdc null and the form
    // resolves the balance again on submit.
  }

  return c.json({
    jobId: deal.jobId,
    sellerAddress: deal.seller,
    dealAmountUsdc: deal.dealAmountUsdc,
    settledAt: deal.settledAt ?? null,
    legacyEscrow: !!deal.legacyEscrow,
    accountKind,
    arcBalanceUsdc,
  });
});
