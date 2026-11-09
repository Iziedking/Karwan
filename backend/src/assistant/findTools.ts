import { randomUUID } from 'node:crypto';
import { tool } from 'ai';
import { z } from 'zod';
import { isVerified } from '../agents/shortlist.js';
import { config } from '../config.js';
import { getProfile, findProfileByHandle } from '../db/profiles.js';
import { blockedSet } from '../find/blocks.js';
import { directoryCandidates } from '../find/directory.js';
import { liveDirectoryDeps } from '../find/directoryLive.js';
import { findEndsAt, myFinds, saveFind, type Find } from '../find/finds.js';
import { rankForFind, type FindCandidate, type FoundRow } from '../find/rank.js';
import { reachableOf } from '../find/settings.js';
import type { DeliveryKind, DistanceLine, PrivateLocation } from '../location/rules.js';
import { levelOf } from '../verification/live.js';
import { MAX_NEEDS, NEED_TEXT_MAX, needsOf, type StandingNeed } from '../find/needs.js';
import { formatLocalAmount } from '../rates/localAmounts.js';
import { readUsdcRates } from '../rates/usdcRates.js';
import { hasEquivalentConfirm, type AssistantAction, type ConfirmAction } from './actions.js';
import { buildBlockPersonConfirm, buildRemoveStandingNeedConfirm, buildSaveStandingNeedConfirm, EVERY_WORDS, REACHES_WORDS } from './findActions.js';

/// Finding people, being reached and blocking, from any channel (view 72).
/// Being found is a setting (propose_change_settings). Nothing here moves money.

export interface FindToolDeps {
  reachable: (address: string) => Promise<boolean>;
  needs: (address: string) => Promise<StandingNeed[]>;
  /// The person behind a Karwan tag, or null.
  byTag: (tag: string) => Promise<{ address: string; handle: string } | null>;
  /// A USDC figure as this person reads it ("₦45,000"), or "45 USDC".
  money: (address: string, usdc: number) => Promise<string>;
  /// The people who chose to be found and share a word with the need.
  people: (need: { keywords: string[]; text: string; kind: DeliveryKind }) => Promise<FindCandidate[]>;
  /// Where the buyer is (never shown) and whether they are verified.
  buyer: (address: string) => Promise<{ location: PrivateLocation | null; verified: boolean }>;
  blocked: (address: string) => Promise<Set<string>>;
  saveFind: (f: Find) => Promise<Find>;
  finds: (address: string) => Promise<Find[]>;
  cleanRecordCounts: boolean;
  now: () => number;
  newId: () => string;
}

/// How far someone is, in words for the assistant; never more than this.
export function distanceWords(d: DistanceLine): string | null {
  switch (d.key) {
    case 'nearby': return 'nearby';
    case 'about': return `about ${d.km} km away`;
    case 'inCity': return `in ${d.city}`;
    case 'far': return `${d.km} km away`;
    case 'sameCity': return `in ${d.city}`;
    case 'sameCountry': return 'in your country';
    default: return null;
  }
}

function meetWords(m: FoundRow['meet']): string {
  const ways = [m.atMyPlace ? 'at their place' : null, m.comeToYouKm !== null ? `comes to you up to ${m.comeToYouKm} km` : null, m.online ? 'online' : null];
  return ways.filter(Boolean).join(', ');
}

const keywordsOf = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);

function offer(actions: AssistantAction[], built: ConfirmAction | { error: string }) {
  if ('error' in built) return built;
  if (!hasEquivalentConfirm(actions, built)) actions.push(built);
  return { ok: true, shown: built.title };
}

const EVERY = z.enum(['once', 'week', 'month', 'season']);
const KIND = z.enum(['goods', 'in_person', 'remote']);
const DAY_MS = 86_400_000;

export function findTools(address: string, actions: AssistantAction[], deps: FindToolDeps) {
  const me = address.toLowerCase();
  const line = async (n: StandingNeed) =>
    [EVERY_WORDS[n.every], n.budgetUsdc ? `about ${await deps.money(me, Number(n.budgetUsdc))}` : null, REACHES_WORDS[n.kind].toLowerCase()].filter(Boolean).join(' · ');

  return {
    find_people: tool({
      description:
        'Find people who sell what this person needs, near them or online, ranked by skill, then their record (verified, tier, rating), then distance (view 72). Use when they ask for someone: "I need a tailor near me", "find me a caterer in Abuja". Only people who chose to be found come up, at most five, the best fit recommended. Pass kind in_person for work done face to face, remote for online work, goods for things delivered. It moves no money and contacts nobody yet: show the list (name and tag, tier, rating, how far, how they work, price or Asks for a quote, reasons) and the link. Contacting them comes in a later step; until then offer to post a request or message one by tag. Nobody fits: say so plainly and offer to post it on the open market.',
      inputSchema: z.object({
        need: z.string().min(3).max(300).describe('What they need, in their words.'),
        budgetUsdc: z.number().positive().max(10_000_000).describe('Their budget in USDC.'),
        kind: KIND,
        where: z.enum(['near', 'country', 'anywhere']).default('near'),
        country: z.string().regex(/^[A-Za-z]{2}$/).optional().describe('ISO country code when where is country.'),
        days: z.number().int().min(1).max(365).optional().describe('By when, in days.'),
      }),
      execute: async ({ need, budgetUsdc, kind, where, country, days }) => {
        const buyer = await deps.buyer(me);
        if (kind === 'in_person' && !buyer.location?.city && !buyer.location?.point) {
          return { needsLocation: true, next: 'Ask once, roughly, where they should meet people (area and city), save it with set_location, then find again.' };
        }
        const keywords = keywordsOf(need);
        const place = { scope: where, ...(country ? { country: country.toUpperCase() } : {}) };
        const [candidates, blocked] = await Promise.all([deps.people({ keywords, text: need, kind }), deps.blocked(me)]);
        const rows = rankForFind(
          candidates,
          { text: need, keywords, budgetUsdc, kind, where: place, buyer: me, buyerLocation: buyer.location, buyerVerified: buyer.verified },
          { requireVerified: false, blocked, cleanRecordCounts: deps.cleanRecordCounts },
        );
        if (rows.length === 0) return { found: 0, next: 'Nobody who chose to be found fits yet. Nothing was paid. Offer to post it as a request on the open market.' };
        const now = deps.now();
        const saved = await deps.saveFind({
          id: deps.newId(), owner: me, side: 'buyer', mode: 'choose', need, budgetUsdc: String(budgetUsdc), kind, where: place,
          jobId: null, needId: null, rows, status: 'shortlisted', createdAt: now, endsAt: findEndsAt(now, days ? now + days * DAY_MS : null),
        });
        return {
          found: rows.length,
          link: `/find/${saved.id}`,
          people: await Promise.all(rows.map(async (r) => ({
            name: r.name,
            tag: r.tag ? `@${r.tag}` : null,
            verified: r.verified,
            tier: r.tier,
            rating: r.rating,
            distance: distanceWords(r.distance),
            meets: meetWords(r.meet),
            price: r.priceUsdc ? await deps.money(me, Number(r.priceUsdc)) : 'Asks for a quote',
            days: r.days,
            reasons: r.reasons,
            recommended: r.recommended,
          }))),
        };
      },
    }),

    my_finds: tool({
      description: 'List the people searches this person ran (find_people), newest first, each with what was needed, how many came up, its state and its link.',
      inputSchema: z.object({}),
      execute: async () => ({
        finds: (await deps.finds(me)).map((f) => ({ need: f.need, found: f.rows.length, status: f.status, link: `/find/${f.id}` })),
      }),
    }),

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
  people: (need) => directoryCandidates(need, liveDirectoryDeps),
  buyer: async (address) => {
    const [profile, level] = await Promise.all([getProfile(address), levelOf(address)]);
    return { location: profile?.location ?? null, verified: isVerified(level) };
  },
  blocked: blockedSet,
  saveFind,
  finds: (address) => myFinds(address),
  cleanRecordCounts: config.ARC_NETWORK === 'testnet',
  now: () => Date.now(),
  newId: () => randomUUID(),
};
