/// What the assistant may keep about a person between conversations
/// (architecture view 20). The note writer is asked to follow these rules;
/// this file enforces them whatever the model returns.

export interface MemoryNote {
  id: string;
  text: string;
  at: number;
}

export const MAX_NOTES = 50;
export const NOTE_MAX = 200;

const SECRET = /\b(?:password|passcode|pin|otp|seed\s*phrase|recovery\s*phrase|mnemonic|private\s*key|secret\s*key|api\s*key|cvv)\b/i;
const LONG_DIGITS = /(?:\d[\s-]?){8,}/;
const HEX_ADDRESS = /\b0x[0-9a-f]{16,}\b/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const DO_NOT_REMEMBER = /\b(?:do\s*n[o']t|do not|never)\s+(?:remember|save|store|keep|note)\b|\bkeep\s+(?:this|that|it)\s+private\b|\boff\s+the\s+record\b|\bforget\s+(?:i|what\s+i)\s+(?:said|told)\b/i;

export function safeNote(raw: string): string | null {
  const text = raw.replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX).trim();
  if (!text) return null;
  if (SECRET.test(text) || LONG_DIGITS.test(text) || HEX_ADDRESS.test(text) || EMAIL.test(text)) return null;
  return text;
}

export function saysDoNotRemember(userText: string): boolean {
  return DO_NOT_REMEMBER.test(userText);
}

/// `replace` names notes the new ones make stale. Oldest notes go first once
/// the account holds MAX_NOTES.
export function mergeNotes(
  existing: readonly MemoryNote[],
  change: { add: readonly string[]; replace: readonly string[] },
  now: number,
  newId: () => string,
): MemoryNote[] {
  const gone = new Set(change.replace);
  const kept = existing.filter((n) => !gone.has(n.id));
  const seen = new Set(kept.map((n) => n.text.toLowerCase()));
  for (const raw of change.add) {
    const text = safeNote(raw);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    kept.push({ id: newId(), text, at: now });
  }
  return kept.slice(-MAX_NOTES);
}
