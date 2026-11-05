import { logger } from '../logger.js';
import { pgEnabled, postgresExecutor } from './client.js';

/// Which seller agents already judged which request (view 48, decision 8). The
/// seller sweep re-enters every recent request every 90 seconds; kept only in
/// memory, a restart made every candidate seller judge every open request
/// again. Writes are best effort: a lost row only means one more judgement.

export async function loadJudged(sinceMs: number): Promise<Array<{ jobId: string; seller: string }>> {
  if (!pgEnabled) return [];
  const res = await postgresExecutor().query(
    'SELECT job_id, seller FROM seller_judged_v1 WHERE judged_at >= $1',
    [sinceMs],
  );
  return (res.rows as Array<{ job_id: string; seller: string }>).map((r) => ({ jobId: r.job_id, seller: r.seller }));
}

export function saveJudged(jobId: string, seller: string): void {
  if (!pgEnabled) return;
  postgresExecutor()
    .query(
      'INSERT INTO seller_judged_v1 (job_id, seller, judged_at) VALUES ($1, $2, $3) ON CONFLICT (job_id, seller) DO NOTHING',
      [jobId, seller.toLowerCase(), Date.now()],
    )
    .catch((err: Error) => logger.warn({ jobId, err: err.message }, 'seller judged write failed'));
}

/// A seller whose limits changed judges these requests again (view 52).
export function clearJudgedBySeller(seller: string, jobIds: readonly string[]): void {
  if (!pgEnabled || jobIds.length === 0) return;
  postgresExecutor()
    .query('DELETE FROM seller_judged_v1 WHERE seller = $1 AND job_id = ANY($2)', [seller.toLowerCase(), [...jobIds]])
    .catch((err: Error) => logger.warn({ seller, err: err.message }, 'seller judged clear failed'));
}

/// A changed request is judged again by everyone.
export function clearJudged(jobId: string): void {
  if (!pgEnabled) return;
  postgresExecutor()
    .query('DELETE FROM seller_judged_v1 WHERE job_id = $1', [jobId])
    .catch((err: Error) => logger.warn({ jobId, err: err.message }, 'seller judged clear failed'));
}
