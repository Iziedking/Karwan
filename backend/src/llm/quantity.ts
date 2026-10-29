/// How many of a thing a request asks for, read from its words when it is
/// posted (view 41): "3 pairs of Clark shoes", "a dozen eggs", "200 T-shirts",
/// "2x phone cases". Rules first, no model: a count is a number followed by
/// what is counted, and a request that cannot be read for one is null, so the
/// whole amount is compared as before. The count is bounded; a wild number is
/// not a quantity. The buyer sees the reading on their card and can change
/// the request if it is wrong.

export interface Quantity {
  count: number;
  /// The word the person used, as written, lowercased: "pairs", "t-shirts". Null when only a count was said.
  unit: string | null;
}

export const MAX_QUANTITY = 100_000;

const WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100, thousand: 1000,
};
const NUMBER = '(\\d{1,6}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred|thousand)';
const WORD = '[a-z][a-z-]{1,24}';

/// Money, time and scope words that follow a number without counting items.
const NOT_UNITS = new Set([
  'usdc', 'usd', 'dollars', 'naira', 'ngn', 'cedis', 'shillings', 'euros', 'pounds', 'rupees',
  'days', 'weeks', 'hours', 'hrs', 'minutes', 'mins', 'months', 'years', 'seconds',
  'percent', 'times', 'pages', 'words', 'characters', 'revisions', 'rounds', 'versions', 'stages', 'parts',
  'bedrooms', 'bathrooms', 'floors', 'rooms', 'seats', 'people', 'persons', 'guests', 'kids', 'adults',
]);

const DIGITS: Array<[number, number]> = [
  [0x0660, 0x0669],
  [0x06f0, 0x06f9],
  [0x0966, 0x096f],
];

function normalise(text: string): string {
  return text
    .replace(/[٠-٩۰-۹०-९]/g, (ch) => {
      const code = ch.charCodeAt(0);
      const block = DIGITS.find(([lo, hi]) => code >= lo && code <= hi)!;
      return String(code - block[0]);
    })
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/(\d),(?=\d{3}\b)/g, '$1');
}

function numberOf(word: string): number {
  return /^\d/.test(word) ? Number(word) : (WORDS[word] ?? NaN);
}

function bounded(count: number, unit: string | null): Quantity | null {
  if (!Number.isInteger(count) || count < 1 || count > MAX_QUANTITY) return null;
  return { count, unit };
}

export function readQuantity(text: string): Quantity | null {
  const t = normalise(text);

  const dozen = t.match(new RegExp(`\\b(half a|a|an|${NUMBER.slice(1, -1)})\\s+dozen\\b(?:\\s+(?:of\\s+)?(${WORD}))?`));
  if (dozen) {
    const n = dozen[1] === 'half a' ? 6 : 12 * numberOf(dozen[1]!);
    return bounded(n, dozen[2] && !NOT_UNITS.has(dozen[2]) ? dozen[2] : null);
  }

  const times = t.match(new RegExp(`\\b(\\d{1,6})\\s*[x×]\\s*(${WORD}(?:\\s+${WORD})?)?`)) ?? t.match(/\b[x×]\s*(\d{1,6})\b/);
  if (times) {
    const unit = times[2] && !NOT_UNITS.has(times[2].split(' ').pop()!) ? times[2] : null;
    return bounded(Number(times[1]), unit);
  }

  // A number, at most one word between, then what is counted in the plural:
  // "3 pairs of shoes", "two owambe outfits", "200 t-shirts". "3 to 5 days"
  // and "100 usdc" fall out because the counted word is not an item.
  const counted = new RegExp(`\\b${NUMBER}\\s+(?:(${WORD})\\s+)?(${WORD}s)\\b`, 'g');
  for (const m of t.matchAll(counted)) {
    const unit = m[3]!;
    const between = m[2];
    if (NOT_UNITS.has(unit) || between === 'to' || between === 'or' || between === 'and') continue;
    const q = bounded(numberOf(m[1]!), unit);
    if (q) return q;
  }
  return null;
}

/// "3 pairs", "12 eggs", "2 items" for a card or a line.
export function quantityWords(q: Quantity): string {
  return q.unit ? `${q.count} ${q.unit}` : `${q.count} items`;
}

/// What each item comes to at a whole price, rounded the way a person says it.
export function perItemUsdc(totalUsdc: number, count: number): number {
  const each = totalUsdc / count;
  return each >= 10 ? Math.round(each) : Math.round(each * 100) / 100;
}
