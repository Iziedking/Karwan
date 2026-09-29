import { randomUUID } from 'node:crypto';
import { pgEnabled, postgresExecutor } from './client.js';

/// A seller's own offer on a request. The on-chain bid carries only price and
/// validity; this row carries who sent it, the delivery date and the note, and
/// tells the buyer agent the bid is a direct offer it must not negotiate.
/// Postgres in production; an in-memory map when there is no database.

export type DirectOfferState = 'pending' | 'accepted' | 'withdrawn' | 'lapsed' | 'failed';

export interface DirectOffer {
  id: string;
  jobId: string;
  sellerUser: string;
  sellerAgent: string;
  priceUsdc: string;
  deliverByUnix: number;
  note: string;
  state: DirectOfferState;
  createdAt: number;
  lapsesAt: number;
  txHash?: string;
  failure?: string;
}

type NewOffer = Omit<DirectOffer, 'id' | 'state' | 'createdAt'> & { createdAt: number };

const mem = new Map<string, DirectOffer>();
const low = (s: string) => s.toLowerCase();

type Row = {
  id: string;
  job_id: string;
  seller_user: string;
  seller_agent: string;
  price_usdc: string;
  deliver_by_unix: string;
  note: string;
  state: DirectOfferState;
  created_at: string;
  lapses_at: string;
  tx_hash: string | null;
  failure: string | null;
};

const fromRow = (r: Row): DirectOffer => ({
  id: r.id,
  jobId: r.job_id,
  sellerUser: r.seller_user,
  sellerAgent: r.seller_agent,
  priceUsdc: r.price_usdc,
  deliverByUnix: Number(r.deliver_by_unix),
  note: r.note,
  state: r.state,
  createdAt: Number(r.created_at),
  lapsesAt: Number(r.lapses_at),
  ...(r.tx_hash ? { txHash: r.tx_hash } : {}),
  ...(r.failure ? { failure: r.failure } : {}),
});

/// Idempotent while pending: a second send from the same seller returns the
/// first offer untouched, so a retried request never places a second bid.
export async function createDirectOffer(input: NewOffer): Promise<{ offer: DirectOffer; created: boolean }> {
  const o: DirectOffer = {
    ...input,
    id: randomUUID(),
    sellerUser: low(input.sellerUser),
    sellerAgent: low(input.sellerAgent),
    state: 'pending',
  };
  if (!pgEnabled) {
    const existing = [...mem.values()].find(
      (x) => x.jobId === o.jobId && x.sellerUser === o.sellerUser && x.state === 'pending',
    );
    // A pending offer past its lapse time is dead; it must not block a new one.
    if (existing && existing.lapsesAt <= o.createdAt) mem.set(existing.id, { ...existing, state: 'lapsed' });
    else if (existing) return { offer: existing, created: false };
    mem.set(o.id, o);
    return { offer: o, created: true };
  }
  const db = postgresExecutor();
  await db.query(
    `UPDATE direct_offers_v1 SET state = 'lapsed'
     WHERE job_id = $1 AND seller_user = $2 AND state = 'pending' AND lapses_at <= $3`,
    [o.jobId, o.sellerUser, o.createdAt],
  );
  const ins = await db.query<Row>(
    `INSERT INTO direct_offers_v1 (id, job_id, seller_user, seller_agent, price_usdc, deliver_by_unix, note, state, created_at, lapses_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9)
     ON CONFLICT (job_id, seller_user) WHERE state = 'pending' DO NOTHING
     RETURNING *`,
    [o.id, o.jobId, o.sellerUser, o.sellerAgent, o.priceUsdc, o.deliverByUnix, o.note, o.createdAt, o.lapsesAt],
  );
  if (ins.rows[0]) return { offer: fromRow(ins.rows[0]), created: true };
  const { rows } = await db.query<Row>(
    `SELECT * FROM direct_offers_v1 WHERE job_id = $1 AND seller_user = $2 AND state = 'pending'`,
    [o.jobId, o.sellerUser],
  );
  return { offer: fromRow(rows[0]!), created: false };
}

export async function getDirectOffer(id: string): Promise<DirectOffer | null> {
  if (!pgEnabled) return mem.get(id) ?? null;
  const { rows } = await postgresExecutor().query<Row>('SELECT * FROM direct_offers_v1 WHERE id = $1', [id]);
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function listDirectOffers(jobId: string): Promise<DirectOffer[]> {
  if (!pgEnabled) {
    return [...mem.values()].filter((o) => o.jobId === jobId).sort((a, b) => a.createdAt - b.createdAt);
  }
  const { rows } = await postgresExecutor().query<Row>(
    'SELECT * FROM direct_offers_v1 WHERE job_id = $1 ORDER BY created_at ASC',
    [jobId],
  );
  return rows.map(fromRow);
}

export async function findPendingDirectOfferByAgent(jobId: string, sellerAgent: string): Promise<DirectOffer | null> {
  const agent = low(sellerAgent);
  if (!pgEnabled) {
    return [...mem.values()].find((o) => o.jobId === jobId && o.sellerAgent === agent && o.state === 'pending') ?? null;
  }
  const { rows } = await postgresExecutor().query<Row>(
    `SELECT * FROM direct_offers_v1 WHERE job_id = $1 AND seller_agent = $2 AND state = 'pending'`,
    [jobId, agent],
  );
  return rows[0] ? fromRow(rows[0]) : null;
}

/// With `onlyFrom`, the change happens only if the offer is still in that
/// state, so a withdraw and an accept racing each other cannot both win.
/// Returns whether the row changed.
export async function setDirectOfferState(
  id: string,
  state: DirectOfferState,
  extra: { txHash?: string; failure?: string; onlyFrom?: DirectOfferState } = {},
): Promise<boolean> {
  const { onlyFrom, ...fields } = extra;
  if (!pgEnabled) {
    const o = mem.get(id);
    if (!o || (onlyFrom && o.state !== onlyFrom)) return false;
    mem.set(id, { ...o, state, ...fields });
    return true;
  }
  const r = await postgresExecutor().query<{ id: string }>(
    `UPDATE direct_offers_v1 SET state = $2, tx_hash = COALESCE($3, tx_hash), failure = COALESCE($4, failure)
     WHERE id = $1 AND ($5::text IS NULL OR state = $5)
     RETURNING id`,
    [id, state, fields.txHash ?? null, fields.failure ?? null, onlyFrom ?? null],
  );
  return r.rows.length > 0;
}

/// Live (pending, not yet lapsed) offers per request, for the market's public
/// count. One query for the whole page of cards.
export async function countLiveDirectOffers(jobIds: string[], nowUnix: number): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (jobIds.length === 0) return counts;
  if (!pgEnabled) {
    const wanted = new Set(jobIds);
    for (const o of mem.values()) {
      if (wanted.has(o.jobId) && o.state === 'pending' && o.lapsesAt > nowUnix) {
        counts.set(o.jobId, (counts.get(o.jobId) ?? 0) + 1);
      }
    }
    return counts;
  }
  const { rows } = await postgresExecutor().query<{ job_id: string; n: string }>(
    `SELECT job_id, COUNT(*) AS n FROM direct_offers_v1
     WHERE job_id = ANY($1) AND state = 'pending' AND lapses_at > $2
     GROUP BY job_id`,
    [jobIds, nowUnix],
  );
  for (const r of rows) counts.set(r.job_id, Number(r.n));
  return counts;
}

export function __resetDirectOffersForTest(): void {
  mem.clear();
}
