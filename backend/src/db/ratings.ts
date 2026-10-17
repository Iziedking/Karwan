import type { DealRating } from '../ratings/rules.js';
import { pgEnabled, postgresExecutor } from './client.js';

/// Ratings of settled deals, one per side. Postgres in production; an
/// in-memory map when there is no database.

const mem = new Map<string, DealRating>();
const low = (s: string) => s.toLowerCase();
const keyOf = (dealId: string, rater: string) => `${low(dealId)}|${low(rater)}`;

const normal = (r: DealRating): DealRating => ({ ...r, dealId: low(r.dealId), rater: low(r.rater), ratee: low(r.ratee) });

/// False when this side already rated this deal.
export async function saveRating(rating: DealRating): Promise<boolean> {
  const r = normal(rating);
  if (!pgEnabled) {
    const key = keyOf(r.dealId, r.rater);
    if (mem.has(key)) return false;
    mem.set(key, r);
    return true;
  }
  const res = await postgresExecutor().query<{ deal_id: string }>(
    `INSERT INTO deal_ratings_v1 (deal_id, rater, ratee, created_at, data) VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (deal_id, rater) DO NOTHING RETURNING deal_id`,
    [r.dealId, r.rater, r.ratee, r.createdAt, JSON.stringify(r)],
  );
  return res.rows.length > 0;
}

export async function ratingsForDeal(dealId: string): Promise<DealRating[]> {
  const id = low(dealId);
  if (!pgEnabled) return [...mem.values()].filter((r) => r.dealId === id);
  const res = await postgresExecutor().query<{ data: DealRating }>(`SELECT data FROM deal_ratings_v1 WHERE deal_id = $1`, [id]);
  return res.rows.map((row) => row.data);
}

export async function ratingsAbout(address: string): Promise<DealRating[]> {
  const a = low(address);
  if (!pgEnabled) return [...mem.values()].filter((r) => r.ratee === a);
  const res = await postgresExecutor().query<{ data: DealRating }>(`SELECT data FROM deal_ratings_v1 WHERE ratee = $1`, [a]);
  return res.rows.map((row) => row.data);
}

export async function ratingsBy(address: string): Promise<DealRating[]> {
  const a = low(address);
  if (!pgEnabled) return [...mem.values()].filter((r) => r.rater === a);
  const res = await postgresExecutor().query<{ data: DealRating }>(`SELECT data FROM deal_ratings_v1 WHERE rater = $1`, [a]);
  return res.rows.map((row) => row.data);
}

/// Account deletion: the stars someone gave stay with the deal, like the deal
/// itself; the words they wrote go.
export async function scrubNotesBy(address: string): Promise<void> {
  const a = low(address);
  if (!pgEnabled) {
    for (const [k, r] of mem) if (r.rater === a) mem.set(k, { ...r, note: null });
    return;
  }
  await postgresExecutor().query(`UPDATE deal_ratings_v1 SET data = jsonb_set(data, '{note}', 'null'::jsonb) WHERE rater = $1`, [a]);
}

export function __resetRatingsForTest(): void {
  mem.clear();
}
