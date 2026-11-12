import { Hono } from 'hono';
import { z } from 'zod';
import { deskPrincipal, requireSupport } from '../middleware/adminAuth.js';
import { caseStore } from '../support/cases.js';
import { teamRoomStore } from '../support/teamRoom.js';

/// The team room (view 78), at /api/admin/support/room behind the Support
/// page: the shared room, or one case's thread with ?case=KT-1042.
export const teamRoomRoutes = new Hono();

teamRoomRoutes.use('*', requireSupport);

const postBody = z.object({ text: z.string().trim().min(1).max(2000), case: z.string().max(40).optional() });

teamRoomRoutes.get('/', async (c) => {
  const ref = c.req.query('case');
  const k = ref ? await caseStore().get(ref) : null;
  if (ref && !k) return c.json({ error: 'case not found' }, 404);
  return c.json({ messages: await teamRoomStore().list({ ...(k ? { caseId: k.id } : {}), limit: 100 }) });
});

teamRoomRoutes.post('/', async (c) => {
  let b;
  try {
    b = postBody.parse(await c.req.json());
  } catch {
    return c.json({ error: 'Write something first.' }, 400);
  }
  const k = b.case ? await caseStore().get(b.case) : null;
  if (b.case && !k) return c.json({ error: 'case not found' }, 404);
  const memberId = deskPrincipal(c)?.memberId ?? undefined;
  const m = await teamRoomStore().post({ text: b.text, at: Date.now(), ...(k ? { caseId: k.id } : {}), ...(memberId ? { memberId } : {}) });
  return c.json({ message: m });
});
