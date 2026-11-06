import { randomUUID } from 'node:crypto';
import type { Context, Next } from 'hono';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { getMember, type TeamMember } from '../db/teamMembers.js';
import { pgEnabled, postgresExecutor } from '../db/client.js';
import {
  checkDeskKey,
  isDeskKey,
  memoryAdminDeskStore,
  postgresAdminDeskStore,
  redactForRow,
  type AdminDeskStore,
  type DeskVia,
} from '../db/adminDesk.js';
import { isDeskSession, memberStillAllowed, readDeskSession } from '../ops/deskSession.js';
import { mayCall } from '../ops/adminPages.js';
import { requireAccessPass } from './accessPass.js';

/// The admin desk's gate (view 64). After Cloudflare Access's pass, it works out
/// who is calling (a member's desk session, a member's key, or until the shared
/// tokens are removed one of those), checks the route against the pages the
/// owner ticked for them, and leaves a row for every change and every refusal.

export interface DeskPrincipal {
  via: DeskVia;
  memberId: string | null;
  email: string | null;
  name: string | null;
  owner: boolean;
  pages: string[];
}

let store: AdminDeskStore = pgEnabled ? postgresAdminDeskStore(postgresExecutor()) : memoryAdminDeskStore();

export function adminDeskStore(): AdminDeskStore {
  return store;
}

/// Tests point the gate at their own store.
export function useAdminDeskStoreForTests(next: AdminDeskStore): void {
  store = next;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function providedToken(c: Context): string {
  const headerToken = c.req.header('x-admin-token') ?? '';
  const authHeader = c.req.header('authorization') ?? '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  return headerToken || bearerToken;
}

export function deskSecret(): string {
  return config.SESSION_SECRET ?? 'dev-only-unsigned';
}

function fromMember(m: TeamMember, via: DeskVia): DeskPrincipal {
  return { via, memberId: m.id, email: m.email, name: m.name, owner: m.deskOwner === true, pages: m.deskOwner ? [] : (m.deskPages ?? []) };
}

export async function resolvePrincipal(c: Context): Promise<DeskPrincipal | null> {
  const raw = providedToken(c);
  if (!raw) return null;
  const accessEmail = (c.get('accessEmail' as never) as string | null | undefined) ?? null;

  if (isDeskSession(raw)) {
    const claims = readDeskSession(raw, deskSecret(), Date.now());
    if (!claims) return null;
    const member = await getMember(claims.id);
    if (!member || !memberStillAllowed(member, { se: claims.se, de: claims.de }, accessEmail)) return null;
    return fromMember(member, 'session');
  }
  if (isDeskKey(raw)) {
    const key = await checkDeskKey(store, raw);
    if (!key) return null;
    const member = await getMember(key.memberId);
    if (!member || !memberStillAllowed(member, { de: key.deskEpoch }, accessEmail)) return null;
    void store.touchKey(key.id, Date.now()).catch(() => undefined);
    return fromMember(member, 'key');
  }
  if (config.ADMIN_API_TOKEN && constantTimeEqual(raw, config.ADMIN_API_TOKEN)) {
    return { via: 'shared-token', memberId: null, email: null, name: 'shared admin token', owner: true, pages: [] };
  }
  if (config.SUPPORT_API_TOKEN && constantTimeEqual(raw, config.SUPPORT_API_TOKEN)) {
    return { via: 'shared-token', memberId: null, email: null, name: 'shared support token', owner: false, pages: ['support'] };
  }
  return null;
}

export function deskPrincipal(c: Context): DeskPrincipal | null {
  return (c.get('deskPrincipal' as never) as DeskPrincipal | undefined) ?? null;
}

/// The reviewer role the support desk records: the owner (or the shared admin
/// token) reviews as admin, any other member as support.
export function tokenRole(c: Context): 'admin' | 'support' | null {
  const p = deskPrincipal(c);
  if (!p) return null;
  return p.owner ? 'admin' : 'support';
}

export async function writeDeskRow(row: Omit<Parameters<AdminDeskStore['insertAction']>[0], 'id' | 'at'>): Promise<void> {
  try {
    await store.insertAction({ id: randomUUID(), at: Date.now(), ...row });
  } catch (err) {
    logger.error({ err: (err as Error).message, path: row.path }, 'admin desk row could not be written');
  }
}

async function readBody(c: Context): Promise<unknown> {
  if (c.req.method === 'GET' || c.req.method === 'HEAD') return null;
  try {
    const text = await c.req.raw.clone().text();
    if (!text) return null;
    try {
      return redactForRow(JSON.parse(text));
    } catch {
      return { bytes: text.length };
    }
  } catch {
    return null;
  }
}

async function readResult(res: Response): Promise<unknown> {
  try {
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('json')) return { status: res.status };
    return redactForRow(await res.clone().json());
  } catch {
    return { status: res.status };
  }
}

/// `page` fixes the page a whole route group belongs to (the support inbox);
/// otherwise the route itself decides.
const deskGate = (page?: string) => async function gate(c: Context, next: Next): Promise<Response | void> {
  // Several route groups stack this gate on one request; the first one decides
  // and writes the row.
  if (c.get('deskChecked' as never)) return next();
  c.set('deskChecked' as never, true as never);

  const method = c.req.method;
  const path = c.req.path;
  const principal = await resolvePrincipal(c);
  const change = method !== 'GET' && method !== 'HEAD';

  if (!principal) {
    if (providedToken(c)) {
      await writeDeskRow({ memberId: null, memberEmail: null, via: 'session', method, path, outcome: 'refused', status: 401, request: null, result: { error: 'not signed in' } });
    }
    return c.json({ error: 'unauthorized' }, 401);
  }
  const allowed = page ? principal.owner || principal.pages.includes(page) : mayCall(principal, method, path);
  if (!allowed) {
    await writeDeskRow({
      memberId: principal.memberId, memberEmail: principal.email, via: principal.via, method, path,
      outcome: 'refused', status: 403, request: await readBody(c), result: { error: 'not on your pages' },
    });
    return c.json({ error: 'This is not on your pages.', code: 'NOT_YOUR_PAGE' }, 403);
  }
  c.set('deskPrincipal' as never, principal as never);
  const request = change ? await readBody(c) : null;
  await next();
  if (!change) return;
  const status = c.res.status;
  await writeDeskRow({
    memberId: principal.memberId, memberEmail: principal.email, via: principal.via, method, path,
    outcome: status < 400 ? 'done' : status >= 500 ? 'failed' : 'refused', status, request, result: await readResult(c.res),
  });
};

/// Every admin gate first needs Cloudflare Access's pass, so a route mounted
/// outside /api/admin is closed to the internet just the same.
function behindAccess(gate: (c: Context, next: Next) => Promise<Response | void>) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    let inner: Response | void = undefined;
    const refused = await requireAccessPass(c, async () => {
      inner = await gate(c, next);
    });
    return refused ?? inner;
  };
}

export const requireAdmin = behindAccess(deskGate());
export const requireSupport = behindAccess(deskGate('support'));
