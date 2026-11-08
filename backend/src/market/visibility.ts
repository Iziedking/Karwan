/// Who can see a request or an offer for sale (views 53 and 72). Every check
/// asks whether something is public, never whether it is one kind of private,
/// so a new kind can't fall through to the market.
///
/// - market (or nothing said): anyone, signed in or not.
/// - agents: never on the market; seller agents match it; the buyer and the
///   sellers who offered on it read it.
/// - invited: a find (view 72). Only the buyer and the people asked read it,
///   and only their agents match it.

export type Visibility = 'market' | 'agents' | 'invited';

const low = (address: string) => address.toLowerCase();

export function isPublic(x: { visibility?: Visibility }): boolean {
  return x.visibility === undefined || x.visibility === 'market';
}

/// Whether `reader` may read a request that is not public. `offered` is true
/// when they already offered on it, by hand or through their agent.
export function canReadPrivate(
  x: { visibility?: Visibility; buyer: string; invited?: readonly string[] },
  reader: string | null,
  opts: { offered?: boolean } = {},
): boolean {
  if (!reader) return false;
  const r = low(reader);
  if (r === low(x.buyer)) return true;
  if (x.visibility === 'invited') return (x.invited ?? []).some((a) => low(a) === r);
  return !!opts.offered;
}

/// Whether a seller's agent may consider a request at all.
export function sellerAgentMaySee(x: { visibility?: Visibility; invited?: readonly string[] }, sellerUser: string): boolean {
  if (x.visibility !== 'invited') return true;
  const s = low(sellerUser);
  return (x.invited ?? []).some((a) => low(a) === s);
}
