/// Does the host in a submitted link actually exist?
///
/// The syntactic scan in localScan.ts checks the SHAPE of a URL: embedded
/// credentials, raw-IP hosts, punycode homographs, throwaway TLDs. None of that
/// asks whether the domain is real, so `https://not-a-real-company-xyz.com`
/// passed every check purely by carrying the scheme. A seller could satisfy the
/// delivery requirement with an invented address.
///
/// DNS is the cheap authority here: an invented domain has no records. This is
/// not a reachability or content check, and deliberately so. A site can be real
/// and briefly down, and we should not fail a delivery for that.
import { promises as dns } from 'node:dns';

/// Resolution is stable for the life of a request and slow enough to be worth
/// not repeating within one proof (sellers paste the same host several times).
/// Short TTL because a domain registered mid-deal should start passing.
const TTL_MS = 5 * 60_000;
const cache = new Map<string, { ok: boolean; at: number }>();

export async function hostResolves(host: string): Promise<boolean> {
  const key = host.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ok;

  let ok = false;
  try {
    // Any record type will do; we only care that the name exists. A domain with
    // MX but no A still exists, so fall back rather than trusting one lookup.
    const addrs = await dns.resolve(key).catch(() => null);
    if (addrs && addrs.length > 0) ok = true;
    else {
      const any = await dns.resolve6(key).catch(() => null);
      ok = Boolean(any && any.length > 0);
    }
  } catch {
    ok = false;
  }
  cache.set(key, { ok, at: Date.now() });
  return ok;
}

/// Hosts from the given list that do not resolve. Empty means every host is
/// real. Lookups run in parallel; a DNS outage degrades to "cannot prove it is
/// fake", which returns empty rather than failing an honest delivery.
export async function unresolvableHosts(hosts: string[]): Promise<string[]> {
  const unique = [...new Set(hosts.map((h) => h.toLowerCase()))].filter(Boolean);
  if (unique.length === 0) return [];
  const results = await Promise.all(
    unique.map(async (h) => ({ host: h, ok: await hostResolves(h) })),
  );
  return results.filter((r) => !r.ok).map((r) => r.host);
}
