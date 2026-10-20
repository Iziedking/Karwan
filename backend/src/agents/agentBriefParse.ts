/// Reads a usual price and delivery time from however a person says it, for
/// the setup conversation (view 19). Rules first, no model: a price is money,
/// and an answer that cannot be read is null so the agent asks, never guesses.

export interface PriceRange {
  min: number;
  max: number;
}

export interface Pace {
  minDays: number;
  maxDays: number;
}

const DIGITS: Array<[number, number]> = [
  [0x0660, 0x0669], // Arabic-Indic
  [0x06f0, 0x06f9], // Eastern Arabic-Indic
  [0x0966, 0x096f], // Devanagari
];

function asciiDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹०-९]/g, (ch) => {
    const code = ch.charCodeAt(0);
    const block = DIGITS.find(([lo, hi]) => code >= lo && code <= hi)!;
    return String(code - block[0]);
  });
}

/// Another currency named means the number is not USDC.
const OTHER_CURRENCY = /₦|\bngn\b|naira|\bn\s?\d|cedi|\bghs\b|shilling|\bksh\b|\bkes\b|€|£|euro|pound|rupee|₹/;
const RANGE = '(?:-|to|إلى|à|hadi|से)';
const NUM = '(\\d+(?:\\.\\d+)?)';

function normalise(text: string): string {
  return asciiDigits(text.toLowerCase())
    .replace(/[–—]/g, '-')
    .replace(/(\d),(?=\d{3}\b)/g, '$1');
}

function takePace(text: string): { pace: Pace | null; rest: string } {
  const rules: Array<[RegExp, (m: RegExpMatchArray) => Pace]> = [
    [/same\s*day/, () => ({ minDays: 1, maxDays: 1 })],
    [new RegExp(`${NUM}\\s*${RANGE}\\s*${NUM}\\s*days?`), (m) => ({ minDays: Number(m[1]), maxDays: Number(m[2]) })],
    [new RegExp(`${NUM}\\s*days?`), (m) => ({ minDays: Number(m[1]), maxDays: Number(m[1]) })],
    [/\b(?:a|one|1)\s*week/, () => ({ minDays: 7, maxDays: 7 })],
    [new RegExp(`${NUM}\\s*weeks?`), (m) => ({ minDays: 7 * Number(m[1]), maxDays: 7 * Number(m[1]) })],
    [/\b(?:a|one|1)\s*month/, () => ({ minDays: 30, maxDays: 30 })],
    [new RegExp(`${NUM}\\s*months?`), (m) => ({ minDays: 30 * Number(m[1]), maxDays: 30 * Number(m[1]) })],
  ];
  for (const [rule, read] of rules) {
    const m = text.match(rule);
    if (!m) continue;
    const pace = read(m);
    return {
      pace: { minDays: Math.min(pace.minDays, pace.maxDays), maxDays: Math.max(pace.minDays, pace.maxDays) },
      rest: text.replace(m[0], ' '),
    };
  }
  return { pace: null, rest: text };
}

function takePrice(text: string): PriceRange | null {
  if (OTHER_CURRENCY.test(text)) return null;
  const t = text.replace(/\$|usdc|usd|dollars?/g, ' ');
  const ordered = (a: number, b: number): PriceRange => ({ min: Math.min(a, b), max: Math.max(a, b) });
  let m = t.match(new RegExp(`up\\s*to\\s*${NUM}`));
  if (m) return { min: 0, max: Number(m[1]) };
  m = t.match(new RegExp(`${NUM}\\s*${RANGE}\\s*${NUM}`));
  if (m) return ordered(Number(m[1]), Number(m[2]));
  m = t.match(new RegExp(`(?:about|around|roughly|approx\\w*|~)\\s*${NUM}`));
  if (m) {
    const n = Number(m[1]);
    return { min: Math.round(n * 0.8), max: Math.round(n * 1.2) };
  }
  m = t.match(new RegExp(NUM));
  if (m) return { min: Number(m[1]), max: Number(m[1]) };
  return null;
}

export function parseBriefPrice(text: string): { price: PriceRange | null; pace: Pace | null } {
  const { pace, rest } = takePace(normalise(text ?? ''));
  return { price: takePrice(rest), pace };
}
