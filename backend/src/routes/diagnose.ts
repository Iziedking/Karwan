import { Hono } from 'hono';
import { z } from 'zod';
import { sessionAddress } from '../auth/session.js';
import { getDeal } from '../db/deals.js';
import { diagnoseUserError, supervisorEnabled } from '../llm/supervisor.js';

/// User-facing failure diagnosis. When a user's own action reverts with a
/// cryptic error, the frontend posts it here and gets back plain-language
/// guidance ({summary, suggestedFix}) it can show beside the raw error.
///
/// PRIVACY — this is the whole point of the endpoint, so the gates are strict:
///   1. Requires a signed-in session; the caller is the cryptographically-bound
///      session address, never a client-supplied param.
///   2. When the error names a deal (jobId), the caller MUST be a party to it
///      (buyer or seller). This blocks using the endpoint to fish diagnoses for
///      deals that aren't yours.
///   3. The diagnosis itself is produced from ONLY the caller's own error string
///      (diagnoseUserError never reads the global error ring or event bus), and
///      only {summary, suggestedFix} come back — no internal scope/stack/model.
///   4. Per-address rate limit so a signed-in user can't spin the model for cost.

export const diagnoseRoutes = new Hono();

const bodySchema = z.object({
  // Short action label the failure came from, e.g. 'release', 'bridge', 'fund'.
  action: z.string().min(1).max(40),
  // The raw error the user hit. Capped so a giant payload can't be shoved at the model.
  errorMessage: z.string().min(1).max(1000),
  // Optional deal the action was on; when present, party membership is enforced.
  jobId: z.string().min(1).max(120).optional(),
  // Locale to write the guidance in; falls back to English for anything else.
  locale: z.enum(['en', 'fr', 'ar', 'hi', 'sw']).optional(),
});

// Per-address rolling rate limit: at most N diagnoses per window. Keyed by the
// session address, so it can't be bypassed with a fresh body.
const RL_WINDOW_MS = 10 * 60 * 1000;
const RL_MAX = 20;
const rlHits = new Map<string, number[]>();

function rateLimited(address: string): boolean {
  const now = Date.now();
  const cutoff = now - RL_WINDOW_MS;
  const hits = (rlHits.get(address) ?? []).filter((t) => t >= cutoff);
  if (hits.length >= RL_MAX) {
    rlHits.set(address, hits);
    return true;
  }
  hits.push(now);
  rlHits.set(address, hits);
  // Opportunistic cleanup so the map doesn't grow unbounded across addresses.
  if (rlHits.size > 5000) {
    for (const [k, v] of rlHits) {
      if (v.every((t) => t < cutoff)) rlHits.delete(k);
    }
  }
  return false;
}

diagnoseRoutes.post('/', async (c) => {
  const address = sessionAddress(c);
  if (!address) {
    return c.json({ error: 'sign in to get an explanation', code: 'unauthorized' }, 401);
  }
  if (!supervisorEnabled()) {
    return c.json({ error: 'explanations are unavailable right now', code: 'disabled' }, 503);
  }

  let body;
  try {
    body = bodySchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }

  // Deal-scoped errors: the caller must be a party to the named deal.
  if (body.jobId) {
    const deal = await getDeal(body.jobId).catch(() => null);
    if (!deal) {
      return c.json({ error: 'deal not found' }, 404);
    }
    const isParty = address === deal.buyer || address === deal.seller;
    if (!isParty) {
      return c.json({ error: 'not your deal', code: 'forbidden' }, 403);
    }
  }

  if (rateLimited(address)) {
    return c.json({ error: 'too many requests, try again shortly', code: 'rate_limited' }, 429);
  }

  try {
    const diagnosis = await diagnoseUserError({
      action: body.action,
      errorMessage: body.errorMessage,
      locale: body.locale,
    });
    if (!diagnosis) {
      return c.json({ error: 'explanations are unavailable right now', code: 'disabled' }, 503);
    }
    return c.json({ diagnosis });
  } catch (err) {
    return c.json({ error: 'could not build an explanation', detail: (err as Error).message }, 502);
  }
});
