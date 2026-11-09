import type { Where } from '../location/rules.js';
import { buildPostRequestConfirm, confirmNonce, type ConfirmActionBase, type PostRequestConfirm } from './actions.js';

/// Confirm cards for being reached and blocking (view 72). Each payload is the
/// body the page sends. Being found rides the settings card (beFound, meet,
/// contactFrom, reachable).

export interface NeedPayload {
  id?: string;
  what: string;
  every: 'once' | 'week' | 'month' | 'season';
  budgetUsdc: number | null;
  kind: 'goods' | 'in_person' | 'remote';
  paused?: boolean;
}

export interface SaveStandingNeedConfirm extends ConfirmActionBase {
  intent: 'save_standing_need';
  payload: NeedPayload;
}
export interface RemoveStandingNeedConfirm extends ConfirmActionBase {
  intent: 'remove_standing_need';
  payload: { id: string };
}
export interface BlockPersonConfirm extends ConfirmActionBase {
  intent: 'block_person' | 'unblock_person';
  payload: { who: string };
}

export interface PitchBuyersConfirm extends ConfirmActionBase {
  intent: 'pitch_buyers';
  payload: { findId: string; picks: number[]; priceUsdc: string; days: number; note: string };
}

export type FindStepConfirm = SaveStandingNeedConfirm | RemoveStandingNeedConfirm | BlockPersonConfirm | PitchBuyersConfirm;

export const EVERY_WORDS: Record<NeedPayload['every'], string> = { once: 'Once', week: 'Every week', month: 'Every month', season: 'Each season' };
export const REACHES_WORDS: Record<NeedPayload['kind'], string> = { goods: 'Delivered', in_person: 'At my place', remote: 'Online' };

/// `budget` is the figure as the person reads it (their currency), for the card.
export function buildSaveStandingNeedConfirm(i: { need: NeedPayload; budget: string | null; changing: boolean; reachable: boolean }): SaveStandingNeedConfirm | { error: string } {
  const what = i.need.what.trim();
  if (what.length < 3) return { error: 'Say what they need in a few words.' };
  const fields = [
    { label: 'What you need', value: what },
    { label: 'How often', value: EVERY_WORDS[i.need.every] },
    ...(i.budget ? [{ label: 'Rough budget each time', value: i.budget }] : []),
    { label: 'How it reaches you', value: REACHES_WORDS[i.need.kind] },
    ...(i.need.paused !== undefined ? [{ label: 'Offers on it', value: i.need.paused ? 'Paused' : 'On' }] : []),
  ];
  return {
    kind: 'confirm',
    id: `save_standing_need:${i.need.id ?? 'new'}:${confirmNonce()}`,
    intent: 'save_standing_need',
    title: i.changing ? 'Change this need' : 'Add a need',
    summary: i.reachable
      ? 'Sellers near you who fit can offer for it. Nothing is paid until you say yes.'
      : 'Saved for when you turn on Let sellers reach me. Until then nobody is told.',
    fields,
    payload: { ...i.need, what },
    confirmLabel: i.changing ? 'Save' : 'Add need',
    cancelLabel: 'Cancel',
  };
}

export function buildRemoveStandingNeedConfirm(i: { id: string; what: string }): RemoveStandingNeedConfirm {
  return {
    kind: 'confirm',
    id: `remove_standing_need:${i.id}:${confirmNonce()}`,
    intent: 'remove_standing_need',
    title: 'Remove this need',
    summary: 'Sellers stop offering for it.',
    fields: [{ label: 'Need', value: i.what }],
    payload: { id: i.id },
    confirmLabel: 'Remove',
    cancelLabel: 'Keep it',
  };
}

export function buildBlockPersonConfirm(i: { who: string; tag: string; block: boolean }): BlockPersonConfirm {
  return {
    kind: 'confirm',
    id: `${i.block ? 'block' : 'unblock'}_person:${i.who.toLowerCase()}:${confirmNonce()}`,
    intent: i.block ? 'block_person' : 'unblock_person',
    title: i.block ? `Block @${i.tag}` : `Unblock @${i.tag}`,
    summary: i.block
      ? 'Neither of you gets deal alerts or pitches from the other, and they are left out of your finds. They are not told.'
      : 'You can reach each other again through finds.',
    fields: [{ label: 'Person', value: `@${i.tag}` }],
    payload: { who: i.who.toLowerCase() },
    confirmLabel: i.block ? 'Block' : 'Unblock',
    cancelLabel: 'Cancel',
  };
}

/// Posting privately from a find and telling the people picked (view 72,
/// Phase 3). It is the request card, private to those people, with the find
/// on it so the server reads who they are; nothing is paid until the buyer
/// picks an offer and locks the money.
export function buildAlertPeopleConfirm(i: {
  caller: string;
  find: { id: string; need: string; budgetUsdc: string; kind: 'goods' | 'in_person' | 'remote'; where: Where; endsAt: number };
  picks: number[];
  names: string[];
  budget: string;
  now: number;
}): PostRequestConfirm | { error: string } {
  const n = i.names.length;
  if (n < 1 || n > 3) return { error: 'Pick one to three people from the list.' };
  const deadlineDays = Math.min(90, Math.max(1, Math.round((i.find.endsAt - i.now) / 86_400_000)));
  const base = buildPostRequestConfirm({ caller: i.caller, brief: i.find.need, budgetUsdc: Number(i.find.budgetUsdc), deadlineDays, deliveryKind: i.find.kind, where: i.find.where });
  if ('error' in base) return base;
  const people = n === 1 ? '1 person' : `${n} people`;
  return {
    ...base,
    id: `post_request:find:${i.find.id}:${confirmNonce()}`,
    title: `Post privately and tell ${people}`,
    fields: [
      { label: 'You need', value: i.find.need.length > 140 ? `${i.find.need.slice(0, 137)}…` : i.find.need },
      { label: 'Budget', value: i.budget },
      { label: 'Asked', value: i.names.join(', ') },
      { label: 'Who can see it', value: 'Only you and the people asked. Never on the market.' },
      { label: 'They see', value: 'How far you are, not where' },
    ],
    payload: { ...base.payload, find: { id: i.find.id, picks: [...new Set(i.picks)] } },
    confirmLabel: `Send to ${people}`,
    cancelLabel: 'Not now',
  };
}

/// A seller offering to help buyers who let sellers reach them (view 72,
/// Phase 4). Each buyer is told once and reminded once; nothing is paid, and
/// the buyer who says interested still picks the offer and locks the money.
export function buildPitchBuyersConfirm(i: {
  findId: string;
  picks: number[];
  needs: string[];
  priceUsdc: string;
  price: string;
  days: number;
  note: string;
}): PitchBuyersConfirm | { error: string } {
  const n = i.needs.length;
  if (n < 1 || n > 5) return { error: 'Pick one to five needs from the list.' };
  if (!(Number(i.priceUsdc) > 0)) return { error: 'Say the price for it.' };
  const buyers = n === 1 ? '1 buyer' : `${n} buyers`;
  return {
    kind: 'confirm',
    id: `pitch_buyers:${i.findId}:${confirmNonce()}`,
    intent: 'pitch_buyers',
    title: `Offer to help ${buyers}`,
    summary: 'Each buyer gets one message from your agent and one reminder the next morning. Nothing is paid until they say yes and lock the money.',
    fields: [
      { label: 'They need', value: i.needs.map((w) => (w.length > 80 ? `${w.slice(0, 77)}…` : w)).join('; ') },
      { label: 'Your price', value: i.price },
      { label: 'Ready in', value: i.days === 1 ? '1 day' : `${i.days} days` },
      ...(i.note ? [{ label: 'Your note', value: i.note }] : []),
      { label: 'They see', value: 'Your name, rating and how far you are, not where' },
    ],
    payload: { findId: i.findId, picks: [...new Set(i.picks)], priceUsdc: i.priceUsdc, days: i.days, note: i.note },
    confirmLabel: `Send to ${buyers}`,
    cancelLabel: 'Not now',
  };
}

/// A buyer interested in a pitch: the request card, private to that seller,
/// with the pitch on it so the server places the seller's offer. Posting pays
/// nothing; the money moves only as on any request.
export function buildPitchInterestedConfirm(i: {
  caller: string;
  pitchId: string;
  what: string;
  kind: 'goods' | 'in_person' | 'remote';
  priceUsdc: string;
  days: number;
  sellerName: string;
  price: string;
}): PostRequestConfirm | { error: string } {
  const deadlineDays = Math.min(90, i.days + 3);
  const base = buildPostRequestConfirm({ caller: i.caller, brief: i.what, budgetUsdc: Number(i.priceUsdc), deadlineDays, deliveryKind: i.kind });
  if ('error' in base) return base;
  return {
    ...base,
    id: `post_request:pitch:${i.pitchId}:${confirmNonce()}`,
    title: `Ask ${i.sellerName} for it`,
    summary: `Posts it privately to ${i.sellerName} with their offer on it. ${base.summary ?? ''}`.trim(),
    fields: [
      { label: 'You need', value: i.what.length > 140 ? `${i.what.slice(0, 137)}…` : i.what },
      { label: 'Their offer', value: `${i.price}, ready in ${i.days === 1 ? '1 day' : `${i.days} days`}` },
      { label: 'Who can see it', value: `Only you and ${i.sellerName}. Never on the market.` },
    ],
    payload: { ...base.payload, pitch: { id: i.pitchId } },
    confirmLabel: 'Post privately',
    cancelLabel: 'Not now',
  };
}
