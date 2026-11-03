import { and, eq } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { requestNotes } from './schema.js';
import type { RequestNotes } from '../agents/requestNotes.js';

/// The request notes store (view 48, decision 8). A write names the version it
/// read; it lands only if the row is still at that version, so two writers can
/// never overwrite each other's notes without one of them knowing.

export interface StoredNotes {
  version: number;
  notes: unknown;
}

export class RequestNotesConflictError extends Error {
  constructor(jobId: string, expected: number) {
    super(`request notes changed since version ${expected}: ${jobId}`);
    this.name = 'RequestNotesConflictError';
  }
}

export interface RequestNotesStore {
  get(jobId: string): Promise<StoredNotes | null>;
  /// Returns the new version. `expectedVersion` 0 means the row must not exist.
  save(jobId: string, expectedVersion: number, notes: RequestNotes, now: number): Promise<number>;
}

const key = (jobId: string) => jobId.toLowerCase();

export class InMemoryRequestNotesStore implements RequestNotesStore {
  private readonly rows = new Map<string, StoredNotes>();

  async get(jobId: string): Promise<StoredNotes | null> {
    const row = this.rows.get(key(jobId));
    return row ? structuredClone(row) : null;
  }

  async save(jobId: string, expectedVersion: number, notes: RequestNotes): Promise<number> {
    const current = this.rows.get(key(jobId))?.version ?? 0;
    if (current !== expectedVersion) throw new RequestNotesConflictError(jobId, expectedVersion);
    const version = expectedVersion + 1;
    this.rows.set(key(jobId), { version, notes: structuredClone(notes) });
    return version;
  }
}

export class PostgresRequestNotesStore implements RequestNotesStore {
  async get(jobId: string): Promise<StoredNotes | null> {
    const [row] = await db().select().from(requestNotes).where(eq(requestNotes.jobId, key(jobId))).limit(1);
    return row ? { version: row.version, notes: row.data } : null;
  }

  async save(jobId: string, expectedVersion: number, notes: RequestNotes, now: number): Promise<number> {
    const version = expectedVersion + 1;
    const rows = expectedVersion === 0
      ? await db().insert(requestNotes)
        .values({ jobId: key(jobId), version, updatedAt: now, data: notes })
        .onConflictDoNothing()
        .returning({ version: requestNotes.version })
      : await db().update(requestNotes)
        .set({ version, updatedAt: now, data: notes })
        .where(and(eq(requestNotes.jobId, key(jobId)), eq(requestNotes.version, expectedVersion)))
        .returning({ version: requestNotes.version });
    if (rows.length !== 1) throw new RequestNotesConflictError(jobId, expectedVersion);
    return version;
  }
}

let store: RequestNotesStore | null = null;

export function requestNotesStore(): RequestNotesStore {
  store ??= pgEnabled ? new PostgresRequestNotesStore() : new InMemoryRequestNotesStore();
  return store;
}

export function setRequestNotesStoreForTest(next: RequestNotesStore | null): void {
  store = next;
}
