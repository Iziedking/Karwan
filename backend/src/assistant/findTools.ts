import { tool } from 'ai';
import { z } from 'zod';
import { getProfile, findProfileByHandle } from '../db/profiles.js';
import { reachableOf } from '../find/settings.js';
import { MAX_NEEDS, NEED_TEXT_MAX, needsOf, type StandingNeed } from '../find/needs.js';
import { formatLocalAmount } from '../rates/localAmounts.js';
import { readUsdcRates } from '../rates/usdcRates.js';
import { hasEquivalentConfirm, type AssistantAction, type ConfirmAction } from './actions.js';
import { buildBlockPersonConfirm, buildRemoveStandingNeedConfirm, buildSaveStandingNeedConfirm, EVERY_WORDS, REACHES_WORDS } from './findActions.js';

/// Being reached and blocking, from any channel (view 72). Being found is a
/// setting (propose_change_settings). Nothing here moves money.

export interface FindToolDeps {
  reachable: (address: string) => Promise<boolean>;
  needs: (address: string) => Promise<StandingNeed[]>;
  /// The person behind a Karwan tag, or null.
  byTag: (tag: string) => Promise<{ address: string; handle: string } | null>;
  /// A USDC figure as this person reads it ("₦45,000"), or "45 USDC".
  money: (address: string, usdc: number) => Promise<string>;
}

function offer(actions: AssistantAction[], built: ConfirmAction | { error: string }) {
  if ('error' in built) return built;
  if (!hasEquivalentConfirm(actions, built)) actions.push(built);
  return { ok: true, shown: built.title };
}

const EVERY = z.enum(['once', 'week', 'month', 'season']);
const KIND = z.enum(['goods', 'in_person', 'remote']);

export function findTools(address: string, actions: AssistantAction[], deps: FindToolDeps) {
  const me = address.toLowerCase();
  const line = async (n: StandingNeed) =>
    [EVERY_WORDS[n.every], n.budgetUsdc ? `about ${await deps.money(me, Number(n.budgetUsdc))}` : null, REACHES_WORDS[n.kind].toLowerCase()].filter(Boolean).join(' · ');

  return {
    my_standing_needs: tool({
      description:
        "List what this person regularly needs (their standing needs, view 72), with each need's id, and whether Let sellers reach me is on. Sellers near them who fit can offer for a need only while that is on and the need is not paused.",
      inputSchema: z.object({}),
      execute: async () => {
        const [needs, reachable] = await Promise.all([deps.needs(me), deps.reachable(me)]);
        return {
          reachable,
          needs: await Promise.all(needs.map(async (n) => ({ id: n.id, what: n.what, line: await line(n), paused: n.paused }))),
          max: MAX_NEEDS,
        };
      },
    }),

    propose_standing_need: tool({
      description:
        "Prepare a card to add something the person regularly needs, or change one (pass its id from my_standing_needs): what, how often (once, week, month, season), a rough budget each time, and how it reaches them (goods delivered, in_person at their place, remote online). Use when they say what they buy again and again, such as \"tomatoes every week for my restaurant\". Sellers near them who fit can then offer for it while Let sellers reach me is on; nothing is paid until they say yes. To pause offers on a need, pass paused true.",
      inputSchema: z.object({
        id: z.string().max(80).optional(),
        what: z.string().min(3).max(NEED_TEXT_MAX),
        every: EVERY,
        budgetUsdc: z.number().positive().max(10_000_000).optional().describe('Rough budget each time, in USDC.'),
        kind: KIND,
        paused: z.boolean().optional(),
      }),
      execute: async ({ id, what, every, budgetUsdc, kind, paused }) => {
        const [needs, reachable] = await Promise.all([deps.needs(me), deps.reachable(me)]);
        if (id && !needs.some((n) => n.id === id)) return { error: 'That need is not on their list. Read my_standing_needs for the ids.' };
        if (!id && needs.length >= MAX_NEEDS) return { error: `They already keep ${MAX_NEEDS} needs. Offer to remove one first.` };
        const budget = budgetUsdc ? await deps.money(me, budgetUsdc) : null;
        return offer(actions, buildSaveStandingNeedConfirm({
          need: { ...(id ? { id } : {}), what, every, budgetUsdc: budgetUsdc ?? null, kind, ...(paused !== undefined ? { paused } : {}) },
          budget,
          changing: !!id,
          reachable,
        }));
      },
    }),

    propose_remove_standing_need: tool({
      description: 'Prepare a card to remove one of the needs this person listed (id from my_standing_needs). Sellers stop offering for it.',
      inputSchema: z.object({ id: z.string().min(1).max(80) }),
      execute: async ({ id }) => {
        const need = (await deps.needs(me)).find((n) => n.id === id);
        if (!need) return { error: 'That need is not on their list. Read my_standing_needs for the ids.' };
        return offer(actions, buildRemoveStandingNeedConfirm({ id, what: need.what }));
      },
    }),

    propose_block_person: tool({
      description:
        'Prepare a card to block someone by Karwan tag (block true) or unblock them (block false). A block stops deal alerts and pitches both ways and leaves each out of the other\'s finds; the person blocked is not told. Their deals already open are not affected.',
      inputSchema: z.object({ tag: z.string().min(1).max(40), block: z.boolean() }),
      execute: async ({ tag, block }) => {
        const found = await deps.byTag(tag.replace(/^@/, ''));
        if (!found) return { error: `Nobody on Karwan has the tag @${tag.replace(/^@/, '')}.` };
        if (found.address.toLowerCase() === me) return { error: 'That is their own tag.' };
        return offer(actions, buildBlockPersonConfirm({ who: found.address, tag: found.handle, block }));
      },
    }),
  };
}

export const liveFindToolDeps: FindToolDeps = {
  reachable: async (address) => reachableOf((await getProfile(address)) ?? {}),
  needs: needsOf,
  byTag: async (tag) => {
    const p = await findProfileByHandle(tag);
    return p?.handle ? { address: p.address, handle: p.handle } : null;
  },
  money: async (address, usdc) => {
    const [profile, rates] = await Promise.all([getProfile(address), readUsdcRates()]);
    return formatLocalAmount(usdc, profile?.settings?.displayCurrency, rates) ?? `${Math.round(usdc * 100) / 100} USDC`;
  },
};
