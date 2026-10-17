/// Where people are and where they deliver, used by agents to match them.
/// Only the country is ever shown to anyone else; city, area and reach stay
/// inside Karwan's matching.

export type DeliveryKind = 'goods' | 'in_person' | 'remote';

export interface PrivateLocation {
  /// ISO 3166-1 alpha-2, upper case.
  country: string | null;
  city: string | null;
  area: string | null;
  /// What the person answered when their agent asked "do you ship there?".
  reach: Record<string, { ships: boolean; days: number | null; answeredAt: number }>;
}

export interface Where {
  scope: 'near' | 'country' | 'anywhere';
  country?: string;
}

const TEXT_MAX = 80;
const RE_ASK_MS = 30 * 24 * 60 * 60 * 1000;

const tidy = (v: string | undefined) => {
  const t = (v ?? '').trim().slice(0, TEXT_MAX);
  return t || null;
};
const same = (a: string | null, b: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export function normalizeLocation(input: { country?: string; city?: string; area?: string }): Pick<PrivateLocation, 'country' | 'city' | 'area'> {
  const country = (input.country ?? '').trim().toUpperCase();
  return { country: /^[A-Z]{2}$/.test(country) ? country : null, city: tidy(input.city), area: tidy(input.area) };
}

/// Old rows carry no kind: an offer is never gated, a goods request is goods.
export function kindOf(row: { deliveryKind?: DeliveryKind; tradeType?: string }): DeliveryKind {
  if (row.deliveryKind) return row.deliveryKind;
  return row.tradeType === 'goods' ? 'goods' : 'remote';
}

/// 4 same area, 3 same city, 2 same country, 1 ships there (or no preference),
/// 0 no fit. Remote work and "anywhere" give everyone 1, so they never reorder.
export function locationFit(
  where: Where | undefined,
  buyer: PrivateLocation | null,
  seller: PrivateLocation | null,
  kind: DeliveryKind | undefined,
): 0 | 1 | 2 | 3 | 4 {
  if (!where || where.scope === 'anywhere' || kind === 'remote') return 1;
  if (!seller?.country) return 0;
  if (where.scope === 'country') {
    const wanted = where.country?.toUpperCase() ?? null;
    if (!wanted) return 1;
    if (seller.country === wanted) return 2;
    return seller.reach[wanted]?.ships ? 1 : 0;
  }
  if (!buyer?.country) return 1;
  if (seller.country === buyer.country) {
    if (same(seller.city, buyer.city)) return same(seller.area, buyer.area) ? 4 : 3;
    return 2;
  }
  return seller.reach[buyer.country]?.ships ? 1 : 0;
}

export function servesCountry(seller: PrivateLocation | null, buyerCountry: string | null, kind: DeliveryKind | undefined): 'yes' | 'no' | 'unknown' {
  if (kind === 'remote' || !buyerCountry) return 'yes';
  if (seller?.country === buyerCountry) return 'yes';
  const answer = seller?.reach[buyerCountry];
  if (!answer) return 'unknown';
  return answer.ships ? 'yes' : 'no';
}

export function needsDeliveryQuestion(seller: PrivateLocation | null, buyerCountry: string, now: number): boolean {
  if (seller?.country === buyerCountry) return false;
  const answer = seller?.reach[buyerCountry];
  if (!answer) return true;
  return !answer.ships && now - answer.answeredAt > RE_ASK_MS;
}

export function publicLocation(l: PrivateLocation | null | undefined): { country: string | null } {
  return { country: l?.country ?? null };
}

const REGION_NAMES = new Intl.DisplayNames(['en'], { type: 'region' });
/// Groupings Intl names that are not places a person lives.
const NOT_COUNTRIES = new Set(['EU', 'EZ', 'UN', 'QO', 'ZZ']);

/// Lower case, accents dropped, anything but letters turned into spaces, so a
/// name and what someone typed are compared the same way.
const fold = (t: string) =>
  ` ${t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}]+/gu, ' ').trim()} `;

const ALIASES: Array<[string, string]> = [
  ['uk', 'GB'], ['great britain', 'GB'], ['england', 'GB'],
  ['usa', 'US'], ['america', 'US'], ['united states of america', 'US'],
  ['ivory coast', 'CI'], ['dr congo', 'CD'], ['drc', 'CD'], ['democratic republic of the congo', 'CD'],
  ['uae', 'AE'],
];

const COUNTRY_BY_NAME: Array<[string, string]> = (() => {
  const out: Array<[string, string]> = ALIASES.map(([name, code]) => [fold(name), code]);
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      if (NOT_COUNTRIES.has(code)) continue;
      let name: string | undefined;
      try {
        name = REGION_NAMES.of(code);
      } catch {
        name = undefined;
      }
      if (name && name !== code) out.push([fold(name), code]);
    }
  }
  // Longest first, so "Niger" never wins over "Nigeria".
  return out.sort((x, y) => y[0].length - x[0].length);
})();
const KNOWN_CODES = new Set(COUNTRY_BY_NAME.map(([, code]) => code));

/// Reads a country from plain words ("Lagos, Nigeria", "Ghana", "KE"), with the
/// city when it comes before a comma. A two-letter code counts only when typed
/// in capitals, so "no" or "me" are never read as Norway or Montenegro.
export function parsePlace(text: string): { country: string | null; city: string | null } {
  const raw = text.trim();
  if (/^[A-Z]{2}$/.test(raw) && KNOWN_CODES.has(raw) && raw !== 'NO') return { country: raw, city: null };
  const folded = fold(raw);
  const hit = COUNTRY_BY_NAME.find(([name]) => folded.includes(name));
  if (!hit) return { country: null, city: null };
  const first = raw.includes(',') ? raw.split(',')[0]!.trim() : '';
  const city = first && fold(first) !== hit[0] ? first.slice(0, 80) : null;
  return { country: hit[1], city };
}
