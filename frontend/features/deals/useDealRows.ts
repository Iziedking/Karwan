'use client';

import { useMemo } from 'react';
import { presentMatchingState } from '@/features/jobs/matchingPresentation';
import { requestRef } from '@/features/jobs/requestRef';
import { labelFor } from '@/features/notifications/dealNextStep';
import { useOpenDeals } from '@/features/notifications/hooks/useOpenDeals';
import { financedStage } from '@/features/notifications/openDealsModel';
import { OpenDealRow, shortDate } from '@/features/notifications/components/OpenDealRow';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { stageOf } from './components/DirectDealList';
import { dealReference } from './dealReference';
import { classifyDirectDeal, dealState, orderDeals, rowMove, type Orderable } from './dealsList';
import { useDirectDeals } from './hooks/useDirectDeals';
import { whatItIs } from './workspace/titleLine';

export interface DealRow extends Orderable {
  key: string;
  row: Omit<Parameters<typeof OpenDealRow>[0], 'yourMove'>;
}

const toMs = (value: number) => (value < 10_000_000_000 ? value * 1_000 : value);

/// Every deal the person is in, as rows for the Deals list and Home: direct
/// deals, requests still being agreed, and deals they financed, in one order.
export function useDealRows() {
  const { locale, t: messages } = useLocale();
  const p = messages.pending;
  const address = useAuth().address ?? '';
  const direct = useDirectDeals();
  const open = useOpenDeals();

  const groups = useMemo(() => {
    const me = address.toLowerCase();
    const due = (unix?: number | null) => (unix ? p.card.dueTemplate.replace('{date}', shortDate(unix, locale)) : undefined);
    const rows: DealRow[] = [];
    const seen = new Set<string>();

    for (const deal of direct.deals) {
      const c = classifyDirectDeal(deal, me);
      const live = labelFor(c.stage, c.isBuyer, p.chips);
      seen.add(deal.jobId.toLowerCase());
      rows.push({
        key: deal.jobId,
        yourMove: c.yourMove,
        finished: c.finished,
        dueUnix: c.finished ? null : deal.deadlineUnix ?? null,
        updatedAtMs: toMs(deal.updatedAt || deal.createdAt),
        row: {
          href: `/deals/${deal.jobId}`,
          role: c.isBuyer ? p.card.roleBuyer : p.card.roleSeller,
          counterparty: deal.counterpartyTrust?.name ?? undefined,
          counterpartyAddress: c.isBuyer ? deal.seller : deal.buyer,
          title: whatItIs(deal),
          deal,
          reference: dealReference(deal.jobId),
          amount: deal.dealAmountUsdc,
          unit: p.card.unit,
          status: live?.text ?? messages.dealStage.labels[c.stage],
          due: c.finished ? undefined : due(deal.deadlineUnix),
          move: (() => { const m = rowMove(deal); return m ? messages.dealsPage.move[m] : undefined; })(),
          state: dealState({ yourMove: c.yourMove, finished: c.finished, deal }),
          // An ended deal's line says when it ended.
          ...(c.finished ? { due: shortDate(deal.settledAt ?? deal.cancelledAt ?? deal.updatedAt, locale) } : {}),
        },
      });
    }

    for (const proposal of open.matches) {
      if (seen.has(proposal.jobId.toLowerCase())) continue;
      const isSeller = proposal.sellerUser.toLowerCase() === me;
      const presentation = presentMatchingState({ proposal, viewerAddress: address });
      rows.push({
        key: proposal.jobId,
        // The same flag as the count on the Deals tab, so the two never disagree.
        yourMove: presentation.viewerMustAct,
        finished: false,
        dueUnix: proposal.deadlineUnix ?? null,
        updatedAtMs: toMs(proposal.proposedAt ?? 0),
        row: {
          href: `/jobs/${proposal.jobId}`,
          role: isSeller ? p.card.roleSeller : p.card.roleBuyer,
          counterparty: !isSeller ? proposal.counterpartyBusiness?.companyName?.trim() || undefined : undefined,
          reference: requestRef(proposal.jobId),
          amount: presentation.currentOffer?.amountUsdc ?? proposal.agreedPriceUsdc,
          unit: p.card.unit,
          status: messages.negotiationCard.states[presentation.state].tag,
          next: messages.negotiationCard.nextActors[presentation.nextActor],
          due: due(proposal.deadlineUnix),
          state: dealState({ yourMove: presentation.viewerMustAct, finished: false }),
        },
      });
    }

    // A financier waits on the deal; nothing on it is their move.
    for (const item of open.financed) {
      rows.push({
        key: `${item.kind}-${item.id}`,
        yourMove: false,
        finished: false,
        dueUnix: item.deal?.deadlineUnix ?? null,
        updatedAtMs: toMs(item.deal?.updatedAt ?? 0),
        row: {
          href: item.href,
          role: p.financed.role,
          reference: item.deal ? dealReference(item.deal.jobId) : null,
          amount: item.advanced,
          unit: p.card.unit,
          status: p.financed.stages[item.deal ? financedStage(stageOf(item.deal), item.deal.deadlineUnix) : 'delivering'],
          next: p.financed.backTemplate.replace('{amount}', item.back),
          due: due(item.deal?.deadlineUnix),
          state: item.deal ? dealState({ yourMove: false, finished: false, deal: item.deal }) : 'active',
        },
      });
    }
    return orderDeals(rows);
  }, [address, direct.deals, open.matches, open.financed, locale, messages, p]);

  const failed = direct.fetchState === 'error' || open.fetchState === 'error';
  const loaded = direct.fetchState === 'success' && open.fetchState !== 'loading';
  return { groups, failed, loaded, refresh: open.refresh };
}
