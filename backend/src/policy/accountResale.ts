/// Karwan does not host the buying, selling or renting of accounts, logins or
/// credentials on other platforms. It breaks those platforms' terms and is a
/// common fraud and identity-theft pattern. Work done FOR someone's own
/// account (setup, management, recovery, accounting) is ordinary service and
/// is not caught here.

export const ACCOUNT_RESALE_MESSAGE =
  'Karwan does not allow buying, selling or renting accounts, logins or credentials. Describe the work or goods instead.';

const OBJECT = String.raw`(?:accounts?|logins?|credentials|profiles?|handles?)`;
const RESALE = String.raw`(?:sell|sells|selling|sold|buy|buys|buying|bought|purchase|purchasing|rent|rents|renting|lease|leasing|trade|trading|resell|reselling)`;
const ACCOUNT_KIND = String.raw`(?:verified|aged|old|kyc'?d?|kyc-verified|unbanned|ready[- ]?made|established|premium|approved|activated|bulk)`;

const PATTERNS: RegExp[] = [
  // "sell my outlier account", "who sells upwork accounts", "buy 10 aged facebook accounts"
  new RegExp(String.raw`\b${RESALE}\s+(?:(?:an?|my|your|his|her|their|the|\d+)\s+)?(?:[\w.'-]+\s+){0,3}${OBJECT}\b`, 'i'),
  // "verified binance account", "aged twitter accounts"
  new RegExp(String.raw`\b${ACCOUNT_KIND}\s+(?:[\w.'-]+\s+){0,2}${OBJECT}\b`, 'i'),
  // "account for sale", "logins for rent", "accounts available for purchase"
  new RegExp(String.raw`\b${OBJECT}\s+(?:\w+\s+){0,2}for\s+(?:sale|rent|purchase|lease)\b`, 'i'),
];

/// Ordinary services that mention accounts. Checked on the same stretch of
/// text, so "set up your Shopify account" passes while "sell my account" does
/// not.
const SERVICE = /\b(?:set\s*up|setup|create|creating|open|opening|manage|managing|management|manager|recover|recovering|recovery|secure|securing|audit|auditing|grow|growing|optimi[sz]e|verify\s+your|reconcile)\b[^.!?\n]{0,40}\b(?:accounts?|profiles?|logins?)\b/i;

export function isAccountResale(text: string | undefined | null): boolean {
  if (!text) return false;
  const t = text.replace(/\s+/g, ' ');
  if (!PATTERNS.some((p) => p.test(t))) return false;
  // A service phrase alone does not clear an explicit sale ("sell" or "for sale").
  const explicitSale = /\b(?:sell|sells|selling|for\s+(?:sale|rent)|resell)\b/i.test(t);
  return explicitSale || !SERVICE.test(t);
}
