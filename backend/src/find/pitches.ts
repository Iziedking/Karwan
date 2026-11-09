import type { UserLocale } from '../db/profiles.js';
import { tg } from '../i18n/telegram.js';
import type { DeliveryKind, DistanceLine } from '../location/rules.js';
import { distanceText } from './alerts.js';
import type { Contact, CreateResult, NewContact, PitchOffer } from './contacts.js';
import type { Find } from './finds.js';
import type { LimitReason } from './limits.js';

/// Pitches (view 72, Phase 4): a seller's agent offers to help a buyer who let
/// sellers reach them, for one of their standing needs, with a price and days.
/// Nothing is funded by a pitch. A buyer who says interested posts a private
/// request from the need, open only to that seller, and the pitch becomes the
/// seller's offer on it; the buyer then accepts it, or not, as any offer.

const DAY_SECONDS = 86_400;

/// How the buyer sees who pitched: a name, verified or not, and their rating.
export interface PitchSeller {
  name: string;
  verified: boolean;
  stars: number | null;
}

export interface PitchDeps {
  create(c: NewContact, now: number, firstDue: (sentAt: number) => Promise<number | null>): Promise<CreateResult>;
  firstDue(to: string): (sentAt: number) => Promise<number | null>;
  saveFind(f: Find): Promise<Find>;
  locale(person: string): Promise<UserLocale>;
  money(person: string, usdc: number): Promise<string>;
  seller(person: string): Promise<PitchSeller>;
  note(to: string, data: { heading: string; lines: string[]; pitchId: string }): void;
  newId(): string;
}

export type PitchRefusal = LimitReason | 'not_a_need';

export interface PitchOutcome {
  pitched: number;
  refused: Array<{ what: string; reason: PitchRefusal }>;
}

/// Arabic counts 1, 2, 3 to 10 and 11 up with different words.
const offerKey = (days: number) =>
  days === 1 ? 'pitch.offerOneDay' : days === 2 ? 'pitch.offerTwoDays' : days > 10 ? 'pitch.offerManyDays' : 'pitch.offer';

/// The pitch, or its one reminder, in the buyer's language and money.
export async function pitchNote(
  input: { to: string; what: string; kind: DeliveryKind; distance: DistanceLine; seller: PitchSeller; offer: PitchOffer; reminder: boolean },
  deps: Pick<PitchDeps, 'locale' | 'money'>,
): Promise<{ heading: string; lines: string[] }> {
  const locale = await deps.locale(input.to);
  const near = input.kind === 'in_person';
  const heading = tg(input.reminder ? (near ? 'pitch.reminderNear' : 'pitch.reminder') : near ? 'pitch.headingNear' : 'pitch.heading', locale);
  const price = await deps.money(input.to, Number(input.offer.priceUsdc));
  const vars = { name: input.seller.name, price, days: String(input.offer.days) };
  const record = [input.seller.verified ? tg('pitch.verified', locale) : null, input.seller.stars !== null ? tg('pitch.rated', locale, { stars: input.seller.stars.toFixed(1) }) : null].filter(Boolean).join(' · ');
  const lines = [
    `"${input.what}"`,
    tg(offerKey(input.offer.days), locale, vars),
    record || null,
    near ? distanceText(input.distance, locale) : null,
    input.offer.note ? `"${input.offer.note}"` : null,
    tg('pitch.open', locale),
  ].filter((l): l is string => !!l);
  return { heading, lines };
}

/// Pitches the needs picked from a seller's find, within the limits. A need
/// a limit stops is named back and its buyer is not told anything.
export async function pitchPicked(
  input: { find: Find; picks: number[]; offer: PitchOffer },
  now: number,
  deps: PitchDeps,
): Promise<PitchOutcome> {
  const out: PitchOutcome = { pitched: 0, refused: [] };
  const leads = input.find.leads ?? [];
  const seller = await deps.seller(input.find.owner);
  for (const i of [...new Set(input.picks)]) {
    const lead = leads[i];
    if (!lead) continue;
    if (lead.kind !== 'need') {
      out.refused.push({ what: lead.what, reason: 'not_a_need' });
      continue;
    }
    const made = await deps.create(
      { id: deps.newId(), findId: input.find.id, from: input.find.owner, to: lead.buyer, kind: 'pitch', needId: lead.ref, offer: input.offer },
      now,
      deps.firstDue(lead.buyer),
    );
    if (!made.ok) {
      out.refused.push({ what: lead.what, reason: made.reason });
      continue;
    }
    out.pitched += 1;
    const text = await pitchNote({ to: lead.buyer, what: lead.what, kind: lead.deliveryKind, distance: lead.distance, seller, offer: input.offer, reminder: false }, deps);
    deps.note(lead.buyer, { ...text, pitchId: made.contact.id });
  }
  if (out.pitched > 0) await deps.saveFind({ ...input.find, status: 'contacting' });
  return out;
}

/// The sweep's reminder of a pitch, the next morning.
export async function sendPitchDue(claimed: { contact: Contact; step: 'deliver' | 'remind' }, find: Find | null, deps: Pick<PitchDeps, 'locale' | 'money' | 'note' | 'seller'>): Promise<void> {
  const c = claimed.contact;
  if (c.kind !== 'pitch' || !c.offer) return;
  const lead = find?.leads?.find((l) => l.kind === 'need' && l.ref === c.needId);
  if (!lead) return;
  const text = await pitchNote({ to: c.to, what: lead.what, kind: lead.deliveryKind, distance: lead.distance, seller: await deps.seller(c.from), offer: c.offer, reminder: claimed.step === 'remind' }, deps);
  deps.note(c.to, { ...text, pitchId: c.id });
}

export interface PlaceDeps {
  /// The seller's own offer on the request, as a seller sends one by hand.
  offer(seller: string, jobId: string, input: { priceUsdc: string; deliverByUnix: number; note: string }): Promise<{ ok: boolean; code?: string }>;
  markOffered(id: string): Promise<boolean>;
  /// When the request closes to offers, in unix seconds, once the buyer agent tracks it.
  deadlineOf(jobId: string): number | null;
  /// Tells the seller the buyer said interested and the offer is on it.
  noteSeller(seller: string, jobId: string): Promise<void>;
}

/// Puts the pitch on the request the buyer posted from it, as the seller's
/// offer. Waits until the request is tracked; placed once.
export async function placePitchOffer(c: Contact, nowSec: number, deps: PlaceDeps): Promise<'placed' | 'waiting' | 'done' | 'failed'> {
  if (c.kind !== 'pitch' || !c.jobId || !c.offer || c.offered !== false) return 'done';
  const deadline = deps.deadlineOf(c.jobId);
  if (deadline === null) return 'waiting';
  const deliverByUnix = Math.min(deadline, nowSec + c.offer.days * DAY_SECONDS);
  const res = await deps.offer(c.from, c.jobId, { priceUsdc: c.offer.priceUsdc, deliverByUnix, note: c.offer.note });
  if (!res.ok) return 'failed';
  if (await deps.markOffered(c.id)) await deps.noteSeller(c.from, c.jobId);
  return 'placed';
}
