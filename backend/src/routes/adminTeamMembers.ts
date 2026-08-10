import { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin } from '../middleware/adminAuth.js';
import {
  createInvite,
  reissueInvite,
  listInvites,
  revokeInvite,
  listMembers,
  setMemberDisabled,
  INVITE_TTL_MS,
} from '../db/teamMembers.js';
import { revokeForMember } from '../db/oauth.js';
import { config } from '../config.js';
import { sendTeamInviteEmail } from '../emails/teamInvite.js';
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
/// The role is set here and the person redeeming it cannot change it, which is
/// the entire reason invitations exist rather than open signup.
///
/// The link is emailed and also returned. Only its hash is stored, so it cannot
/// be read back later, but that is a storage decision rather than a policy: if
/// it goes missing, `/resend` mints a new one.
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
    return c.json(await inviteResponse(invite, rawToken));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 409);
  }
});

/// POST /api/admin/team-members/invites/:id/resend
///
/// Mints a fresh link for an invitation that already exists and emails it
/// again. The previous link stops working, which is the point: this is for
/// "they never got it" and "they lost it", and in both cases the old one
/// should not still be lying around.
adminTeamMemberRoutes.post('/invites/:id/resend', async (c) => {
  const result = await reissueInvite(c.req.param('id'));
  if (!result) return c.json({ error: 'no such pending invitation' }, 404);

  logger.info({ email: result.invite.email }, 'team invite reissued');
  return c.json(await inviteResponse(result.invite, result.rawToken));
});

/// One shape for both create and resend: email it, and hand the link back
/// anyway. The email is a convenience, not a dependency. If Resend is
/// unconfigured or rejects it, the admin still has a working link to pass on
/// by whatever means they like.
async function inviteResponse(
  invite: { id: string; email: string; name: string; role: 'dev' | 'marketing'; expiresAt: number },
  rawToken: string,
) {
  const link = `${portalBase()}/team/invite?token=${encodeURIComponent(rawToken)}`;
  const days = Math.max(1, Math.round((invite.expiresAt - Date.now()) / 86_400_000));

  const sent = await sendTeamInviteEmail({
    to: invite.email,
    name: invite.name,
    role: invite.role,
    inviteUrl: link,
    expiresLabel: `This link works for ${days} day${days === 1 ? '' : 's'}`,
  });

  return {
    invite: {
      id: invite.id,
      email: invite.email,
      name: invite.name,
      role: invite.role,
      expiresAt: invite.expiresAt,
    },
    link,
    emailed: sent.delivered,
    note: sent.delivered
      ? `Emailed to ${invite.email}. The link is here too if you would rather send it yourself.`
      : `Not emailed (${sent.reason ?? 'unknown'}). Send this link to them yourself.`,
  };
}

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
  let revokeWarning: string | null = null;
  if (body.disabled) {
    try {
      revoked = await revokeForMember(view.id);
    } catch (err) {
      revokeWarning = 'Access is disabled, but stored OAuth grants could not be marked revoked yet.';
      logger.error(
        { member: view.email, memberId: view.id, err: (err as Error).message },
        'team member disabled; OAuth grant cleanup failed',
      );
    }
  }

  logger.info({ member: view.email, disabled: body.disabled, revoked }, 'team member access changed');
  return c.json({
    member: view,
    revokedTokens: revoked,
    warning: revokeWarning,
    note: body.disabled
      ? `Access ended. ${revoked} live token(s) were revoked, so every tool they connected stops now.`
      : 'Access restored. They can sign in again and reconnect their tools.',
  });
});
