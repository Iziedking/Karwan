import { tool } from 'ai';
import { z } from 'zod';
import { keepOnCard, saidFigure } from './saidFigure.js';
import type { AssistantAction } from './actions.js';
import {
  buildWorkRequestCloseConfirm,
  buildWorkRequestHireConfirm,
  buildWorkRequestOfferConfirm,
  buildWorkRequestPostConfirm,
  buildWorkApproveConfirm,
  buildWorkFlagConfirm,
  buildWorkUnflagConfirm,
  buildWorkHoursConfirm,
  buildWorkObjectConfirm,
  buildWorkOfferConfirm,
  buildWorkStepConfirm,
  type WorkDraftCard,
} from './work.js';

/// Hourly work and monthly retainers from any channel (view 32). Reads and
/// drafts go through the app's own routes as the person, so every rule and
/// every party check is the page's own.

type Call = (address: string, method: 'GET' | 'POST', path: string, body?: unknown) => Promise<{ status: number; json: Record<string, unknown> }>;

export interface WorkToolDeps {
  call: Call;
}

const WORK = z.string().min(3).max(64).describe('The work id, from list_my_work.');
const REQUEST = z.string().min(3).max(64).describe('The posted work id, from list_hourly_requests.');
const errorOf = (r: { json: Record<string, unknown> }, fallback: string) => ({ error: typeof r.json.error === 'string' ? r.json.error : fallback });

type Week = { k: number; loggedMinutes: number; approvedMinutes: number; canApprove: boolean; canObject: boolean; canLog: boolean; canFlag?: boolean; canUnflag?: boolean; log?: { flagged?: unknown }[]; ifPaid: { netMicros: string } };
type WorkView = {
  id: string; title: string; kind: 'hourly' | 'monthly'; sessions?: number; role: 'hirer' | 'worker'; weeks: Week[];
  canAccept: boolean; canTakeBack: boolean; canGiveNotice: boolean; nextWeek: { k: number; totalMicros: string } | null; fundBlocked: string | null;
};

export function workTools(address: string, actions: AssistantAction[], deps: WorkToolDeps) {
  const show = (card: AssistantAction | { error: string }) => {
    if ('error' in card) return card;
    if (!actions.some((a) => a.id === card.id)) actions.push(card);
    return { ok: true, shown: 'title' in card ? card.title : '' };
  };
  const read = async (workId: string): Promise<WorkView | { error: string }> => {
    const r = await deps.call(address, 'GET', `/api/work/${encodeURIComponent(workId)}`);
    return r.status === 200 ? (r.json.work as WorkView) : errorOf(r, 'No work with that id.');
  };
  const weekOf = (w: WorkView, k: number | undefined, pick: (x: Week) => boolean) =>
    k === undefined ? [...w.weeks].reverse().find(pick) : w.weeks.find((x) => x.k === k && pick(x));

  return {
    list_my_work: tool({
      description: "List the person's hourly work and monthly retainers, as hirer or as worker: title, status, rate. Use for 'my hourly work', 'who am I paying by the hour', 'my retainer'.",
      inputSchema: z.object({}),
      execute: async () => {
        const r = await deps.call(address, 'GET', '/api/work/mine');
        return r.status === 200 ? { work: ((r.json.work as unknown[]) ?? []).slice(0, 15) } : errorOf(r, 'Could not read your work just now.');
      },
    }),

    read_work: tool({
      description: 'One piece of hourly or monthly work: its terms, each week or month (hours logged, approved, paid, what came back) and the steps open to the person now. On monthly work with sessions, the counts are sessions and each log entry is one session with its note, link and any note from the hirer that it did not happen.',
      inputSchema: z.object({ workId: WORK }),
      execute: async ({ workId }) => read(workId),
    }),

    propose_hourly_work: tool({
      description:
        "Prepare a card to hire someone by the hour or monthly, named by their Karwan tag: 'hire @ada as a virtual assistant, 15 an hour, 20 hours a week, 4 weeks'. Their agent pays for the first week (or month) when they confirm, and pays one at a time after. The worker accepts before it starts. For lessons, classes or anything counted in sessions use kind monthly with sessions (three a week is 12 a month): the month is four weeks, the worker records each session, and after the month the hirer pays for the sessions that happened and the rest comes back. Ask for anything missing: who, the rate, hours a week (hourly only), sessions a month (when it is counted in sessions), and how many weeks or months.",
      inputSchema: z.object({
        worker: z.string().min(1).max(64).describe('Their Karwan tag, with or without @.'),
        kind: z.enum(['hourly', 'monthly']),
        rateUsdc: z.number().positive().max(100_000).describe('Per hour, or per month for a retainer.'),
        maxHours: z.number().int().min(1).max(80).optional().describe('Most hours a week; hourly only.'),
        periods: z.number().int().min(1).max(52).describe('Weeks, or months for a retainer.'),
        sessions: z.number().int().min(1).max(60).optional().describe('Monthly only: sessions the month holds. Leave out for a plain retainer.'),
        startsInDays: z.number().int().min(1).max(30).optional(),
        title: z.string().min(1).max(80),
        brief: z.string().max(1_500).default(''),
      }),
      execute: async (i, options) => {
        // A rate said in their own currency keeps that figure (view 77).
        const said = await saidFigure(options, 'rateUsdc');
        const input = { ...i, rateUsdc: String(said ? said.usdc : i.rateUsdc) };
        const r = await deps.call(address, 'POST', '/api/work/draft', input);
        if (r.status !== 200) return errorOf(r, 'That work cannot be set up as it is.');
        return show(keepOnCard(buildWorkOfferConfirm(input, r.json.card as WorkDraftCard, i.worker.startsWith('@') ? i.worker : `@${i.worker}`), said, []));
      },
    }),

    propose_work_answer: tool({
      description: 'Prepare a card for the worker to accept, or say no to, hourly work they were offered.',
      inputSchema: z.object({ workId: WORK, answer: z.enum(['accept', 'decline']) }),
      execute: async ({ workId, answer }) => {
        const w = await read(workId);
        if ('error' in w) return w;
        if (!w.canAccept) return { error: 'This offer is not waiting for your answer.' };
        return show(buildWorkStepConfirm(answer === 'accept' ? 'work_accept' : 'work_decline', w));
      },
    }),

    propose_hours: tool({
      description:
        "Prepare a card for the worker to log hours they worked ('log 3 hours 20 on the VA work, inbox cleanup'), or claim the month on a retainer. On monthly work with sessions it records ONE session ('lesson done today, fractions'): pass minutes 1, what was covered as the note, and a link to a recording or material if they gave one. Hours go to the week running now unless they name an earlier week still open for logging (2 days after it ends).",
      inputSchema: z.object({ workId: WORK, minutes: z.number().int().min(1).max(4_800).describe('Hours times 60, plus minutes. 1 when recording a session.'), note: z.string().max(300).default(''), week: z.number().int().min(1).optional().describe('Week or month number, 1 for the first.'), link: z.string().max(300).optional().describe('Sessions only: an https link to a recording or material.') }),
      execute: async ({ workId, minutes, note, week, link }) => {
        const w = await read(workId);
        if ('error' in w) return w;
        if (w.role !== 'worker') return { error: 'Only the worker logs hours.' };
        if (link && !w.sessions) return { error: 'A link goes with a session; this work logs hours.' };
        if (link && !/^https:\/\/\S+$/.test(link)) return { error: 'The link must start with https://.' };
        return show(buildWorkHoursConfirm(w, { minutes, note, ...(week ? { k: week - 1 } : {}), ...(link ? { link } : {}) }));
      },
    }),

    propose_hours_approve: tool({
      description: 'Prepare a card for the hirer to approve the hours logged for a week, or the sessions recorded for a month once that month has ended; the worker is paid at once.',
      inputSchema: z.object({ workId: WORK, week: z.number().int().min(1).optional() }),
      execute: async ({ workId, week }) => {
        const w = await read(workId);
        if ('error' in w) return w;
        const x = weekOf(w, week ? week - 1 : undefined, (y) => y.canApprove);
        if (!x) return { error: w.sessions ? 'Nothing can be approved yet: the month is reviewed after it ends. Until then they can say a session did not happen.' : 'There are no hours waiting for your approval.' };
        return show(buildWorkApproveConfirm(w, { k: x.k, minutes: x.loggedMinutes, netMicros: x.ifPaid.netMicros }));
      },
    }),

    propose_hours_object: tool({
      description: "Prepare a card for the hirer to say some hours are wrong, with how many and why. On monthly work with sessions, minutes is the NUMBER OF SESSIONS that did not happen. Only after logging closes and before review ends; the rest are paid at once and Karwan's review team decides the rest.",
      inputSchema: z.object({ workId: WORK, minutes: z.number().int().min(1).max(4_800), reason: z.string().min(1).max(500), week: z.number().int().min(1).optional() }),
      execute: async ({ workId, minutes, reason, week }) => {
        const w = await read(workId);
        if ('error' in w) return w;
        const x = weekOf(w, week ? week - 1 : undefined, (y) => y.canObject);
        if (!x) return { error: 'No hours can be objected to right now: either logging is still open, or the review time has ended.' };
        return show(buildWorkObjectConfirm(w, { k: x.k, minutes, reason }));
      },
    }),

    propose_session_flag: tool({
      description: "Prepare a card for the hirer to say one recorded session did not happen, while the month is still running ('the lesson on Tuesday never happened'). It is a note for the month's review: no money moves, nothing is disputed yet, and the worker is told. Sessions are numbered in the order they were recorded (read_work).",
      inputSchema: z.object({ workId: WORK, session: z.number().int().min(1).max(60).describe('Which recorded session, 1 for the first of that month.'), note: z.string().min(1).max(300).describe('What happened, in their words.'), month: z.number().int().min(1).optional() }),
      execute: async ({ workId, session, note, month }) => {
        const w = await read(workId);
        if ('error' in w) return w;
        if (w.role !== 'hirer') return { error: 'Only the hirer can say a session did not happen.' };
        if (!w.sessions) return { error: 'This work has no sessions to mark.' };
        const x = weekOf(w, month ? month - 1 : undefined, (y) => y.canFlag === true);
        if (!x) return { error: 'No session is recorded for a month that is still open.' };
        if (session > (x.log?.length ?? 0)) return { error: `Only ${x.log?.length ?? 0} sessions are recorded for that month.` };
        if (x.log?.[session - 1]?.flagged) return { error: 'That session already has their note. Offer to take it back first (propose_session_unflag); then a new note can be sent.' };
        return show(buildWorkFlagConfirm(w, { k: x.k, n: session, note }));
      },
    }),

    propose_session_unflag: tool({
      description: "Prepare a card for the hirer to take back a note saying a session did not happen ('I was wrong, the Tuesday lesson did happen', 'remove my note on session 2'), while the month is still running. The session counts as held again, the worker is told and no money moves. To change the words of a note, take it back and then send a new one.",
      inputSchema: z.object({ workId: WORK, session: z.number().int().min(1).max(60).describe('Which recorded session, 1 for the first of that month.'), month: z.number().int().min(1).optional() }),
      execute: async ({ workId, session, month }) => {
        const w = await read(workId);
        if ('error' in w) return w;
        if (w.role !== 'hirer') return { error: 'Only the hirer can take back a note on a session.' };
        const x = weekOf(w, month ? month - 1 : undefined, (y) => y.canUnflag === true);
        if (!x) return { error: 'No session has a note in a month that is still open.' };
        if (!x.log?.[session - 1]?.flagged) return { error: 'That session has no note to take back.' };
        return show(buildWorkUnflagConfirm(w, { k: x.k, n: session }));
      },
    }),

    propose_work_fund: tool({
      description: 'Prepare a card for the hirer to pay for the next week or month of hourly work.',
      inputSchema: z.object({ workId: WORK }),
      execute: async ({ workId }) => {
        const w = await read(workId);
        if ('error' in w) return w;
        if (!w.nextWeek) return { error: w.fundBlocked ?? 'There is nothing to pay for right now.' };
        return show(buildWorkStepConfirm('work_fund', { ...w, k: w.nextWeek.k, totalMicros: w.nextWeek.totalMicros }));
      },
    }),

    list_hourly_requests: tool({
      description: "Hourly and monthly work posted on the market: the open ones a seller can offer on, and the ones the person posted. Use for 'any hourly work', 'part-time jobs', 'my posted work'.",
      inputSchema: z.object({}),
      execute: async () => {
        const [open, mine] = await Promise.all([deps.call(address, 'GET', '/api/work-requests'), deps.call(address, 'GET', '/api/work-requests/mine')]);
        return { open: ((open.json.requests as unknown[]) ?? []).slice(0, 10), mine: ((mine.json.requests as unknown[]) ?? []).slice(0, 10) };
      },
    }),

    read_hourly_request: tool({
      description: "One piece of posted hourly work. For the hirer it lists the offers their agent ranked, best fit first: name, verified in words, tier, rating, up to three reasons and the rate; never scores or counts, so never state or guess any. For a seller, their own offer.",
      inputSchema: z.object({ requestId: REQUEST }),
      execute: async ({ requestId }) => {
        const r = await deps.call(address, 'GET', `/api/work-requests/${encodeURIComponent(requestId)}`);
        return r.status === 200 ? r.json.request : errorOf(r, 'No posted work with that id.');
      },
    }),

    propose_post_hourly_work: tool({
      description: "Prepare a card to post hourly or monthly work on the market when the person does not have someone in mind: 'I need a bookkeeper, up to 10 an hour, 10 hours a week, 4 weeks'. Sellers who fit offer a rate and their agent ranks them by what they have actually done on Karwan. Nothing is paid until they hire. For lessons, classes or anything counted in sessions use kind monthly with sessions (three a week is 12 a month). Ask for anything missing: what the work is, the most per hour (or month), hours a week (hourly only), sessions a month (when counted in sessions), how many weeks or months.",
      inputSchema: z.object({
        kind: z.enum(['hourly', 'monthly']),
        title: z.string().min(1).max(80),
        brief: z.string().min(1).max(1_500),
        maxRateUsdc: z.number().positive().max(100_000),
        maxHours: z.number().int().min(1).max(80).optional(),
        periods: z.number().int().min(1).max(52),
        sessions: z.number().int().min(1).max(60).optional().describe('Monthly only: sessions the month holds.'),
        startsInDays: z.number().int().min(2).max(30).optional(),
      }),
      execute: async (i, options) => {
        const said = await saidFigure(options, 'maxRateUsdc');
        return show(keepOnCard(buildWorkRequestPostConfirm({ ...i, maxRateUsdc: String(said ? said.usdc : i.maxRateUsdc) }), said, ['The most an hour', 'The most a month']));
      },
    }),

    propose_hourly_offer: tool({
      description: 'Prepare a card for a seller to offer their rate on posted hourly work, with a short note. Offering again changes their rate.',
      inputSchema: z.object({ requestId: REQUEST, rateUsdc: z.number().positive().max(100_000), note: z.string().max(300).default('') }),
      execute: async ({ requestId, rateUsdc, note }, options) => {
        const said = await saidFigure(options, 'rateUsdc');
        const r = await deps.call(address, 'GET', `/api/work-requests/${encodeURIComponent(requestId)}`);
        if (r.status !== 200) return errorOf(r, 'No posted work with that id.');
        const req = r.json.request as { title: string; kind: 'hourly' | 'monthly'; mine: boolean; status: string };
        if (req.mine) return { error: 'You cannot offer on your own work.' };
        if (req.status !== 'open') return { error: 'This work is no longer taking offers.' };
        return show(keepOnCard(buildWorkRequestOfferConfirm({ requestId, title: req.title, kind: req.kind, rateUsdc: String(said ? said.usdc : rateUsdc), note }), said, ['Your rate an hour', 'Your price a month']));
      },
    }),

    propose_hire_offer: tool({
      description: 'Prepare a card for the hirer to hire one of the people who offered on their posted work, by offer id from read_hourly_request. Their agent pays for the first week and the worker\'s agent accepts at once.',
      inputSchema: z.object({ requestId: REQUEST, offerId: z.string().min(3).max(64) }),
      execute: async ({ requestId, offerId }) => {
        const r = await deps.call(address, 'GET', `/api/work-requests/${encodeURIComponent(requestId)}`);
        if (r.status !== 200) return errorOf(r, 'No posted work with that id.');
        const req = r.json.request as { title: string; offers?: Array<{ offerId: string; name: string; tag: string | null }> };
        const o = req.offers?.find((x) => x.offerId === offerId);
        if (!o) return { error: 'Only the hirer can hire, and only someone who offered.' };
        const card = await deps.call(address, 'POST', `/api/work-requests/${encodeURIComponent(requestId)}/hire/card`, { offerId });
        if (card.status !== 200) return errorOf(card, 'That hire cannot go ahead as it is.');
        const c = card.json.card as { totalMicros: string };
        return show(buildWorkRequestHireConfirm({ requestId, offerId, name: o.tag ? `@${o.tag}` : o.name, title: req.title, totalMicros: c.totalMicros }));
      },
    }),

    propose_close_hourly_request: tool({
      description: 'Prepare a card for the hirer to take their posted hourly work off the market without hiring.',
      inputSchema: z.object({ requestId: REQUEST }),
      execute: async ({ requestId }) => {
        const r = await deps.call(address, 'GET', `/api/work-requests/${encodeURIComponent(requestId)}`);
        if (r.status !== 200) return errorOf(r, 'No posted work with that id.');
        const req = r.json.request as { title: string; mine: boolean; status: string };
        if (!req.mine) return { error: 'Only the hirer can close it.' };
        if (req.status !== 'open') return { error: 'It is already off the market.' };
        return show(buildWorkRequestCloseConfirm({ requestId, title: req.title }));
      },
    }),

    propose_work_end: tool({
      description: "Prepare a card to end hourly work: with one week's (or month's) notice while it runs, or, for the hirer, taking back an offer nobody accepted yet.",
      inputSchema: z.object({ workId: WORK }),
      execute: async ({ workId }) => {
        const w = await read(workId);
        if ('error' in w) return w;
        if (w.canTakeBack) return show(buildWorkStepConfirm('work_cancel', w));
        if (w.canGiveNotice) return show(buildWorkStepConfirm('work_notice', w));
        return { error: 'This work is already ending.' };
      },
    }),
  };
}
