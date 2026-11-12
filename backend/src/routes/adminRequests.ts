import { Hono } from 'hono';
import { deskPrincipal, requireAdmin } from '../middleware/adminAuth.js';
import { requestDesk, view, who } from '../middleware/twoPeople.js';
import { mayCall } from '../ops/adminPages.js';

/// The money requests list, approve and withdraw (view 64). The rule itself
/// lives in middleware/twoPeople.ts, on each money route.

/// GET /api/admin/requests, approve, turn down, cancel.
export const adminRequestRoutes = new Hono();


adminRequestRoutes.get('/requests', requireAdmin, async (c) => {
  return c.json({ requests: (await requestDesk().store.list(100)).map(view) });
});

adminRequestRoutes.post('/requests/:id/approve', requireAdmin, async (c) => {
  const principal = deskPrincipal(c)!;
  if (!principal.memberId) return c.json({ error: 'Sign in as a member to approve.' }, 403);
  const r = await requestDesk().store.get(c.req.param('id') ?? '');
  if (!r) return c.json({ error: 'No such request.' }, 404);
  if (r.status !== 'pending') return c.json({ error: `This request is ${r.status}.` }, 409);
  if (r.expiresAt <= requestDesk().now()) {
    await requestDesk().store.move(r.id, 'pending', { status: 'expired', decidedAt: requestDesk().now() });
    return c.json({ error: 'This request is more than 24 hours old. Ask again.' }, 409);
  }
  if (r.requestedBy.memberId === principal.memberId) return c.json({ error: 'A second member must approve this, not the one who asked.' }, 403);
  if (!mayCall(principal, r.method, r.path)) return c.json({ error: 'This is not on your pages.' }, 403);
  const { action: actionOf, replay, replaySecret } = requestDesk();
  const action = actionOf(r.action);
  if (!action || !replay) return c.json({ error: 'This move cannot run here.' }, 409);

  const running = await requestDesk().store.move(r.id, 'pending', { status: 'running', approvedBy: who(principal), decidedAt: requestDesk().now() });
  if (!running) return c.json({ error: 'Someone else decided this request first.' }, 409);

  if (action.snapshot) {
    const current = await action.snapshot(r.path);
    if (JSON.stringify(current) !== JSON.stringify(r.snapshot)) {
      const refused = await requestDesk().store.move(r.id, 'running', {
        status: 'refused',
        result: { status: 409, body: { error: 'The target changed after this was asked for.', before: r.snapshot, now: current } },
      });
      return c.json({ error: 'The target changed after this was asked for. Nothing ran. Ask again if it is still needed.', request: refused && view(refused) }, 409);
    }
  }

  const headers = new Headers({ 'content-type': 'application/json', 'x-desk-approved': r.id, 'x-desk-replay': replaySecret });
  for (const name of ['x-admin-token', 'authorization', 'cf-access-jwt-assertion']) {
    const v = c.req.header(name);
    if (v) headers.set(name, v);
  }
  let status = 500;
  let body: unknown = null;
  try {
    const res = await replay(new Request(`http://desk.internal${r.path}${r.query}`, { method: r.method, headers, ...(r.body ? { body: r.body } : {}) }));
    status = res.status;
    body = await res.json().catch(() => null);
  } catch (err) {
    body = { error: (err as Error).message };
  }
  const done = await requestDesk().store.move(r.id, 'running', { status: status < 400 ? 'done' : 'failed', result: { status, body } });
  return c.json({ request: done && view(done) }, status < 400 ? 200 : 502);
});

/// A second member who may run it says no. The asker withdraws instead.
adminRequestRoutes.post('/requests/:id/turn-down', requireAdmin, async (c) => {
  const principal = deskPrincipal(c)!;
  if (!principal.memberId) return c.json({ error: 'Sign in as a member to turn this down.' }, 403);
  const r = await requestDesk().store.get(c.req.param('id') ?? '');
  if (!r) return c.json({ error: 'No such request.' }, 404);
  if (r.requestedBy.memberId === principal.memberId) return c.json({ error: 'You asked for this. Withdraw it instead.' }, 403);
  if (!mayCall(principal, r.method, r.path)) return c.json({ error: 'This is not on your pages.' }, 403);
  const turned = await requestDesk().store.move(r.id, 'pending', { status: 'turned_down', turnedDownBy: who(principal), decidedAt: requestDesk().now() });
  if (!turned) return c.json({ error: `This request is ${r.status}.` }, 409);
  return c.json({ request: view(turned) });
});

adminRequestRoutes.post('/requests/:id/cancel', requireAdmin, async (c) => {
  const principal = deskPrincipal(c)!;
  const r = await requestDesk().store.get(c.req.param('id') ?? '');
  if (!r) return c.json({ error: 'No such request.' }, 404);
  if (!principal.owner && r.requestedBy.memberId !== principal.memberId) return c.json({ error: 'Only the member who asked, or the owner, can withdraw it.' }, 403);
  const cancelled = await requestDesk().store.move(r.id, 'pending', { status: 'cancelled', decidedAt: requestDesk().now() });
  if (!cancelled) return c.json({ error: `This request is ${r.status}.` }, 409);
  return c.json({ request: view(cancelled) });
});
