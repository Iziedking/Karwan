/// Links typed one per line into a statement: trimmed, http(s) only, five at most.
export function linksFrom(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^https?:\/\/\S+$/i.test(l))
    .slice(0, 5);
}

export function splitShares(sellerBps: number): { seller: number; buyer: number } {
  const seller = Math.round(Math.min(10_000, Math.max(0, sellerBps)) / 100);
  return { seller, buyer: 100 - seller };
}

type NoteKey = 'silentSeller' | 'silentBuyer' | 'bothSilent' | 'unavailable' | 'inconclusive';

/// The plain-words note for a proposal the model did not make, or could not settle.
export function proposalNote(p: { rule?: string; confidence: 'clear' | 'inconclusive' }): NoteKey | null {
  if (p.rule === 'silent-seller') return 'silentSeller';
  if (p.rule === 'silent-buyer') return 'silentBuyer';
  if (p.rule === 'both-silent') return 'bothSilent';
  if (p.rule === 'judge-unavailable') return 'unavailable';
  return p.confidence === 'inconclusive' ? 'inconclusive' : null;
}
