import type { SealedShortlistEntry, ShortlistEntry } from '../agents/shortlist.js';

type Row = ShortlistEntry | SealedShortlistEntry;

/// The shortlist as one chat message, for any channel. The person replies with
/// a number and the assistant prepares the confirm step, so choosing in chat
/// runs the same route and confirm card as the app.

const TIER_WORDS: Record<string, string> = {
  NEW: 'New',
  COLD: 'Building',
  ESTABLISHED: 'Established',
  STRONG: 'Strong',
  ELITE: 'Elite',
};

function numbersLine(e: Row): string | null {
  if (!e.counts) return e.recordChecked ? 'Record checked' : null;
  const nums =
    e.counts.completed === 0
      ? 'No completed deals yet'
      : [
          `${e.counts.completed} completed deals`,
          e.counts.onTimeRate !== null ? `${e.counts.onTimeRate}% on time` : null,
          `${e.counts.disputesLost} disputes lost`,
        ]
          .filter(Boolean)
          .join(' · ');
  return e.recordChecked ? `${nums} · Record checked` : nums;
}

function row(e: Row, webBase: string): string {
  const head = `${e.rank}. ${e.name}${e.tag ? ` @${e.tag}` : ''}${e.recommended ? ' · Recommended' : ''}`;
  // People see tier and reasons; a score is for agents (D30).
  const level = `${e.verified ? 'Verified' : 'Not verified'} · ${TIER_WORDS[e.tier] ?? e.tier}`;
  const offer = e.offer ? `${e.offer}, ` : '';
  const price = `${offer}${e.deliveryDays} days · ${e.priceUsdc} USDC${e.askedUsdc !== null ? ` (asked ${e.askedUsdc})` : ''}`;
  const numbers = numbersLine(e);
  const lines = [head, level, price, ...(numbers ? [numbers] : [])];
  if (e.state === 'unavailable') lines.push('No longer available');
  // view 41, decisions 11 and 13
  if (e.mustLink) lines.push('Not linked to their account yet. You can choose them once they link it.');
  else if (e.extraDays) lines.push(`Needs ${e.extraDays} ${e.extraDays === 1 ? 'day' : 'days'} longer than your request`);
  else if (e.outsideRequest) lines.push('Above your budget, outside your request');
  if (e.tag) lines.push(`Profile: ${webBase.replace(/\/$/, '')}/r/${e.tag}`);
  return lines.join('\n');
}

export function shortlistText(
  entries: readonly Row[],
  webBase: string,
  opts: { readsBalanceEmpty: boolean },
): string {
  const parts: string[] = [];
  if (opts.readsBalanceEmpty) {
    parts.push('Your agent could not check records for this list, so it uses free data. Top up your buying agent in Profile and your agent checks records again.');
  }
  if (entries.length === 0) {
    parts.push('No one has offered yet. Your agent keeps looking until the request closes.');
    return parts.join('\n\n');
  }
  parts.push('*Your shortlist*');
  if (!entries.some((e) => e.recommended)) {
    parts.push(
      entries.some((e) => e.verified)
        ? 'No verified seller is within your budget yet.'
        : 'None of these sellers is verified yet.',
    );
  }
  parts.push(...entries.map((e) => row(e, webBase)));
  parts.push('Reply with a number to choose. You confirm before any money moves.');
  return parts.join('\n\n');
}
