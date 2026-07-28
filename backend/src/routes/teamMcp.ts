import { Hono } from 'hono';
import { z } from 'zod';
import { rateLimit } from '../middleware/rateLimit.js';
import { verifyTeamKey } from '../db/teamKeys.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

/// Key check for the team MCP.
///
/// Unauthenticated by necessity: this is what a client calls to find out whether
/// it is authenticated. That makes it the one endpoint an attacker can reach
/// with no credential, so it is the one that has to be careful.
///
/// Two costs to defend. Guessing a secret is not really one of them (32 random
/// bytes), but hashing is: scrypt is deliberately slow, and an endpoint that
/// runs it per request is an endpoint that burns the server's CPU for free. The
/// store already returns before hashing for a malformed or unknown key, so the
/// expensive path needs a real key id. The limit below covers the rest.

export const teamMcpRoutes = new Hono();

/// 20 per minute per IP. A real client verifies at startup and again every 15
/// minutes; 20 is generous for that and thin for anything else.
const verifyLimit = rateLimit({ windowMs: 60_000, max: 20, name: 'team-mcp-verify' });

const verifySchema = z.object({ key: z.string().min(1).max(200) });

/// POST /api/team-mcp/verify
///
/// The key travels in the body, not the URL: query strings land in access logs,
/// proxy logs and browser history, and a credential that ends up in a log is a
/// credential that has leaked.
teamMcpRoutes.post('/verify', verifyLimit, async (c) => {
  let body;
  try {
    body = verifySchema.parse(await c.req.json());
  } catch {
    // Deliberately shaped like a failed verification rather than a parse error.
    // Nothing here should help someone map the endpoint.
    return c.json({ valid: false, reason: 'malformed' }, 400);
  }

  const result = await verifyTeamKey(body.key);

  if (!result.valid) {
    // Log the id when we have one, never the key. A burst of 'revoked' on one id
    // is someone using a key that was taken off them, which is worth seeing.
    logger.warn({ reason: result.reason, keyId: result.keyId }, 'team key verify rejected');
    return c.json({ valid: false, reason: result.reason }, 401);
  }

  return c.json({
    valid: true,
    role: result.role,
    member: result.member,
    canonVersion: config.CANON_VERSION,
  });
});
