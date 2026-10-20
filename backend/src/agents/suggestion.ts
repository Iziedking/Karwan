import type { KarwanEvent } from '../events.js';

/// "Ask me first" (view 19): where the selling agent would bid, it tells its
/// owner instead, once per request, and the owner decides on /jobs/{id}.

export type AgentMode = 'offers' | 'ask';

export function shouldSuggest(mode: AgentMode, alreadySuggestedHere: boolean): 'bid' | 'suggest' | 'skip' {
  if (mode !== 'ask') return 'bid';
  return alreadySuggestedHere ? 'skip' : 'suggest';
}

/// The request rides in the payload, never as the event's jobId: an event with
/// a jobId reaches whoever posted that request, and this one carries the
/// seller's own price. Only `sellerUser` is a party to it.
export function suggestionEvent(s: { sellerUser: string; jobId: string; priceUsdc: string; title: string }): Omit<KarwanEvent, 'ts'> {
  return {
    type: 'agent.suggestion',
    actor: 'seller',
    payload: { sellerUser: s.sellerUser.toLowerCase(), jobId: s.jobId.toLowerCase(), priceUsdc: s.priceUsdc, title: s.title },
  };
}

/// Whether this owner was already told about this request, read from the
/// event history so a restart does not tell them twice.
export function alreadySuggested(history: readonly KarwanEvent[], jobId: string, sellerUser: string): boolean {
  const job = jobId.toLowerCase();
  const owner = sellerUser.toLowerCase();
  return history.some((e) => {
    if (e.type !== 'agent.suggestion') return false;
    const p = e.payload as Record<string, unknown> | undefined;
    return String(p?.jobId ?? '').toLowerCase() === job && String(p?.sellerUser ?? '').toLowerCase() === owner;
  });
}
