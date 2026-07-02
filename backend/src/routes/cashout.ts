// Post-settlement withdraw for the seller. Two seller-side wallets exist:
// the identity wallet (login + staking) and the per-deal seller agent wallet
// that the escrow pays out to. The cashout page picks one of these as the
// source; both are Circle DCWs we already control. Cross-chain withdraws
// go through /api/bridge/circle-bridge-out.
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { parseUnits, formatUnits } from 'viem';
import { getDeal } from '../db/deals.js';
import { getUserByAddress } from '../db/users.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { createBridge } from '../db/bridges.js';
import { ARC_DOMAIN } from '../chain/cctpChains.js';
import { readUsdcBalance, usdc as ARC_USDC } from '../chain/contracts.js';
import { executeContractCall, deterministicIdempotencyKey } from '../chain/txs.js';
import { readSession } from '../auth/session.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';

const USDC_DECIMALS = 6;
const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');

// Three custodial-or-connected sources the seller can pull from: the identity
// wallet (login + staking), the per-deal seller agent wallet (escrow pays out
// here, the default), and the buyer agent wallet the same user owns. Seller and
// buyer agent wallets are always Circle DCWs we sign for; identity is a DCW for
// email accounts and the user's own connected wallet for web3 accounts.
const walletKindSchema = z.enum(['identity', 'sellerAgent', 'buyerAgent']);
type WalletKind = z.infer<typeof walletKindSchema>;

const arcWithdrawSchema = z.object({
  jobId: z.string().min(1),
  recipient: addrSchema,
  amountUsdc: z.number().positive().max(1_000_000),
  /// Source wallet. Default sellerAgent because that's where escrow paid out.
  walletKind: walletKindSchema.default('sellerAgent'),
  /// Client-minted id for this ONE submission (a UUID from the form). Retries
  /// of the same submission reuse it, so Circle dedupes the transfer
  /// server-side instead of paying twice.
  requestId: z.string().min(8).max(128).optional(),
});

/// One in-flight balance-check-and-transfer per source wallet. The balance
/// read and the transfer are not atomic, so without this two concurrent
/// requests both see enough balance and both spend it.
const cashoutInFlight = new Set<string>();

/// Deal-free instant Arc send. Cashing out to a wallet that lives on Arc is a
/// plain same-chain USDC transfer from the signed-in user's identity wallet,
/// not a CCTP burn/mint. Keyed on the session only, so there is no
/// caller-supplied source address to spoof.
const arcSendSchema = z.object({
  recipient: addrSchema,
  amountUsdc: z.number().positive().max(1_000_000),
  /// The client's local record id, so the recorded bridge shares it and the
  /// frontend doesn't render a duplicate row when it merges /bridge/list.
  bridgeId: z.string().min(1).optional(),
});

export const cashoutRoutes = new Hono();

interface ResolvedWallet {
  kind: WalletKind;
  address: string;
  walletId: string;
}

/// Resolve the wallet ID and address for `kind`. Returns null when the source
/// isn't custodial for this user: a web3-only identity (no Circle DCW), a deal
/// that predates per-user seller agent wallets, or a user who never activated a
/// buyer agent.
async function resolveWallet(
  kind: WalletKind,
  user: ReturnType<typeof getUserByAddress>,
  deal: NonNullable<Awaited<ReturnType<typeof getDeal>>>,
): Promise<ResolvedWallet | null> {
  if (kind === 'identity') {
    if (!user?.circleIdentityWalletId) return null;
    return {
      kind,
      address: user.address,
      walletId: user.circleIdentityWalletId,
    };
  }
  if (kind === 'buyerAgent') {
    if (!user) return null;
    const wallets = await getAgentWallets(user.address);
    if (!wallets?.buyerWalletId || !wallets.buyerAddress) return null;
    return {
      kind,
      address: wallets.buyerAddress,
      walletId: wallets.buyerWalletId,
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
  const source = await resolveWallet(body.walletKind, user, deal);
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
    if (body.walletKind === 'buyerAgent') {
      return c.json(
        {
          error: 'buyer agent wallet not available',
          detail:
            'You have not activated a buyer agent, so there is no buyer wallet to withdraw from. Use the deal or identity wallet instead.',
          code: 'NO_BUYER_WALLET',
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

  // Balance read + transfer are not atomic: serialize per source wallet so two
  // concurrent withdraws can't both pass the check and both spend.
  if (cashoutInFlight.has(source.walletId)) {
    return c.json({ error: 'another withdraw from this wallet is in progress' }, 409);
  }
  cashoutInFlight.add(source.walletId);
  try {
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
          detail: `The ${body.walletKind === 'identity' ? 'identity' : body.walletKind === 'buyerAgent' ? 'buyer' : 'deal'} wallet holds ${formatUnits(bal, USDC_DECIMALS)} USDC on Arc, less than the ${body.amountUsdc} you want to withdraw.`,
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
          // Same submission retried (network blip, double-submit that slipped
          // past the client) dedupes at Circle instead of paying twice.
          ...(body.requestId
            ? { idempotencyKey: deterministicIdempotencyKey(`cashout-arc:${body.requestId}`) }
            : {}),
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
  } finally {
    cashoutInFlight.delete(source.walletId);
  }
});

/// Instant same-chain Arc send. Moves USDC from the signed-in user's Karwan
/// identity wallet to any Arc address in a single `transfer` call. Arc has
/// sub-second finality and USDC-as-gas, so this settles synchronously with no
/// attestation wait, unlike the cross-chain /api/bridge/circle-bridge-out path.
cashoutRoutes.post('/arc-send', async (c) => {
  let body;
  try {
    body = arcSendSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  const session = readSession(c);
  if (!session) return c.json({ error: 'sign in to cash out' }, 401);

  const user = getUserByAddress(session.address);
  if (!user?.circleIdentityWalletId) {
    // Web3-only users have no Karwan-custodied wallet to send from; their USDC
    // already sits in their own Arc wallet, which they send from directly.
    return c.json(
      {
        error: 'wallet-account send is not available',
        detail:
          'This instant send moves USDC from your Karwan wallet. Send from your own connected wallet on Arc instead.',
        code: 'WALLET_ACCOUNT',
      },
      409,
    );
  }

  const amountWei = parseUnits(body.amountUsdc.toString(), USDC_DECIMALS);

  // Serialize per identity wallet: balance read + transfer are not atomic.
  if (cashoutInFlight.has(user.circleIdentityWalletId)) {
    return c.json({ error: 'another send from this wallet is in progress' }, 409);
  }
  cashoutInFlight.add(user.circleIdentityWalletId);
  try {
  let bal: bigint;
  try {
    bal = await readUsdcBalance(user.address);
  } catch (err) {
    return c.json(
      { error: 'could not read your Arc balance', detail: (err as Error).message },
      503,
    );
  }
  if (bal < amountWei) {
    return c.json(
      {
        error: 'insufficient balance',
        detail: `Your Arc wallet holds ${formatUnits(bal, USDC_DECIMALS)} USDC, less than the ${body.amountUsdc} you want to send.`,
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
        // The client's bridge record id is stable across retries of this one
        // send, so Circle dedupes a replay instead of transferring twice.
        ...(body.bridgeId
          ? { idempotencyKey: deterministicIdempotencyKey(`arc-send:${body.bridgeId}`) }
          : {}),
      },
      `cashout-arc-send-${session.address.slice(0, 10)}`,
    );
    logger.info(
      { from: session.address, recipient: body.recipient, amount: body.amountUsdc, txHash },
      'cashout Arc instant send ok',
    );
    // Record it (best-effort) so this instant cash-out shows in durable history
    // and the main /activity feed, like the CCTP and App Kit bridges. A same-
    // chain Arc send has a single tx, so burn == mint == the transfer hash.
    try {
      const bridgeId = body.bridgeId ?? `arc-send-${session.address}-${randomUUID()}`;
      const amountUsdc = String(body.amountUsdc);
      await createBridge({
        bridgeId,
        sourceDomain: ARC_DOMAIN,
        sourceTxHash: txHash,
        amountUsdc,
        mintRecipient: body.recipient,
        status: 'minted',
        direction: 'out',
        mintTxHash: txHash,
        bridgeWalletAddress: session.address.toLowerCase(),
        sourceChainKey: 'arc' as never,
      });
      bus.emitEvent({
        type: 'bridge.minted',
        actor: 'buyer',
        payload: {
          bridgeId,
          amountUsdc,
          mintRecipient: body.recipient,
          sourceTxHash: txHash,
          txHash,
        },
      });
    } catch (recErr) {
      logger.warn({ err: (recErr as Error).message }, 'arc-send record failed (send still succeeded)');
    }
    return c.json({ ok: true, txHash, explorerUrl });
  } catch (err) {
    const message = (err as Error).message;
    logger.warn(
      { from: session.address, recipient: body.recipient, err: message },
      'cashout Arc instant send failed',
    );
    return c.json({ error: 'send failed', detail: message }, 502);
  }
  } finally {
    cashoutInFlight.delete(user.circleIdentityWalletId);
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

  // The seller's own buyer agent wallet, if they ever activated one. Custodial
  // like the deal wallet, so it's a valid third source to sweep from here.
  const agentWallets = await getAgentWallets(session.address);
  const buyerAgentAddress = agentWallets?.buyerAddress ?? null;

  const [identityBalance, sellerAgentBalance, buyerAgentBalance] = await Promise.all([
    readArc(session.address),
    readArc(deal.sellerAgentAddress),
    readArc(buyerAgentAddress ?? undefined),
  ]);

  return c.json({
    jobId: deal.jobId,
    sellerAddress: deal.seller,
    dealAmountUsdc: deal.dealAmountUsdc,
    settledAt: deal.settledAt ?? null,
    legacyEscrow: !!deal.legacyEscrow,
    accountKind,
    /// Identity wallet (the address the rest of Karwan shows for this user).
    /// For web3 accounts `available` is false (no Circle DCW to sign): the
    /// frontend still offers identity, but drives it through the user's own
    /// connected wallet rather than a custodial withdraw.
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
    /// The user's own buyer agent wallet (custodial). Null/unavailable when
    /// they never activated a buyer agent.
    buyerAgentWallet: {
      address: buyerAgentAddress,
      arcBalanceUsdc: buyerAgentBalance,
      available: !!agentWallets?.buyerAddress && !!agentWallets?.buyerWalletId,
    },
  });
});
