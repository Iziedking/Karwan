import type { ListingSeller } from './sellerSummary.js';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/// Who posted each request on the market (view 44, Market Sell), as a name,
/// tag, rating and country; never the address. One read per person; when
/// people cannot be read, the requests still list, with no name.
export async function attachPosters<T extends { jobId: string }>(
  rows: T[],
  postedByOf: (jobId: string) => string | undefined,
  summaries: (addresses: string[]) => Promise<Map<string, ListingSeller | null>>,
): Promise<Array<T & { poster: ListingSeller | null }>> {
  const byJob = new Map<string, string>();
  for (const row of rows) {
    const address = postedByOf(row.jobId);
    if (address && ADDRESS.test(address)) byJob.set(row.jobId, address.toLowerCase());
  }
  const people = await summaries([...new Set(byJob.values())]).catch(() => new Map<string, ListingSeller | null>());
  return rows.map((row) => {
    const address = byJob.get(row.jobId);
    return { ...row, poster: (address && people.get(address)) || null };
  });
}
