import { Hono } from 'hono';
import { z } from 'zod';
import { parseUnits } from 'viem';
import { readSession, sessionAddress } from '../auth/session.js';
import { moneyOutGuard } from '../moneyOut/live.js';
import { refusalBody } from '../moneyOut/refusal.js';
import { getUserByAddress } from '../db/users.js';
import { appendActivity } from '../db/activityLog.js';
import { bus } from '../events.js';
import {
  depositToGateway,
  GatewayDepositError,
  readUserGatewayBalance,
  sweepToUnifiedBalance,
} from '../gateway/balance.js';
import { GatewaySpendError, fundAgentFromGateway, cashOutFromGateway } from '../gateway/spend.js';
import { logger } from '../logger.js';
import { forgetPooledBalance, readPooledBalance } from '../gateway/pooledBalance.js';
import { invalidBodyMessage } from './invalidBody.js';

/// Circle Gateway unified balance routes. The read itself lives in
/// gateway/pooledBalance.ts, shared with the assistant's balance answer.

export const gatewayRoutes = new Hono();

/// Session-scoped, never `?address=`. A pooled balance is financial data, so
/// the caller reads their own or nothing.
gatewayRoutes.get('/balance', async (c) => {
  const address = sessionAddress(c);
  if (!address) return c.json({ error: 'unauthorized' }, 401);

  try {
    const { balance, stale } = await readPooledBalance(address);
    return c.json(stale ? { balance, stale: true } : { balance });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'gateway_unavailable';
    return c.json({ error: 'gateway_unavailable', message }, 502);
  }
});

/// A deposit only shows up once Gateway has indexed the source-chain tx, so the
/// client calls this straight after depositing to drop the cached zero instead
/// of waiting out the TTL.
gatewayRoutes.post('/refresh', async (c) => {
  const address = sessionAddress(c);
  if (!address) return c.json({ error: 'unauthorized' }, 401);
  forgetPooledBalance(address);
  return c.json({ ok: true });
});

// --- Pooled-balance WRITE side ------------------------------------------------
//
// THE POOLED BALANCE IS PLUMBING AND MUST STAY THAT WAY. The product presents one
// wallet and one balance. Underneath, a user's USDC can sit in their Arc identity
// wallet or in this Gateway pool, and gateway/router.ts picks the rail per move.
// Nothing here is a user-facing feature: no screen offers "add to your unified
// balance", no chat intent names it, and get_my_balance reports a single number
// that already includes it. Do not re-surface it — a second balance to manage is
// exactly the friction the one-wallet design removes.
//
// /deposit and /sweep therefore have no caller in the app. They stay because they
// are the operator lever for building or recovering a pooled balance by hand, and
// because /sweep is self-healing for a top-up that landed but was never deposited.
// Money is spent OUT of the pool automatically (fund-agent, cash-out) and never
// moved INTO it on a user's request: pre-positioning funds behind a finality delay
// and a 7-day trustless withdrawal buys nothing when the wallet leg works today.

const depositSchema = z.object({
  amountUsdc: z.number().positive().max(5_000_000),
  /// Client-generated retry identity. Reusing it returns the same Karwan
  /// movement instead of allocating a second deposit on a network retry.
  requestId: z.string().trim().min(8).max(128).optional(),
  /// Which of the user's own wallets funds the deposit. 'identity' is Circle-only;
  /// 'buyer'/'seller' agent wallets work for every account type (the web3 path).
  source: z.enum(['identity', 'buyer', 'seller']).optional(),
});

// One deposit at a time per user, so a double-click can't fire two approves.
const depositInFlight = new Set<string>();

/// The user's unified Gateway balance (available USD on Arc). Session-scoped.
gatewayRoutes.get('/unified', async (c) => {
  const address = sessionAddress(c);
  if (!address) return c.json({ error: 'unauthorized' }, 401);
  try {
    const bal = await readUserGatewayBalance(address);
    if (!bal) return c.json({ available: '0', gatewayAddress: null });
    return c.json({ available: bal.available.toString(), gatewayAddress: bal.gatewayAddress });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'gateway_unavailable';
    return c.json({ error: 'gateway_unavailable', message }, 502);
  }
});

/// Deposit USDC from one of the caller's own wallets into their unified balance.
gatewayRoutes.post('/deposit', async (c) => {
  const address = sessionAddress(c);
  if (!address) return c.json({ error: 'unauthorized' }, 401);

  let body;
  try {
    body = depositSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  const source = body.source ?? 'identity';
  // The identity source signs the identity SCA, which only Circle accounts have.
  // Agent sources are Circle DCWs for everyone, so the web3 path uses those.
  if (source === 'identity' && !getUserByAddress(address)) {
    return c.json(
      {
        error: 'Depositing from your sign-in wallet is available for email/passkey accounts. Fund an agent wallet and deposit from there instead.',
        code: 'web3_identity_unsupported',
      },
      409,
    );
  }

  if (depositInFlight.has(address)) {
    return c.json({ error: 'a deposit is already in progress', code: 'in_flight' }, 409);
  }
  depositInFlight.add(address);
  try {
    const result = await depositToGateway(address, body.amountUsdc, source, body.requestId);
    forgetPooledBalance(address); // bust the read cache so the new balance shows on next poll
    // Both axes, the way the yield route does it: the event drives the live
    // balance toast and the personal feed, the entry is the permanent receipt.
    // `address` is an OWNER_KEY, so the SSE projection delivers this to the
    // depositor intact instead of as an empty pulse.
    bus.emitEvent({
      type: 'gateway.deposited',
      actor: 'buyer',
      payload: {
        address,
        amountUsdc: result.amountUsd.toString(),
        source: String(result.source),
        ...(result.depositTxHash ? { txHash: result.depositTxHash } : {}),
        reference: result.reference,
      },
    });
    void appendActivity({
      address,
      kind: 'gateway_deposit',
      summary: `Added ${result.amountUsd} USDC to the unified balance from the ${result.source} wallet`,
      params: {t: 'gatewayDeposit', amount: String(result.amountUsd), source: String(result.source)},
      amountUsdc: result.amountUsd.toString(),
      ...(result.depositTxHash ? { txHash: result.depositTxHash } : {}),
      refId: result.reference,
    });
    return c.json({ ok: true, ...result });
  } catch (err) {
    logger.warn({ address, err: (err as Error).message }, 'gateway deposit failed');
    if (err instanceof GatewayDepositError) {
      void appendActivity({
        address,
        kind: 'gateway_deposit',
        summary: `Adding ${body.amountUsdc} USDC to the unified balance needs attention`,
        params: {t: 'gatewayDeposit', amount: String(body.amountUsdc), source: String(source)},
        amountUsdc: String(body.amountUsdc),
        ...(err.depositTxHash ? { txHash: err.depositTxHash } : {}),
        refId: err.reference,
      });
      return c.json(
        {
          error: 'deposit failed',
          detail: (err as Error).message,
          reference: err.reference,
          movementState: err.movementState,
        },
        502,
      );
    }
    return c.json({ error: 'deposit failed', detail: (err as Error).message }, 502);
  } finally {
    depositInFlight.delete(address);
  }
});

/// Sweep loose identity-wallet USDC into the unified balance. The "into the
/// unified balance" step after a top-up (incl. a Solana top-up, which mints to
/// the identity wallet). Self-healing: safe to call anytime; a no-op when there
/// is nothing to sweep. Circle-only.
gatewayRoutes.post('/sweep', async (c) => {
  const address = sessionAddress(c);
  if (!address) return c.json({ error: 'unauthorized' }, 401);
  if (!getUserByAddress(address)) {
    return c.json(
      { error: 'Sweeping into your unified balance is available for email/passkey accounts.', code: 'web3_unsupported' },
      409,
    );
  }
  if (depositInFlight.has(address)) {
    return c.json({ error: 'a deposit is already in progress', code: 'in_flight' }, 409);
  }
  depositInFlight.add(address);
  try {
    const result = await sweepToUnifiedBalance(address);
    forgetPooledBalance(address);
    return c.json({ ok: true, ...result });
  } catch (err) {
    logger.warn({ address, err: (err as Error).message }, 'gateway sweep failed');
    return c.json({ error: 'sweep failed', detail: (err as Error).message }, 502);
  } finally {
    depositInFlight.delete(address);
  }
});

const fundAgentSchema = z.object({
  agent: z.enum(['buyer', 'seller']),
  amountUsdc: z.number().positive().max(5_000_000),
  requestId: z.string().trim().min(8).max(128).optional(),
});

// One spend at a time per user, so a double-click can't fire two burn intents.
const spendInFlight = new Set<string>();

/// Fund one of the caller's agent wallets from their unified Gateway balance.
/// Same-chain Arc spend, using the configured owner path for this account.
gatewayRoutes.post('/fund-agent', async (c) => {
  const address = sessionAddress(c);
  if (!address) return c.json({ error: 'unauthorized' }, 401);

  let body;
  try {
    body = fundAgentSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }

  if (spendInFlight.has(address)) {
    return c.json({ error: 'a transfer is already in progress', code: 'in_flight' }, 409);
  }
  spendInFlight.add(address);
  try {
    const requestId = body.requestId ?? c.req.header('Idempotency-Key');
    if (!requestId) return c.json({ error: 'requestId or Idempotency-Key is required' }, 400);
    const result = await fundAgentFromGateway(address, body.agent, body.amountUsdc, requestId);
    forgetPooledBalance(address); // unified balance dropped; bust the read cache
    bus.emitEvent({
      type: 'gateway.agent.funded',
      actor: 'buyer',
      payload: {
        address,
        agent: String(result.agent),
        amountUsdc: result.amountUsd.toString(),
        ...(result.txHash ? { txHash: result.txHash } : {}),
        reference: result.reference,
        movementState: result.movementState,
      },
    });
    void appendActivity({
      address,
      kind: 'gateway_fund_agent',
      // Plain past tense with no plumbing in it: the user has one balance and
      // one wallet, and where the USDC physically sat is not their concern.
      summary: `Funded the ${result.agent} agent with ${result.amountUsd} USDC`,
        params: {
          t: 'gatewayFundAgent',
          agent: String(result.agent),
          amount: String(result.amountUsd),
          state: result.movementState,
        },
      amountUsdc: result.amountUsd.toString(),
      // Prefer the mined hash for explorer proof. The KWN reference is the
      // product receipt; Circle transfer ids remain provider-only metadata.
      ...(result.txHash ? { txHash: result.txHash } : {}),
      refId: result.reference,
    });
    return c.json({ ok: true, requestId, ...result });
  } catch (err) {
    logger.warn({ address, err: (err as Error).message }, 'gateway fund-agent failed');
    if (err instanceof GatewaySpendError) {
      void appendActivity({
        address,
        kind: 'gateway_fund_agent',
        summary: `Funding the ${body.agent} agent needs attention`,
        params: {
          t: 'gatewayFundAgent',
          agent: body.agent,
          amount: String(body.amountUsdc),
          state: err.movementState,
        },
        amountUsdc: String(body.amountUsdc),
        refId: err.reference,
      });
      return c.json(
        { error: 'transfer failed', detail: err.message, reference: err.reference, movementState: err.movementState },
        502,
      );
    }
    return c.json({ error: 'transfer failed', detail: (err as Error).message }, 502);
  } finally {
    spendInFlight.delete(address);
  }
});

const cashOutSchema = z.object({
  destChainKey: z.enum(['baseSepolia', 'arbitrumSepolia', 'optimismSepolia', 'sepolia', 'polygonAmoy']),
  recipient: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  amountUsdc: z.number().positive().max(5_000_000),
  requestId: z.string().trim().min(8).max(128).optional(),
});

/// Cash out from the caller's unified balance to another chain (cross-chain
/// Gateway spend). Works for every account type supported by the owner path.
gatewayRoutes.post('/cash-out', async (c) => {
  const address = sessionAddress(c);
  if (!address) return c.json({ error: 'unauthorized' }, 401);

  let body;
  try {
    body = cashOutSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  const requestId = body.requestId ?? c.req.header('Idempotency-Key');
  if (!requestId) return c.json({ error: 'requestId or Idempotency-Key is required' }, 400);

  const outgoing = {
    wallet: address,
    exit: { kind: 'payout', chain: body.destChainKey, address: body.recipient },
    amountMicros: parseUnits(body.amountUsdc.toString(), 6),
    reference: `gateway:cash-out:${address.toLowerCase()}:${requestId}`,
    ownEverywhere: readSession(c)?.method === 'web3',
  } as const;
  const early = await moneyOutGuard.check(outgoing, { reserve: false });
  if (!early.ok) return c.json(refusalBody(early.refusal), 409);

  if (spendInFlight.has(address)) {
    return c.json({ error: 'a transfer is already in progress', code: 'in_flight' }, 409);
  }
  spendInFlight.add(address);
  try {
    const pass = await moneyOutGuard.check(outgoing);
    if (!pass.ok) return c.json(refusalBody(pass.refusal), 409);
    const result = await cashOutFromGateway(
      address,
      body.destChainKey,
      body.recipient,
      body.amountUsdc,
      requestId,
    );
    forgetPooledBalance(address);
    bus.emitEvent({
      type: 'gateway.cashed.out',
      actor: 'buyer',
      payload: {
        address,
        amountUsdc: result.amountUsd.toString(),
        chain: String(result.destChainKey),
        recipient: result.recipientAddress.toLowerCase(),
        ...(result.txHash ? { txHash: result.txHash } : {}),
        reference: result.reference,
        movementState: result.movementState,
      },
    });
    void appendActivity({
      address,
      kind: 'gateway_cash_out',
      summary: `Cashed out ${result.amountUsd} USDC to ${result.recipientAddress.toLowerCase()} on ${result.destChainKey}`,
        params: {
          t: 'gatewayCashOut',
          amount: String(result.amountUsd),
          to: result.recipientAddress.toLowerCase(),
          chain: String(result.destChainKey),
          state: result.movementState,
        },
      amountUsdc: result.amountUsd.toString(),
      ...(result.txHash ? { txHash: result.txHash } : {}),
      refId: result.reference,
      chain: result.destChainKey,
      counterparty: result.recipientAddress.toLowerCase(),
    });
    return c.json({ ok: true, requestId, ...result });
  } catch (err) {
    logger.warn({ address, err: (err as Error).message }, 'gateway cash-out failed');
    if (err instanceof GatewaySpendError) {
      void appendActivity({
        address,
        kind: 'gateway_cash_out',
        summary: 'Cashing out from the unified balance needs attention',
        params: {
          t: 'gatewayCashOut',
          amount: String(body.amountUsdc),
          to: body.recipient.toLowerCase(),
          chain: body.destChainKey,
          state: err.movementState,
        },
        amountUsdc: String(body.amountUsdc),
        refId: err.reference,
        chain: body.destChainKey,
        counterparty: body.recipient.toLowerCase(),
      });
      return c.json(
        { error: 'cash-out failed', detail: err.message, reference: err.reference, movementState: err.movementState },
        502,
      );
    }
    return c.json({ error: 'cash-out failed', detail: (err as Error).message }, 502);
  } finally {
    spendInFlight.delete(address);
  }
});
