/// A buyer chose a seller from the shortlist (view 75). Nothing is funded until
/// the seller says yes, unless they told their agent it may agree for them and
/// the price is inside their limits. Pure: the rules and the hold, no I/O.

export type AgentMode = 'offers' | 'ask' | 'agree';

export interface ChoiceHold {
  jobId: string;
  sellerAgent: string;
  sellerUser: string;
  buyerUser: string;
  /// The price the buyer chose at.
  priceUsdc: string;
  chosenAt: number;
  /// The seller's answer is wanted by this moment; after it the choice lapses.
  answerBy: number;
  /// The seller asked for more: the buyer approves this price or declines.
  raisedPriceUsdc?: string;
  raisedAt?: number;
  /// The seller said no. Kept until the time is up so the same choice is not
  /// put to them twice.
  declinedAt?: number;
}

export type ChoiceState = 'waiting' | 'raised' | 'declined' | 'expired';

/// A day to answer, or until the request's own date if that is sooner.
export const ANSWER_WINDOW_MS = 24 * 60 * 60_000;

/// Whether the seller has to be asked. Only "Agree for me", with the agent on
/// and the price at or above their lowest, lets the agent say yes alone.
export function sellerMustAnswer(seller: { mode: AgentMode; agentOn: boolean; lowestUsdc: number | null }, priceUsdc: number): boolean {
  if (!seller.agentOn || seller.mode !== 'agree') return true;
  if (!(priceUsdc > 0)) return true;
  return seller.lowestUsdc !== null && priceUsdc < seller.lowestUsdc;
}

export function answerBy(now: number, requestDeadlineUnix: number | null | undefined): number {
  const day = now + ANSWER_WINDOW_MS;
  const due = requestDeadlineUnix ? requestDeadlineUnix * 1000 : null;
  return due !== null && due > now && due < day ? due : day;
}

export function newHold(input: { jobId: string; sellerAgent: string; sellerUser: string; buyerUser: string; priceUsdc: string; now: number; requestDeadlineUnix?: number | null }): ChoiceHold {
  return {
    jobId: input.jobId.toLowerCase(),
    sellerAgent: input.sellerAgent.toLowerCase(),
    sellerUser: input.sellerUser.toLowerCase(),
    buyerUser: input.buyerUser.toLowerCase(),
    priceUsdc: input.priceUsdc,
    chosenAt: input.now,
    answerBy: answerBy(input.now, input.requestDeadlineUnix),
  };
}

export function choiceState(hold: ChoiceHold, now: number): ChoiceState {
  if (now >= hold.answerBy) return 'expired';
  if (hold.declinedAt) return 'declined';
  return hold.raisedPriceUsdc ? 'raised' : 'waiting';
}

export function decline(hold: ChoiceHold, now: number): ChoiceHold {
  return { ...hold, declinedAt: now };
}

/// The same seller at the same price keeps the time already running; a new
/// seller or a new price starts again.
export function sameChoice(hold: ChoiceHold | null, sellerAgent: string, priceUsdc: string): boolean {
  return !!hold && hold.sellerAgent === sellerAgent.toLowerCase() && Number(hold.priceUsdc) === Number(priceUsdc);
}

export type RaiseRefusal = 'NOT_WAITING' | 'NOT_HIGHER' | 'EXPIRED';

/// The seller asks for more: once, and for more than the price chosen.
export function raise(hold: ChoiceHold, priceUsdc: number, now: number): { ok: true; hold: ChoiceHold } | { ok: false; code: RaiseRefusal } {
  const state = choiceState(hold, now);
  if (state === 'expired') return { ok: false, code: 'EXPIRED' };
  if (state !== 'waiting') return { ok: false, code: 'NOT_WAITING' };
  if (!Number.isFinite(priceUsdc) || priceUsdc <= Number(hold.priceUsdc)) return { ok: false, code: 'NOT_HIGHER' };
  return { ok: true, hold: { ...hold, raisedPriceUsdc: priceUsdc.toFixed(2), raisedAt: now } };
}

/// Who a caller is on this choice.
export function roleOn(hold: ChoiceHold | null, caller: string): 'buyer' | 'seller' | null {
  const me = caller.toLowerCase();
  if (!hold) return null;
  return hold.sellerUser === me ? 'seller' : hold.buyerUser === me ? 'buyer' : null;
}

/// What either side reads about the choice. The seller never reads who else
/// offered; the buyer never reads the seller's limits.
export function choiceView(hold: ChoiceHold | null, now: number) {
  if (!hold) return null;
  const state = choiceState(hold, now);
  if (state === 'expired') return null;
  return {
    sellerAgent: hold.sellerAgent,
    priceUsdc: hold.priceUsdc,
    state,
    answerBy: hold.answerBy,
    ...(hold.raisedPriceUsdc ? { raisedPriceUsdc: hold.raisedPriceUsdc } : {}),
  };
}
