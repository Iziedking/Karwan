import type { DealView, TrustCardView } from '@/core/api';
import type { Messages } from '@/shared/i18n/messages/en';

type Copy = Messages['dealWorkspace'];

function formatEnglishDateParts(ms: number, options: Intl.DateTimeFormatOptions): string {
  const parts = new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).formatToParts(ms);
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }
  const day = values.day || '';
  const month = values.month || '';
  const year = values.year || '';
  if (options.month && !options.day) return `${month} ${year}`;
  return `${day} ${month} ${year}`;
}

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

export function formatUsdcAmount(usdc: string, locale: string): string {
  const [whole = '0', fraction = ''] = usdc.split('.');
  const grouped = new Intl.NumberFormat(locale).format(BigInt(whole || '0'));
  const trimmed = fraction.slice(0, 6).replace(/0+$/, '');
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}

export function formatDealDate(ms: number, locale: string): string {
  if (locale === 'en') {
    return formatEnglishDateParts(ms, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(ms);
}

function formatMonth(ms: number, locale: string): string {
  if (locale === 'en') {
    return formatEnglishDateParts(ms, { month: 'short', year: 'numeric' });
  }
  return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(ms);
}

export function actionLabel(next: DealView['next'], copy: Copy, locale: string): string | null {
  const amount = next.amountUsdc ? formatUsdcAmount(next.amountUsdc, locale) : '';
  switch (next.action) {
    case 'accept': return copy.actions.accept;
    case 'fund': return fill(copy.actions.fundTemplate, { amount });
    case 'deliver': return copy.actions.deliver;
    case 'release': return fill(copy.actions.releaseTemplate, { amount });
    case 'claim': return fill(copy.actions.claimTemplate, { amount });
    case 'review-manually': return copy.actions.reviewManually;
    case 'respond-extension': return copy.actions.respondExtension;
    case 'respond-cancel': return copy.actions.respondCancel;
    case 'dispute': return copy.actions.dispute;
    default: return null;
  }
}

/// The confirm sheet's consequence line for the actions that do not need a
/// bespoke sheet (accept and fund build their own; see useWorkspaceActions).
export function actionConsequence(next: DealView['next'], counterpartyName: string, copy: Copy, locale: string): string {
  const amount = next.amountUsdc ? formatUsdcAmount(next.amountUsdc, locale) : '';
  switch (next.action) {
    case 'release': return fill(copy.consequence.releaseTemplate, { amount, name: counterpartyName });
    case 'claim': return fill(copy.consequence.claimTemplate, { amount });
    case 'review-manually': return copy.consequence.reviewManually;
    default: return '';
  }
}

/// Money that has left escrow cannot be pulled back through the UI. Every
/// other confirm action can still be corrected (accept just agrees to terms,
/// fund is refused up front by the escrow if anything moved).
export function isIrreversibleAction(action: DealView['next']['action']): boolean {
  return action === 'release' || action === 'claim';
}

export function actorLabel(next: DealView['next'], counterpartyName: string, copy: Copy): string {
  if (next.actor === 'you') return copy.actor.you;
  if (next.actor === 'counterparty') return fill(copy.actor.waitingTemplate, { name: counterpartyName });
  return copy.actor.nobody;
}

export function trustFactParts(card: TrustCardView, copy: Copy, locale: string): string[] {
  const parts = [fill(copy.trust.settledTemplate, { n: card.facts.settled })];
  if (card.facts.withDeadline > 0) {
    parts.push(fill(copy.trust.onTimeTemplate, { on: card.facts.onTime, total: card.facts.withDeadline }));
  }
  parts.push(fill(copy.trust.disputesTemplate, { n: card.facts.disputes }));
  if (card.memberSince != null) parts.push(fill(copy.trust.sinceTemplate, { date: formatMonth(card.memberSince, locale) }));
  return parts;
}

export function automaticLine(view: DealView, copy: Copy, locale: string): string | null {
  if (!view.automatic) return null;
  const date = formatDealDate(view.automatic.at, locale);
  switch (view.automatic.kind) {
    case 'auto-release': return fill(copy.automatic.autoReleaseTemplate, { date });
    case 'deadline-reclaim': return fill(copy.automatic.deadlineReclaimTemplate, { date });
    case 'acceptance-expiry': return fill(copy.automatic.acceptanceExpiryTemplate, { date });
  }
}
