import { tool } from 'ai';
import { z } from 'zod';
import type { AssistantAction } from './actions.js';
import {
  buildWorkRequestCloseConfirm,
  buildWorkRequestHireConfirm,
  buildWorkRequestOfferConfirm,
  buildWorkRequestPostConfirm,
  buildWorkApproveConfirm,
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

type Week = { k: number; loggedMinutes: number; approvedMinutes: number; canApprove: boolean; canObject: boolean; canLog: boolean; ifPaid: { netMicros: string } };
type WorkView = {
  id: string; title: string; kind: 'hourly' | 'monthly'; role: 'hirer' | 'worker'; weeks: Week[];
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
      description: 'One piece of hourly work: its terms, each week (hours logged, approved, paid, what came back) and the steps open to the person now.',
      inputSchema: z.object({ workId: WORK }),
      execute: async ({ workId }) => read(workId),
    }),

    propose_hourly_work: tool({
      description:
        "Prepare a card to hire someone by the hour or monthly, named by their Karwan tag: 'hire @ada as a virtual assistant, 15 an hour, 20 hours a week, 4 weeks'. Their agent pays for the first week (or month) when they confirm, and pays one at a time after. The worker accepts before it starts. Ask for anything missing: who, the rate, hours a week (hourly only), and how many weeks or months.",
      inputSchema: z.object({
        worker: z.string().min(1).max(64).describe('Their Karwan tag, with or without @.'),
        kind: z.enum(['hourly', 'monthly']),
        rateUsdc: z.number().positive().max(100_000).describe('Per hour, or per month for a retainer.'),
        maxHours: z.number().int().min(1).max(80).optional().describe('Most hours a week; hourly only.'),
        periods: z.number().int().min(1).max(52).describe('Weeks, or months for a retainer.'),
        startsInDays: z.number().int().min(1).max(30).optional(),
        title: z.string().min(1).max(80),
        brief: z.string().max(1_500).default(''),
      }),
      execute: async (i) => {
        const input = { ...i, rateUsdc: String(i.rateUsdc) };
        const r = await deps.call(address, 'POST', '/api/work/draft', input);
        if (r.status !== 200) return errorOf(r, 'That work cannot be set up as it is.');
        return show(buildWorkOfferConfirm(input, r.json.card as WorkDraftCard, i.worker.startsWith('@') ? i.worker : `@${i.worker}`));
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
        "Prepare a card for the worker to log hours they worked ('log 3 hours 20 on the VA work, inbox cleanup'), or claim the month on a retainer. Hours go to the week running now unless they name an earlier week still open for logging (2 days after it ends).",
      inputSchema: z.object({ workId: WORK, minutes: z.number().int().min(1).max(4_800).describe('Hours times 60, plus minutes.'), note: z.string().max(300).default(''), week: z.number().int().min(1).optional().describe('Week number, 1 for the first.') }),
      execute: async ({ workId, minutes, note, week }) => {
        const w = await read(workId);
        if ('error' in w) return w;
        if (w.role !== 'worker') return { error: 'Only the worker logs hours.' };
        return show(buildWorkHoursConfirm(w, { minutes, note, ...(week ? { k: week - 1 } : {}) }));
      },
    }),

    propose_hours_approve: tool({
      description: 'Prepare a card for the hirer to approve the hours logged for a week; the worker is paid at once.',
      inputSchema: z.object({ workId: WORK, week: z.number().int().min(1).optional() }),
      execute: async ({ workId, week }) => {
        const w = await read(workId);
        if ('error' in w) return w;
        const x = weekOf(w, week ? week - 1 : undefined, (y) => y.canApprove);
        if (!x) return { error: 'There are no hours waiting for your approval.' };
        return show(buildWorkApproveConfirm(w, { k: x.k, minutes: x.loggedMinutes, netMicros: x.ifPaid.netMicros }));
      },
    }),

    propose_hours_object: tool({
      description: "Prepare a card for the hirer to say some hours are wrong, with how many and why. Only after logging closes and before review ends; the rest are paid at once and Karwan's review team decides the rest.",
      inputSchema: z.object({ workId: WORK, minutes: z.number().int().min(1).max(4_800), reason: z.string().min(1).max(500), week: z.number().int().min(1).optional() }),
      execute: async ({ workId, minutes, reason, week }) => {
        const w = await read(workId);
        if ('error' in w) return w;
        const x = weekOf(w, week ? week - 1 : undefined, (y) => y.canObject);
        if (!x) return { error: 'No hours can be objected to right now: either logging is still open, or the review time has ended.' };
        return show(buildWorkObjectConfirm(w, { k: x.k, minutes, reason }));
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
      description: "Prepare a card to post hourly or monthly work on the market when the person does not have someone in mind: 'I need a bookkeeper, up to 10 an hour, 10 hours a week, 4 weeks'. Sellers who fit offer a rate and their agent ranks them by what they have actually done on Karwan. Nothing is paid until they hire. Ask for anything missing: what the work is, the most per hour (or month), hours a week (hourly only), how many weeks or months.",
      inputSchema: z.object({
        kind: z.enum(['hourly', 'monthly']),
        title: z.string().min(1).max(80),
        brief: z.string().min(1).max(1_500),
        maxRateUsdc: z.number().positive().max(100_000),
        maxHours: z.number().int().min(1).max(80).optional(),
        periods: z.number().int().min(1).max(52),
        startsInDays: z.number().int().min(2).max(30).optional(),
      }),
      execute: async (i) => show(buildWorkRequestPostConfirm({ ...i, maxRateUsdc: String(i.maxRateUsdc) })),
    }),

    propose_hourly_offer: tool({
      description: 'Prepare a card for a seller to offer their rate on posted hourly work, with a short note. Offering again changes their rate.',
      inputSchema: z.object({ requestId: REQUEST, rateUsdc: z.number().positive().max(100_000), note: z.string().max(300).default('') }),
      execute: async ({ requestId, rateUsdc, note }) => {
        const r = await deps.call(address, 'GET', `/api/work-requests/${encodeURIComponent(requestId)}`);
        if (r.status !== 200) return errorOf(r, 'No posted work with that id.');
        const req = r.json.request as { title: string; kind: 'hourly' | 'monthly'; mine: boolean; status: string };
        if (req.mine) return { error: 'You cannot offer on your own work.' };
        if (req.status !== 'open') return { error: 'This work is no longer taking offers.' };
        return show(buildWorkRequestOfferConfirm({ requestId, title: req.title, kind: req.kind, rateUsdc: String(rateUsdc), note }));
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
