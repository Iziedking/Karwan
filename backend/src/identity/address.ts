import { getAddress, isAddress } from 'viem';

/// One address, one key (view 48, rule 1). Agents and accounts arrive from the
/// chain checksummed, from events and the database lowercased, and from people
/// in any casing; compared as raw strings, one seller became two. Every key
/// goes through `canonicalAddress`. Something that is not an address (a test
/// name, an old record) is kept lowercased rather than thrown on.
export function canonicalAddress<K extends string>(raw: K): K {
  const s = raw.trim();
  return (isAddress(s, { strict: false }) ? getAddress(s) : s.toLowerCase()) as K;
}

export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && canonicalAddress(a) === canonicalAddress(b);
}

/// A Map whose keys are addresses: one entry per address whatever the casing.
export class AddressMap<K extends string, V> extends Map<K, V> {
  override get(key: K): V | undefined {
    return super.get(canonicalAddress(key));
  }
  override set(key: K, value: V): this {
    return super.set(canonicalAddress(key), value);
  }
  override has(key: K): boolean {
    return super.has(canonicalAddress(key));
  }
  override delete(key: K): boolean {
    return super.delete(canonicalAddress(key));
  }
}

/// A Set of addresses: one entry per address whatever the casing.
export class AddressSet<K extends string> extends Set<K> {
  override add(value: K): this {
    return super.add(canonicalAddress(value));
  }
  override has(value: K): boolean {
    return super.has(canonicalAddress(value));
  }
  override delete(value: K): boolean {
    return super.delete(canonicalAddress(value));
  }
}
