import { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin } from '../middleware/adminAuth.js';
import { issueTeamKey, listTeamKeys, revokeTeamKey } from '../db/teamKeys.js';
import { logger } from '../logger.js';

/// Issue and revoke access keys for the team canon.
///
/// Admin-gated, and deliberately built here rather than as a new service: there
/// is already an admin panel with auth, and a second thing to secure is a second
/// thing to get wrong.

export const adminTeamKeyRoutes = new Hono();
adminTeamKeyRoutes.use('*', requireAdmin);

const issueSchema = z.object({
  label: z.string().min(1).max(80),
  member: z.string().min(1).max(80),
  role: z.enum(['dev', 'marketing']),
});

/// GET /api/admin/team-keys: every key, active and revoked, newest first.
/// Never returns key material.
adminTeamKeyRoutes.get('/', async (c) => {
  return c.json({ keys: await listTeamKeys() });
});

/// POST /api/admin/team-keys: issue one.
///
/// `rawKey` is in this response and nowhere else, ever. It is not stored, not
/// logged, and cannot be recovered. Reissue is the only remedy for a lost key,
/// which is the point: a key we could show you twice is a key a database dump
/// hands to someone else.
adminTeamKeyRoutes.post('/', async (c) => {
  let body;
  try {
    body = issueSchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }

  const { key, rawKey } = await issueTeamKey(body);
  logger.info(
    { keyId: key.id, member: key.member, role: key.role, label: key.label },
    'team key issued',
  );
  return c.json({
    key: {
      id: key.id,
      label: key.label,
      member: key.member,
      role: key.role,
      createdAt: key.createdAt,
      lastUsedAt: null,
      revokedAt: null,
      active: true,
    },
    rawKey,
    warning: 'Copy this now. It is not stored and cannot be shown again.',
  });
});

/// DELETE /api/admin/team-keys/:id: revoke.
///
/// Takes effect at the backend immediately. A team MCP already running caches
/// its verification for up to 15 minutes, so a revoked key can keep working for
/// that long. Stated here and in the docs rather than left for someone to
/// discover during an incident.
adminTeamKeyRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const view = await revokeTeamKey(id);
  if (!view) return c.json({ error: 'unknown key' }, 404);
  logger.info({ keyId: id, member: view.member }, 'team key revoked');
  return c.json({ key: view, note: 'A running client may cache access for up to 15 minutes.' });
});
