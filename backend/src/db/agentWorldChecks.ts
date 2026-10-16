import { pgEnabled, postgresExecutor } from './client.js';
import type { SqlExecutor } from './migrations.js';
import type { AgentWorldHold } from '../trust/agentWorldCheck.js';

/// The open World ID step on each agent request, one row per request.
const memory = new Map<string, AgentWorldHold>();

export async function getHold(jobId: string, tx?: SqlExecutor): Promise<AgentWorldHold | null> {
  const id = jobId.toLowerCase();
  if (!pgEnabled && !tx) return memory.get(id) ?? null;
  const ex = tx ?? postgresExecutor();
  const r = await ex.query<{ data: AgentWorldHold }>(
    `SELECT data FROM agent_world_checks_v1 WHERE job_id = $1${tx ? ' FOR UPDATE' : ''}`,
    [id],
  );
  return r.rows[0]?.data ?? null;
}

export async function putHold(hold: AgentWorldHold, tx?: SqlExecutor): Promise<void> {
  if (!pgEnabled && !tx) {
    memory.set(hold.jobId, hold);
    return;
  }
  await (tx ?? postgresExecutor()).query(
    `INSERT INTO agent_world_checks_v1 (job_id, seller_user, data, updated_at) VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (job_id) DO UPDATE SET seller_user = EXCLUDED.seller_user, data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    [hold.jobId, hold.sellerUser, JSON.stringify(hold), hold.updatedAt],
  );
}

export async function deleteHold(jobId: string): Promise<void> {
  const id = jobId.toLowerCase();
  if (!pgEnabled) {
    memory.delete(id);
    return;
  }
  await postgresExecutor().query('DELETE FROM agent_world_checks_v1 WHERE job_id = $1', [id]);
}

/// Requests where this seller still has to check before the buyer's choice funds.
export async function holdsWaitingOnSeller(sellerUser: string): Promise<AgentWorldHold[]> {
  const me = sellerUser.toLowerCase();
  const rows = !pgEnabled
    ? [...memory.values()].filter((h) => h.sellerUser === me)
    : (await postgresExecutor().query<{ data: AgentWorldHold }>(
        'SELECT data FROM agent_world_checks_v1 WHERE seller_user = $1',
        [me],
      )).rows.map((r) => r.data);
  return rows.filter((h) => h.buyerConfirmed && h.seller === 'pending');
}
