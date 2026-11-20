import { pgEnabled, postgresExecutor } from './client.js';
import type { SqlExecutor } from './migrations.js';

/// Meaning vectors (view 95 phase 2), one per seller, request or standing
/// order and model. Only a hash of the text is kept, never the text. The owner
/// is the account the row belongs to, so deleting an account is one statement.

export type MeaningKind = 'seller' | 'request' | 'need';

export interface StoredVector {
  kind: MeaningKind;
  ref: string;
  model: string;
  owner: string;
  textHash: string;
  vector: Float32Array;
  updatedAt: number;
}

type Row = { kind: MeaningKind; ref: string; model: string; owner: string; text_hash: string; vector: number[]; updated_at: number | string };

const fromRow = (r: Row): StoredVector => ({
  kind: r.kind,
  ref: r.ref,
  model: r.model,
  owner: r.owner,
  textHash: r.text_hash,
  vector: Float32Array.from(r.vector),
  updatedAt: Number(r.updated_at),
});

const COLUMNS = 'kind, ref, model, owner, text_hash, vector, updated_at';

/// The Postgres side, on any executor (the live pool, or a test schema).
export function meaningVectorSql(x: SqlExecutor) {
  return {
    async put(v: StoredVector): Promise<void> {
      await x.query(
        `INSERT INTO meaning_vectors_v1 (${COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6::real[], $7)
         ON CONFLICT (kind, ref, model) DO UPDATE SET owner = EXCLUDED.owner, text_hash = EXCLUDED.text_hash,
           vector = EXCLUDED.vector, updated_at = EXCLUDED.updated_at`,
        [v.kind, v.ref, v.model, v.owner.toLowerCase(), v.textHash, [...v.vector], v.updatedAt],
      );
    },
    async get(kind: MeaningKind, ref: string, model: string): Promise<StoredVector | null> {
      const r = await x.query<Row>(`SELECT ${COLUMNS} FROM meaning_vectors_v1 WHERE kind = $1 AND ref = $2 AND model = $3`, [kind, ref, model]);
      return r.rows[0] ? fromRow(r.rows[0]) : null;
    },
    async list(kind: MeaningKind, model: string): Promise<StoredVector[]> {
      const r = await x.query<Row>(`SELECT ${COLUMNS} FROM meaning_vectors_v1 WHERE kind = $1 AND model = $2 ORDER BY ref`, [kind, model]);
      return r.rows.map(fromRow);
    },
    async count(kind: MeaningKind, model: string): Promise<number> {
      const r = await x.query<{ n: number | string }>(`SELECT count(*) AS n FROM meaning_vectors_v1 WHERE kind = $1 AND model = $2`, [kind, model]);
      return Number(r.rows[0]?.n ?? 0);
    },
    async deleteOwner(owner: string): Promise<number> {
      const r = await x.query(`DELETE FROM meaning_vectors_v1 WHERE owner = $1 RETURNING ref`, [owner.toLowerCase()]);
      return r.rows.length;
    },
  };
}

const kept = new Map<string, StoredVector>();
const keyOf = (kind: MeaningKind, ref: string, model: string) => `${kind}\u0000${ref}\u0000${model}`;

export function resetMeaningVectorsForTests(): void {
  kept.clear();
}

export async function putVector(v: StoredVector): Promise<void> {
  if (pgEnabled) return meaningVectorSql(postgresExecutor()).put(v);
  kept.set(keyOf(v.kind, v.ref, v.model), { ...v, owner: v.owner.toLowerCase(), vector: Float32Array.from(v.vector) });
}

export async function getVector(kind: MeaningKind, ref: string, model: string): Promise<StoredVector | null> {
  if (pgEnabled) return meaningVectorSql(postgresExecutor()).get(kind, ref, model);
  return kept.get(keyOf(kind, ref, model)) ?? null;
}

export async function listVectors(kind: MeaningKind, model: string): Promise<StoredVector[]> {
  if (pgEnabled) return meaningVectorSql(postgresExecutor()).list(kind, model);
  return [...kept.values()].filter((v) => v.kind === kind && v.model === model).sort((a, b) => a.ref.localeCompare(b.ref));
}

export async function countVectors(kind: MeaningKind, model: string): Promise<number> {
  if (pgEnabled) return meaningVectorSql(postgresExecutor()).count(kind, model);
  return (await listVectors(kind, model)).length;
}

/// Every vector of an account, in the account deletion sweep.
export async function deleteVectorsOf(owner: string): Promise<number> {
  if (pgEnabled) return meaningVectorSql(postgresExecutor()).deleteOwner(owner);
  const who = owner.toLowerCase();
  let n = 0;
  for (const [k, v] of kept) {
    if (v.owner === who) {
      kept.delete(k);
      n += 1;
    }
  }
  return n;
}
