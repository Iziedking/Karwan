import { Hono } from 'hono';
import { z } from 'zod';
import { randomBytes, createHash } from 'node:crypto';
import { config } from '../config.js';
import {
  getProfile,
  upsertProfile,
  findProfileByXHandle,
  findProfileByXUserId,
} from '../db/profiles.js';
import { logger } from '../logger.js';

export const xRoutes = new Hono();

const X_AUTH_URL = 'https://twitter.com/i/oauth2/authorize';
const X_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';
const X_ME_URL = 'https://api.twitter.com/2/users/me?user.fields=profile_image_url,username,id';

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');

interface PendingAuth {
  address: string;
  codeVerifier: string;
  /// Where to redirect the browser after a successful (or failed) callback.
  /// Defaults to `${FRONTEND_BASE_URL}/profile` when the start request didn't
  /// pin a specific destination.
  returnTo: string;
  /// State entries auto-expire so a forgotten start link can't be replayed
  /// later. 10 minutes is generous for the user-driven OAuth bounce.
  expiresAt: number;
}

const pending = new Map<string, PendingAuth>();

function purgeExpired() {
  const now = Date.now();
  for (const [k, v] of pending.entries()) {
    if (v.expiresAt < now) pending.delete(k);
  }
}

function configured(): boolean {
  return !!config.X_CLIENT_ID && !!config.X_CLIENT_SECRET && !!config.X_REDIRECT_URI;
}

function frontendBase(): string {
  return (config.FRONTEND_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

// PKCE: code_verifier is a high-entropy random string; code_challenge is its
// SHA-256 hash, base64url-encoded. We send the challenge in the auth request
// and the verifier in the token exchange.
function generatePkce() {
  const codeVerifier = randomBytes(48).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

const startSchema = z.object({
  address: addrSchema,
  returnTo: z.string().url().optional(),
});

/// Kicks off the X OAuth flow. Returns the URL the browser should bounce to.
xRoutes.post('/oauth/start', async (c) => {
  if (!configured()) {
    return c.json({ error: 'x oauth not configured' }, 503);
  }
  let body;
  try {
    body = startSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  purgeExpired();
  const state = randomBytes(24).toString('base64url');
  const { codeVerifier, codeChallenge } = generatePkce();
  pending.set(state, {
    address: body.address.toLowerCase(),
    codeVerifier,
    returnTo: body.returnTo ?? `${frontendBase()}/profile`,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.X_CLIENT_ID!,
    redirect_uri: config.X_REDIRECT_URI!,
    scope: 'tweet.read users.read offline.access',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return c.json({ url: `${X_AUTH_URL}?${params.toString()}` });
});

interface XTokenResponse {
  token_type: string;
  expires_in: number;
  access_token: string;
  scope?: string;
  refresh_token?: string;
}

interface XUserResponse {
  data?: {
    id: string;
    name?: string;
    username: string;
    profile_image_url?: string;
  };
}

/// Callback the X dashboard redirects to with `?code=...&state=...`. Resolves
/// the code into an access token, fetches the user, persists handle + profile
/// image URL on the address that started the flow, then redirects the browser
/// back to the originating page on the frontend.
xRoutes.get('/oauth/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const fail = (reason: string) => {
    const url = `${frontendBase()}/profile?x=error&reason=${encodeURIComponent(reason)}`;
    return c.redirect(url);
  };
  if (!code || !state) return fail('missing code or state');
  if (!configured()) return fail('not configured');

  const entry = pending.get(state);
  pending.delete(state);
  if (!entry || entry.expiresAt < Date.now()) return fail('state expired');

  try {
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: config.X_CLIENT_ID!,
      redirect_uri: config.X_REDIRECT_URI!,
      code_verifier: entry.codeVerifier,
    });
    const basic = Buffer.from(
      `${config.X_CLIENT_ID}:${config.X_CLIENT_SECRET}`,
    ).toString('base64');
    const tokenRes = await fetch(X_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
      },
      body: tokenBody,
    });
    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      logger.warn({ status: tokenRes.status, detail }, 'x token exchange failed');
      return fail('token exchange failed');
    }
    const token = (await tokenRes.json()) as XTokenResponse;

    const meRes = await fetch(X_ME_URL, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!meRes.ok) {
      const detail = await meRes.text();
      logger.warn({ status: meRes.status, detail }, 'x users/me failed');
      return fail('user fetch failed');
    }
    const me = (await meRes.json()) as XUserResponse;
    if (!me.data) return fail('empty user response');

    // X returns a `_normal` 48px avatar by default; bump to `_400x400` so the
    // profile pill renders crisp on retina. The URL pattern is stable.
    const rawImage = me.data.profile_image_url;
    const profileImage = rawImage?.replace('_normal', '_400x400');

    // One X account binds to one wallet. Block if this X user id (stable across
    // renames) or handle already belongs to a different wallet.
    const xOwner =
      (await findProfileByXUserId(me.data.id)) ?? (await findProfileByXHandle(me.data.username));
    if (xOwner && xOwner.address.toLowerCase() !== entry.address.toLowerCase()) {
      logger.warn(
        { address: entry.address, handle: me.data.username, owner: xOwner.address },
        'x account already linked to another wallet',
      );
      return c.redirect(`${entry.returnTo}?x=taken&handle=${me.data.username}`);
    }

    const existing = await getProfile(entry.address);
    if (!existing) {
      // No profile yet — store a minimal record so the X binding survives a
      // later /profile save. The user can still complete onboarding normally.
      await upsertProfile({
        address: entry.address,
        role: 'buyer',
        displayName: me.data.name ?? me.data.username,
        xHandle: me.data.username,
        xUserId: me.data.id,
        xProfileImageUrl: profileImage,
      });
    } else {
      await upsertProfile({
        address: existing.address,
        role: existing.role,
        displayName: existing.displayName,
        seller: existing.seller,
        buyer: existing.buyer,
        xHandle: me.data.username,
        xUserId: me.data.id,
        xProfileImageUrl: profileImage,
      });
    }

    logger.info(
      { address: entry.address, handle: me.data.username },
      'x account bound via oauth',
    );
    return c.redirect(`${entry.returnTo}?x=ok&handle=${me.data.username}`);
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'x oauth callback error');
    return fail('callback error');
  }
});

/// Reports whether the backend is wired for X OAuth, so the frontend can fall
/// back to manual handle entry when the env is unset.
xRoutes.get('/status', (c) => {
  return c.json({ configured: configured() });
});
