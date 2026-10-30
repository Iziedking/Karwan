/// Someone asking to be paid outside Karwan's escrow (view 32). The message
/// still goes through; both sides are warned and the team is told. Never a
/// refusal, so a near miss costs a warning, not a lost message.

const PHRASES: RegExp[] = [
  /\bpay (?:me |you )?direct(?:ly)?\b/,
  /\bsend (?:it |am |the money |money )?direct(?:ly)?\b/,
  /\b(?:send|transfer|pay)\b[^.?!]{0,30}\bto my (?:account|bank|wallet|opay|palmpay|moniepoint|kuda)\b/,
  /\bno need (?:for|of) (?:the )?escrow\b/,
  /\b(?:pay|paying|deal|do (?:it|this)|trade)\b[^.?!]{0,20}\b(?:outside|off) (?:of )?(?:karwan|the app|escrow|the platform)\b/,
  /\bpay (?:me )?before (?:i|you) (?:send|ship|deliver)\b/,
  /\baccount (?:number|no\b)/,
];

const MOBILE_MONEY = /\b(?:opay|palmpay|moniepoint|kuda)\b/;
const MONEY_WORD = /\b(?:pay|paying|send|transfer|money)\b/;
const BANK_WORD = /\b(?:bank|gtbank|zenith|access|uba|first ?bank|opay|palmpay|moniepoint|kuda|account|transfer)\b/;
const NUBAN = /\b\d{10}\b/;
const CRYPTO_ADDRESS = /\b0x[0-9a-f]{40}\b/;
const CRYPTO_PAY = /\b(?:send|pay|transfer|usdc|usdt)\b/;

export function asksToPayOutside(text: string): boolean {
  const t = text.toLowerCase();
  if (PHRASES.some((p) => p.test(t))) return true;
  if (MOBILE_MONEY.test(t) && MONEY_WORD.test(t)) return true;
  if (NUBAN.test(t) && BANK_WORD.test(t)) return true;
  return CRYPTO_ADDRESS.test(t) && CRYPTO_PAY.test(t);
}
