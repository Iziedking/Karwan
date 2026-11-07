import { formatLocal, type DisplayCurrency } from '@/features/money/displayCurrency';
import { localiseFigures } from '@/features/money/moneyText';

/// Setup asks prices in the currency the person reads (owner, 7 Nov 2026): the
/// examples under a question and the agent's read-back say naira for someone
/// in Nigeria, and USDC only where no other currency applies or no fresh rate
/// exists. The server reads the answer the same way (agentBriefParse.ts).

const NUM = '(\\d+(?:,\\d{3})*(?:\\.\\d+)?)';
const SEP = '(\\s*(?:to|-|–|à|إلى|hadi|से)\\s*)';
/// "20 to 40 USDC" (and Swahili's "USDC 20 hadi 40"): both ends are prices.
const RANGE_TRAIL = new RegExp(`${NUM}${SEP}${NUM}[  ]?USDC`, 'g');
const RANGE_LEAD = new RegExp(`USDC[  ]?${NUM}${SEP}${NUM}`, 'g');

/// A round figure for an example: 29,431 naira reads as 30,000, 18.4 euros as 20.
export function roundExample(value: number): number {
  if (value < 10) return Math.max(1, Math.round(value));
  const digits = Math.floor(Math.log10(value)) + 1;
  const step = 5 * 10 ** (digits - 2);
  return Math.round(value / step) * step;
}

const number = (figure: string) => Number(figure.replace(/,/g, ''));

/// An example written in USDC, said in the person's currency with round figures.
export function localExample(text: string, currency: DisplayCurrency, rate: number | null, locale: string): string {
  if (currency === 'USDC' || !rate) return text;
  const say = (usdc: number) => formatLocal(roundExample(usdc * rate) / rate, currency, rate, locale) ?? `${usdc} USDC`;
  const pair = (_: string, a: string, sep: string, b: string) => `${say(number(a))}${sep}${say(number(b))}`;
  return localiseFigures(text.replace(RANGE_TRAIL, pair).replace(RANGE_LEAD, pair), say);
}
