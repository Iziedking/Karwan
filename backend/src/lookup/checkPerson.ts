import type { ReasonCode } from '../sealed/reasons.js';
import type { PublicPassport } from '../sealed/passport.js';
import type { Ladder } from '../verification/ladder.js';
import { vetAdvice, type VetAdvice } from './advice.js';

/// A lookup answers with the public record (D30: name, tag, tier, fixed
/// reasons) and the agent's plain advice. The score, counts, amounts and the
/// wallet address stay inside Karwan.

export interface CheckPersonDeps {
  resolve: (raw: string) => Promise<{ address: string; via: 'tag' | 'telegram' } | null>;
  passport: (address: string) => Promise<PublicPassport>;
  level: (address: string) => Promise<Ladder>;
}

export type CheckPersonResult =
  | { found: true; name: string; tag: string | null; tier: PublicPassport['tier']; reasons: ReasonCode[]; advice: VetAdvice }
  | { found: false; next: string };

export async function checkPerson(handle: string, deps: CheckPersonDeps): Promise<CheckPersonResult> {
  const who = await deps.resolve(handle);
  if (!who) return { found: false, next: 'Offer to send them a deal link.' };
  const [passport, level] = await Promise.all([deps.passport(who.address), deps.level(who.address)]);
  return {
    found: true,
    name: passport.displayName ?? (passport.tag ? `@${passport.tag}` : 'A Karwan member'),
    tag: passport.tag ? `@${passport.tag}` : null,
    tier: passport.tier,
    reasons: passport.reasons,
    advice: vetAdvice({ tier: passport.tier, level }),
  };
}
