/// Drops one seller from the judged sets of the named requests, so the next
/// match judges those requests again for them (view 52, re-plan). Job ids are
/// compared without case. Returns how many sets changed.
export function forgetSeller(judged: Map<string, Set<string>>, seller: string, jobIds: readonly string[]): number {
  const s = seller.toLowerCase();
  const wanted = new Set(jobIds.map((j) => j.toLowerCase()));
  let changed = 0;
  for (const [jobId, set] of judged) {
    if (wanted.has(jobId.toLowerCase()) && set.delete(s)) changed += 1;
  }
  return changed;
}
