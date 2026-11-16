import { tool } from 'ai';
import { z } from 'zod';
import type { AssistantAction } from './actions.js';
import { saidFigure, saidMoney } from './saidFigure.js';
import {
  buildContestAwardConfirm,
  buildContestCancelConfirm,
  buildContestEnterConfirm,
  buildContestPostConfirm,
  type DraftCard,
} from './contests.js';

/// Contests from any channel (view 40). Reads and drafts go through the app's
/// own routes as the person, so every rule and every party check is the
/// page's own.

type Call = (address: string, method: 'GET' | 'POST', path: string, body?: unknown) => Promise<{ status: number; json: Record<string, unknown> }>;

export interface ContestToolDeps {
  call: Call;
  /// How many files the person sent the assistant for their next entry.
  heldEntryFiles: (address: string) => number;
  /// The website's address, for the link a post carries.
  base?: string;
}

const CONTEST = z.string().min(3).max(64).describe('The contest id, from list_contests.');
const errorOf = (r: { json: Record<string, unknown> }, fallback: string) => ({ error: typeof r.json.error === 'string' ? r.json.error : fallback });

type ContestRow = { id: string; title: string; prizeMicros: string; entries: number; entriesBy: number; awardBy: number; status: string };
type EntryRow = { id: string; seller: string; note: string; status: string };

export function contestTools(address: string, actions: AssistantAction[], deps: ContestToolDeps) {
  const show = (card: AssistantAction | { error: string }) => {
    if ('error' in card) return card;
    if (!actions.some((a) => a.id === card.id)) actions.push(card);
    return { ok: true, shown: 'title' in card ? card.title : '' };
  };
  const read = async (contestId: string) => deps.call(address, 'GET', `/api/contests/${encodeURIComponent(contestId)}`);

  return {
    list_contests: tool({
      description:
        "List contests: the open ones anyone can enter, and the person's own. Use for 'any contests', 'what contests are open', 'my contest'. A contest has a prize held from the start and up to three winners the buyer picks.",
      inputSchema: z.object({}),
      execute: async () => {
        const [open, mine] = await Promise.all([deps.call(address, 'GET', '/api/contests'), deps.call(address, 'GET', '/api/contests/mine')]);
        return {
          open: ((open.json.contests as ContestRow[] | undefined) ?? []).slice(0, 10),
          mine: ((mine.json.contests as ContestRow[] | undefined) ?? []).slice(0, 10),
        };
      },
    }),

    read_contest: tool({
      description: "One contest: its prize, dates and status. For the buyer it lists the entries (who, their note, status); for an entrant, their own entry. Use before picking winners.",
      inputSchema: z.object({ contestId: CONTEST }),
      execute: async ({ contestId }) => {
        const r = await read(contestId);
        return r.status === 200 ? r.json : errorOf(r, 'No contest with that id.');
      },
    }),

    propose_contest: tool({
      description:
        "Prepare a card for the person to run a contest: 'best logo, three places, a prize of 300, entries by Friday'. Ask for the prize in the person's own currency, never 'how much USDC'. Draw the card as soon as you have a title, what they want, the prize and the places: never send them to a form to fill it in. Their agent puts up the prize when they confirm. One to three places; entries open 1 to 30 days; they pick winners within 7 days after unless they say otherwise.",
      inputSchema: z.object({
        title: z.string().min(1).max(80),
        brief: z.string().min(1).max(1_500).describe('What they want, in their words.'),
        prizeUsdc: z.number().positive().max(1_000_000),
        places: z.number().int().min(1).max(3),
        entriesDays: z.number().int().min(1).max(30),
        awardDays: z.number().int().min(1).max(60).optional(),
      }),
      execute: async (i, options) => {
        // A prize said in naira reads as said, and every row on the card at
        // the said figure's own rate (view 77).
        const said = await saidFigure(options, 'prizeUsdc');
        const input = { ...i, prizeUsdc: String(said ? said.usdc : i.prizeUsdc) };
        const r = await deps.call(address, 'POST', '/api/contests/draft', input);
        if (r.status !== 200) return errorOf(r, 'That contest cannot be set up as it is.');
        return show(buildContestPostConfirm(input, r.json.card as DraftCard, said ? saidMoney(said) : undefined));
      },
    }),

    share_contest: tool({
      description:
        "The link to a contest and its facts, so you can write the person a short post they copy to WhatsApp, X or anywhere: 'prepare it for me to post', 'share my contest', 'write the announcement'. Read-only. Write the post yourself from what this returns, in their language and currency, with the link on its own line. Never tell them to go and write it.",
      inputSchema: z.object({ contestId: CONTEST }),
      execute: async ({ contestId }) => {
        const r = await read(contestId);
        if (r.status !== 200) return errorOf(r, 'No contest with that id.');
        const c = r.json as { title?: string; brief?: string; prizeMicros?: string; shares?: unknown[]; entriesBy?: number };
        const base = (deps.base ?? 'https://karwan.site').replace(/\/+$/, '');
        return {
          link: `${base}/contests/${encodeURIComponent(contestId)}`,
          title: c.title,
          brief: c.brief,
          prizeUsdc: c.prizeMicros ? (Number(c.prizeMicros) / 1_000_000).toFixed(2) : undefined,
          winners: Array.isArray(c.shares) ? c.shares.length : undefined,
          entriesClose: c.entriesBy ? new Date(c.entriesBy).toISOString().slice(0, 10) : undefined,
          note: 'The prize is already held by Karwan, so entrants know it is real. Anyone can enter from the link; their full work reaches the buyer only if they win.',
        };
      },
    }),

    propose_contest_entry: tool({
      description:
        "Prepare a card to enter a contest with the files the person sent you (images or PDF, captioned like 'my entry'). The first image is what the buyer sees before picking.",
      inputSchema: z.object({ contestId: CONTEST, note: z.string().max(500).default('').describe('A short note to the buyer.') }),
      execute: async ({ contestId, note }) => {
        const r = await read(contestId);
        if (r.status !== 200) return errorOf(r, 'No contest with that id.');
        return show(buildContestEnterConfirm({ contestId, title: String(r.json.title), files: deps.heldEntryFiles(address), note }));
      },
    }),

    propose_contest_award: tool({
      description: 'Prepare a card for the buyer to pay the winners, entry ids in place order (first place first), from read_contest.',
      inputSchema: z.object({ contestId: CONTEST, entryIds: z.array(z.string().max(64)).min(1).max(3) }),
      execute: async ({ contestId, entryIds }) => {
        const r = await read(contestId);
        if (r.status !== 200) return errorOf(r, 'No contest with that id.');
        const list = (r.json.entryList as EntryRow[] | undefined) ?? null;
        if (!list) return { error: 'Only the buyer picks the winners.' };
        const winners: { entryId: string; name: string }[] = [];
        for (const id of entryIds) {
          const e = list.find((x) => x.id === id && x.status === 'in');
          if (!e) return { error: 'Only entries in this contest can win.' };
          winners.push({ entryId: id, name: e.seller });
        }
        const card = await deps.call(address, 'POST', `/api/contests/${encodeURIComponent(contestId)}/award/card`, { entryIds });
        if (card.status !== 200) return errorOf(card, 'Could not work out the payouts just now.');
        const c = card.json.card as { netMicros: string[]; backMicros: string };
        return show(buildContestAwardConfirm({ contestId, title: String(r.json.title), winners, netMicros: c.netMicros, backMicros: c.backMicros }));
      },
    }),

    propose_contest_cancel: tool({
      description: 'Prepare a card for the buyer to take back a contest nobody has entered.',
      inputSchema: z.object({ contestId: CONTEST }),
      execute: async ({ contestId }) => {
        const r = await read(contestId);
        if (r.status !== 200) return errorOf(r, 'No contest with that id.');
        if (r.json.mine !== true) return { error: 'Only the buyer can take a contest back.' };
        return show(buildContestCancelConfirm({ contestId, title: String(r.json.title), prizeMicros: String(r.json.prizeMicros), entries: Number(r.json.entries) }));
      },
    }),
  };
}
