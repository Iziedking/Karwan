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

export function updateAgentRecord(owner: string, change: (r: AgentRecord) => AgentRecord): Promise<AgentRecord> {
  const o = owner.toLowerCase();
  const previous = queues.get(o) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const updated = change(await getAgentRecord(o));
      await write(updated);
      return updated;
    });
  queues.set(o, next);
  void next.finally(() => {
    if (queues.get(o) === next) queues.delete(o);
  });
  return next;
}

export async function listAgentRecords(): Promise<AgentRecord[]> {
  if (!pgEnabled) return [...mem.values()];
  const rows = await db().select().from(agentRecords);
  return rows.map((r) => r.data as AgentRecord);
}
