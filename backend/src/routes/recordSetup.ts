import { Hono, type Context } from 'hono';
import type { SessionPayload } from '../auth/session.js';
import { BUYING_AGENT_LIMITS, type SuiteIdentity } from '../identity/suiteIdentity.js';
import { presenceAction, type PresenceAction } from '../presence/action.js';

export interface RecordSetupDeps {
  /// Null where the escrow family is not set up.
  identity: SuiteIdentity | null;
  session: (c: Context) => SessionPayload | null;
  requirePresence: (c: Context, action: PresenceAction) => Promise<Response | null>;
}

const limits = {
  perPayment: BUYING_AGENT_LIMITS.perPayment.toString(),
  total: BUYING_AGENT_LIMITS.total.toString(),
  days: BUYING_AGENT_LIMITS.days,
};

const complete = (s: { identityId: bigint; buyerBound: boolean; sellerBound: boolean; buyerExpiresAt: bigint }, nowSecs: number) =>
  s.identityId !== 0n && s.buyerBound && s.sellerBound && s.buyerExpiresAt > BigInt(nowSecs);

/// Setting up a person's record on the escrow family: once, before their first
/// money step. Karwan signs for the identity wallet it holds after the person
/// confirms; a person who holds their own wallet sends the calls themselves.
export function createRecordSetupRoutes(deps: RecordSetupDeps): Hono {
  const app = new Hono();

  async function status(session: SessionPayload) {
    const s = await deps.identity!.identityStatus(session.address);
    const nowSecs = Math.floor(Date.now() / 1000);
    return {
      complete: complete(s, nowSecs),
      identityId: s.identityId.toString(),
      buyerBound: s.buyerBound,
      sellerBound: s.sellerBound,
      buyerExpiresAt: Number(s.buyerExpiresAt),
      limits,
      ...(session.method === 'web3' ? { calls: await deps.identity!.preparedSetupCalls(session.address) } : {}),
    };
  }

  app.get('/setup', async (c) => {
    c.header('Cache-Control', 'no-store');
    const session = deps.session(c);
    if (!session) return c.json({ error: 'not authenticated' }, 401);
    if (!deps.identity) return c.json({ available: false });
    return c.json({ available: true, ...(await status(session)) });
  });

  app.post('/setup', async (c) => {
    c.header('Cache-Control', 'no-store');
    const session = deps.session(c);
    if (!session) return c.json({ error: 'not authenticated' }, 401);
    if (!deps.identity) return c.json({ error: 'record setup is not available here' }, 503);
    const before = await status(session);
    if (before.complete) return c.json(before);
    if (session.method === 'web3') {
      // Their own signatures were their presence; this only checks the calls landed.
      return c.json({ error: 'record_setup_needed', ...before }, 409);
    }
    const refused = await deps.requirePresence(
      c,
      presenceAction({
        kind: 'record_setup',
        wallet: session.address,
        amountMicros: null,
        recipient: null,
        detail: { perPayment: limits.perPayment, total: limits.total, days: String(limits.days) },
      }),
    );
    if (refused) return refused;
    await deps.identity.setUpIdentityForCustodial(session.address);
    return c.json(await status(session));
  });

  return app;
}
