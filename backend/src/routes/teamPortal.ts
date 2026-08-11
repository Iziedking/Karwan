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
  getMemberByEmail,
  createPasswordReset,
  checkPasswordReset,
  consumePasswordReset,
  MIN_PASSWORD_LENGTH,
} from '../db/teamMembers.js';
import { sendTeamPasswordResetEmail } from '../emails/teamPasswordReset.js';
import type { TeamRole } from '../db/teamKeys.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { page, escapeHtml, copyable } from '../ui/shell.js';

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
<p class="foot"><a href="/team/forgot">Forgot your password?</a></p>
<p class="foot">No account? An admin has to invite you. Ask for a link.</p>`,
    { center: true },
  );
}

function forgotPage(sent?: boolean) {
  if (sent) {
    // Says the same thing whether or not that address has an account. Confirming
    // it does would turn this form into a way to find out who works here, which
    // is the exact thing the login page's single error message already avoids.
    return page(
      'Reset your password',
      `<p class="eyebrow">[:KARWAN TEAM:]</p>
<h1>Check your email</h1>
<p>If that address belongs to a team account, a reset link is on its way. It
works for one hour and can only be used once.</p>
<p class="foot"><a href="/team">Back to sign in</a></p>`,
      { center: true },
    );
  }

  return page(
    'Reset your password',
    `<p class="eyebrow">[:KARWAN TEAM:]</p>
<h1>Reset your password</h1>
<p>Tell us the address you sign in with and we will email you a link to set a
new password.</p>
<form method="post" action="/team/forgot">
  <label><span class="l">Email</span>
    <input name="email" type="email" autocomplete="username" required autofocus></label>
  <button class="wide" type="submit">Email me a link</button>
</form>
<p class="foot"><a href="/team">Back to sign in</a></p>`,
    { center: true },
  );
}

function resetPage(token: string, name: string, error?: string) {
  return page(
    'Choose a new password',
    `<p class="eyebrow">[:KARWAN TEAM:]</p>
<h1>New password, ${escapeHtml(name)}</h1>
<p>Pick something you can remember. This link stops working once you use it.</p>
${error ? `<p class="err">${escapeHtml(error)}</p>` : ''}
<form method="post" action="/team/reset">
  <input type="hidden" name="token" value="${escapeHtml(token)}">
  <label><span class="l">Password (${MIN_PASSWORD_LENGTH} characters or more)</span>
    <input name="password" type="password" autocomplete="new-password"
      minlength="${MIN_PASSWORD_LENGTH}" required autofocus></label>
  <button class="wide" type="submit">Set my password</button>
</form>
<p class="foot">Use a long phrase you can remember. A password manager is better still.</p>`,
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

${copyable(mcpUrl)}

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
  ${copyable(`claude mcp add --transport http karwan ${mcpUrl}`)}
</div>

<div class="step">
  <h2>Codex, Cursor, or anything else</h2>
  <p>Anything that speaks MCP over HTTP works. Give it this, and it will handle
  the sign-in itself:</p>
  ${copyable(JSON.stringify({ mcpServers: { karwan: { type: 'http', url: mcpUrl } } }, null, 2))}
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

/// The origin the portal is served from, so an emailed link points back here.
/// Same source the admin invite route uses, deliberately: two ways of building
/// the same URL is how one of them ends up pointing at the wrong host.
function portalBase(): string {
  return config.OAUTH_ISSUER.replace(/\/$/, '');
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

teamPortalRoutes.get('/forgot', () => forgotPage());

/// Ask for a reset link.
///
/// Answers identically in every case: address unknown, account disabled, email
/// provider down. The response is about what the requester is allowed to learn,
/// not about what happened, and what they are allowed to learn is nothing.
///
/// Rate limited harder than login. A login attempt costs a scrypt hash; this
/// sends mail to a third party, so an unthrottled form is a way to use Karwan's
/// sending reputation to spam somebody.
teamPortalRoutes.post(
  '/forgot',
  rateLimit({ windowMs: 15 * 60_000, max: 5, name: 'team-portal-forgot' }),
  async (c) => {
    const form = await c.req.parseBody();
    const email = String(form.email ?? '').trim().toLowerCase();

    const member = email ? await getMemberByEmail(email) : null;
    if (member && !member.disabledAt) {
      const reset = await createPasswordReset(member.id);
      if (reset) {
        const link = `${portalBase()}/team/reset?token=${encodeURIComponent(reset.rawToken)}`;
        const sent = await sendTeamPasswordResetEmail({
          to: member.email,
          name: member.name,
          resetUrl: link,
          expiresLabel: 'This link works for one hour',
        });
        logger.info(
          { member: member.email, delivered: sent.delivered },
          'team password reset requested',
        );
      }
    } else {
      // Logged so a real person asking "I never got it" can be answered, without
      // the page itself giving anything away.
      logger.info({ email }, 'team password reset requested for unknown or disabled account');
    }

    return forgotPage(true);
  },
);

teamPortalRoutes.get('/reset', async (c) => {
  const token = c.req.query('token') ?? '';
  const check = await checkPasswordReset(token);

  if (!check.valid || !check.member) {
    const why =
      check.reason === 'disabled'
        ? 'That account is no longer active. Talk to an admin.'
        : 'That reset link has expired or has already been used. Ask for a new one.';
    return page(
      'Reset your password',
      `<h1>Cannot use this link</h1><p>${escapeHtml(why)}</p>
<p class="foot"><a href="/team/forgot">Send me another</a></p>`,
      { status: 400, center: true },
    );
  }

  return resetPage(token, check.member.name);
});

teamPortalRoutes.post(
  '/reset',
  rateLimit({ windowMs: 60_000, max: 12, name: 'team-portal-reset' }),
  async (c) => {
    const form = await c.req.parseBody();
    const token = String(form.token ?? '');
    const password = String(form.password ?? '');

    const check = await checkPasswordReset(token);
    if (!check.valid || !check.member) {
      return page(
        'Reset your password',
        `<h1>Cannot use this link</h1><p>That reset link is no longer valid.</p>
<p class="foot"><a href="/team/forgot">Send me another</a></p>`,
        { status: 400, center: true },
      );
    }

    const result = await consumePasswordReset(token, password);
    if (!result.ok) {
      if (result.reason === 'weak') {
        return resetPage(
          token,
          check.member.name,
          `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
        );
      }
      return page(
        'Reset your password',
        `<h1>Cannot use this link</h1><p>That reset link is no longer valid.</p>
<p class="foot"><a href="/team/forgot">Send me another</a></p>`,
        { status: 400, center: true },
      );
    }

    logger.info({ member: result.member.email }, 'team password reset completed');
    // Straight in. Making somebody who just proved control of the mailbox type
    // the password they set four seconds ago is friction with nothing behind it.
    setSession(c, result.member.id);
    return c.redirect('/team');
  },
);

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
