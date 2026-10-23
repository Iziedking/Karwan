import type { AgentPrefs, UserLocale, UserProfile, UserSettings } from '../db/profiles.js';
import { parsePlace } from '../location/rules.js';
import { parseBriefPrice } from './agentBriefParse.js';
import { briefLines, type BriefAnswers, type BriefRead } from './agentBriefLines.js';
import { legacyFromWays, waysOf, withWay, type SellWay } from './ways.js';

/// The setup conversation's answers, read into the account's settings (view
/// 19). Shared by the website, the Telegram interview and the assistant, so
/// every channel sets an account up the same way. Nothing is saved here.

export type ProfilePatch = Pick<UserProfile, 'goals' | 'agentPrefs' | 'ownWords' | 'workPlaces' | 'businessDraft'> &
  Partial<Pick<UserProfile, 'role' | 'seller' | 'buyer' | 'agentWays'>> & { settings?: Partial<UserSettings> };

export interface BriefResult {
  patch: ProfilePatch;
  lines: string[];
  /// A question to ask once more, because its answer could not be read.
  needs: Array<'price'>;
  place: BriefRead['place'];
}

/// When a price cannot be read the schema still needs a range; the agent never
/// offers on it because an unset price makes it ask first.
const UNSET_RANGE = { min: 1, max: 100000 };
const DEFAULT_DAYS = { minDays: 1, maxDays: 14 };

const clip = (text: string | undefined, max: number) => (text ?? '').trim().slice(0, max);

function businessOf(text: string): { name: string; trades: string } | null {
  const clean = clip(text, 200);
  if (!clean) return null;
  const cut = clean.indexOf(',');
  return cut < 0 ? { name: clean.slice(0, 80), trades: '' } : { name: clean.slice(0, cut).trim().slice(0, 80), trades: clean.slice(cut + 1).trim() };
}

export async function readBrief(
  a: BriefAnswers,
  current: UserProfile | null,
  deps: { keywords: (text: string) => Promise<string[]> },
  locale: UserLocale,
): Promise<BriefResult> {
  const has = (g: BriefAnswers['goals'][number]) => a.goals.includes(g);
  const selling = has('work') || has('sell');
  const buying = has('buy');
  const prefs: AgentPrefs = { ...(current?.agentPrefs ?? {}) };
  const settings: Partial<UserSettings> = {};
  const patch: ProfilePatch = { goals: a.goals, agentPrefs: prefs, settings };
  const needs: BriefResult['needs'] = [];

  const what = clip(a.what, 400);
  const priceText = clip(a.price, 200);
  const priced = parseBriefPrice(priceText);
  const price = priced.price ?? (priceText ? null : current?.seller ? { min: current.seller.minBudgetUsdc, max: current.seller.maxBudgetUsdc } : null);
  const pace = priced.pace ?? (current?.seller ? { minDays: current.seller.minDeadlineDays, maxDays: current.seller.maxDeadlineDays } : null);

  if (selling) {
    if (!priced.price && priceText && !a.retried) needs.push('price');
    let skills: string[];
    try {
      skills = what ? (await deps.keywords(what)).slice(0, 6) : [];
    } catch {
      skills = [];
    }
    if (skills.length === 0) skills = what ? [what.slice(0, 40).trim()] : current?.seller?.skills ?? [has('work') ? 'services' : 'products'];
    const range = price ?? UNSET_RANGE;
    const days = pace ?? DEFAULT_DAYS;
    patch.seller = {
      ...(current?.seller ?? {}),
      skills,
      // The tags gate which requests the agent bids on, so they follow the words.
      ...(what ? { keywords: skills } : {}),
      bio: what || current?.seller?.bio || '',
      minBudgetUsdc: range.min,
      maxBudgetUsdc: range.max,
      minDeadlineDays: days.minDays,
      maxDeadlineDays: days.maxDays,
    };
    prefs.sellerPriceSet = !!price;
    // How clients pay becomes the selling way the agent starts with (view 26).
    // Goods need somewhere to ship to, read from where they are.
    const shipsTo = clip(a.where, 120);
    const way: SellWay | null = !a.paid || !price
      ? null
      : a.paid === 'goods'
        ? shipsTo
          ? { shape: 'goods', what: (what || skills[0] || 'Goods').slice(0, 120), priceMin: range.min, priceMax: range.max, shipsTo, arriveDaysMin: days.minDays, arriveDaysMax: days.maxDays }
          : null
        : a.paid === 'milestones'
          ? { shape: 'milestones', priceMin: range.min, priceMax: range.max, daysMin: days.minDays, daysMax: days.maxDays, stages: 2 }
          : { shape: 'one_time', priceMin: range.min, priceMax: range.max, daysMin: days.minDays, daysMax: days.maxDays };
    if (way) {
      const base = current?.agentWays ?? { sell: [], buy: waysOf({ buyer: current?.buyer }).buy };
      const ways = withWay(base, 'sell', way.shape, way);
      patch.agentWays = ways;
      patch.seller = legacyFromWays(ways, { seller: patch.seller }).seller;
    }
    if (a.clients) prefs.findClients = a.clients !== 'own';
    prefs.agentMode = !price ? 'ask' : a.own ?? prefs.agentMode ?? 'offers';
  } else if (current?.seller) {
    // Kept for a later return, but off the market.
    patch.seller = current.seller;
    prefs.findClients = false;
  }

  const buyText = clip(a.buy, 200);
  const buyMax = buyText ? parseBriefPrice(buyText).price?.max ?? null : null;
  if (buying) {
    const max = buyMax ?? current?.buyer?.maxBudgetUsdc ?? null;
    patch.buyer = {
      maxBudgetUsdc: max ?? 100,
      minDeadlineDays: current?.buyer?.minDeadlineDays ?? DEFAULT_DAYS.minDays,
      maxDeadlineDays: current?.buyer?.maxDeadlineDays ?? DEFAULT_DAYS.maxDays,
      bidCollectionSeconds: current?.buyer?.bidCollectionSeconds ?? 45,
      milestonePcts: current?.buyer?.milestonePcts ?? [100],
    };
    prefs.buyerPriceSet = max != null;
  } else if (current?.buyer) {
    patch.buyer = current.buyer;
  }

  if (selling && buying) patch.role = 'both';
  else if (selling) patch.role = 'seller';
  else if (buying) patch.role = 'buyer';

  const business = has('business') ? businessOf(a.business ?? '') : null;
  if (business) {
    patch.businessDraft = business;
    settings.tradesAs = 'business';
  }
  if (has('record') && a.places?.trim()) patch.workPlaces = clip(a.places, 200);
  if (a.reach) settings.notifyVia = a.reach;

  patch.ownWords = {
    ...(current?.ownWords ?? {}),
    ...(what ? { what } : {}),
    ...(priceText ? { price: priceText } : {}),
    ...(buyText ? { buy: buyText } : {}),
    ...(a.business?.trim() ? { business: clip(a.business, 200) } : {}),
  };

  const parsed = a.where?.trim() ? parsePlace(a.where) : null;
  const place = parsed?.country ? { country: parsed.country, city: parsed.city } : null;
  const read: BriefRead = { price: selling ? price : null, pace: selling ? pace : null, buyMax, business, place };
  return { patch, lines: briefLines(a, read, locale), needs, place };
}
