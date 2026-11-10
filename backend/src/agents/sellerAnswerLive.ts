import { config } from '../config.js';
import { deleteRecord, getRecord, listRecords, putRecord } from '../db/evidence.js';
import { agentPrefsOf, getProfile } from '../db/profiles.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import { resolveSellerProfile } from './agent-registry.js';
import { choiceState, newHold, sameChoice, sellerMustAnswer, type ChoiceHold } from './sellerAnswer.js';

/// The buyer's choice while it waits on the seller (view 75): one per request.

const KIND = 'choice-hold' as const;
const SWEEP_MS = 5 * 60_000;

export type ChoiceNews = 'waiting' | 'raised' | 'declined' | 'expired' | 'cancelled' | 'accepted';

export const getChoice = (jobId: string) => getRecord<ChoiceHold>(KIND, jobId.toLowerCase());
export const putChoice = (hold: ChoiceHold) => putRecord(KIND, hold.jobId, hold);
export const deleteChoice = (jobId: string) => deleteRecord(KIND, jobId.toLowerCase());

/// Tells whoever has to know. The event names both people so each channel can
/// pick the one the news is for; it is never shown to anyone else.
export function publishChoice(hold: ChoiceHold, state: ChoiceNews): void {
  bus.emitEvent({
    type: 'request.chosen',
    jobId: hold.jobId,
    actor: 'platform',
    payload: {
      buyer: hold.buyerUser,
      seller: hold.sellerUser,
      sellerAgent: hold.sellerAgent,
      priceUsdc: hold.priceUsdc,
      ...(hold.raisedPriceUsdc ? { raisedPriceUsdc: hold.raisedPriceUsdc } : {}),
      answerBy: hold.answerBy,
      state,
    },
  });
}

/// Run when the buyer chooses. Says whether the choice has to wait for the
/// seller, and keeps the hold if it does.
export async function sellerAnswerStep(input: {
  jobId: string;
  sellerAgent: string;
  priceUsdc: string;
  buyerUser: string;
  requestDeadlineUnix?: number | null;
  now?: number;
}): Promise<{ wait: false } | { wait: true; hold: ChoiceHold; declined: boolean }> {
  if (!config.SELLER_ASKED) return { wait: false };
  const now = input.now ?? Date.now();
  // A seller agent nobody owns is stopped earlier, by the shortlist rules.
  const seller = await resolveSellerProfile(input.sellerAgent).catch(() => null);
  if (!seller) return { wait: false };
  const profile = await getProfile(seller.userAddress).catch(() => null);
  const prefs = agentPrefsOf(profile);
  const asked = sellerMustAnswer(
    { mode: prefs.agentMode, agentOn: prefs.agentOn !== false, lowestUsdc: Number.isFinite(seller.minBudgetUsdc) ? seller.minBudgetUsdc : null },
    Number(input.priceUsdc),
  );
  const prev = await getChoice(input.jobId);
  if (!asked) {
    if (prev) await deleteChoice(input.jobId);
    return { wait: false };
  }
  if (prev && sameChoice(prev, input.sellerAgent, input.priceUsdc)) {
    const state = choiceState(prev, now);
    if (state === 'declined') return { wait: true, hold: prev, declined: true };
    if (state !== 'expired') return { wait: true, hold: prev, declined: false };
  }
  if (prev && !sameChoice(prev, input.sellerAgent, input.priceUsdc) && choiceState(prev, now) !== 'expired' && choiceState(prev, now) !== 'declined') {
    publishChoice(prev, 'cancelled');
  }
  const hold = newHold({
    jobId: input.jobId,
    sellerAgent: input.sellerAgent,
    sellerUser: seller.userAddress,
    buyerUser: input.buyerUser,
    priceUsdc: input.priceUsdc,
    now,
    requestDeadlineUnix: input.requestDeadlineUnix,
  });
  await putChoice(hold);
  publishChoice(hold, 'waiting');
  return { wait: true, hold, declined: false };
}

/// Choices this seller still has to answer.
export async function choicesWaitingOnSeller(sellerUser: string, now = Date.now()): Promise<ChoiceHold[]> {
  const me = sellerUser.toLowerCase();
  const all = await listRecords<ChoiceHold>(KIND);
  return all.map((r) => r.data).filter((h) => h.sellerUser === me && choiceState(h, now) === 'waiting');
}

/// Choices past their time lapse: the request is open again and both are told.
export async function sweepChoices(now = Date.now()): Promise<number> {
  const all = await listRecords<ChoiceHold>(KIND);
  let lapsed = 0;
  for (const { data } of all) {
    const state = choiceState(data, now);
    if (state !== 'expired') continue;
    await deleteChoice(data.jobId);
    if (!data.declinedAt) {
      publishChoice(data, 'expired');
      lapsed += 1;
    }
  }
  return lapsed;
}

export function startChoiceSweeper(): () => void {
  const timer = setInterval(() => {
    void sweepChoices().catch((err) => logger.warn({ err: (err as Error).message }, 'choice sweep failed'));
  }, SWEEP_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
