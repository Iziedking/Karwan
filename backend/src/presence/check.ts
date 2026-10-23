import type { Context } from 'hono';
import { readSession } from '../auth/session.js';
import type { PresenceAction } from './action.js';
import { CONFIRM_HEADER, type PresenceService } from './service.js';

/// For a route that starts one of the confirmed actions: null lets it go ahead;
/// otherwise the response to send, a 428 the website answers with the
/// confirmation sheet and a chat answers with its one-time link.
export function createRequirePresence(service: PresenceService) {
  return async function requirePresence(c: Context, action: PresenceAction): Promise<Response | null> {
    const session = readSession(c);
    if (!session) return c.json({ error: 'not authenticated' }, 401);
    if (session.address.toLowerCase() !== action.wallet) return c.json({ error: 'You can only confirm for your own account.', code: 'forbidden' }, 403);
    const result = await service.confirmPresence({ account: session, action, proof: c.req.header(CONFIRM_HEADER) ?? null });
    if (result.ok) return null;
    c.header('Cache-Control', 'no-store');
    return c.json(result.required, 428);
  };
}
