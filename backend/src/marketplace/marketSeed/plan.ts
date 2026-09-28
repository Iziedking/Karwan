import { createHash } from 'node:crypto';
import {
  ACCOUNT_GROUPS,
  LOCAL_DELIVERY,
  ONSITE_CITIES,
  SERVICE_MARKETS,
  SHIPPING_DESTINATIONS,
  SPECIALTIES,
  type Market,
  type Specialty,
} from './catalog.js';

export const SEED_PREFIX = 'mk1-';
const REQUESTS_PER_ACCOUNT = 50;

export interface SeedOffer {
  kind: 'offer';
  seedKey: string;
  account: number;
  specialty: string;
  title: string;
  description: string;
  askingPriceUsdc: number;
}

export interface SeedRequest {
  kind: 'request';
  seedKey: string;
  account: number;
  specialty: string;
  brief: string;
  budgetUsdc: number;
  deadlineDays: number;
}

export interface AccountPlan {
  account: number;
  email: string;
  specialties: readonly string[];
  offers: SeedOffer[];
  requests: SeedRequest[];
}

/// A short, stable tag for an account so seed keys never carry the email.
export function accountKey(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 8);
}

function price(amount: number): number {
  return amount < 50 ? Math.max(1, Math.round(amount)) : Math.round(amount / 5) * 5;
}

function specialty(id: string): Specialty {
  const found = SPECIALTIES.find((s) => s.id === id);
  if (!found) throw new Error(`unknown specialty ${id}`);
  return found;
}

/// Three versions of each offer: three client markets for remote work, three
/// cities for on-site work, or Lagos plus two shipping destinations for goods.
function variantsFor(s: Specialty, specialtyIndex: number, offerIndex: number, onsite: boolean): Array<{ market: Market; title: (t: string) => string }> {
  if (s.lane === 'goods') {
    const ship = [0, 1].map((j) => SHIPPING_DESTINATIONS[(specialtyIndex * 3 + offerIndex * 2 + j) % SHIPPING_DESTINATIONS.length]!);
    return [
      { market: LOCAL_DELIVERY, title: (t) => `${t}, Lagos delivery` },
      ...ship.map((market) => ({ market, title: (t: string) => `${t}, shipped to ${market.name}` })),
    ];
  }
  if (onsite) return ONSITE_CITIES.map((market) => ({ market, title: (t: string) => `${t} in ${market.name}` }));
  return [0, 1, 2].map((k) => {
    const market = SERVICE_MARKETS[(specialtyIndex * 5 + offerIndex * 3 + k) % SERVICE_MARKETS.length]!;
    return { market, title: (t: string) => `${t} for clients in ${market.name}` };
  });
}

function offersFor(account: number, key: string, ids: readonly string[]): SeedOffer[] {
  return ids.flatMap((id) => {
    const s = specialty(id);
    const specialtyIndex = SPECIALTIES.indexOf(s);
    return s.offers.flatMap(([title, description, base, onsite], o) =>
      variantsFor(s, specialtyIndex, o, !!onsite).map((v, n) => ({
        kind: 'offer' as const,
        seedKey: `${SEED_PREFIX}${key}-o-${id}-${o}-${n}`,
        account,
        specialty: id,
        title: v.title(title),
        description: `${description} ${v.market.detail}`,
        askingPriceUsdc: price(base * v.market.multiplier),
      })),
    );
  });
}

/// Requests come from the other accounts' specialties, taken round-robin so an
/// account asks for a spread of work, never for what it sells itself.
function requestsFor(account: number, key: string, own: readonly string[], context: string): SeedRequest[] {
  const pool = ACCOUNT_GROUPS.flatMap((g) => g.specialties).filter((id) => !own.includes(id)).map(specialty);
  const out: SeedRequest[] = [];
  for (let round = 0; out.length < REQUESTS_PER_ACCOUNT; round += 1) {
    for (const s of pool) {
      if (out.length >= REQUESTS_PER_ACCOUNT) break;
      const entry = s.requests[round % s.requests.length];
      if (!entry || round >= s.requests.length) continue;
      const [brief, budget, onsite] = entry;
      const n = out.length;
      const market = onsite ? 'Nigeria' : SERVICE_MARKETS[(account * 5 + n) % SERVICE_MARKETS.length]!.name;
      const drift = 1 + (((account * 7 + n) % 5) - 2) * 0.05;
      out.push({
        kind: 'request',
        seedKey: `${SEED_PREFIX}${key}-r-${s.id}-${round}`,
        account,
        specialty: s.id,
        brief: `${brief} ${context.replace('{market}', market)}`,
        budgetUsdc: price(budget * drift),
        deadlineDays: 21 + (n % 10),
      });
    }
    if (round > 10) throw new Error('not enough request templates for one account');
  }
  return out;
}

export function buildSeedPlan(emails: readonly string[]): AccountPlan[] {
  if (emails.length > ACCOUNT_GROUPS.length) {
    throw new Error(`at most ${ACCOUNT_GROUPS.length} accounts, one per specialty group`);
  }
  return emails.map((email, account) => {
    const group = ACCOUNT_GROUPS[account]!;
    const key = accountKey(email);
    return {
      account,
      email: email.trim().toLowerCase(),
      specialties: group.specialties,
      offers: offersFor(account, key, group.specialties),
      requests: requestsFor(account, key, group.specialties, group.context),
    };
  });
}

/// One item from each account in turn, offers and requests mixed, so the
/// market never shows a long run from a single seller.
export function interleave(plan: readonly AccountPlan[]): Array<SeedOffer | SeedRequest> {
  const queues = plan.map((a) => {
    const mixed: Array<SeedOffer | SeedRequest> = [];
    const every = Math.ceil(a.offers.length / Math.max(1, a.requests.length));
    let r = 0;
    a.offers.forEach((offer, i) => {
      mixed.push(offer);
      if ((i + 1) % every === 0 && r < a.requests.length) mixed.push(a.requests[r++]!);
    });
    while (r < a.requests.length) mixed.push(a.requests[r++]!);
    return mixed;
  });
  const out: Array<SeedOffer | SeedRequest> = [];
  for (let i = 0; queues.some((q) => i < q.length); i += 1) {
    for (const q of queues) if (i < q.length) out.push(q[i]!);
  }
  return out;
}
