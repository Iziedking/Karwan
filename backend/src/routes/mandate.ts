import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { ProfilePatch } from '../agents/agentBrief.js';
import type { AgentRecord } from '../agents/agentRecord.js';
import { DEFAULT_BRIEF, mandateOf, mandatePatchSchema, sayMandate, validatePatch, type Mandate, type MandatePatch } from '../agents/mandate.js';
import type { Replan } from '../agents/replan.js';
import { waysOf, waysSchema, type AgentWays, type SellWay } from '../agents/ways.js';
import type { UserLocale, UserProfile } from '../db/profiles.js';
import type { MarketWatch } from '../intelligence/watches.js';
import { patchForWays } from './setup.js';

/// The person's mandate, read as one thing and changed one part at a time
/// (view 52, step 3). A change comes only from a confirm card the person
/// pressed: the body carries that card's id, used once. Each part is written to
/// the store that already holds it, then the agent re-plans at once.

export interface MandateRouteDeps {
  sessionAddress: (c: Context) => string | null | Promise<string | null>;
  current: (address: string) => Promise<UserProfile | null>;
  save: (address: string, patch: ProfilePatch) => Promise<UserProfile | null>;
  record: (address: string) => Promise<AgentRecord>;
  updateRecord: (address: string, change: (r: AgentRecord) => AgentRecord) => Promise<AgentRecord>;
  watches: (address: string, now: number) => Promise<MarketWatch[]>;
  replan: (owner: string, before: Mandate, patch: MandatePatch, locale: UserLocale) => Promise<Replan>;
  now: () => number;
  newId: () => string;
}

const bodySchema = z.object({ patch: mandatePatchSchema, cardId: z.string().trim().min(8).max(120) });

const DAY_MS = 86_400_000;
const CARD_TTL_MS = DAY_MS;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function withSellPrice(ways: AgentWays, p: Extract<MandatePatch, { part: 'sell-price' }>): AgentWays {
  const sell = ways.sell.map((w): SellWay => {
    if (w.shape !== p.shape) return w;
    switch (w.shape) {
      case 'deposit':
        return { ...w, deposit: p.lowestUsdc };
      case 'hourly':
        return { ...w, rateMin: p.lowestUsdc, ...(p.usualUsdc !== undefined ? { rateUsual: p.usualUsdc } : {}) };
      default: {
        const { usualGuessed: _g, ...rest } = w as typeof w & { usualGuessed?: true };
        return p.usualUsdc !== undefined ? ({ ...rest, priceMin: p.lowestUsdc, priceUsual: p.usualUsdc } as SellWay) : ({ ...w, priceMin: p.lowestUsdc } as SellWay);
      }
    }
  });
  return { sell, buy: ways.buy };
}

function withBuyMost(ways: AgentWays, usdcMost: number): AgentWays {
  return { sell: ways.sell, buy: ways.buy.map((w) => (w.shape === 'deposit' ? { ...w, maxDeposit: usdcMost } : { ...w, maxPrice: usdcMost })) };
}

/// The profile change for a part the profile holds, or null for a part the
/// agent record holds.
function profilePatchFor(current: UserProfile, p: MandatePatch): ProfilePatch | null {
  const { saved: _s, ...ways } = waysOf(current);
  switch (p.part) {
    case 'sell-price':
      return patchForWays(withSellPrice(ways, p), current);
    case 'alone':
      return { agentPrefs: { ...(current.agentPrefs ?? {}), agentMode: p.mode } };
    case 'buy-most':
      if (current.agentWays && ways.buy.length) return patchForWays(withBuyMost(ways, p.usdc), current);
      return {
        buyer: current.buyer
          ? { ...current.buyer, maxBudgetUsdc: p.usdc }
          : { maxBudgetUsdc: p.usdc, minDeadlineDays: 1, maxDeadlineDays: 14, bidCollectionSeconds: 45, milestonePcts: [100] },
      };
    default:
      return null;
  }
}

function recordChangeFor(p: MandatePatch, now: number, newId: () => string): ((r: AgentRecord) => AgentRecord) | null {
  switch (p.part) {
    case 'weekly-limit':
      return (r) => ({ ...r, weeklyBudgetUsdc: round6(p.usdc), lastBudgetNoticeAt: undefined });
    case 'goal-add':
      return (r) => ({
        ...r,
        goals: [...(r.goals ?? []), { id: newId(), kind: p.kind, text: p.text.trim(), ...(p.untilDays ? { until: now + p.untilDays * DAY_MS } : {}), createdAt: now }],
      });
    case 'goal-remove':
      return (r) => ({ ...r, goals: (r.goals ?? []).filter((g) => g.id !== p.id) });
    case 'brief':
      return (r) => {
        const { part: _p, ...change } = p;
        const defined = Object.fromEntries(Object.entries(change).filter(([, v]) => v !== undefined));
        return { ...r, brief: { ...DEFAULT_BRIEF, ...(r.brief ?? {}), ...defined } };
      };
    case 'quiet':
      return (r) => ({ ...r, quiet: { from: p.from, to: p.to } });
    case 'quiet-off':
      return (r) => ({ ...r, quiet: null });
    default:
      return null;
  }
}

export function createMandateRoutes(deps: MandateRouteDeps): Hono {
  const app = new Hono();
  const usedCards = new Map<string, number>();

  function cardFresh(owner: string, cardId: string, now: number): boolean {
    for (const [k, at] of usedCards) if (now - at > CARD_TTL_MS) usedCards.delete(k);
    const key = `${owner}:${cardId}`;
    if (usedCards.has(key)) return false;
    usedCards.set(key, now);
    return true;
  }

  async function read(owner: string, now: number) {
    const [profile, record, watches] = await Promise.all([deps.current(owner), deps.record(owner), deps.watches(owner, now)]);
    if (!profile) return null;
    const locale = (profile.settings?.locale ?? 'en') as UserLocale;
    return { profile, record, watches, locale, mandate: mandateOf(profile, record, watches) };
  }

  app.get('/', async (c) => {
    const owner = (await deps.sessionAddress(c))?.toLowerCase();
    if (!owner) return c.json({ error: 'not authenticated' }, 401);
    const r = await read(owner, deps.now());
    if (!r) return c.json({ error: 'profile not found' }, 404);
    return c.json({ mandate: r.mandate, lines: sayMandate(r.mandate, r.locale) });
  });

  app.post('/', async (c) => {
    const owner = (await deps.sessionAddress(c))?.toLowerCase();
    if (!owner) return c.json({ error: 'not authenticated' }, 401);
    const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'A change needs the card you confirmed, with one part to change.' }, 400);
    const now = deps.now();
    const before = await read(owner, now);
    if (!before) return c.json({ error: 'profile not found' }, 404);
    const { patch, cardId } = parsed.data;
    const refusal = validatePatch(before.mandate, patch, before.locale);
    if (refusal) return c.json({ error: refusal }, 400);
    const profileChange = profilePatchFor(before.profile, patch);
    if (profileChange?.agentWays && !waysSchema.safeParse(profileChange.agentWays).success) {
      return c.json({ error: 'That price does not fit your selling way.' }, 400);
    }
    if (!cardFresh(owner, cardId, now)) return c.json({ error: 'That is already done.', code: 'reused' }, 409);

    const profile = profileChange ? await deps.save(owner, profileChange) : before.profile;
    if (!profile) return c.json({ error: 'profile not found' }, 404);
    const change = recordChangeFor(patch, now, deps.newId);
    const record = change ? await deps.updateRecord(owner, change) : before.record;

    const mandate = mandateOf(profile, record, before.watches);
    const replan = await deps.replan(owner, before.mandate, patch, before.locale);
    return c.json({ mandate, lines: sayMandate(mandate, before.locale), replan });
  });

  return app;
}

/// Mounted at /api/agents/mandate. The live wiring loads on first use, so the
/// route inventory and tests never open the database.
const live = () => import('../agents/mandateLive.js').then((m) => m.liveMandateDeps);
export const mandateRoutes = createMandateRoutes({
  sessionAddress: async (c) => (await live()).sessionAddress(c),
  current: async (a) => (await live()).current(a),
  save: async (a, p) => (await live()).save(a, p),
  record: async (a) => (await live()).record(a),
  updateRecord: async (a, ch) => (await live()).updateRecord(a, ch),
  watches: async (a, n) => (await live()).watches(a, n),
  replan: async (o, b, p, l) => (await live()).replan(o, b, p, l),
  now: Date.now,
  newId: () => `g_${randomUUID().slice(0, 12)}`,
});
