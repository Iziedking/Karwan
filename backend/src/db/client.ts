import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { config } from '../config.js';
import { logger } from '../logger.js';
import * as schema from './schema.js';

// Postgres is used when DATABASE_URL is set. Without it, the db modules fall
// back to flat-file persistence so local dev still works.
export const pgEnabled = !!config.DATABASE_URL;

let _db: NodePgDatabase<typeof schema> | null = null;

if (pgEnabled) {
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  pool.on('error', (err) => logger.error({ err: err.message }, 'pg pool error'));
  _db = drizzle(pool, { schema });
}

/// The Drizzle instance. Throws if called when Postgres is disabled; callers
/// must gate on `pgEnabled` first.
export function db(): NodePgDatabase<typeof schema> {
  if (!_db) throw new Error('Postgres is not enabled (DATABASE_URL unset)');
  return _db;
}

/// Creates the tables and indexes if they do not exist. No-op when Postgres is
/// disabled. Called once at startup.
export async function ensureSchema(): Promise<void> {
  if (!pgEnabled || !_db) return;
  await _db.execute(`
    CREATE TABLE IF NOT EXISTS profiles (
      address TEXT PRIMARY KEY,
      data JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS direct_deals (
      job_id TEXT PRIMARY KEY,
      buyer TEXT NOT NULL,
      seller TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      data JSONB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS direct_deals_buyer_idx ON direct_deals (buyer);
    CREATE INDEX IF NOT EXISTS direct_deals_seller_idx ON direct_deals (seller);
    CREATE INDEX IF NOT EXISTS direct_deals_created_at_idx ON direct_deals (created_at);
    CREATE TABLE IF NOT EXISTS agent_wallets (
      user_address TEXT PRIMARY KEY,
      data JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bridges (
      bridge_id TEXT PRIMARY KEY,
      data JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      ts BIGINT NOT NULL,
      data JSONB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_job_idx ON messages (job_id);
    CREATE INDEX IF NOT EXISTS messages_job_ts_idx ON messages (job_id, ts);
    CREATE TABLE IF NOT EXISTS telegram_links (
      address TEXT PRIMARY KEY,
      data JSONB NOT NULL
    );
  `);
  logger.info('postgres schema ensured');
}
