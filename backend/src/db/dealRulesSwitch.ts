import { pgEnabled, postgresExecutor } from './client.js';
import { logger } from '../logger.js';

/// The switch for the deal rules (view 32, decision 6). Off until the owner
/// turns it on after the 3 Nov demo. While off, a deal a rule would refuse goes
/// ahead and the rule is logged, so the team sees what it would stop. Cached
/// and re-read from Postgres at most every 15 seconds; until the first read
/// lands, or if a read fails, it stays as it was (off at start).

export interface DealRulesState {
  on: boolean;
  updatedAt: number | null;
  updatedBy: string | null;
}

const KEY = 'deal_rules';
const REFRESH_MS = 15_000;

let state: DealRulesState = { on: false, updatedAt: null, updatedBy: null };
let readAt = 0;
let reading: Promise<void> | null = null;

async function read(): Promise<void> {
  if (!pgEnabled) {
    readAt = Date.now();
    return;
  }
  try {
    const rows = await postgresExecutor().query<{ data: DealRulesState }>('SELECT data FROM platform_settings_v1 WHERE key = $1', [KEY]);
    if (rows.rows[0]) state = rows.rows[0].data;
    readAt = Date.now();
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'deal rules switch read failed; it stays as it was');
  }
}

function refresh(): Promise<void> {
  if (!reading) reading = read().finally(() => { reading = null; });
  return reading;
}

export async function dealRulesState(): Promise<DealRulesState> {
  if (Date.now() - readAt > REFRESH_MS) await refresh();
  return state;
}

export async function setDealRules(on: boolean, by: string): Promise<DealRulesState> {
  const next: DealRulesState = { on, updatedAt: Date.now(), updatedBy: by };
  if (pgEnabled) {
    await postgresExecutor().query(
      `INSERT INTO platform_settings_v1 (key, data, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
      [KEY, JSON.stringify(next), next.updatedAt],
    );
  }
  state = next;
  readAt = Date.now();
  logger.info({ on, by }, 'deal rules switched');
  return state;
}
