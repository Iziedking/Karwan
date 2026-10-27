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
export function suggestionEvent(s: {
  sellerUser: string;
  jobId: string;
  priceUsdc: string;
  title: string;
  /// A request that fits but sits outside the seller's range (view 35): what is
  /// outside it, so the notice can say so. Absent for "Ask me first".
  range?: { outOfRange: import('./outOfRange.js').OutOfRange; budgetUsdc: string; limit: number; days: number };
}): Omit<KarwanEvent, 'ts'> {
  return {
    type: 'agent.suggestion',
    actor: 'seller',
    payload: {
      sellerUser: s.sellerUser.toLowerCase(),
      jobId: s.jobId.toLowerCase(),
      priceUsdc: s.priceUsdc,
      title: s.title,
      ...(s.range ? { ...s.range } : {}),
    },
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

/// "Ask me first" makes no paid market read: the suggestion prices on what is
/// already cached, and the owner decides the real price.
export function paysForResearch(mode: AgentMode): boolean {
  return mode !== 'ask';
}

/// The durable record that this owner was told about this request, so a
/// request older than the event ring is still suggested only once.
export function suggestionKey(sellerUser: string, jobId: string): string {
  return `${sellerUser.toLowerCase()}|${jobId.toLowerCase()}`;
}
