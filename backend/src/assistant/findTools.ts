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
import { buildNavigateAction, hasEquivalentConfirm, type AssistantAction, type ConfirmAction } from './actions.js';
import { buildAlertPeopleConfirm, buildBlockPersonConfirm, buildPitchBuyersConfirm, buildPitchInterestedConfirm, buildRemoveStandingNeedConfirm, buildSaveStandingNeedConfirm, EVERY_WORDS, REACHES_WORDS } from './findActions.js';
import { answerPitch, declineAlert, type DeclineResult } from '../find/answers.js';
import { contactOf, pitchesTo } from '../find/contacts.js';
import { customerLeads } from '../find/customersLive.js';
import { pitchView, type PitchView } from '../find/pitchView.js';
import { rankBuyersFor, type LeadCandidate, type LeadSeller } from '../find/rankBuyers.js';

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
  /// A seller says no thanks to a deal alert on this request.
  decline: (seller: string, jobId: string) => Promise<DeclineResult>;
  /// What a seller's agent reads to find buyers (Phase 4).
  customers: (seller: string) => Promise<{ seller: LeadSeller | null; leads: LeadCandidate[] }>;
  /// Pitches sent to this buyer, newest first, and one by id (theirs only).
  pitches: (buyer: string) => Promise<PitchView[]>;
  pitch: (buyer: string, id: string) => Promise<PitchView | null>;
  answerPitch: (buyer: string, id: string, answer: 'not_now' | 'no') => Promise<'answered' | 'already' | 'none'>;
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
        'Find people who sell what this person needs, near them or online, ranked by skill, then their record (verified, tier, rating), then distance (view 72). Use when they ask for someone: "I need a tailor near me", "find me a caterer in Abuja". Only people who chose to be found come up, at most five, the best fit recommended. Pass kind in_person for work done face to face, remote for online work, goods for things delivered. It moves no money and contacts nobody yet. A card with the people and a See all button is shown under your reply, so say in one or two sentences who fits best and why; do not list every row. Contacting them comes in a later step; until then offer to post a request or message one by tag. Nobody fits: say so plainly and offer to post it on the open market.',
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
        // The web shows the people as a card; chat apps get the link.
        const open = buildNavigateAction({ destination: 'find', token: saved.id, label: rows.length === 1 ? 'See them' : `See all ${rows.length}` });
        if (!('error' in open)) actions.push(open);
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

    alert_people: tool({
      description:
        'Prepare a card that posts the need privately and tells the people the buyer picked from their last find (find_people), one to three, by their number on that list (1 is the first). Each gets one message, reminded at most three times, spaced out and never at night; their offers come back to the buyer, who still picks one and locks the money. Use when the buyer says who to ask ("ask Ngozi and Amaka", "ask the first two"). Nothing is paid by this.',
      inputSchema: z.object({ people: z.array(z.number().int().min(1).max(5)).min(1).max(3) }),
      execute: async ({ people }) => {
        const find = (await deps.finds(me)).find((f) => f.side === 'buyer' && f.status === 'shortlisted' && !f.jobId);
        if (!find) return { error: 'There is no list of people to ask. Run find_people first.' };
        const picks = [...new Set(people.map((n) => n - 1))].filter((i) => !!find.rows[i]);
        if (picks.length === 0) return { error: `The list has ${find.rows.length} people; use their numbers from 1.` };
        return offer(actions, buildAlertPeopleConfirm({
          caller: me,
          find,
          picks,
          names: picks.map((i) => find.rows[i]!.name),
          budget: `About ${await deps.money(me, Number(find.budgetUsdc))}`,
          now: deps.now(),
        }));
      },
    }),

    decline_deal_alert: tool({
      description: 'For a SELLER who got a deal alert (someone needs your work): say no thanks to it, by the request id. Their agent stops on it and they get no more reminders for it. To say yes, make an offer on the request instead (make_offer).',
      inputSchema: z.object({ jobId: z.string().min(3).max(80) }),
      execute: async ({ jobId }) => {
        const r = await deps.decline(me, jobId);
        if (r === 'declined') return { ok: true, said: 'No thanks sent. No more reminders for it.' };
        if (r === 'matched') return { ok: true, said: 'They have already found someone, so nothing more is needed.' };
        return { error: 'There is no deal alert for them on that request.' };
      },
    }),

    find_customers: tool({
      description:
        "For a SELLER: find buyers for what they sell (view 72): open requests on the market that fit them, and the standing needs of buyers near them who let sellers reach them, best skill fit first, then distance, then the buyer's record. At most five, numbered from 1. Buyers are not named; each row says what they need, how often, the rough budget and how far they are. It contacts nobody. For a request, offer as on any request (propose_make_offer with its jobId; never show the jobId). For a need, offer with pitch_buyers and their numbers. Nobody fits: say so plainly.",
      inputSchema: z.object({}),
      execute: async () => {
        const { seller, leads } = await deps.customers(me);
        if (!seller) return { found: 0, next: 'They have no selling profile yet. Offer set_up_my_agents.' };
        const rows = rankBuyersFor(leads, seller, { blocked: await deps.blocked(me) });
        if (rows.length === 0) return { found: 0, next: 'No open request or reachable buyer fits what they sell right now. Their agent tells them when one does.' };
        const now = deps.now();
        const saved = await deps.saveFind({
          id: deps.newId(), owner: me, side: 'seller', mode: 'choose', need: 'Buyers for what I sell', budgetUsdc: '0', kind: 'remote', where: { scope: 'anywhere' },
          jobId: null, needId: null, rows: [], leads: rows, status: 'shortlisted', createdAt: now, endsAt: findEndsAt(now, null),
        });
        return {
          found: rows.length,
          link: `/find/${saved.id}`,
          buyers: await Promise.all(rows.map(async (r, i) => ({
            number: i + 1,
            kind: r.kind === 'request' ? 'open request' : 'regular need',
            ...(r.kind === 'request' ? { jobId: r.ref } : {}),
            what: r.what,
            every: r.every ? EVERY_WORDS[r.every] : null,
            budget: r.budgetUsdc ? `about ${await deps.money(me, Number(r.budgetUsdc))}` : 'no budget said',
            distance: distanceWords(r.distance),
            dueDays: r.dueDays,
            verifiedBuyer: r.buyerVerified,
          }))),
        };
      },
    }),

    pitch_buyers: tool({
      description:
        'For a SELLER: prepare a card that offers to help buyers from their last find_customers list, by number, for their regular needs only (one to five), with one price in USDC, the days it takes and a short note. Each buyer gets one message and one reminder the next morning; a buyer who said not interested is never asked again for that need. The buyer who says interested posts a private request with this offer on it, then accepts it as any offer. Nothing is paid by this.',
      inputSchema: z.object({
        buyers: z.array(z.number().int().min(1).max(5)).min(1).max(5),
        priceUsdc: z.number().positive().max(10_000_000),
        days: z.number().int().min(1).max(90),
        note: z.string().max(280).optional(),
      }),
      execute: async ({ buyers, priceUsdc, days, note }) => {
        const find = (await deps.finds(me)).find((f) => f.side === 'seller' && f.status !== 'ended' && (f.leads?.length ?? 0) > 0);
        const leads = find?.leads;
        if (!find || !leads) return { error: 'There is no list of buyers. Run find_customers first.' };
        const picks = [...new Set(buyers.map((n) => n - 1))].filter((i) => !!leads[i]);
        const requests = picks.filter((i) => leads[i]!.kind === 'request');
        if (requests.length) return { error: `Number ${requests.map((i) => i + 1).join(', ')} is an open request: offer on it with propose_make_offer instead.` };
        if (picks.length === 0) return { error: `The list has ${leads.length} rows; use their numbers from 1.` };
        const price = String(Math.round(priceUsdc * 1e6) / 1e6);
        return offer(actions, buildPitchBuyersConfirm({
          findId: find.id, picks, needs: picks.map((i) => leads[i]!.what), priceUsdc: price, price: await deps.money(me, priceUsdc), days, note: note?.trim() ?? '',
        }));
      },
    }),

    my_pitches: tool({
      description: 'For a BUYER: the offers sellers sent them for their regular needs (pitches), newest first, each with its id, what it is for, who sent it, their price and days, and whether they answered.',
      inputSchema: z.object({}),
      execute: async () => ({
        pitches: await Promise.all((await deps.pitches(me)).map(async (p) => ({
          id: p.id, for: p.what, from: p.seller.name, verified: p.seller.verified, rating: p.seller.stars,
          price: p.priceUsdc ? await deps.money(me, Number(p.priceUsdc)) : null, days: p.days, distance: distanceWords(p.distance),
          answered: p.answer, closed: p.closed,
        }))),
      }),
    }),

    answer_pitch: tool({
      description:
        "For a BUYER: answer a seller's offer for one of their regular needs (id from my_pitches). interested prepares a card that posts it privately to that seller with their offer on it, which they then accept as any offer. not_now stops offers from that seller for 30 days; no stops that seller offering for this need again. The seller is not told a no.",
      inputSchema: z.object({ id: z.string().min(1).max(80), answer: z.enum(['interested', 'not_now', 'no']) }),
      execute: async ({ id, answer }) => {
        const p = await deps.pitch(me, id);
        if (!p) return { error: 'There is no such offer for them. Read my_pitches for the ids.' };
        if (p.answer !== null || p.closed) return { error: 'They already answered this offer.' };
        if (answer !== 'interested') {
          const r = await deps.answerPitch(me, id, answer);
          if (r !== 'answered') return { error: 'That offer could not be answered.' };
          return { ok: true, said: answer === 'no' ? 'Not interested. That seller will not offer for this need again.' : 'Not now. No offers from that seller for 30 days.' };
        }
        if (!p.priceUsdc || !p.days) return { error: 'That offer has no price on it.' };
        return offer(actions, buildPitchInterestedConfirm({
          caller: me, pitchId: p.id, what: p.what, kind: p.kind, priceUsdc: p.priceUsdc, days: p.days, sellerName: p.seller.name, price: await deps.money(me, Number(p.priceUsdc)),
        }));
      },
    }),

    my_finds: tool({
      description: 'List the people searches this person ran (find_people), newest first, each with what was needed, how many came up, its state and its link.',
      inputSchema: z.object({}),
      execute: async () => ({
        finds: (await deps.finds(me)).map((f) => ({ side: f.side, need: f.need, found: f.side === 'seller' ? (f.leads?.length ?? 0) : f.rows.length, status: f.status, link: `/find/${f.id}` })),
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
  decline: (seller, jobId) => declineAlert(seller, jobId, Date.now()),
  customers: customerLeads,
  pitches: async (buyer) => Promise.all((await pitchesTo(buyer)).map(pitchView)),
  pitch: async (buyer, id) => {
    const c = await contactOf(id);
    return c && c.kind === 'pitch' && c.to === buyer.toLowerCase() && c.delivered ? pitchView(c) : null;
  },
  answerPitch: (buyer, id, answer) => answerPitch(buyer, id, answer, Date.now()),
};
