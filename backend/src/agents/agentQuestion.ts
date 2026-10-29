import { bus } from '../events.js';
import { getBrief } from '../db/briefs.js';
import { answerQuestion, openFor, putQuestion, type AgentQuestion, type QuestionAnswer, type QuestionKind, type QuestionSide } from '../db/agentQuestions.js';

/// Asking the person instead of going quiet (view 41). The question is stored
/// (one open per person and request), the person is told on every channel
/// through the `agent.suggestion` event the bell, email and Telegram already
/// read, and the other side hears only that someone is checking: no price,
/// limit or name.

export interface AskInput {
  owner: string;
  side: QuestionSide;
  jobId: string;
  kind: QuestionKind;
  title: string;
  budgetUsdc: string;
  dueDays: number;
  limit: number | null;
  suggested: { priceUsdc: string; days: number };
  /// The other party's person, told that someone is checking.
  counterpartUser?: string | null;
  /// For a counter: the price the other side offered.
  theirPriceUsdc?: string;
  /// False when the person was already told through their own card (the
  /// buyer's near match): stored and shown, but no second notice.
  notify?: boolean;
}

export async function askOwner(input: AskInput, now = Date.now()): Promise<AgentQuestion> {
  const q = await putQuestion({
    owner: input.owner,
    side: input.side,
    jobId: input.jobId,
    kind: input.kind,
    title: input.title,
    facts: {
      budgetUsdc: input.budgetUsdc,
      dueDays: input.dueDays,
      limit: input.limit,
      ...(input.theirPriceUsdc ? { theirPriceUsdc: input.theirPriceUsdc } : {}),
    },
    suggested: input.suggested,
    mandateVersion: 1,
    now,
  });
  const owner = input.owner.toLowerCase();
  if (input.notify !== false) bus.emitEvent({
    type: 'agent.suggestion',
    actor: input.side,
    payload: {
      ...(input.side === 'seller' ? { sellerUser: owner } : { buyerUser: owner }),
      jobId: input.jobId.toLowerCase(),
      questionId: q.id,
      kind: q.kind,
      title: input.title,
      budgetUsdc: input.budgetUsdc,
      dueDays: input.dueDays,
      limit: input.limit,
      priceUsdc: input.suggested.priceUsdc,
      days: input.suggested.days,
      ...(input.theirPriceUsdc ? { theirPriceUsdc: input.theirPriceUsdc } : {}),
    },
  });
  if (input.counterpartUser) {
    bus.emitEvent({
      type: 'agent.question.waiting',
      actor: input.side,
      payload: { [input.side === 'seller' ? 'buyerUser' : 'sellerUser']: input.counterpartUser.toLowerCase(), jobId: input.jobId.toLowerCase(), checking: input.side },
    });
  }
  return q;
}

/// The person answered: the question closes, and the other side's "checking"
/// line clears.
export async function closeQuestion(q: AgentQuestion, answer: QuestionAnswer, counterpartUser: string | null, now = Date.now()): Promise<AgentQuestion | null> {
  const done = await answerQuestion(q.id, q.owner, answer, now);
  if (done && counterpartUser) {
    bus.emitEvent({
      type: 'agent.question.waiting',
      actor: q.side,
      payload: { [q.side === 'seller' ? 'buyerUser' : 'sellerUser']: counterpartUser.toLowerCase(), jobId: q.jobId, checking: null },
    });
  }
  return done;
}

/// The buyer's near match was answered (taken, passed or replaced): its
/// question closes and the seller's "checking" line clears.
export async function closeBuyerQuestion(buyerUser: string, jobId: string, choice: 'yes' | 'no', sellerUser: string | null): Promise<void> {
  const q = await openFor(buyerUser.toLowerCase(), jobId.toLowerCase());
  if (!q || q.kind !== 'price-above-cap') return;
  await closeQuestion(q, { choice }, sellerUser);
}

/// A seller who sends their own offer has answered their agent's question.
export async function closeQuestionOnOffer(sellerUser: string, jobId: string, priceUsdc: string): Promise<void> {
  const q = await openFor(sellerUser.toLowerCase(), jobId.toLowerCase());
  if (!q) return;
  const choice = q.suggested.priceUsdc !== undefined && Number(q.suggested.priceUsdc) === Number(priceUsdc) ? 'yes' : 'change';
  await closeQuestion(q, { choice, priceUsdc }, getBrief(jobId)?.postedBy ?? null);
}

const dayWord = (d: number) => `${d} ${d === 1 ? 'day' : 'days'}`;

/// The sentence the email, Telegram and the bell share, from the event payload.
export function questionLine(p: Record<string, unknown> | undefined): string | null {
  const kind = p?.kind as QuestionKind | undefined;
  if (!kind) return null;
  const price = String(p?.priceUsdc ?? '');
  const budget = String(p?.budgetUsdc ?? '');
  const limit = p?.limit;
  const days = Number(p?.days);
  const due = Number(p?.dueDays);
  const their = String(p?.theirPriceUsdc ?? '');
  switch (kind) {
    case 'no-way':
      return `The budget is ${budget} USDC. You have not told your agent how you sell this yet. Offer ${price} USDC, ready in ${dayWord(days)}?`;
    case 'price-below-floor':
      return `The budget is ${budget} USDC, under your lowest of ${limit} USDC. Offer ${price} USDC?`;
    case 'price-above-usual':
      return `The budget is ${budget} USDC, above your usual ${limit} USDC. Offer ${price} USDC?`;
    case 'time':
      return `It is due in ${dayWord(due)}; you usually take ${dayWord(Number(limit))}. Offer ${price} USDC in ${dayWord(days)}?`;
    case 'ask-first':
      return `Your agent would offer ${price} USDC, ready in ${dayWord(days)}. Send it?`;
    case 'counter-below-floor':
    case 'last-price-passed':
      return `The buyer offers ${their} USDC. Your lowest is ${limit} USDC. Take ${their} USDC or hold at ${price} USDC?`;
    case 'price-above-cap':
      return `A seller asks ${their} USDC, above the ${limit} USDC you allowed. Pay ${price} USDC?`;
    default:
      return null;
  }
}
