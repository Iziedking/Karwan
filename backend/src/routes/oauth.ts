import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  registerClient,
  getClient,
  clientSecretMatches,
  redirectUriAllowed,
  issueCode,
  redeemCode,
  issueToken,
  redeemRefresh,
  introspect,
  canonicalResource,
  ACCESS_TTL_MS,
} from '../db/oauth.js';
import { login as verifyPassword } from '../db/teamMembers.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { page as shellPage, escapeHtml } from '../ui/shell.js';

/// The OAuth 2.1 authorization server.
///
/// It exists because a static bearer key cannot reach the clients the team
/// actually uses: the Claude app offers a URL and an optional OAuth client id,
/// with no field for a header, and ChatGPT cannot present a custom API key at
/// all. Both speak OAuth, so we speak OAuth.
///
/// The rule that shapes every handler below: NEVER redirect to a URI that has
/// not been proven to belong to a registered client. An error rendered on our
/// own page is a bad afternoon. An error redirected to an attacker's URI hands
/// them the thing they were fishing for.

export const oauthRoutes = new Hono();

function issuer(): string {
  return config.OAUTH_ISSUER.replace(/\/$/, '');
}

/// The audiences a token may be minted for. A client asking for anything else
/// is refused rather than accommodated.
function allowedResources(): string[] {
  return config.OAUTH_RESOURCES.split(',')
    .map((r) => canonicalResource(r.trim()))
    .filter(Boolean);
}

/// Signs the authorization parameters into the login form.
///
/// Two jobs. It stops a forged POST from starting a flow with parameters the
/// user never saw, and it means the server holds no per-request state between
/// rendering the form and receiving it. The secret is the one already used for
/// session cookies.
function signParams(payload: string): string {
  const secret = config.SESSION_SECRET ?? 'dev-only-unsigned';
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function paramsValid(payload: string, signature: string): boolean {
  const expected = Buffer.from(signParams(payload));
  const got = Buffer.from(signature);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

// ------------------------------------------------------------- metadata

/// RFC 8414. Mounted at the issuer root by index.ts, not under /oauth: clients
/// construct this path from the issuer and will not find it anywhere else.
export const oauthMetadataRoutes = new Hono();

oauthMetadataRoutes.get('/oauth-authorization-server', (c) =>
  c.json({
    issuer: issuer(),
    authorization_endpoint: `${issuer()}/oauth/authorize`,
    token_endpoint: `${issuer()}/oauth/token`,
    registration_endpoint: `${issuer()}/oauth/register`,
    scopes_supported: ['mcp'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    // S256 only. `plain` is forbidden in OAuth 2.1 and advertising it would
    // invite a client to use it.
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    // RFC 9207. Clients validate the issuer on the authorization response.
    authorization_response_iss_parameter_supported: true,
  }),
);

// ------------------------------------------------------------- registration

const registerSchema = z.object({
  client_name: z.string().min(1).max(120).optional(),
  redirect_uris: z.array(z.string().url()).min(1).max(10),
  token_endpoint_auth_method: z.string().optional(),
});

/// RFC 7591. Unauthenticated by necessity: Claude and ChatGPT register
/// themselves before any human is involved. That is safe because a client on
/// its own grants nothing. Somebody still has to log in and approve, and the
/// redirect allowlist is fixed at this moment and never widened later.
oauthRoutes.post(
  '/register',
  rateLimit({ windowMs: 60_000, max: 10, name: 'oauth-register' }),
  async (c) => {
    let body;
    try {
      body = registerSchema.parse(await c.req.json());
    } catch (e) {
      return c.json({ error: 'invalid_client_metadata', error_description: (e as Error).message }, 400);
    }

    try {
      const { client, clientSecret } = await registerClient({
        clientName: body.client_name ?? 'Unnamed client',
        redirectUris: body.redirect_uris,
        confidential: body.token_endpoint_auth_method === 'client_secret_post',
        registeredFrom: c.req.header('x-real-ip') ?? undefined,
      });

      logger.info(
        { clientId: client.clientId, name: client.clientName, redirects: client.redirectUris.length },
        'oauth client registered',
      );

      return c.json(
        {
          client_id: client.clientId,
          ...(clientSecret ? { client_secret: clientSecret } : {}),
          client_name: client.clientName,
          redirect_uris: client.redirectUris,
          token_endpoint_auth_method: clientSecret ? 'client_secret_post' : 'none',
          client_id_issued_at: Math.floor(client.createdAt / 1000),
        },
        201,
      );
    } catch (e) {
      return c.json({ error: 'invalid_redirect_uri', error_description: (e as Error).message }, 400);
    }
  },
);

// ------------------------------------------------------------- authorize

interface AuthRequest {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  resource: string;
  scope: string;
}

function encodeRequest(r: AuthRequest): string {
  return Buffer.from(JSON.stringify(r)).toString('base64url');
}

function decodeRequest(encoded: string): AuthRequest | null {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AuthRequest;
  } catch {
    return null;
  }
}

/// Send the user back to the client with an error, per RFC 6749. Only ever
/// called once the redirect_uri has been proven to belong to the client.
function redirectError(redirectUri: string, state: string, error: string, description: string) {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', description);
  url.searchParams.set('iss', issuer());
  if (state) url.searchParams.set('state', state);
  return url.toString();
}

/// What a role can actually read, in the words of the thing being read rather
/// than the names of the packages. Shown on the granted page so consent is
/// informed: a person approving an app should not have to already know what
/// "dev" means here.
const ROLE_READS: Record<string, string[]> = {
  dev: [
    'Product facts and how features actually work',
    'Contract and integration detail, with the checks behind each claim',
    'Internal constraints and the decisions log',
    'What is shipped versus what is still roadmap',
  ],
  marketing: [
    'Product facts and the claims that are safe to make publicly',
    'Brand voice, tone and the writing rules',
    'What is shipped versus what is still roadmap',
  ],
};

function roleReads(role: string): string[] {
  return ROLE_READS[role] ?? ['Product facts marked public'];
}

/// What crosses the approve POST: the request parameters plus WHO was
/// authenticated, so the approve endpoint never trusts a form field for identity.
/// Signed with the same key as the request blob.
interface Grant extends AuthRequest {
  memberId: string;
  email: string;
  role: string;
}

function encodeGrant(g: Grant): string {
  return Buffer.from(JSON.stringify(g)).toString('base64url');
}

function decodeGrant(encoded: string): Grant | null {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Grant;
  } catch {
    return null;
  }
}

/// Signed in, not yet approved.
///
/// The only Karwan surface in this flow a person reads rather than passes
/// through, so it is where consent actually happens. It names the client, the
/// identity, the role, and what that role can read. Before this, signing in was
/// the whole of consent and none of that was ever shown.
function consentPage(grant: Grant, clientName: string) {
  const encoded = encodeGrant(grant);
  const sig = signParams(encoded);
  const reads = roleReads(grant.role)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join('');
  return renderPage(
    'Approve access',
    `<p class="eyebrow">Karwan</p>
<h1>Allow ${escapeHtml(clientName)}?</h1>
<p>It will read the canon as ${escapeHtml(grant.email)}.</p>
<span class="l">Role</span>
<p style="margin:0 0 16px;color:#F4F4F1"><strong>${escapeHtml(grant.role)}</strong></p>
<span class="l">What it can read</span>
<ul>${reads}</ul>
<p class="foot">It cannot write anything and cannot act on your account.</p>
<form method="post" action="/oauth/authorize/approve">
  <input type="hidden" name="g" value="${escapeHtml(encoded)}">
  <input type="hidden" name="s" value="${escapeHtml(sig)}">
  <button type="submit">Allow access</button>
</form>`,
  );
}

/// Centred card, the shape every page in this flow wants.
function renderPage(title: string, body: string, status = 200) {
  return shellPage(title, body, { status, center: true });
}

function loginPage(req: AuthRequest, clientName: string, error?: string) {
  const encoded = encodeRequest(req);
  const sig = signParams(encoded);
  return renderPage(
    'Sign in',
    `<h1>Connect to Karwan</h1>
<p>${escapeHtml(clientName)} is asking to read the Karwan canon as you.</p>
${error ? `<p class="err">${escapeHtml(error)}</p>` : ''}
<form method="post" action="/oauth/authorize">
  <input type="hidden" name="r" value="${escapeHtml(encoded)}">
  <input type="hidden" name="s" value="${escapeHtml(sig)}">
  <label><span class="l">Email</span>
    <input name="email" type="email" autocomplete="username" required autofocus></label>
  <label><span class="l">Password</span>
    <input name="password" type="password" autocomplete="current-password" required></label>
  <button type="submit">Sign in and approve</button>
</form>
<p class="foot">Your role decides what the canon returns. Ask an admin if you do not have an account.</p>`,
  );
}

const authQuerySchema = z.object({
  response_type: z.literal('code'),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal('S256'),
  resource: z.string().min(1),
  state: z.string().max(512).optional(),
  scope: z.string().max(200).optional(),
});

oauthRoutes.get('/authorize', async (c) => {
  const parsed = authQuerySchema.safeParse(c.req.query());

  // Before anything else: is the client real and is the redirect one of its
  // own? Until both hold, an error must be rendered here rather than
  // redirected, because a redirect to an unverified URI is the attack.
  const clientId = c.req.query('client_id') ?? '';
  const redirectUri = c.req.query('redirect_uri') ?? '';
  const client = clientId ? await getClient(clientId) : null;

  if (!client) {
    return renderPage('Unknown application', '<h1>Unknown application</h1><p>This client is not registered with Karwan.</p>', 400);
  }
  if (!redirectUri || !redirectUriAllowed(client, redirectUri)) {
    return renderPage(
      'Bad redirect',
      '<h1>Bad redirect</h1><p>That redirect address is not one this application registered. Nothing was sent to it.</p>',
      400,
    );
  }

  const state = c.req.query('state') ?? '';

  if (!parsed.success) {
    const detail = parsed.error.issues[0];
    const description =
      detail?.path.join('.') === 'code_challenge_method'
        ? 'this server requires PKCE with S256'
        : `${detail?.path.join('.') ?? 'request'}: ${detail?.message ?? 'invalid'}`;
    return c.redirect(redirectError(redirectUri, state, 'invalid_request', description));
  }

  const resource = canonicalResource(parsed.data.resource);
  if (!allowedResources().includes(resource)) {
    return c.redirect(
      redirectError(redirectUri, state, 'invalid_target', 'this authorization server does not issue tokens for that resource'),
    );
  }

  return loginPage(
    {
      clientId,
      redirectUri,
      state,
      codeChallenge: parsed.data.code_challenge,
      resource,
      scope: parsed.data.scope ?? 'mcp',
    },
    client.clientName,
  );
});

oauthRoutes.post(
  '/authorize',
  rateLimit({ windowMs: 60_000, max: 20, name: 'oauth-authorize' }),
  async (c) => {
    const form = await c.req.parseBody();
    const encoded = String(form.r ?? '');
    const signature = String(form.s ?? '');

    // The parameters must be the ones this server put in the form. Without
    // this, a forged POST could start a flow the user never saw.
    if (!encoded || !signature || !paramsValid(encoded, signature)) {
      return renderPage('Expired', '<h1>That form expired</h1><p>Start the connection again from your app.</p>', 400);
    }

    const req = decodeRequest(encoded);
    if (!req) {
      return renderPage('Expired', '<h1>That form expired</h1><p>Start the connection again from your app.</p>', 400);
    }

    // Re-check rather than trust the signed blob: a client could have been
    // deleted or had its redirects changed since the form was rendered.
    const client = await getClient(req.clientId);
    if (!client || !redirectUriAllowed(client, req.redirectUri)) {
      return renderPage('Unknown application', '<h1>Unknown application</h1><p>This client is no longer registered.</p>', 400);
    }

    const email = String(form.email ?? '');
    const password = String(form.password ?? '');
    const result = await verifyPassword(email, password);

    if (!result.ok || !result.member) {
      // One message for every failure. Which of "no such account", "wrong
      // password" and "disabled" it was is not the caller's business.
      const message =
        result.reason === 'locked'
          ? 'Too many attempts. Try again in a few minutes.'
          : 'That email and password do not match an active account.';
      logger.warn({ email, reason: result.reason }, 'oauth login refused');
      return loginPage(req, client.clientName, message);
    }

    logger.info(
      { member: result.member.email, role: result.member.role, client: client.clientName },
      'oauth sign-in ok, awaiting approval',
    );

    // No code yet. Signing in is not consent, the next screen is.
    return consentPage(
      {
        clientId: req.clientId,
        redirectUri: req.redirectUri,
        state: req.state,
        codeChallenge: req.codeChallenge,
        resource: req.resource,
        scope: req.scope,
        memberId: result.member.id,
        email: result.member.email,
        role: result.member.role,
      },
      client.clientName,
    );
  },
);

/// The approval. Mints the code and redirects, so a client still sees the same
/// plain 302 it saw before consent existed.
///
/// This is a separate POST rather than a branded page in place of the redirect.
/// The first attempt at this returned HTML from POST /authorize, and the tests
/// caught it: a 200 where a 302 belongs breaks any client that does not run
/// JavaScript, which is most of the ones this server exists for.
oauthRoutes.post(
  '/authorize/approve',
  rateLimit({ windowMs: 60_000, max: 20, name: 'oauth-approve' }),
  async (c) => {
    const form = await c.req.parseBody();
    const encoded = String(form.g ?? '');
    const signature = String(form.s ?? '');

    if (!encoded || !signature || !paramsValid(encoded, signature)) {
      return renderPage('Expired', '<h1>That form expired</h1><p>Start the connection again from your app.</p>', 400);
    }
    const grant = decodeGrant(encoded);
    if (!grant) {
      return renderPage('Expired', '<h1>That form expired</h1><p>Start the connection again from your app.</p>', 400);
    }

    // Re-checked rather than trusted: the client could have been deleted, or had
    // its redirects changed, between sign-in and this click.
    const client = await getClient(grant.clientId);
    if (!client || !redirectUriAllowed(client, grant.redirectUri)) {
      return renderPage('Unknown application', '<h1>Unknown application</h1><p>This client is no longer registered.</p>', 400);
    }

    const code = await issueCode({
      clientId: grant.clientId,
      memberId: grant.memberId,
      role: grant.role as never,
      redirectUri: grant.redirectUri,
      codeChallenge: grant.codeChallenge,
      resource: grant.resource,
      scope: grant.scope,
    });

    logger.info(
      { member: grant.email, role: grant.role, client: client.clientName },
      'oauth authorization granted',
    );

    const url = new URL(grant.redirectUri);
    url.searchParams.set('code', code);
    // RFC 9207: clients validate this against the issuer they discovered.
    url.searchParams.set('iss', issuer());
    if (grant.state) url.searchParams.set('state', grant.state);
    return c.redirect(url.toString());
  },
);

// ------------------------------------------------------------- token

oauthRoutes.post(
  '/token',
  rateLimit({ windowMs: 60_000, max: 60, name: 'oauth-token' }),
  async (c) => {
    const form = await c.req.parseBody();
    const grantType = String(form.grant_type ?? '');
    const clientId = String(form.client_id ?? '');
    const clientSecret = form.client_secret ? String(form.client_secret) : undefined;

    const client = clientId ? await getClient(clientId) : null;
    if (!client) return c.json({ error: 'invalid_client' }, 401);
    if (!clientSecretMatches(client, clientSecret)) return c.json({ error: 'invalid_client' }, 401);

    if (grantType === 'authorization_code') {
      const redeemed = await redeemCode({
        code: String(form.code ?? ''),
        clientId,
        redirectUri: String(form.redirect_uri ?? ''),
        codeVerifier: String(form.code_verifier ?? ''),
      });
      if (!redeemed.ok || !redeemed.grant) {
        return c.json({ error: 'invalid_grant', error_description: redeemed.reason }, 400);
      }

      // RFC 8707: the resource on the token request must match the one the code
      // was issued for. A client cannot widen its audience at exchange time.
      const asked = form.resource ? canonicalResource(String(form.resource)) : redeemed.grant.resource;
      if (asked !== redeemed.grant.resource) {
        return c.json(
          { error: 'invalid_target', error_description: 'resource does not match the authorization request' },
          400,
        );
      }

      const token = await issueToken({
        clientId,
        memberId: redeemed.grant.memberId,
        role: redeemed.grant.role,
        resource: redeemed.grant.resource,
        scope: redeemed.grant.scope,
        parentId: redeemed.grant.id,
      });

      return c.json({
        access_token: token.accessToken,
        token_type: 'Bearer',
        expires_in: token.expiresIn,
        refresh_token: token.refreshToken,
        scope: redeemed.grant.scope,
      });
    }

    if (grantType === 'refresh_token') {
      const refreshed = await redeemRefresh({
        refreshToken: String(form.refresh_token ?? ''),
        clientId,
      });
      if (!refreshed.ok || !refreshed.grant) {
        return c.json({ error: 'invalid_grant', error_description: refreshed.reason }, 400);
      }

      const token = await issueToken({
        clientId,
        memberId: refreshed.grant.memberId,
        role: refreshed.grant.role,
        resource: refreshed.grant.resource,
        scope: refreshed.grant.scope,
      });

      return c.json({
        access_token: token.accessToken,
        token_type: 'Bearer',
        expires_in: token.expiresIn,
        refresh_token: token.refreshToken,
        scope: refreshed.grant.scope,
      });
    }

    return c.json({ error: 'unsupported_grant_type' }, 400);
  },
);

// ------------------------------------------------------------- introspection

const introspectSchema = z.object({ token: z.string().min(1), resource: z.string().min(1) });

/// For the MCP resource server, over the internal network.
///
/// Not public: introspection tells you whether a token is live and who it
/// belongs to, which is a free oracle for anyone holding a stolen one. Unset
/// credentials mean it refuses everything, so a misconfigured deploy fails
/// closed rather than open.
oauthRoutes.post(
  '/introspect',
  rateLimit({ windowMs: 60_000, max: 600, name: 'oauth-introspect' }),
  async (c) => {
    const expected = config.OAUTH_INTROSPECT_TOKEN;
    if (!expected) return c.json({ error: 'introspection is not configured' }, 503);

    const presented = (c.req.header('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const a = Buffer.from(presented);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    let body;
    try {
      body = introspectSchema.parse(await c.req.json());
    } catch {
      return c.json({ active: false }, 200);
    }

    const result = await introspect(body.token, body.resource);
    if (!result.active) return c.json({ active: false });

    return c.json({
      active: true,
      sub: result.memberId,
      role: result.role,
      client_id: result.clientId,
      scope: result.scope,
      aud: result.resource,
      exp: Math.floor((result.expiresAt ?? Date.now() + ACCESS_TTL_MS) / 1000),
    });
  },
);
