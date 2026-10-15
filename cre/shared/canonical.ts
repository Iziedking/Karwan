import { keccak256, toBytes, type Hex } from 'viem';

/// One text form per value: keys sorted at every level, no whitespace. The
/// backend, every workflow and anyone checking a fingerprint later get the
/// same bytes, so a document can be matched to the hash written on Arc.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('CANONICAL_NUMBER');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, v]) => {
      if (v === undefined) throw new Error('CANONICAL_UNDEFINED');
      return `${JSON.stringify(key)}:${canonicalJson(v)}`;
    }).join(',')}}`;
  }
  throw new Error('CANONICAL_TYPE');
}

export function fingerprint(value: unknown): Hex {
  return keccak256(toBytes(canonicalJson(value)));
}
