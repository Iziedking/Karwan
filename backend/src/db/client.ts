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
    CREATE TABLE IF NOT EXISTS app_snapshots (
      key TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at BIGINT NOT NULL
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
    CREATE TABLE IF NOT EXISTS match_proposals (
      job_id TEXT PRIMARY KEY,
      buyer_user TEXT NOT NULL,
      seller_user TEXT NOT NULL,
      proposed_at BIGINT NOT NULL,
      data JSONB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS match_proposals_buyer_user_idx ON match_proposals (buyer_user);
    CREATE INDEX IF NOT EXISTS match_proposals_seller_user_idx ON match_proposals (seller_user);
    CREATE INDEX IF NOT EXISTS match_proposals_proposed_at_idx ON match_proposals (proposed_at);
    -- SME trade-finance tables. Companion to KarwanInvoiceRegistry +
    -- KarwanPOFinancing on chain. JSONB data column holds the full row
    -- shape; surfaced columns power the indexed lookups.
    CREATE TABLE IF NOT EXISTS factoring_offers (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      financier TEXT NOT NULL,
      seller TEXT NOT NULL,
      status TEXT NOT NULL,
      offered_at BIGINT NOT NULL,
      data JSONB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS factoring_offers_invoice_idx ON factoring_offers (invoice_id);
    CREATE INDEX IF NOT EXISTS factoring_offers_financier_idx ON factoring_offers (financier);
    CREATE INDEX IF NOT EXISTS factoring_offers_seller_idx ON factoring_offers (seller);
    CREATE INDEX IF NOT EXISTS factoring_offers_status_idx ON factoring_offers (status);
    CREATE INDEX IF NOT EXISTS factoring_offers_offered_at_idx ON factoring_offers (offered_at);
    CREATE TABLE IF NOT EXISTS po_financing_lines (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      financier TEXT NOT NULL,
      seller TEXT NOT NULL,
      state TEXT NOT NULL,
      funded_at BIGINT NOT NULL,
      data JSONB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS po_financing_lines_invoice_idx ON po_financing_lines (invoice_id);
    CREATE INDEX IF NOT EXISTS po_financing_lines_financier_idx ON po_financing_lines (financier);
    CREATE INDEX IF NOT EXISTS po_financing_lines_seller_idx ON po_financing_lines (seller);
    CREATE INDEX IF NOT EXISTS po_financing_lines_state_idx ON po_financing_lines (state);
    CREATE INDEX IF NOT EXISTS po_financing_lines_funded_at_idx ON po_financing_lines (funded_at);
    CREATE TABLE IF NOT EXISTS document_anchors (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      anchorer TEXT NOT NULL,
      anchored_at BIGINT NOT NULL,
      data JSONB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS document_anchors_invoice_idx ON document_anchors (invoice_id);
    CREATE INDEX IF NOT EXISTS document_anchors_anchored_at_idx ON document_anchors (anchored_at);
  `);
  logger.info('postgres schema ensured');
}
