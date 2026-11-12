import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { db, pgEnabled } from './client.js';
import * as schema from './schema.js';

/// The team list (view 79) is one list for both desks. It lives in testnet's
/// database; the mainnet server reaches it with a second login that may touch
/// only the team tables. Without that, it is this server's own database.

export function teamDatabaseUrl(cfg: { TEAM_DATABASE_URL?: string; DATABASE_URL?: string }): string | undefined {
  return cfg.TEAM_DATABASE_URL || cfg.DATABASE_URL || undefined;
}

export const teamPgEnabled = !!teamDatabaseUrl(config);

let _teamDb: NodePgDatabase<typeof schema> | null = null;

/// The Drizzle instance for the team tables. Callers gate on `teamPgEnabled`.
export function teamDb(): NodePgDatabase<typeof schema> {
  if (!config.TEAM_DATABASE_URL) {
    if (!pgEnabled) throw new Error('Postgres is not enabled for the team list');
    return db();
  }
  if (!_teamDb) {
    const pool = new pg.Pool({ connectionString: config.TEAM_DATABASE_URL, max: 3, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 });
    pool.on('error', (err) => logger.error({ err: err.message }, 'team database pool error'));
    _teamDb = drizzle(pool, { schema });
  }
  return _teamDb;
}
