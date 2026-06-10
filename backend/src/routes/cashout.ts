// Post-settlement withdraw for the seller. Two seller-side wallets exist:
// the identity wallet (login + staking) and the per-deal seller agent wallet
// that the escrow pays out to. The cashout page picks one of these as the
// source; both are Circle DCWs we already control. Cross-chain withdraws
// go through /api/bridge/circle-bridge-out.
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

const walletKindSchema = z.enum(['identity', 'sellerAgent']);
type WalletKind = z.infer<typeof walletKindSchema>;

const arcWithdrawSchema = z.object({
  jobId: z.string().min(1),
  recipient: addrSchema,
  amountUsdc: z.number().positive().max(1_000_000),
  /// Source wallet. Default sellerAgent because that's where escrow paid out.
  walletKind: walletKindSchema.default('sellerAgent'),
});

export const cashoutRoutes = new Hono();

interface ResolvedWallet {
  kind: WalletKind;
  address: string;
  walletId: string;
}

/// Resolve the wallet ID and address for `kind`. Returns null for web3-only
/// users (no Circle identity) or deals that predate per-user agent wallets.
function resolveWallet(
  kind: WalletKind,
  user: ReturnType<typeof getUserByAddress>,
  deal: NonNullable<Awaited<ReturnType<typeof getDeal>>>,
): ResolvedWallet | null {
  if (kind === 'identity') {
    if (!user?.circleIdentityWalletId) return null;
    return {
      kind,
      address: user.address,
      walletId: user.circleIdentityWalletId,
    };
  }
  if (!deal.sellerAgentWalletId || !deal.sellerAgentAddress) return null;
  return {
    kind,
    address: deal.sellerAgentAddress,
    walletId: deal.sellerAgentWalletId,
  };
}

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
  const source = resolveWallet(body.walletKind, user, deal);
  if (!source) {
    if (body.walletKind === 'identity') {
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
    return c.json(
      {
        error: 'deal wallet not available on this deal',
        detail:
          'This deal was opened before per-user agent wallets existed. Use identity wallet instead.',
        code: 'NO_DEAL_WALLET',
      },
      409,
    );
  }

  const amountWei = parseUnits(body.amountUsdc.toString(), USDC_DECIMALS);

  // Preflight against the live balance of the chosen wallet so we don't burn
  // a Circle tx submission with insufficient funds.
  let bal: bigint;
  try {
    bal = await readUsdcBalance(source.address);
  } catch (err) {
    return c.json(
      {
        error: 'could not read the source wallet Arc balance',
        detail: (err as Error).message,
      },
      503,
    );
  }
  if (bal < amountWei) {
    return c.json(
      {
        error: 'insufficient balance',
        detail: `The ${body.walletKind === 'identity' ? 'identity' : 'deal'} wallet holds ${formatUnits(bal, USDC_DECIMALS)} USDC on Arc, less than the ${body.amountUsdc} you want to withdraw.`,
        code: 'INSUFFICIENT_BALANCE',
      },
      409,
    );
  }

  try {
    const { txHash, explorerUrl } = await executeContractCall(
      {
        walletId: source.walletId,
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
        walletKind: body.walletKind,
      },
    });
    logger.info(
      {
        jobId: body.jobId,
        recipient: body.recipient,
        amount: body.amountUsdc,
        walletKind: body.walletKind,
        txHash,
      },
      'cashout Arc transfer ok',
    );
    return c.json({ ok: true, txHash, explorerUrl });
  } catch (err) {
    const message = (err as Error).message;
    logger.warn(
      { jobId: body.jobId, walletKind: body.walletKind, err: message },
      'cashout Arc transfer failed',
    );
    return c.json({ error: 'withdraw failed', detail: message }, 502);
  }
});

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

  // Read both Arc balances so the form can show each wallet's spendable
  // amount alongside the picker. Either read can fail (transient RPC) and
  // the page still renders. null tells the form to defer to the live read
  // on submit.
  async function readArc(address: string | undefined): Promise<string | null> {
    if (!address) return null;
    try {
      const bal = await readUsdcBalance(address);
      return formatUnits(bal, USDC_DECIMALS);
    } catch {
      return null;
    }
  }

  const [identityBalance, sellerAgentBalance] = await Promise.all([
    readArc(session.address),
    readArc(deal.sellerAgentAddress),
  ]);

  return c.json({
    jobId: deal.jobId,
    sellerAddress: deal.seller,
    dealAmountUsdc: deal.dealAmountUsdc,
    settledAt: deal.settledAt ?? null,
    legacyEscrow: !!deal.legacyEscrow,
    accountKind,
    /// Identity wallet (the address the rest of Karwan shows for this user).
    identityWallet: {
      address: session.address,
      arcBalanceUsdc: identityBalance,
      available: !!user?.circleIdentityWalletId,
    },
    /// Per-deal seller agent wallet. The escrow paid out to this address;
    /// this is the default source for cashout.
    sellerAgentWallet: {
      address: deal.sellerAgentAddress ?? null,
      arcBalanceUsdc: sellerAgentBalance,
      available: !!deal.sellerAgentAddress && !!deal.sellerAgentWalletId,
    },
  });
});
