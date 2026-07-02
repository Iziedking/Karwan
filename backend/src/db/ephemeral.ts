// Durable ephemeral state: pending WebAuthn challenges, OTP codes, SIWE
// nonces, Telegram link tokens. These lived in plain in-memory Maps, so every
// restart voided in-flight sign-ins (a user mid-OTP got "invalid code" from a
// deploy). Same pattern as db/users.ts: the Map stays the synchronous
// read/write path, Postgres is the write-through durable copy, and boot
// hydrates unexpired rows back into memory. Flat-file/dev mode degrades to
// memory-only, exactly the old behavior.

import { eq, like, lt } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { ephemeralState } from './schema.js';
import { logger } from '../logger.js';

interface DurableMap<T extends { expiresAt: number }> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  delete(key: string): boolean;
  entries(): IterableIterator<[string, T]>;
  readonly size: number;
}

const registry: Array<{ namespace: string; hydrate: (rows: Map<string, unknown>) => void }> = [];

/// A Map with a Postgres shadow. `namespace` scopes the keys so every consumer
/// shares one table. Values must carry `expiresAt` (epoch ms): expired entries
/// are dropped on read and skipped at hydration.
export function durableEphemeralMap<T extends { expiresAt: number }>(
  namespace: string,
): DurableMap<T> {
  const mem = new Map<string, T>();
  const pgKey = (k: string) => `${namespace}:${k}`;

  registry.push({
    namespace,
    hydrate: (rows) => {
      const now = Date.now();
      for (const [key, data] of rows) {
        const value = data as T;
        if (value.expiresAt > now) mem.set(key, value);
      }
    },
  });

  return {
    get(key) {
      const v = mem.get(key);
      if (v && v.expiresAt <= Date.now()) {
        this.delete(key);
        return undefined;
      }
      return v;
    },
    set(key, value) {
      mem.set(key, value);
      if (pgEnabled) {
        void db()
          .insert(ephemeralState)
          .values({ key: pgKey(key), data: value, expiresAt: value.expiresAt })
          .onConflictDoUpdate({
            target: ephemeralState.key,
            set: { data: value, expiresAt: value.expiresAt },
          })
          .catch((err: Error) =>
            logger.warn({ err: err.message, namespace }, 'ephemeral pg write failed'),
          );
      }
    },
    delete(key) {
      const existed = mem.delete(key);
      if (pgEnabled) {
        void db()
          .delete(ephemeralState)
          .where(eq(ephemeralState.key, pgKey(key)))
          .catch((err: Error) =>
            logger.warn({ err: err.message, namespace }, 'ephemeral pg delete failed'),
          );
      }
      return existed;
    },
    entries: () => mem.entries(),
    get size() {
      return mem.size;
    },
  };
}

/// Boot-time hydration for every registered map, plus a sweep of expired rows
/// so the table never grows unbounded. Call after ensureSchema.
export async function initEphemeralStores(): Promise<void> {
  if (!pgEnabled) return;
  try {
    const now = Date.now();
    await db().delete(ephemeralState).where(lt(ephemeralState.expiresAt, now));
    for (const entry of registry) {
      const rows = await db()
        .select()
        .from(ephemeralState)
        .where(like(ephemeralState.key, `${entry.namespace}:%`));
      const byKey = new Map<string, unknown>();
      for (const row of rows) {
        byKey.set(row.key.slice(entry.namespace.length + 1), row.data);
      }
      entry.hydrate(byKey);
    }
    logger.info({ namespaces: registry.map((r) => r.namespace) }, 'ephemeral state hydrated');
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      'ephemeral hydration failed; in-flight auth state resets on this boot',
    );
  }
}
