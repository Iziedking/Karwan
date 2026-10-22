import { randomUUID } from 'node:crypto';
import { pgEnabled, postgresExecutor } from './client.js';
import { mergeNotes, type MemoryNote } from '../assistant/memoryRules.js';

/// What the assistant remembers about one account (architecture view 20), one
/// row per address. Postgres in production; an in-memory map without a database.
/// Off stops reading and writing; the notes stay until the person deletes them.

export interface AssistantMemory {
  enabled: boolean;
  notes: MemoryNote[];
  updatedAt: number;
}

const EMPTY: AssistantMemory = { enabled: true, notes: [], updatedAt: 0 };
const mem = new Map<string, AssistantMemory>();
const low = (s: string) => s.toLowerCase();

export async function getMemory(address: string): Promise<AssistantMemory> {
  const a = low(address);
  if (!pgEnabled) return mem.get(a) ?? EMPTY;
  const res = await postgresExecutor().query<{ data: AssistantMemory }>(
    'SELECT data FROM assistant_memory_v1 WHERE address = $1',
    [a],
  );
  return res.rows[0]?.data ?? EMPTY;
}

async function save(address: string, next: AssistantMemory): Promise<AssistantMemory> {
  const a = low(address);
  if (!pgEnabled) {
    mem.set(a, next);
    return next;
  }
  await postgresExecutor().query(
    `INSERT INTO assistant_memory_v1 (address, updated_at, data) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (address) DO UPDATE SET updated_at = EXCLUDED.updated_at, data = EXCLUDED.data`,
    [a, next.updatedAt, JSON.stringify(next)],
  );
  return next;
}

/// Adds notes and drops the ones they replace. Does nothing while memory is off.
export async function addNotes(address: string, change: { add: readonly string[]; replace: readonly string[] }): Promise<AssistantMemory> {
  const current = await getMemory(address);
  if (!current.enabled || (!change.add.length && !change.replace.length)) return current;
  const now = Date.now();
  return save(address, { ...current, notes: mergeNotes(current.notes, change, now, randomUUID), updatedAt: now });
}

export async function setMemoryEnabled(address: string, enabled: boolean): Promise<AssistantMemory> {
  const current = await getMemory(address);
  return save(address, { ...current, enabled, updatedAt: Date.now() });
}

export async function deleteNotes(address: string, ids: readonly string[]): Promise<boolean> {
  const current = await getMemory(address);
  const gone = new Set(ids);
  const notes = current.notes.filter((n) => !gone.has(n.id));
  if (notes.length === current.notes.length) return false;
  await save(address, { ...current, notes, updatedAt: Date.now() });
  return true;
}

export async function forgetAllNotes(address: string): Promise<void> {
  const current = await getMemory(address);
  await save(address, { ...current, notes: [], updatedAt: Date.now() });
}

/// Account deletion.
export async function deleteMemoryOf(address: string): Promise<void> {
  const a = low(address);
  if (!pgEnabled) {
    mem.delete(a);
    return;
  }
  await postgresExecutor().query('DELETE FROM assistant_memory_v1 WHERE address = $1', [a]);
}

export function __resetMemoryForTest(): void {
  mem.clear();
}
