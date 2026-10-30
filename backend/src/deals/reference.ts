/// A deal's short reference (view 42): the first eight characters of its job
/// id, in capitals and two groups, e.g. D68F-E7D8. Made from the id, never
/// stored, and resolved only among the deals of the person asking.

const FULL_ID = /^0x[0-9a-f]{64}$/i;

export function dealReference(jobId: string): string | null {
  if (!FULL_ID.test(jobId)) return null;
  const body = jobId.slice(2, 10).toUpperCase();
  return `${body.slice(0, 4)}-${body.slice(4)}`;
}

/// The eight lowercase characters of a written reference, or null when the
/// text is not one. A full id is not a reference; it is used as it is.
export function readDealReference(text: string): string | null {
  const t = text.trim().replace(/^deal\s+/i, '').replace(/^#/, '').replace(/^0x/i, '');
  const m = /^([0-9a-f]{4})[\s-]?([0-9a-f]{4})$/i.exec(t);
  return m ? `${m[1]}${m[2]}`.toLowerCase() : null;
}

export type ResolvedReference = { jobId: string } | { ambiguous: string[] } | { missing: true };

export function resolveDealReference(text: string, jobIds: string[]): ResolvedReference {
  const body = readDealReference(text);
  if (!body) return { missing: true };
  const found = [...new Set(jobIds.filter((id) => FULL_ID.test(id) && id.slice(2, 10).toLowerCase() === body))];
  if (found.length === 1) return { jobId: found[0]! };
  return found.length ? { ambiguous: found } : { missing: true };
}
