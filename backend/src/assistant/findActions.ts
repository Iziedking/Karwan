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

export type FindStepConfirm = SaveStandingNeedConfirm | RemoveStandingNeedConfirm | BlockPersonConfirm;

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
