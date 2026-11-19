/// Splits the one line a seller types at setup (view 39, 19 Nov), such as
/// "Logo and brand design, ₦30,000 to ₦60,000, 3 days", into what they sell
/// and the rest, which holds the price and how fast. The price itself is read
/// later by the setup reader, as when it was asked on its own.

const UNIT = String.raw`(?:usdc|usd|ngn|naira|dollars?|cedis?|ghs|kes|shillings?)`;
const NUM = String.raw`[₦$€£]?\s?\d[\d,.]*\s*(?:k|m)?(?:\s*${UNIT})?`;
/// Where money starts: a currency mark, a range, a unit, or "about 20".
const MONEY = new RegExp(
  String.raw`(?:about|around|from|up to|under|between)\s+[₦$€£]?\s?\d|[₦$€£]\s?\d|\d[\d,.]*\s*(?:k|m)?\s*(?:to|-|–)\s*[₦$€£]?\s?\d|\d[\d,.]*\s*(?:k|m)?\s*${UNIT}\b|\b\d[\d,.]*k\b`,
  'i',
);
/// The money phrase itself, when the line starts with it.
const LEADING = new RegExp(String.raw`^(?:(?:about|around|from|up to|under|between)\s+)?${NUM}(?:\s*(?:to|-|–|and)\s*${NUM})?`, 'i');

const tidy = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s,;:-]+|[\s,;:-]+$/g, '');

export function splitSellLine(line: string): { what: string; price: string | null } {
  const text = tidy(line);
  const parts = text.split(',');
  const at = parts.findIndex((p) => MONEY.test(p));
  if (at > 0) {
    return { what: tidy(parts.slice(0, at).join(',')), price: tidy(parts.slice(at).join(',')) };
  }
  const found = text.search(MONEY);
  if (found < 0) return { what: text, price: null };
  if (found === 0) {
    const lead = LEADING.exec(text)?.[0] ?? '';
    const rest = tidy(text.slice(lead.length));
    if (lead && rest) return { what: rest, price: tidy(lead) };
    return { what: text, price: null };
  }
  return { what: tidy(text.slice(0, found)), price: tidy(text.slice(found)) };
}
