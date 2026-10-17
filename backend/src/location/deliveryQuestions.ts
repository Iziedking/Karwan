import { tellAccount } from '../channels/sender.js';
import { getRecord, listRecords, putRecord } from '../db/evidence.js';
import { rememberInChat } from '../channels/chatHistory.js';
import { logger } from '../logger.js';
import { needsDeliveryQuestion, servesCountry, type DeliveryKind, type PrivateLocation, type Where } from './rules.js';

/// When a seller's agent finds buyers in a country the seller has not
/// answered for, it stays out of that deal and asks: "I found some customers
/// in Ghana. Do you ship there?" Questions wait in a queue and go out at most
/// once a day per seller, several countries in one message. A country is not
/// asked about again for 30 days, and a seller who cannot be reached in chat
/// is never held back by a question they would never see.

const DAY_MS = 24 * 60 * 60 * 1000;
const RE_ASK_MS = 30 * DAY_MS;
const SWEEP_MS = 60 * 60 * 1000;

export interface QuestionRecord {
  pending: string[];
  lastSentAt: number | null;
  /// When each country was last asked about.
  asked?: Record<string, number>;
  /// No chat reaches this seller, so questions cannot be asked.
  unreachable?: boolean;
}

/// Only requests that say where they want the work done are gated, and only
/// against sellers who said where they are.
export function reachGate(input: {
  kind: DeliveryKind;
  where: Where | undefined;
  seller: PrivateLocation | null;
  buyerCountry: string | null;
  now: number;
}): 'bid' | 'skip' | 'ask' {
  if (!input.where || input.where.scope === 'anywhere' || !input.seller?.country) return 'bid';
  const target = input.where.scope === 'country' ? (input.where.country?.toUpperCase() ?? null) : input.buyerCountry;
  const serves = servesCountry(input.seller, target, input.kind);
  if (serves === 'yes') return 'bid';
  if (serves === 'no') return target && needsDeliveryQuestion(input.seller, target, input.now) ? 'ask' : 'skip';
  return 'ask';
}

const names = new Intl.DisplayNames(['en'], { type: 'region' });
const countryName = (code: string) => names.of(code) ?? code;

export function deliveryQuestionText(countries: string[]): string {
  const list = countries.map(countryName);
  const joined = list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
  return `I found some customers in ${joined}. Do you ship there? Tell me which, and roughly how many days.`;
}

export interface DeliveryQuestionDeps {
  now: () => number;
  get: (seller: string) => Promise<QuestionRecord | null>;
  put: (seller: string, r: QuestionRecord) => Promise<void>;
  list: () => Promise<Array<{ key: string; data: QuestionRecord }>>;
}

const blank = (): QuestionRecord => ({ pending: [], lastSentAt: null, asked: {} });

export function createDeliveryQuestions(deps: DeliveryQuestionDeps) {
  async function queue(seller: string, country: string): Promise<void> {
    const key = seller.toLowerCase();
    const r = (await deps.get(key)) ?? blank();
    if (r.unreachable || r.pending.includes(country)) return;
    const askedAt = r.asked?.[country];
    if (askedAt !== undefined && deps.now() - askedAt < RE_ASK_MS) return;
    await deps.put(key, { ...r, pending: [...r.pending, country] });
  }

  async function due(): Promise<Array<{ seller: string; countries: string[] }>> {
    const now = deps.now();
    return (await deps.list())
      .filter(({ data }) => !data.unreachable && data.pending.length > 0 && (data.lastSentAt === null || now - data.lastSentAt > DAY_MS))
      .map(({ key, data }) => ({ seller: key, countries: data.pending }));
  }

  /// Marks only the countries that went out, so one queued meanwhile stays.
  async function sent(seller: string, countries: string[]): Promise<void> {
    const key = seller.toLowerCase();
    const r = (await deps.get(key)) ?? blank();
    const now = deps.now();
    const asked = { ...(r.asked ?? {}) };
    for (const c of countries) asked[c] = now;
    await deps.put(key, { ...r, pending: r.pending.filter((c) => !countries.includes(c)), lastSentAt: now, asked });
  }

  async function unreachable(seller: string): Promise<void> {
    const key = seller.toLowerCase();
    const r = (await deps.get(key)) ?? blank();
    await deps.put(key, { ...r, pending: [], unreachable: true });
  }

  async function isUnreachable(seller: string): Promise<boolean> {
    return (await deps.get(seller.toLowerCase()))?.unreachable === true;
  }

  return { queue, due, sent, unreachable, isUnreachable };
}

export type DeliveryQuestions = ReturnType<typeof createDeliveryQuestions>;

/// Sends each seller's waiting questions in one message. A seller no chat
/// reaches is marked so their agent bids without asking; one failed send
/// never stops the rest.
export async function runDeliverySweep(
  q: DeliveryQuestions,
  tell: (seller: string, text: string) => Promise<boolean>,
  remember: (seller: string, text: string) => Promise<void>,
): Promise<void> {
  for (const { seller, countries } of await q.due()) {
    try {
      const text = deliveryQuestionText(countries);
      if (!(await tell(seller, text))) {
        await q.unreachable(seller);
        continue;
      }
      await remember(seller, text);
      await q.sent(seller, countries);
    } catch (err) {
      logger.warn({ seller, err: (err as Error).message }, 'delivery question not sent');
    }
  }
}

export const deliveryQuestions = createDeliveryQuestions({
  now: Date.now,
  get: (seller) => getRecord<QuestionRecord>('delivery-q', seller),
  put: (seller, r) => putRecord('delivery-q', seller, r),
  list: () => listRecords<QuestionRecord>('delivery-q'),
});

export function startDeliveryQuestionSweep(): () => void {
  const run = () =>
    runDeliverySweep(deliveryQuestions, (seller, text) => tellAccount(seller, { kind: 'text', body: text }), rememberInChat).catch((err) =>
      logger.warn({ err: (err as Error).message }, 'delivery question sweep failed'),
    );
  const timer = setInterval(() => void run(), SWEEP_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
