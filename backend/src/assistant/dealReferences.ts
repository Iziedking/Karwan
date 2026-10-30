import { readDealReference, resolveDealReference } from '../deals/reference.js';

/// Lets every assistant tool take a deal reference (D68F-E7D8) wherever it asks
/// for a jobId (view 42). The reference is swapped for the full id among the
/// person's own deals before the tool runs, so each tool keeps its party check.
/// The person's ids are read at most once per turn, and only when needed.
export function withDealReferences<T extends Record<string, object>>(tools: T, ownJobIds: () => Promise<string[]>): T {
  let ids: Promise<string[]> | null = null;
  const wrapped: Record<string, object> = {};
  for (const [name, t] of Object.entries(tools)) {
    const run = (t as { execute?: (args: unknown, ...rest: unknown[]) => unknown }).execute;
    if (typeof run !== 'function') {
      wrapped[name] = t;
      continue;
    }
    wrapped[name] = {
      ...t,
      execute: async (args: unknown, ...rest: unknown[]) => {
        const jobId = (args as { jobId?: unknown } | null)?.jobId;
        const body = typeof jobId === 'string' ? readDealReference(jobId) : null;
        if (!body) return run(args, ...rest);
        ids ??= ownJobIds();
        const found = resolveDealReference(body, await ids);
        const written = `${body.slice(0, 4)}-${body.slice(4)}`.toUpperCase();
        if ('jobId' in found) return run({ ...(args as object), jobId: found.jobId }, ...rest);
        if ('ambiguous' in found) {
          return { error: `Two deals of theirs share the reference ${written}: ${found.ambiguous.join(' and ')}. Ask which one, by amount or the other person.` };
        }
        return { error: `None of their deals has the reference ${written}. Call list_my_deals and check the reference with them.` };
      },
    };
  }
  return wrapped as T;
}
