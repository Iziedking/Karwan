import { pgEnabled, postgresExecutor } from './client.js';
import { logger } from '../logger.js';

/// The switch for the per-IP limits on the public forms: the research survey
/// and the waitlist. On unless an admin turns it off, which they do while
/// sign-ups arrive from shared carrier IPs, and turn back on later. Turning it
/// on restores the limits exactly as they were. The per-code wrong-try limit
/// and the per-email cap on waitlist codes are not behind this switch.
///
/// The limiter needs an answer on every request, so the value is cached and
/// re-read from Postgres in the background at most every 15 seconds. Until the
/// first read lands, or if a read fails, the limits stay on.

export interface FormLimitsState {
  on: boolean;
  updatedAt: number | null;
  updatedBy: string | null;
}

const KEY = 'public_form_limits';
const REFRESH_MS = 15_000;

let state: FormLimitsState = { on: true, updatedAt: null, updatedBy: null };
let readAt = 0;
let reading: Promise<void> | null = null;

async function read(): Promise<void> {
  if (!pgEnabled) {
    readAt = Date.now();
    return;
  }
  try {
    const rows = await postgresExecutor().query<{ data: FormLimitsState }>(
      'SELECT data FROM platform_settings_v1 WHERE key = $1',
      [KEY],
    );
    if (rows.rows[0]) state = rows.rows[0].data;
    readAt = Date.now();
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'form limits switch read failed; limits stay as they were');
  }
}

function refresh(): Promise<void> {
  if (!reading) reading = read().finally(() => { reading = null; });
  return reading;
}

/// For the limiter: answers at once from the cache.
export function formLimitsOn(): boolean {
  if (Date.now() - readAt > REFRESH_MS) void refresh();
  return state.on;
}

export async function formLimitsState(): Promise<FormLimitsState> {
  await refresh();
  return state;
}

export async function setFormLimits(on: boolean, by: string): Promise<FormLimitsState> {
  const next: FormLimitsState = { on, updatedAt: Date.now(), updatedBy: by };
  if (pgEnabled) {
    await postgresExecutor().query(
      `INSERT INTO platform_settings_v1 (key, data, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
      [KEY, JSON.stringify(next), next.updatedAt],
    );
  }
  state = next;
  readAt = Date.now();
  logger.info({ on, by }, 'public form limits switched');
  return state;
}
