import type { PublicPassport } from '../sealed/passport.js';
import type { PublicRating } from '../ratings/rules.js';

/// Who sells an offer, as the market card shows them (view 44): a name or tag,
/// the verified mark, the public rating and the country. Never an address.
export interface ListingSeller {
  name: string | null;
  tag: string | null;
  verified: boolean;
  rating: PublicRating;
  country: string | null;
}

export interface SellerSummaryDeps {
  passport(address: string): Promise<PublicPassport>;
  level(address: string): Promise<string>;
}

function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/// One read per seller, in parallel. A seller who fails or is slow comes back
/// as null, so the market still lists their offers.
export async function sellerSummaries(
  addresses: string[],
  deps: SellerSummaryDeps,
  timeoutMs = 1500,
): Promise<Map<string, ListingSeller | null>> {
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];
  const out = new Map<string, ListingSeller | null>();
  await Promise.all(
    unique.map(async (address) => {
      try {
        const [passport, level] = await within(Promise.all([deps.passport(address), deps.level(address)]), timeoutMs);
        out.set(address, {
          name: passport.displayName?.trim() || null,
          tag: passport.tag ?? null,
          verified: level !== 'registered',
          rating: passport.rating,
          country: passport.country ?? null,
        });
      } catch {
        out.set(address, null);
      }
    }),
  );
  return out;
}

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; value: ListingSeller | null }>();

/// The live read: the cached passport and record level, kept for a minute so
/// the market list stays fast. A failed read is not cached.
export async function liveSellerSummaries(addresses: string[]): Promise<Map<string, ListingSeller | null>> {
  const now = Date.now();
  const out = new Map<string, ListingSeller | null>();
  const missing: string[] = [];
  for (const address of new Set(addresses.map((a) => a.toLowerCase()))) {
    const hit = cache.get(address);
    if (hit && now - hit.at < CACHE_MS) out.set(address, hit.value);
    else missing.push(address);
  }
  if (missing.length) {
    const [{ loadPublicPassport }, { recordDeps }] = await Promise.all([
      import('../sealed/passportLoader.js'),
      import('../verification/recordLive.js'),
    ]);
    const read = await sellerSummaries(missing, { passport: loadPublicPassport, level: recordDeps.level });
    for (const [address, value] of read) {
      out.set(address, value);
      if (value) cache.set(address, { at: now, value });
    }
  }
  return out;
}
