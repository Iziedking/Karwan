import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Context, Next } from 'hono';
import { pgEnabled, postgresExecutor } from '../db/client.js';
import {
  memoryAdminRequestStore,
  postgresAdminRequestStore,
  REQUEST_TTL_MS,
  type AdminRequest,
  type AdminRequestStore,
} from '../db/adminRequests.js';
import { deskPrincipal, type DeskPrincipal } from './adminAuth.js';

/// Two people for any money or chain move (view 64). A money route asked for on
/// the desk opens a request and moves nothing. A different member who has the
/// same page approves it within 24 hours; the target is read again, and only if
/// it has not moved does the route run, once, as the approver. There is no way
/// to run one alone.

export interface MoneyAction {
  key: string;
  label: string;
  /// `?dry=1` on this route moves nothing, so it runs without a request.
  dryRunMovesNothing?: boolean;
  /// What the target looks like now; read when asked for and again before it runs.
  snapshot?: (path: string) => Promise<unknown>;
}

const actions = new Map<string, MoneyAction>();
let store: AdminRequestStore = pgEnabled ? postgresAdminRequestStore(postgresExecutor()) : memoryAdminRequestStore();
let replay: ((req: Request) => Promise<Response>) | null = null;
let now = () => Date.now();
/// Only this process's own replay of an approved request carries it, so no
/// caller can claim an approval from outside.
const REPLAY_SECRET = randomBytes(32).toString('hex');

export function setDeskReplay(fn: (req: Request) => Promise<Response>): void {
  replay = fn;
}

export function useTwoPeopleForTests(deps: { store?: AdminRequestStore; now?: () => number }): void {
  if (deps.store) store = deps.store;
  if (deps.now) now = deps.now;
}

export function who(p: DeskPrincipal) {
  return { memberId: p.memberId!, email: p.email, name: p.name };
}

function sameSecret(a: string | undefined): boolean {
  if (!a) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(REPLAY_SECRET);
  return x.length === y.length && timingSafeEqual(x, y);
}

function queryOf(c: Context): string {
  const url = new URL(c.req.url);
  return url.search;
}

function reasonOf(c: Context): string {
  const raw = c.req.header('x-desk-reason') ?? '';
  try {
    return decodeURIComponent(raw).trim().slice(0, 1000);
  } catch {
    return raw.trim().slice(0, 1000);
  }
}

export function twoPeople(action: MoneyAction) {
  actions.set(action.key, action);
  return async (c: Context, next: Next): Promise<Response | void> => {
    const principal = deskPrincipal(c);
    if (!principal) return c.json({ error: 'unauthorized' }, 401);
    if (action.dryRunMovesNothing && c.req.query('dry') === '1') return next();

    const approvedId = c.req.header('x-desk-approved');
    if (approvedId) {
      const r = await store.get(approvedId);
      const ok =
        sameSecret(c.req.header('x-desk-replay')) &&
        r?.status === 'running' &&
        r.action === action.key &&
        r.method === c.req.method &&
        r.path === c.req.path &&
        r.query === queryOf(c) &&
        r.approvedBy?.memberId === principal.memberId;
      if (!ok) return c.json({ error: 'This approval does not match a running request.' }, 403);
      return next();
    }

    if (!principal.memberId) return c.json({ error: 'Sign in as a member to ask for a money move.' }, 403);
    const reason = reasonOf(c);
    if (reason.length < 3) return c.json({ error: 'Say why, so the second member can check it.', code: 'REASON_NEEDED' }, 400);
    const at = now();
    const request: AdminRequest = {
      id: randomUUID(),
      action: action.key,
      label: action.label,
      method: c.req.method,
      path: c.req.path,
      query: queryOf(c),
      body: await c.req.raw.clone().text(),
      reason,
      requestedBy: who(principal),
      requestedAt: at,
      expiresAt: at + REQUEST_TTL_MS,
      snapshot: action.snapshot ? await action.snapshot(c.req.path) : null,
      status: 'pending',
    };
    await store.insert(request);
    return c.json({ request: view(request), note: 'Nothing has moved. A second member with this page must approve it within 24 hours.' }, 202);
  };
}

export function view(r: AdminRequest) {
  const { body, ...rest } = r;
  let parsed: unknown = null;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    parsed = { bytes: body.length };
  }
  return { ...rest, body: parsed, status: r.status === 'pending' && r.expiresAt <= now() ? 'expired' : r.status };
}

/// What the request routes (routes/adminRequests.ts) work with.
export function requestDesk() {
  return { store, now, action: (key: string) => actions.get(key), replay, replaySecret: REPLAY_SECRET };
}
