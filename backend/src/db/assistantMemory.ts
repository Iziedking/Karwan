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

/// Every assistant turn reads memory before it answers, so reads come from a
/// short-lived cache. This process writes through it; the TTL covers a second
/// backend writing the same account.
const CACHE_MS = 60_000;
const CACHE_MAX = 5_000;
const cache = new Map<string, { value: AssistantMemory; at: number }>();

function remember(a: string, value: AssistantMemory): void {
  cache.delete(a);
  cache.set(a, { value, at: Date.now() });
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
}

/// Writes to one account run one at a time, so two replies finishing together
/// cannot each read the old notes and drop the other's.
const queues = new Map<string, Promise<unknown>>();
function serial<T>(a: string, work: () => Promise<T>): Promise<T> {
  const run = (queues.get(a) ?? Promise.resolve()).then(work, work);
  const settled = run.catch(() => undefined);
  queues.set(a, settled);
  void settled.then(() => { if (queues.get(a) === settled) queues.delete(a); });
  return run;
}

export async function getMemory(address: string): Promise<AssistantMemory> {
  const a = low(address);
  if (!pgEnabled) return mem.get(a) ?? EMPTY;
  const hit = cache.get(a);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  return readStored(a);
}

/// Writes read the stored row, never the cache.
async function readStored(a: string): Promise<AssistantMemory> {
  if (!pgEnabled) return mem.get(a) ?? EMPTY;
  const res = await postgresExecutor().query<{ data: AssistantMemory }>(
    'SELECT data FROM assistant_memory_v1 WHERE address = $1',
    [a],
  );
  const value = res.rows[0]?.data ?? EMPTY;
  remember(a, value);
  return value;
}

async function save(a: string, next: AssistantMemory): Promise<AssistantMemory> {
  if (!pgEnabled) {
    mem.set(a, next);
    return next;
  }
  await postgresExecutor().query(
    `INSERT INTO assistant_memory_v1 (address, updated_at, data) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (address) DO UPDATE SET updated_at = EXCLUDED.updated_at, data = EXCLUDED.data`,
    [a, next.updatedAt, JSON.stringify(next)],
  );
  remember(a, next);
  return next;
}

function change<T>(address: string, work: (a: string, current: AssistantMemory) => Promise<T>): Promise<T> {
  const a = low(address);
  return serial(a, async () => work(a, await readStored(a)));
}

/// Adds notes and drops the ones they replace. Does nothing while memory is off.
export function addNotes(address: string, notes: { add: readonly string[]; replace: readonly string[] }): Promise<AssistantMemory> {
  return change(address, async (a, current) => {
    if (!current.enabled || (!notes.add.length && !notes.replace.length)) return current;
    const now = Date.now();
    return save(a, { ...current, notes: mergeNotes(current.notes, notes, now, randomUUID), updatedAt: now });
  });
}

export function setMemoryEnabled(address: string, enabled: boolean): Promise<AssistantMemory> {
  return change(address, (a, current) => save(a, { ...current, enabled, updatedAt: Date.now() }));
}

export function deleteNotes(address: string, ids: readonly string[]): Promise<boolean> {
  return change(address, async (a, current) => {
    const gone = new Set(ids);
    const notes = current.notes.filter((n) => !gone.has(n.id));
    if (notes.length === current.notes.length) return false;
    await save(a, { ...current, notes, updatedAt: Date.now() });
    return true;
  });
}

export function forgetAllNotes(address: string): Promise<void> {
  return change(address, async (a, current) => {
    await save(a, { ...current, notes: [], updatedAt: Date.now() });
  });
}

/// Account deletion.
export function deleteMemoryOf(address: string): Promise<void> {
  return change(address, async (a) => {
    cache.delete(a);
    if (!pgEnabled) {
      mem.delete(a);
      return;
    }
    await postgresExecutor().query('DELETE FROM assistant_memory_v1 WHERE address = $1', [a]);
  });
}

export function __resetMemoryForTest(): void {
  mem.clear();
  cache.clear();
}
