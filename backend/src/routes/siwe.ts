import { Hono } from 'hono';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { getAddress, isAddress } from 'viem';
import { rateLimit } from '../middleware/rateLimit.js';
import { durableEphemeralMap } from '../db/ephemeral.js';
import { setSessionCookie } from '../auth/session.js';
import { publicClient } from '../chain/client.js';
import { logger } from '../logger.js';

const NONCE_TTL_MS = 10 * 60 * 1000;

interface PendingNonce {
  nonce: string;
  address: string;
  message: string;
  issuedAt: number;
  expiresAt: number;
}

const pending = durableEphemeralMap<PendingNonce>('siwe');

function purgeStale() {
  const now = Date.now();
  for (const [k, v] of pending.entries()) {
    if (v.expiresAt < now) pending.delete(k);
  }
}

const addressSchema = z
  .string()
  .refine((v) => isAddress(v), { message: 'invalid address' });

function originHost(origin: string | undefined): string {
  if (!origin) return 'karwan.site';
  try {
    return new URL(origin).host;
  } catch {
    return 'karwan.site';
  }
}

function buildMessage(opts: {
  domain: string;
  uri: string;
  address: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
}): string {
  return [
    `${opts.domain} wants you to sign in with your Ethereum account:`,
    opts.address,
    '',
    'Sign in to Karwan. This message proves you control this wallet. No transaction. No gas. No funds move.',
    '',
    `URI: ${opts.uri}`,
    'Version: 1',
    `Chain ID: ${opts.chainId}`,
    `Nonce: ${opts.nonce}`,
    `Issued At: ${opts.issuedAt}`,
    `Expiration Time: ${opts.expirationTime}`,
  ].join('\n');
}

export const siweRoutes = new Hono();

const nonceSchema = z.object({
  address: addressSchema,
  chainId: z.number().int().positive().optional(),
});

siweRoutes.post(
  '/nonce',
  rateLimit({ windowMs: 10 * 60 * 1000, max: 30, name: 'siwe-nonce' }),
  async (c) => {
    let body;
    try {
      body = nonceSchema.parse(await c.req.json());
    } catch (err) {
      return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
    }
    purgeStale();
    const address = getAddress(body.address);
    const origin = c.req.header('origin') ?? c.req.header('referer');
    const domain = originHost(origin);
    const uri = origin ?? `https://${domain}`;
    const nonce = randomBytes(16).toString('hex');
    const issuedAt = new Date().toISOString();
    const expirationTime = new Date(Date.now() + NONCE_TTL_MS).toISOString();
    let chainId = body.chainId;
    if (!chainId) {
      try {
        chainId = await publicClient.getChainId();
      } catch {
        chainId = 5042002;
      }
    }
    const message = buildMessage({
      domain,
      uri,
      address,
      chainId,
      nonce,
      issuedAt,
      expirationTime,
    });
    pending.set(address.toLowerCase(), {
      nonce,
      address: address.toLowerCase(),
      message,
      issuedAt: Date.now(),
      expiresAt: Date.now() + NONCE_TTL_MS,
    });
    return c.json({ nonce, message });
  },
);

const verifySchema = z.object({
  address: addressSchema,
  signature: z.string().min(2),
});

siweRoutes.post(
  '/verify',
  rateLimit({ windowMs: 10 * 60 * 1000, max: 30, name: 'siwe-verify' }),
  async (c) => {
    let body;
    try {
      body = verifySchema.parse(await c.req.json());
    } catch (err) {
      return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
    }
    const address = getAddress(body.address);
    const key = address.toLowerCase();
    const entry = pending.get(key);
    if (!entry) {
      return c.json({ error: 'no nonce pending for this address' }, 400);
    }
    if (entry.expiresAt < Date.now()) {
      pending.delete(key);
      return c.json({ error: 'nonce expired, request a fresh one' }, 400);
    }

    // publicClient.verifyMessage handles both EOAs (ecrecover) and smart
    // contract wallets (EIP-1271 isValidSignature call on the connected chain).
    // EOAs short-circuit before any RPC; 1271 reads code at the address on Arc.
    let ok = false;
    try {
      ok = await publicClient.verifyMessage({
        address,
        message: entry.message,
        signature: body.signature as `0x${string}`,
      });
    } catch (err) {
      logger.warn(
        { err: (err as Error).message, address: key },
        'siwe verifyMessage threw',
      );
      return c.json({ error: 'signature verification failed' }, 400);
    }
    if (!ok) {
      return c.json({ error: 'signature does not match address' }, 401);
    }

    pending.delete(key);
    setSessionCookie(c, {
      address: key,
      method: 'web3',
    });
    logger.info({ address: key }, 'web3 user signed in via SIWE');
    return c.json({
      user: { address: key, method: 'web3' as const },
    });
  },
);
