'use client';
import { OpenDealRow, shortDate } from './OpenDealRow';
import { type DirectDeal } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useDirectDeals } from '@/features/deals/hooks/useDirectDeals';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages';
import { Band, SectionTag, HeroHeadline, Punc } from '@/shared/components/Bands';
import { Hint } from '@/shared/components/Hint';
import { stageOf, type DealStage } from '@/features/deals/components/DirectDealList';

interface Props {
  tone?: 'light' | 'dark';
  headline?: string;
}

type PendingChips = Messages['pending']['chips'];

/// Chip label for a deal stage from the viewer's side: either an action this
/// viewer owns or a wait on the counterparty. Null on terminal stages so
/// finished deals do not render here.
export function labelFor(
  stage: DealStage,
  isBuyer: boolean,
  chips: PendingChips,
): { kind: 'action' | 'wait'; text: string } | null {
  switch (stage) {
    case 'awaiting-acceptance':
      return isBuyer
        ? { kind: 'wait', text: chips.waitingOnSeller }
        : { kind: 'action', text: chips.agreeTerms };
    case 'awaiting-funding':
      return isBuyer
        ? { kind: 'action', text: chips.reviewFunding }
        : { kind: 'wait', text: chips.waitingOnBuyer };
    case 'awaiting-delivery':
      return isBuyer
        ? { kind: 'wait', text: chips.waitingOnSeller }
        : { kind: 'action', text: chips.markDelivered };
    case 'awaiting-first-release':
      return isBuyer
        ? { kind: 'action', text: chips.releaseFirst }
        : { kind: 'wait', text: chips.waitingOnBuyer };
    case 'awaiting-final-release':
      return isBuyer
        ? { kind: 'action', text: chips.releaseFinal }
        : { kind: 'wait', text: chips.waitingOnBuyer };
    default:
      return null;
  }
}

/// Live direct deals on the viewer's book. Used on /app, /profile, /seller.
/// Green chips mark deals where the viewer must move; grey chips mark deals
/// waiting on the counterparty. Terminal stages drop off. Match proposals
/// surface in ProfileOpenDealsPanel. Polls every 10s.
export function PendingDealsBand({ tone = 'light', headline }: Props) {
  const auth = useAuth();
  const { locale, t: messages } = useLocale();
  const t = messages.pending;
  const resolvedHeadline = headline ?? t.deals.headline;
  const address = auth.address;
  /// Single source of truth for deal lists. Inheriting the shared cache
  /// kills the duplicate fetch this component used to fire on every
  /// mount, and the persister excludes the deals namespace, so the band
  /// never renders a stale snapshot, it shows nothing until the fresh
  /// fetch lands. That removes the "old deals flash on home / profile"
  /// regression cleanly.
  const { deals, fetchState } = useDirectDeals();

  const me = address?.toLowerCase() ?? '';
  const rows = deals
    .map((deal) => {
      const isBuyer = deal.buyer.toLowerCase() === me;
      const label = labelFor(stageOf(deal), isBuyer, t.chips);
      return label ? { deal, isBuyer, label } : null;
    })
    .filter(
      (x): x is {
        deal: DirectDeal;
        isBuyer: boolean;
        label: { kind: 'action' | 'wait'; text: string };
      } => x !== null,
    );

  /// While the first fetch is in flight, render nothing instead of an
  /// empty list, keeps the layout from briefly hopping into the page
  /// before the truth arrives. Once we have a response (even one with
  /// zero rows), the band hides as before.
  if (fetchState !== 'success') return null;
  if (rows.length === 0) return null;

  return (
    <Band tone={tone} compact>
      {/* Same measure as every neighbour on this page: MoneyStrip above,
          the agent card below. Without it the band spread to the Band's
          full width and the card read as longer than everything near it. */}
      <div className="mx-auto w-full max-w-[1040px]">
      {/* The green/grey chip legend folds into a gently glowing tap-to-reveal
          hint beside the eyebrow, so the header stays clean on mobile. */}
      <div className="flex items-center gap-2">
        <SectionTag tone={tone} dot="live">
          {t.deals.sectionTag}
        </SectionTag>
        <Hint glow side="bottom" align="start">
          {t.deals.body}
        </Hint>
      </div>
      <HeroHeadline as="h2" size="md">
        {resolvedHeadline}
        <Punc>.</Punc>
      </HeroHeadline>
      <ul className="mt-6 divide-y divide-[var(--lp-border-light)] border-y border-[var(--lp-border-light)]">
        {rows.map(({ deal, isBuyer, label }) => (
          <OpenDealRow
            key={deal.jobId}
            href={`/deals/${deal.jobId}`}
            role={isBuyer ? t.card.roleBuyer : t.card.roleSeller}
            amount={deal.dealAmountUsdc}
            unit={t.card.unit}
            status={label.text}
            yourMove={label.kind === 'action'}
            due={deal.deadlineUnix ? t.card.dueTemplate.replace('{date}', shortDate(deal.deadlineUnix, locale)) : undefined}
          />
        ))}
      </ul>
      </div>
    </Band>
  );
}
