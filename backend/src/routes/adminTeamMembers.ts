import { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin } from '../middleware/adminAuth.js';
import {
  createInvite,
  listInvites,
  revokeInvite,
  listMembers,
  setMemberDisabled,
  INVITE_TTL_MS,
} from '../db/teamMembers.js';
import { revokeForMember } from '../db/oauth.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

/// Inviting people and taking access away.
///
/// Admin-gated, which means the admin token, which means you. A team member has
/// no route here: the whole point of the invite model is that the role is
/// decided by somebody who already has it.

export const adminTeamMemberRoutes = new Hono();
adminTeamMemberRoutes.use('*', requireAdmin);

function portalBase(): string {
  return config.OAUTH_ISSUER.replace(/\/$/, '');
}

/// GET /api/admin/team-members: everyone, and every outstanding invitation.
adminTeamMemberRoutes.get('/', async (c) => {
  const [members, invites] = await Promise.all([listMembers(), listInvites()]);
  return c.json({
    members,
    invites: invites.map((i) => ({
      id: i.id,
      email: i.email,
      name: i.name,
      role: i.role,
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
      redeemedAt: i.redeemedAt ?? null,
      // Never the token. It was shown once at creation and is a hash here.
      pending: !i.redeemedAt && i.expiresAt > Date.now(),
    })),
    inviteTtlHours: Math.round(INVITE_TTL_MS / 3_600_000),
  });
});

const inviteSchema = z.object({
  email: z.string().email().max(200),
  name: z.string().min(1).max(80),
  role: z.enum(['dev', 'marketing']),
});

/// POST /api/admin/team-members/invites: invite somebody.
///
/// The link comes back once and is not recoverable, same as a team key. The
/// role is set here and the person redeeming it cannot change it, which is the
/// entire reason invitations exist rather than open signup.
adminTeamMemberRoutes.post('/invites', async (c) => {
  let body;
  try {
    body = inviteSchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }

  try {
    const { invite, rawToken } = await createInvite(body);
    logger.info({ email: invite.email, role: invite.role }, 'team invite created');

    return c.json({
      invite: {
        id: invite.id,
        email: invite.email,
        name: invite.name,
        role: invite.role,
        expiresAt: invite.expiresAt,
      },
      link: `${portalBase()}/team/invite?token=${encodeURIComponent(rawToken)}`,
      warning: 'Send this link to them now. It is not stored and cannot be shown again.',
    });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 409);
  }
});

/// DELETE /api/admin/team-members/invites/:id: cancel an unredeemed invitation.
adminTeamMemberRoutes.delete('/invites/:id', async (c) => {
  const ok = await revokeInvite(c.req.param('id'));
  if (!ok) return c.json({ error: 'no such pending invitation' }, 404);
  return c.json({ ok: true });
});

const disableSchema = z.object({ disabled: z.boolean() });

/// PATCH /api/admin/team-members/:id: disable or re-enable somebody.
///
/// Disabling kills their live tokens on the spot rather than waiting for the
/// hour to run out. That is the difference between revocation and a promise of
/// revocation, and it is the reason this route exists rather than a note in a
/// runbook saying to wait.
adminTeamMemberRoutes.patch('/:id', async (c) => {
  let body;
  try {
    body = disableSchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }

  const view = await setMemberDisabled(c.req.param('id'), body.disabled);
  if (!view) return c.json({ error: 'unknown member' }, 404);

  let revoked = 0;
  if (body.disabled) revoked = await revokeForMember(view.id);

  logger.info({ member: view.email, disabled: body.disabled, revoked }, 'team member access changed');
  return c.json({
    member: view,
    revokedTokens: revoked,
    note: body.disabled
      ? `Access ended. ${revoked} live token(s) were revoked, so every tool they connected stops now.`
      : 'Access restored. They can sign in again and reconnect their tools.',
  });
});
