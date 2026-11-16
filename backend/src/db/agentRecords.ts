import { eq } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { agentRecords } from './schema.js';
import { newAgentRecord, type AgentRecord } from '../agents/agentRecord.js';

/// The person's agent records (view 48, step 6). Updates for one owner run one
/// at a time, so payments landing together all count.

const mem = new Map<string, AgentRecord>();
const queues = new Map<string, Promise<unknown>>();

export async function getAgentRecord(owner: string): Promise<AgentRecord> {
  const o = owner.toLowerCase();
  if (!pgEnabled) return mem.get(o) ?? newAgentRecord(o);
  const [row] = await db().select().from(agentRecords).where(eq(agentRecords.owner, o)).limit(1);
  return (row?.data as AgentRecord | undefined) ?? newAgentRecord(o);
}

async function write(r: AgentRecord): Promise<void> {
  if (!pgEnabled) {
    mem.set(r.owner, r);
    return;
  }
  await db().insert(agentRecords).values({ owner: r.owner, data: r }).onConflictDoUpdate({ target: agentRecords.owner, set: { data: r } });
}

function queued<T>(owner: string, work: () => Promise<T>): Promise<T> {
  const previous = queues.get(owner) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  queues.set(owner, next);
  void next.finally(() => {
    if (queues.get(owner) === next) queues.delete(owner);
  }).catch(() => undefined);
  return next;
}

export function updateAgentRecord(owner: string, change: (r: AgentRecord) => AgentRecord): Promise<AgentRecord> {
  const o = owner.toLowerCase();
  return queued(o, async () => {
    const updated = change(await getAgentRecord(o));
    await write(updated);
    return updated;
  });
}

export type LockDecision = { ok: true; record: AgentRecord } | { ok: false };

/// Checks and sets money aside in one write (view 87): `decide` reads the
/// record and answers with the record to save, or refuses. The row is held for
/// the length of the check, so two servers deciding for one person at the same
/// moment cannot both fit under one limit. A refusal writes nothing.
export function reserveLock(owner: string, decide: (r: AgentRecord) => LockDecision): Promise<{ ok: boolean; record: AgentRecord }> {
  const o = owner.toLowerCase();
  return queued(o, async () => {
    if (!pgEnabled) {
      const current = mem.get(o) ?? newAgentRecord(o);
      const decision = decide(current);
      if (!decision.ok) return { ok: false, record: current };
      mem.set(o, decision.record);
      return { ok: true, record: decision.record };
    }
    return db().transaction(async (tx) => {
      const [row] = await tx.select().from(agentRecords).where(eq(agentRecords.owner, o)).limit(1).for('update');
      const current = (row?.data as AgentRecord | undefined) ?? newAgentRecord(o);
      const decision = decide(current);
      // A person with no saved record has no lock rules; nothing to hold.
      if (!decision.ok || !row) return { ok: false, record: current };
      await tx.update(agentRecords).set({ data: decision.record }).where(eq(agentRecords.owner, o));
      return { ok: true, record: decision.record };
    });
  });
}

export async function listAgentRecords(): Promise<AgentRecord[]> {
  if (!pgEnabled) return [...mem.values()];
  const rows = await db().select().from(agentRecords);
  return rows.map((r) => r.data as AgentRecord);
}
