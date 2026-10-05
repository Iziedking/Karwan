'use client';

import type { MatchProposal } from '@/core/api';
import { presentMatchingState } from '@/features/jobs/matchingPresentation';
import { labelFor } from './PendingDealsBand';
import type { OpenDirectDeal } from '../hooks/useOpenDeals';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { Button } from '@/shared/components/Button';
import { cn } from '@/shared/utils/cn';
import { OpenDealRow, shortDate } from './OpenDealRow';

export function ProfileOpenDealsPanel({
  address,
  matches,
  directDeals,
  fetchState,
  onRetry,
}: {
  address: string;
  matches: MatchProposal[];
  directDeals: OpenDirectDeal[];
  fetchState: 'idle' | 'loading' | 'success' | 'partial-error' | 'error';
  onRetry: () => void;
}) {
  const { locale, t: messages } = useLocale();
  const t = messages.pending;
  const matching = messages.negotiationCard;
  const showError = fetchState === 'error' || fetchState === 'partial-error';
  const me = address.toLowerCase();

  const matchRows = matches.map((proposal) => {
    const isSeller = proposal.sellerUser.toLowerCase() === me;
    const presentation = presentMatchingState({ proposal, viewerAddress: address });
    const business = !isSeller ? proposal.counterpartyBusiness?.companyName?.trim() : undefined;
    return (
      <OpenDealRow
        key={proposal.jobId}
        href={`/jobs/${proposal.jobId}`}
        role={isSeller ? t.card.roleSeller : t.card.roleBuyer}
        counterparty={business}
        amount={presentation.currentOffer?.amountUsdc ?? proposal.agreedPriceUsdc}
        unit={t.card.unit}
        status={matching.states[presentation.state].tag}
        yourMove={presentation.nextActor === (isSeller ? 'seller' : 'buyer')}
        next={matching.nextActors[presentation.nextActor]}
        due={proposal.deadlineUnix ? t.card.dueTemplate.replace('{date}', shortDate(proposal.deadlineUnix, locale)) : undefined}
      />
    );
  });

  const dealRows = directDeals.map((item) => {
    const state = labelFor(item.stage, item.isBuyer, t.chips);
    if (!state) return null;
    return (
      <OpenDealRow
        key={item.deal.jobId}
        href={`/deals/${item.deal.jobId}`}
        role={item.isBuyer ? t.card.roleBuyer : t.card.roleSeller}
        amount={item.deal.dealAmountUsdc}
        unit={t.card.unit}
        status={state.text}
        yourMove={state.kind === 'action'}
        due={item.deal.deadlineUnix ? t.card.dueTemplate.replace('{date}', shortDate(item.deal.deadlineUnix, locale)) : undefined}
      />
    );
  });

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      {showError ? (
        <div className="flex items-center justify-between gap-4 border-b border-[var(--lp-border-light)] pb-4">
          <p role="status" className="text-[14px] text-[var(--lp-text-sub)] font-medium">{t.matches.loadError}</p>
          <Button type="button" variant="outline" onClick={onRetry}>{t.matches.retry}</Button>
        </div>
      ) : null}

      {!showError && fetchState === 'success' && matches.length === 0 && directDeals.length === 0 ? (
        <p className="py-8 text-[15px] font-medium text-[var(--lp-text-sub)]">No open deals.</p>
      ) : null}

      {matchRows.length > 0 ? (
        <section aria-label={t.matches.sectionTag}>
          {dealRows.length > 0 ? <h3 className="pb-1 pt-2 text-[15px] font-semibold text-[var(--lp-dark)]">{t.matches.sectionTag}</h3> : null}
          <ul className="divide-y divide-[var(--lp-border-light)]">{matchRows}</ul>
        </section>
      ) : null}

      {dealRows.length > 0 ? (
        <section aria-label={t.deals.sectionTag} className={cn(matchRows.length > 0 && 'mt-6')}>
          {matchRows.length > 0 ? <h3 className="pb-1 pt-2 text-[15px] font-semibold text-[var(--lp-dark)]">{t.deals.sectionTag}</h3> : null}
          <ul className="divide-y divide-[var(--lp-border-light)]">{dealRows}</ul>
        </section>
      ) : null}
    </div>
  );
}
