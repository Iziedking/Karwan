import type { DistanceLine, FindView, FoundLead, FoundPerson, Meet } from '@/core/api';
import type { FindPeopleCopy } from '@/shared/i18n/messages/findPeople';

/// How the people an agent found read on a screen (view 72). Pure.

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''));

/// A find's own page. The assistant's link to it is drawn as a card.
export const FIND_HREF = /^\/find\/([0-9a-f-]{36})$/i;

export function findIdOf(href: string): string | null {
  return FIND_HREF.exec(href)?.[1]?.toLowerCase() ?? null;
}

/// How far someone is, rounded, or null when it says nothing.
export function distanceText(d: DistanceLine, t: FindPeopleCopy): string | null {
  switch (d.key) {
    case 'nearby': return t.distance.nearby;
    case 'about': return fill(t.distance.about, { km: d.km });
    case 'far': return fill(t.distance.far, { km: d.km });
    case 'inCity':
    case 'sameCity': return fill(t.distance.inCity, { city: d.city });
    case 'sameCountry': return t.distance.sameCountry;
    default: return null;
  }
}

export function ratingText(p: Pick<FoundPerson, 'stars' | 'ratings'>, t: FindPeopleCopy): string {
  return p.stars !== null ? fill(t.rated, { stars: p.stars.toFixed(1), n: p.ratings }) : t.newOnKarwan;
}

/// The line under a name: rating, then how far.
export function personLine(p: FoundPerson, t: FindPeopleCopy): string {
  return [ratingText(p, t), distanceText(p.distance, t)].filter(Boolean).join(' · ');
}

export function rankText(index: number, t: FindPeopleCopy): string {
  return t.ranks[Math.min(index, t.ranks.length - 1)]!;
}

export function meetText(m: Meet, t: FindPeopleCopy): string {
  return [m.atMyPlace ? t.meet.atPlace : null, m.comeToYouKm !== null ? t.meet.comesTo : null, m.online ? t.meet.online : null].filter(Boolean).join(', ');
}

export function reasonsText(p: FoundPerson, t: FindPeopleCopy): string {
  return p.reasons.map((r) => t.reasons[r]).join(' · ');
}

export function daysText(days: number | null, t: FindPeopleCopy): string | null {
  if (days === null) return null;
  return days === 1 ? t.oneDay : fill(t.days, { n: days });
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/// "4 people near you" for in-person work, else "4 people found".
export function titleOf(f: Pick<FindView, 'kind' | 'rows'>, t: FindPeopleCopy): string {
  const n = f.rows.length;
  if (f.kind === 'in_person') return n === 1 ? t.nearYouOne : fill(t.nearYou, { n });
  return n === 1 ? t.foundOne : fill(t.found, { n });
}

export function endsText(f: Pick<FindView, 'status' | 'endsAt'>, t: FindPeopleCopy, locale: string): string {
  if (f.status === 'ended') return t.ended;
  const day = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(f.endsAt));
  return fill(t.endsOn, { day });
}

export { fill as fillFind };

/// Where a person asked stands, in place of their record line.
export function askedText(p: Pick<FoundPerson, 'asked'>, t: FindPeopleCopy, locale: string): string | null {
  const a = p.asked;
  if (!a) return null;
  if (a.answer === 'interested') return t.status.offered;
  if (a.answer === 'no' || a.answer === 'not_now') return t.status.declined;
  if (a.closed || a.nextAt === null) return t.status.noAnswer;
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(a.nextAt));
  return `${t.status.waiting} · ${fill(t.reminderAt, { time })}`;
}

export const PICK_MAX = 3;

/// Needs a seller may offer for at once (Phase 4).
export const PITCH_MAX = 5;

/// The line under a buyer's need: how often or when it is due, how far, verified.
export function leadLine(l: FoundLead, t: FindPeopleCopy): string {
  const when = l.every ? t.every[l.every] : l.dueDays !== null ? (l.dueDays <= 1 ? t.dueOne : fill(t.dueIn, { n: l.dueDays })) : null;
  return [when, distanceText(l.distance, t), l.buyerVerified ? t.verified : null].filter(Boolean).join(' · ');
}

/// "3 buyers near you".
export function buyersTitle(n: number, t: FindPeopleCopy): string {
  return n === 1 ? t.buyersOne : fill(t.buyers, { n });
}
