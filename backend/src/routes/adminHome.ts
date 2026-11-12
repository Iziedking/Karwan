import { Hono } from 'hono';
import { adminDeskStore, deskPrincipal, requireAdmin } from '../middleware/adminAuth.js';
import { homeFor, lagosMidnight, type HomeFacts, type SystemRow } from '../ops/deskHome.js';

/// GET /api/admin/home (view 79): any signed-in teammate; homeFor filters by
/// the caller's pages.
export const adminHomeRoutes = new Hono();

type Facts = Omit<HomeFacts, 'now' | 'callerId'>;

async function settle<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch {
    return fallback;
  }
}

/// The cheap checks only; the full picture stays on Health.
async function systemRows(): Promise<SystemRow[]> {
  const { db, pgEnabled } = await import('../db/client.js');
  const { publicClient } = await import('../chain/client.js');
  const { watcherHealth, cronHealth } = await import('../ops/heartbeats.js');
  const rows: SystemRow[] = [];
  if (pgEnabled) {
    rows.push({ label: 'Website and app', state: await settle(async () => { await db().execute('select 1'); return 'working' as const; }, 'down' as const) });
  }
  rows.push({ label: 'Arc network', state: await settle(async () => { await publicClient.getBlockNumber(); return 'working' as const; }, 'down' as const) });
  const stuck = watcherHealth().filter((w) => w.enabled && (w.status === 'stalled' || w.status === 'missing')).length
    + cronHealth().filter((c) => c.status === 'stale').length;
  rows.push(stuck ? { label: 'Background jobs', state: 'slow', detail: `${stuck} behind` } : { label: 'Background jobs', state: 'working' });
  return rows;
}

async function liveFacts(now: number): Promise<Facts> {
  const { requestDesk } = await import('../middleware/twoPeople.js');
  const { caseStore } = await import('../support/cases.js');
  const { listAllDeals } = await import('../db/deals.js');
  const { listProfiles } = await import('../db/profiles.js');
  const { listMembers } = await import('../db/teamMembers.js');
  const { dealStage } = await import('../ops/deskHome.js');
  const midnight = lagosMidnight(now);
  const [requests, open, solved, deals, profiles, rows, members, system] = await Promise.all([
    settle(() => requestDesk().store.list(100), []),
    settle(() => caseStore().queue({}), []),
    settle(() => caseStore().queue({ state: 'solved' }), []),
    settle(() => listAllDeals(), []),
    settle(() => listProfiles(), []),
    settle(() => adminDeskStore().listActions({ limit: 300 }), []),
    settle(() => listMembers(), []),
    settle(() => systemRows(), []),
  ]);
  return {
    requests,
    cases: [...open, ...solved.filter((c) => (c.solvedAt ?? 0) >= midnight)],
    deals: deals.map((d) => ({ jobId: d.jobId, buyer: d.buyer, seller: d.seller, amountUsdc: d.dealAmountUsdc, stage: dealStage(d), createdAt: d.createdAt })),
    accounts: profiles.map((p) => ({ createdAt: p.createdAt ?? 0, setupDone: p.settings?.setupDoneAt !== undefined })),
    system,
    rows: rows.map((r) => ({ at: r.at, memberId: r.memberId })),
    members: members.filter((m) => m.active).map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role })),
  };
}

let facts: (now: number) => Promise<Facts> = liveFacts;

export function useHomeFactsForTests(fn: (now: number) => Promise<Facts>): void {
  facts = fn;
}

adminHomeRoutes.get('/home', requireAdmin, async (c) => {
  const p = deskPrincipal(c)!;
  const now = Date.now();
  return c.json(homeFor(p.access, p.owner, { now, callerId: p.memberId ?? null, ...(await facts(now)) }));
});
