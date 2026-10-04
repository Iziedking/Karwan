import { Hono } from 'hono';
import { z } from 'zod';
import { isSessionSelf, sessionAddress } from '../auth/session.js';
import { logger } from '../logger.js';
import { readDepositAddresses } from '../money/depositAddresses.js';
import {
  cancelDepositRequest,
  createDepositRequest,
  getDepositRequest,
  getDepositRequestByTxId,
  listDepositRequests,
  listDepositRequestsPaidBy,
  markDepositRequestMatched,
  saveDepositRequest,
  toPublicRequest,
} from '../money/depositRequests.js';
import { coversRequest, payerOf, receivedBy } from '../money/requestPayment.js';
import { publicClient } from '../chain/client.js';
import { config } from '../config.js';
import { rateLimit } from '../middleware/rateLimit.js';

/// Everything the deposit card needs, with Circle's vocabulary left behind.
///
/// The card asks one question: where do I send money from another chain, and is
/// it being watched? So this answers in those terms. `BASE-SEPOLIA`, walletIds
/// and the per-chain derivation never reach the browser, because a user
/// depositing money has no use for any of it.
///
/// Two addresses, not five. Circle derives every EVM deposit wallet from the
/// user's identity anchor, so one address serves Ethereum, Base, Arbitrum and
/// Polygon. Solana is a different curve and can never share it, so it is
/// reported separately rather than folded in and quietly wrong.
export const depositRoutes = new Hono();

const requestBodySchema = z.object({
  amountUsdc: z.union([z.string(), z.number()]).optional(),
  purpose: z.string().max(120).optional(),
  ttlMinutes: z.number().int().min(5).max(7 * 24 * 60).optional(),
});

const addrSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

depositRoutes.get('/address', async (c) => {
  const raw = c.req.query('address');
  if (!raw) return c.json({ error: 'address query param required' }, 400);
  const parsed = addrSchema.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'invalid address' }, 400);
  const userAddress = parsed.data.toLowerCase();

  // A deposit address is where somebody's money lands. Handing one out for an
  // account that is not yours would let a stranger watch, or misdirect, another
  // user's funding.
  if (!isSessionSelf(c, userAddress)) {
    return c.json({ error: 'You can only read your own deposit address.', code: 'forbidden' }, 403);
  }

  return c.json(await readDepositAddresses(userAddress));
});

/// Create a shareable request for a third party to pay this account. The
/// request does not move money; it records the recipient and the user's intent
/// before a sender opens the public link.
depositRoutes.post('/requests', async (c) => {
  const owner = sessionAddress(c);
  if (!owner) return c.json({ error: 'sign in first' }, 401);
  const parsed = requestBodySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'invalid deposit request' }, 400);
  try {
    const request = createDepositRequest({ owner, ...parsed.data });
    await saveDepositRequest(request);
    return c.json({ request: toPublicRequest(request) }, 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'invalid deposit request' }, 400);
  }
});

/// Requests the signed-in account paid, so a payer can find them again.
depositRoutes.get('/requests/paid', async (c) => {
  const payer = sessionAddress(c);
  if (!payer) return c.json({ requests: [] });
  const requests = await listDepositRequestsPaidBy(payer, 20);
  const now = Date.now();
  return c.json({ requests: requests.map((request) => toPublicRequest(request, now)) });
});

/// Public by design. A recipient can share this URL with someone who is not
/// signed in. It returns only what the sender needs to confirm the request.
depositRoutes.get('/requests/:token', async (c) => {
  const token = c.req.param('token');
  const request = await getDepositRequest(token);
  if (!request) return c.json({ error: 'request not found' }, 404);
  const publicRequest = toPublicRequest(request);
  if (publicRequest.status === 'expired' && request.status === 'open') {
    await saveDepositRequest({ ...request, status: 'expired', updatedAt: Date.now() });
  }
  return c.json({ request: publicRequest });
});

/// The recipient's own request history. No public caller can enumerate tokens.
depositRoutes.get('/requests', async (c) => {
  const owner = sessionAddress(c);
  if (!owner) return c.json({ requests: [] });
  const requests = await listDepositRequests(owner, 20);
  const now = Date.now();
  return c.json({ requests: requests.map((request) => toPublicRequest(request, now)) });
});

/// The payer reports the Arc transaction that paid a request. Public, because a
/// payer need not have an account; the receipt on Arc is the only proof taken.
const paidSchema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  chain: z.string().trim().min(1).max(40).default('Arc'),
});

depositRoutes.post('/requests/:token/paid', rateLimit({ windowMs: 60_000, max: 30, name: 'request-paid' }), async (c) => {
  const parsed = paidSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'invalid payment' }, 400);
  const request = await getDepositRequest(c.req.param('token') ?? '');
  if (!request) return c.json({ error: 'request not found' }, 404);
  const txId = `arc:${parsed.data.txHash.toLowerCase()}`;
  if (request.status === 'matched') {
    return request.matchedTxId === txId
      ? c.json({ request: toPublicRequest(request) })
      : c.json({ error: 'already paid', request: toPublicRequest(request) }, 409);
  }
  if (toPublicRequest(request).status !== 'open') return c.json({ error: 'request is closed', request: toPublicRequest(request) }, 409);
  if (await getDepositRequestByTxId(txId)) return c.json({ error: 'this payment already settled another request' }, 409);

  const receipt = await publicClient.getTransactionReceipt({ hash: parsed.data.txHash as `0x${string}` }).catch(() => null);
  // Not on Arc yet: the payer's page keeps asking until it is.
  if (!receipt) return c.json({ pending: true, request: toPublicRequest(request) }, 202);
  if (receipt.status !== 'success') return c.json({ error: 'the transaction failed on Arc' }, 422);
  const received = receivedBy(receipt.logs, config.USDC_ADDR, request.recipientAddress);
  if (!coversRequest(received, request.amountUsdc)) {
    return c.json({ error: 'this transaction does not pay the request' }, 422);
  }
  const paidBy = sessionAddress(c) ?? payerOf(receipt.logs, config.USDC_ADDR, request.recipientAddress) ?? undefined;
  const matched = await markDepositRequestMatched(request, { txId, chain: parsed.data.chain, now: Date.now(), paidBy });
  const latest = matched ?? (await getDepositRequest(request.token)) ?? request;
  logger.info({ token: request.token, txHash: parsed.data.txHash, micros: received.micros.toString() }, 'payment request paid');
  return c.json({ request: toPublicRequest(latest) });
});

depositRoutes.post('/requests/:token/cancel', async (c) => {
  const owner = sessionAddress(c);
  if (!owner) return c.json({ error: 'sign in first' }, 401);
  const request = await cancelDepositRequest(owner, c.req.param('token'));
  if (!request) return c.json({ error: 'request not found' }, 404);
  return c.json({ request: toPublicRequest(request) });
});
