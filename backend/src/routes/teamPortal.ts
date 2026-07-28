import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Context } from 'hono';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  login as verifyPassword,
  checkInvite,
  redeemInvite,
  getMember,
  MIN_PASSWORD_LENGTH,
} from '../db/teamMembers.js';
import type { TeamRole } from '../db/teamKeys.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { page, escapeHtml } from '../ui/shell.js';

/// The team portal.
///
/// One page a member lands on, signs in, and learns how to connect whatever
/// they use. Most of the team is not technical, so the guide is per client with
/// copy-paste blocks rather than a paragraph explaining MCP.
///
/// Separate from the wallet session entirely: a different cookie, a different
/// audience, and nothing here can act on a deal. Somebody's Karwan account and
/// their team membership are two different things and conflating them would
/// mean a marketing hire needs a wallet.

export const teamPortalRoutes = new Hono();

const COOKIE = 'karwan_team';
const TTL_MS = 12 * 60 * 60 * 1000;

interface PortalSession {
  id: string;
  exp: number;
}

function secret(): string {
  return config.SESSION_SECRET ?? 'dev-only-unsigned';
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function setSession(c: Context, memberId: string) {
  const payload = Buffer.from(
    JSON.stringify({ id: memberId, exp: Date.now() + TTL_MS } satisfies PortalSession),
  ).toString('base64url');
  setCookie(c, COOKIE, `${payload}.${sign(payload)}`, {
    path: '/team',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: Math.floor(TTL_MS / 1000),
  });
}

function readSession(c: Context): string | null {
  const raw = getCookie(c, COOKIE);
  if (!raw) return null;

  const dot = raw.lastIndexOf('.');
  if (dot < 0) return null;
  const payload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);

  const expected = Buffer.from(sign(payload));
  const got = Buffer.from(signature);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as PortalSession;
    return parsed.exp > Date.now() ? parsed.id : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ pages

function loginPage(error?: string) {
  return page(
    'Team sign in',
    `<p class="eyebrow">[:KARWAN TEAM:]</p>
<h1>Sign in</h1>
<p>Connect your AI tools to the Karwan canon so they write from what we have actually shipped.</p>
${error ? `<p class="err">${escapeHtml(error)}</p>` : ''}
<form method="post" action="/team/login">
  <label><span class="l">Email</span>
    <input name="email" type="email" autocomplete="username" required autofocus></label>
  <label><span class="l">Password</span>
    <input name="password" type="password" autocomplete="current-password" required></label>
  <button class="wide" type="submit">Sign in</button>
</form>
<p class="foot">No account? An admin has to invite you. Ask for a link.</p>`,
    { center: true },
  );
}

function invitePage(token: string, name: string, role: TeamRole, error?: string) {
  return page(
    'Set your password',
    `<p class="eyebrow">[:KARWAN TEAM:]</p>
<h1>Welcome, ${escapeHtml(name)}</h1>
<p>Pick a password and your account is ready. You are joining as
<strong>${escapeHtml(role)}</strong>, which decides what the canon shows you.</p>
${error ? `<p class="err">${escapeHtml(error)}</p>` : ''}
<form method="post" action="/team/invite">
  <input type="hidden" name="token" value="${escapeHtml(token)}">
  <label><span class="l">Password (${MIN_PASSWORD_LENGTH} characters or more)</span>
    <input name="password" type="password" autocomplete="new-password"
      minlength="${MIN_PASSWORD_LENGTH}" required autofocus></label>
  <button class="wide" type="submit">Create my account</button>
</form>
<p class="foot">Use a long phrase you can remember. A password manager is better still.</p>`,
    { center: true },
  );
}

/// The connect guide.
///
/// Ordered by who is likely to be reading. Most of the team lives in the Claude
/// app or ChatGPT, and both take a URL and nothing else, which is the entire
/// reason the OAuth server exists.
function guide(name: string, role: TeamRole, mcpUrl: string) {
  return page(
    'Connect your tools',
    `<p class="eyebrow">[:KARWAN TEAM:]</p>
<h1>Connect your tools</h1>
<div class="who">
  <span>Signed in as <strong>${escapeHtml(name)}</strong></span>
  <span class="tag">${escapeHtml(role)}</span>
  <form method="post" action="/team/logout" style="margin-left:auto">
    <button class="quiet" type="submit">Sign out</button>
  </form>
</div>

<p>Point your AI tool at the address below. It will send you back here to sign
in, then it can read the Karwan canon: what we have shipped, what we have not,
how we write, and the brand rules. It answers from that instead of guessing,
which is the difference between copy that is right and copy that sounds right.</p>

<pre>${escapeHtml(mcpUrl)}</pre>

<div class="step">
  <h2>Claude app (desktop or web)</h2>
  <ol>
    <li>Settings, then Connectors.</li>
    <li>Add custom connector.</li>
    <li>Paste the address above. Leave the advanced fields empty.</li>
    <li>Click connect. Sign in with this same email and password.</li>
  </ol>
</div>

<div class="step">
  <h2>ChatGPT</h2>
  <ol>
    <li>Settings, then Connectors, then Create.</li>
    <li>Paste the address above and choose OAuth when asked how it authenticates.</li>
    <li>Connect, then sign in here when it redirects you.</li>
  </ol>
</div>

<div class="step">
  <h2>Claude Code</h2>
  <p>One command, then follow the browser prompt:</p>
  <pre>claude mcp add --transport http karwan ${escapeHtml(mcpUrl)}</pre>
</div>

<div class="step">
  <h2>Codex, Cursor, or anything else</h2>
  <p>Anything that speaks MCP over HTTP works. Give it this, and it will handle
  the sign-in itself:</p>
  <pre>{
  "mcpServers": {
    "karwan": {
      "type": "http",
      "url": "${escapeHtml(mcpUrl)}"
    }
  }
}</pre>
</div>

<h2>What to ask it</h2>
<p>Start with "read the Karwan brief" so it loads the canon before writing
anything. Then ask for the post, the page or the thread you need. Before
anything goes out, ask it to "review this draft against the Karwan voice" and
it will name what to fix.</p>

<p class="foot">Access is tied to this account. If you lose your laptop, tell an
admin and they will disable it, which cuts off every tool at once.</p>`,
  );
}

// ------------------------------------------------------------------ routes

function mcpUrl(): string {
  return config.OAUTH_RESOURCES.split(',')[0]?.trim() ?? 'https://mcp.karwan.site/mcp';
}

teamPortalRoutes.get('/', async (c) => {
  const id = readSession(c);
  if (!id) return loginPage();

  // Re-read the account on every page load rather than trusting the cookie: a
  // member disabled five minutes ago must not still see the guide.
  const member = await getMember(id);
  if (!member || member.disabledAt) {
    deleteCookie(c, COOKIE, { path: '/team' });
    return loginPage('That account is no longer active.');
  }

  return guide(member.name, member.role, mcpUrl());
});

teamPortalRoutes.post(
  '/login',
  rateLimit({ windowMs: 60_000, max: 12, name: 'team-portal-login' }),
  async (c) => {
    const form = await c.req.parseBody();
    const email = String(form.email ?? '');
    const result = await verifyPassword(email, String(form.password ?? ''));

    if (!result.ok || !result.member) {
      // One wording for every failure. Anything more specific turns this into
      // a way to find out who works here.
      const message =
        result.reason === 'locked'
          ? 'Too many attempts. Try again in a few minutes.'
          : 'That email and password do not match an active account.';
      logger.warn({ email, reason: result.reason }, 'team portal login refused');
      return loginPage(message);
    }

    setSession(c, result.member.id);
    return c.redirect('/team');
  },
);

teamPortalRoutes.post('/logout', (c) => {
  deleteCookie(c, COOKIE, { path: '/team' });
  return c.redirect('/team');
});

teamPortalRoutes.get('/invite', async (c) => {
  const token = c.req.query('token') ?? '';
  const check = await checkInvite(token);

  if (!check.valid || !check.invite) {
    const why =
      check.reason === 'used'
        ? 'That invitation has already been used. If that was not you, tell an admin.'
        : check.reason === 'expired'
          ? 'That invitation has expired. Ask an admin for a new one.'
          : 'That invitation link is not valid.';
    return page('Invitation', `<h1>Cannot use this link</h1><p>${escapeHtml(why)}</p>`, {
      status: 400,
      center: true,
    });
  }

  return invitePage(token, check.invite.name, check.invite.role);
});

teamPortalRoutes.post(
  '/invite',
  rateLimit({ windowMs: 60_000, max: 12, name: 'team-portal-invite' }),
  async (c) => {
    const form = await c.req.parseBody();
    const token = String(form.token ?? '');
    const password = String(form.password ?? '');

    const check = await checkInvite(token);
    if (!check.valid || !check.invite) {
      return page(
        'Invitation',
        '<h1>Cannot use this link</h1><p>That invitation is no longer valid. Ask an admin for a new one.</p>',
        { status: 400, center: true },
      );
    }

    const result = await redeemInvite(token, password);
    if (!result.ok) {
      return invitePage(token, check.invite.name, check.invite.role, result.reason);
    }

    logger.info(
      { member: result.member.email, role: result.member.role },
      'team member account created',
    );
    setSession(c, result.member.id);
    return c.redirect('/team');
  },
);
