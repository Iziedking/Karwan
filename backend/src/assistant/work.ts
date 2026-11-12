import { confirmNonce, type ConfirmActionBase } from './actions.js';
import { saidMoney, type Said } from './saidFigure.js';

/// The assistant's hourly work cards (view 32). Each shows every figure before
/// anything moves. Offering, paying for a week, approving or objecting to hours
/// and taking an offer back move the hirer's money, so on a chat channel they
/// are confirmed on Karwan; the worker's steps run in chat.

export interface WorkInputPayload {
  worker: string;
  kind: 'hourly' | 'monthly';
  rateUsdc: string;
  maxHours?: number;
  periods: number;
  /// Monthly only: sessions the month holds (view 76).
  sessions?: number;
  startsInDays?: number;
  title: string;
  brief: string;
  /// The quote behind a rate said in a local currency (view 77).
  quote?: string;
}

export interface WorkOfferConfirm extends ConfirmActionBase { intent: 'work_offer'; payload: WorkInputPayload }
export interface WorkStepConfirm extends ConfirmActionBase {
  intent: 'work_accept' | 'work_decline' | 'work_cancel' | 'work_notice' | 'work_fund';
  payload: { workId: string };
}
export interface WorkHoursConfirm extends ConfirmActionBase { intent: 'work_hours'; payload: { workId: string; minutes: number; note: string; k?: number; link?: string } }
export interface WorkFlagConfirm extends ConfirmActionBase { intent: 'work_flag'; payload: { workId: string; k: number; n: number; note: string } }
export interface WorkUnflagConfirm extends ConfirmActionBase { intent: 'work_unflag'; payload: { workId: string; k: number; n: number } }
export interface WorkApproveConfirm extends ConfirmActionBase { intent: 'work_approve'; payload: { workId: string; k: number } }
export interface WorkObjectConfirm extends ConfirmActionBase { intent: 'work_object'; payload: { workId: string; k: number; minutes: number; reason: string } }

export interface WorkRequestPayload {
  kind: 'hourly' | 'monthly';
  title: string;
  brief: string;
  maxRateUsdc: string;
  maxHours?: number;
  periods: number;
  sessions?: number;
  startsInDays?: number;
  quote?: string;
}
export interface WorkRequestPostConfirm extends ConfirmActionBase { intent: 'work_request_post'; payload: WorkRequestPayload }
export interface WorkRequestOfferConfirm extends ConfirmActionBase { intent: 'work_request_offer'; payload: { requestId: string; rateUsdc: string; note: string; quote?: string } }
export interface WorkRequestHireConfirm extends ConfirmActionBase { intent: 'work_request_hire'; payload: { requestId: string; offerId: string } }
export interface WorkRequestCloseConfirm extends ConfirmActionBase { intent: 'work_request_close'; payload: { requestId: string } }

export type WorkConfirm =
  | WorkOfferConfirm | WorkStepConfirm | WorkHoursConfirm | WorkFlagConfirm | WorkUnflagConfirm | WorkApproveConfirm | WorkObjectConfirm
  | WorkRequestPostConfirm | WorkRequestOfferConfirm | WorkRequestHireConfirm | WorkRequestCloseConfirm;

export interface WorkDraftCard {
  kind: 'hourly' | 'monthly';
  title: string;
  rateMicros: string;
  maxHours: number;
  periods: number;
  sessions?: number;
  startsAt: number;
  feeHalfMicros: string;
  totalMicros: string;
  mostMicros: string;
  note: string;
}

const usdc = (micros: string | number) => `${(Number(micros) / 1_000_000).toFixed(2)} USDC`;
const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const hours = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h && m ? `${h} h ${m} m` : h ? `${h} h` : `${m} m`;
};
const period = (kind: 'hourly' | 'monthly') => (kind === 'hourly' ? 'week' : 'month');
const countOf = (n: number, one: string) => (n === 1 ? `1 ${one}` : `${n} ${one}s`);
const sessionsOf = (n: number) => countOf(n, 'session');

/// With `said`, the card reads in the currency the rate was said in (view 77);
/// what is paid now keeps its exact USDC beside it, as money cards do (view 54).
export function buildWorkOfferConfirm(input: WorkInputPayload, card: WorkDraftCard, workerName: string, said?: Said | null): WorkOfferConfirm {
  const hourly = card.kind === 'hourly';
  const local = said ? saidMoney(said) : null;
  const money = (micros: string | number) => (local ? local(Number(micros) / 1_000_000) : usdc(micros));
  const payNow = local ? `${money(card.totalMicros)} · ${usdc(card.totalMicros)}` : usdc(card.totalMicros);
  return {
    kind: 'confirm',
    id: `work_offer:${confirmNonce()}`,
    intent: 'work_offer',
    title: `Hire ${workerName}: ${card.title}`,
    summary: `${hourly ? `${money(card.rateMicros)} an hour, up to ${countOf(card.maxHours, 'hour')} a week, for ${countOf(card.periods, 'week')}` : `${money(card.rateMicros)} a month${card.sessions ? ` for ${sessionsOf(card.sessions)}` : ''}, for ${countOf(card.periods, 'month')}`}, from ${day(card.startsAt)}. Your agent pays for the first ${period(card.kind)} now.`,
    warning: card.note,
    fields: [
      { label: hourly ? 'First week, the most it can bill' : 'First month', value: money(Number(card.totalMicros) - Number(card.feeHalfMicros)) },
      { label: 'Karwan fee', value: money(card.feeHalfMicros) },
      { label: 'You pay now', value: payNow },
      { label: card.periods === 1 ? `The most for the ${period(card.kind)}` : `The most for all ${card.periods} ${period(card.kind)}s`, value: money(card.mostMicros) },
    ],
    payload: input,
    confirmLabel: `Pay ${money(card.totalMicros)}`,
    cancelLabel: 'Not now',
  };
}

type WorkRow = { id: string; title: string; kind: 'hourly' | 'monthly'; sessions?: number };

export function buildWorkStepConfirm(step: WorkStepConfirm['intent'], w: WorkRow & { totalMicros?: string; k?: number }): WorkStepConfirm {
  const p = period(w.kind);
  const copy: Record<WorkStepConfirm['intent'], { title: string; summary: string; label: string; warning?: string }> = {
    work_accept: { title: `Accept ${w.title}`, summary: 'You agree to these exact terms. The first one is already paid in, and you log your hours as you work.', label: 'Accept' },
    work_decline: { title: `Say no to ${w.title}`, summary: 'The hirer is told and their money goes back to them.', label: 'Say no' },
    work_cancel: { title: `Take back ${w.title}`, summary: `They have not accepted yet, so the first ${p} comes back to you in full.`, label: 'Take it back' },
    work_notice: { title: `End ${w.title} with notice`, summary: `The current ${p} and one more still run; nothing after that.`, label: 'Give notice', warning: 'Notice cannot be taken back.' },
    work_fund: { title: `Pay for ${p} ${(w.k ?? 0) + 1} of ${w.title}`, summary: `Held until the ${p} is settled. Hours not worked come back to you.`, label: `Pay ${usdc(w.totalMicros ?? '0')}` },
  };
  const c = copy[step];
  return {
    kind: 'confirm',
    id: `${step}:${w.id}:${confirmNonce()}`,
    intent: step,
    title: c.title,
    summary: c.summary,
    ...(c.warning ? { warning: c.warning } : {}),
    fields: step === 'work_fund' ? [{ label: 'You pay now', value: usdc(w.totalMicros ?? '0') }] : [],
    payload: { workId: w.id },
    confirmLabel: c.label,
    cancelLabel: 'Not now',
  };
}

export function buildWorkHoursConfirm(w: WorkRow, i: { minutes: number; note: string; k?: number; link?: string }): WorkHoursConfirm {
  const monthly = w.kind === 'monthly';
  if (w.sessions) {
    return {
      kind: 'confirm',
      id: `work_hours:${w.id}:${confirmNonce()}`,
      intent: 'work_hours',
      title: `Record a session on ${w.title}`,
      summary: 'The hirer is told now. They review the month after it ends and pay for the sessions that happened; if they say nothing, you are paid then.',
      fields: [...(i.note ? [{ label: 'What was covered', value: i.note }] : []), ...(i.link ? [{ label: 'Link', value: i.link }] : [])],
      payload: { workId: w.id, minutes: 1, note: i.note, ...(i.k === undefined ? {} : { k: i.k }), ...(i.link ? { link: i.link } : {}) },
      confirmLabel: 'Record the session',
      cancelLabel: 'Not now',
    };
  }
  return {
    kind: 'confirm',
    id: `work_hours:${w.id}:${confirmNonce()}`,
    intent: 'work_hours',
    title: monthly ? `Claim this month of ${w.title}` : `Log ${hours(i.minutes)} on ${w.title}`,
    summary: 'The hirer reviews them after logging closes; if they say nothing, you are paid then.',
    fields: [...(monthly ? [] : [{ label: 'Hours', value: hours(i.minutes) }]), ...(i.note ? [{ label: 'Note', value: i.note }] : [])],
    payload: { workId: w.id, minutes: monthly ? 1 : i.minutes, note: i.note, ...(i.k === undefined ? {} : { k: i.k }) },
    confirmLabel: monthly ? 'Claim the month' : 'Log the hours',
    cancelLabel: 'Not now',
  };
}

export function buildWorkApproveConfirm(w: WorkRow, i: { k: number; minutes: number; netMicros: string }): WorkApproveConfirm {
  return {
    kind: 'confirm',
    id: `work_approve:${w.id}:${i.k}:${confirmNonce()}`,
    intent: 'work_approve',
    title: `Approve ${w.kind === 'hourly' ? hours(i.minutes) : w.sessions ? `${sessionsOf(i.minutes)} of month ${i.k + 1}` : `month ${i.k + 1}`} on ${w.title}`,
    summary: 'They are paid now.',
    warning: 'Once paid this cannot be undone.',
    fields: [{ label: 'They receive', value: usdc(i.netMicros) }],
    payload: { workId: w.id, k: i.k },
    confirmLabel: 'Approve and pay',
    cancelLabel: 'Not now',
  };
}

export function buildWorkUnflagConfirm(w: WorkRow, i: { k: number; n: number }): WorkUnflagConfirm {
  return {
    kind: 'confirm',
    id: `work_unflag:${w.id}:${i.k}:${i.n}:${confirmNonce()}`,
    intent: 'work_unflag',
    title: `Take back your note on session ${i.n} of ${w.title}`,
    summary: 'The session counts as held again, and they are told. No money moves now.',
    fields: [{ label: 'Session', value: `${i.n} of month ${i.k + 1}` }],
    payload: { workId: w.id, k: i.k, n: i.n },
    confirmLabel: 'Take it back',
    cancelLabel: 'Not now',
  };
}

export function buildWorkFlagConfirm(w: WorkRow, i: { k: number; n: number; note: string }): WorkFlagConfirm {
  return {
    kind: 'confirm',
    id: `work_flag:${w.id}:${i.k}:${i.n}:${confirmNonce()}`,
    intent: 'work_flag',
    title: `Say session ${i.n} on ${w.title} did not happen`,
    summary: 'It is kept as a note for when you review the month. No money moves now, and they are told.',
    fields: [{ label: 'Session', value: `${i.n} of month ${i.k + 1}` }, { label: 'What happened', value: i.note }],
    payload: { workId: w.id, k: i.k, n: i.n, note: i.note },
    confirmLabel: 'Send the note',
    cancelLabel: 'Not now',
  };
}

export function buildWorkObjectConfirm(w: WorkRow, i: { k: number; minutes: number; reason: string }): WorkObjectConfirm {
  if (w.sessions) {
    return {
      kind: 'confirm',
      id: `work_object:${w.id}:${i.k}:${confirmNonce()}`,
      intent: 'work_object',
      title: `Say ${sessionsOf(i.minutes)} on ${w.title} did not happen`,
      summary: "The other sessions are paid now. Both of you have 72 hours to give your side; then Karwan's review team decides.",
      fields: [{ label: 'Sessions you object to', value: String(i.minutes) }, { label: 'Why', value: i.reason }],
      payload: { workId: w.id, k: i.k, minutes: i.minutes, reason: i.reason },
      confirmLabel: 'Send my objection',
      cancelLabel: 'Not now',
    };
  }
  return {
    kind: 'confirm',
    id: `work_object:${w.id}:${i.k}:${confirmNonce()}`,
    intent: 'work_object',
    title: `Say ${hours(i.minutes)} on ${w.title} are wrong`,
    summary: "The rest of the hours are paid now. Both of you have 72 hours to give your side; then Karwan's review team decides.",
    fields: [{ label: 'Hours you object to', value: hours(i.minutes) }, { label: 'Why', value: i.reason }],
    payload: { workId: w.id, k: i.k, minutes: i.minutes, reason: i.reason },
    confirmLabel: 'Send my objection',
    cancelLabel: 'Not now',
  };
}

export function buildWorkRequestPostConfirm(p: WorkRequestPayload): WorkRequestPostConfirm {
  const hourly = p.kind === 'hourly';
  return {
    kind: 'confirm',
    id: `work_request_post:${confirmNonce()}`,
    intent: 'work_request_post',
    title: `Post ${p.title}`,
    summary: 'Sellers who fit are told and offer their rate. Your agent ranks them by what they have done on Karwan. Nothing is paid until you hire someone.',
    fields: [
      { label: hourly ? 'The most an hour' : 'The most a month', value: usdc(Number(p.maxRateUsdc) * 1_000_000) },
      ...(hourly ? [{ label: 'Most hours a week', value: String(p.maxHours ?? 0) }] : []),
      ...(!hourly && p.sessions ? [{ label: 'Sessions a month', value: String(p.sessions) }] : []),
      { label: hourly ? 'Weeks' : 'Months', value: String(p.periods) },
    ],
    payload: p,
    confirmLabel: 'Post it',
    cancelLabel: 'Not now',
  };
}

export function buildWorkRequestOfferConfirm(i: { requestId: string; title: string; kind: 'hourly' | 'monthly'; rateUsdc: string; note: string }): WorkRequestOfferConfirm {
  return {
    kind: 'confirm',
    id: `work_request_offer:${i.requestId}:${confirmNonce()}`,
    intent: 'work_request_offer',
    title: `Offer on ${i.title}`,
    summary: 'If they hire you, your agent accepts these terms for you and the first one is paid in.',
    fields: [{ label: i.kind === 'hourly' ? 'Your rate an hour' : 'Your price a month', value: usdc(Number(i.rateUsdc) * 1_000_000) }, ...(i.note ? [{ label: 'Note', value: i.note }] : [])],
    payload: { requestId: i.requestId, rateUsdc: i.rateUsdc, note: i.note },
    confirmLabel: 'Send my offer',
    cancelLabel: 'Not now',
  };
}

/// `local` is what is paid now in the hirer's own currency at the shared rate
/// (view 77); the exact USDC stays beside it, as on every money card.
export function buildWorkRequestHireConfirm(i: { requestId: string; offerId: string; name: string; title: string; kind: 'hourly' | 'monthly'; totalMicros: string; local?: string | null }): WorkRequestHireConfirm {
  return {
    kind: 'confirm',
    id: `work_request_hire:${i.requestId}:${confirmNonce()}`,
    intent: 'work_request_hire',
    title: `Hire ${i.name} for ${i.title}`,
    summary: `Your agent pays for the first ${period(i.kind)} now; they already agreed these terms, so it starts as planned.`,
    fields: [{ label: 'You pay now', value: i.local ? `${i.local} · ${usdc(i.totalMicros)}` : usdc(i.totalMicros) }],
    payload: { requestId: i.requestId, offerId: i.offerId },
    confirmLabel: `Pay ${i.local ?? usdc(i.totalMicros)}`,
    cancelLabel: 'Not now',
  };
}

export function buildWorkRequestCloseConfirm(i: { requestId: string; title: string }): WorkRequestCloseConfirm {
  return {
    kind: 'confirm',
    id: `work_request_close:${i.requestId}:${confirmNonce()}`,
    intent: 'work_request_close',
    title: `Close ${i.title}`,
    summary: 'It comes off the market and the people who offered are told.',
    fields: [],
    payload: { requestId: i.requestId },
    confirmLabel: 'Close it',
    cancelLabel: 'Keep it open',
  };
}
