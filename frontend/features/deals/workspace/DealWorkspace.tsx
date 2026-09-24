'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, type MoneyMovementView } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { ChatPanel } from '@/features/chat/components/ChatPanel';
import { ConnectWalletButton } from '@/shared/components/ConnectWallet';
import { SettlementRecord, type SettlementRecordFetchState } from '../components/SettlementRecord';
import { useDirectDeal, type DealErrorKind } from '../hooks/useDirectDeals';
import { AgreementSection } from './AgreementSection';
import { ConfirmSheet } from './ConfirmSheet';
import { FundingQuoteRows } from './FundingQuoteRows';
import { MoneyBlock } from './MoneyBlock';
import { ProgressLine } from './ProgressLine';
import { TrustCard } from './TrustCard';
import { useWorkspaceActions } from './useWorkspaceActions';
import { registerDealTools } from './webmcp';

const SOFT = 'bg-[var(--lp-workspace-soft)] motion-safe:animate-pulse motion-reduce:animate-none rounded-[10px]';

function WorkspaceSkeleton() {
  return (
    <div aria-busy="true" className="mx-auto max-w-[720px] space-y-8 px-4 pb-24 pt-6 sm:px-6">
      <div className="space-y-4 border-b border-[var(--lp-border-light)] pb-8">
        <div className={`h-[52px] w-56 ${SOFT}`} />
        <div className={`h-5 w-72 ${SOFT}`} />
        <div className={`h-12 w-44 ${SOFT}`} />
      </div>
      <div className="grid gap-3 pb-8 sm:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={`h-4 w-full ${SOFT}`} />
        ))}
      </div>
    </div>
  );
}

/// A deal read that did not resolve to a deal: still loading (handled by the
/// caller before this renders), gone, private/signed-out, or a transient
/// backend hiccup that must never read as "your deal is gone".
function DealFetchError({ kind, isRefetching, onRetry }: {
  kind: DealErrorKind | undefined;
  isRefetching: boolean;
  onRetry: () => void;
}) {
  const copy = useTranslations().dealWorkspace;
  const dd = useTranslations().directDealDetail;
  if (kind === 'gone') {
    return (
      <div className="mx-auto max-w-[720px] space-y-4 px-4 py-10">
        <p className="text-[15px] leading-relaxed text-[var(--lp-dark)]">{dd.errorStates.notFoundBody}</p>
        <Link
          href="/buyer"
          className="inline-flex min-h-12 items-center rounded-[10px] bg-[var(--accent)] px-5 text-[15px] font-semibold text-[var(--accent-ink)]"
        >
          {dd.errorStates.notFoundCta}
        </Link>
      </div>
    );
  }
  if (kind === 'transient') {
    return (
      <div className="mx-auto max-w-[720px] space-y-4 px-4 py-10">
        <p className="text-[15px] leading-relaxed text-[var(--lp-dark)]">{dd.errorStates.transientBody}</p>
        <button
          type="button"
          onClick={onRetry}
          disabled={isRefetching}
          className="inline-flex min-h-12 items-center rounded-[10px] border border-[var(--lp-outline-strong)] px-5 text-[15px] font-medium text-[var(--lp-dark)] disabled:opacity-60"
        >
          {isRefetching ? dd.errorStates.transientRetrying : dd.errorStates.transientCta}
        </button>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-[720px] space-y-4 px-4 py-10">
      <p className="text-[15px] leading-relaxed text-[var(--lp-dark)]">{copy.privateDeal}</p>
      <ConnectWalletButton variant="primary" />
    </div>
  );
}

export function DealWorkspace({ jobId }: { jobId: string }) {
  const copy = useTranslations().dealWorkspace;
  const router = useRouter();
  const auth = useAuth();
  const address = auth.address ?? null;
  const { deal, fetchState, refresh, errorKind, isRefetching } = useDirectDeal(jobId);
  const [movements, setMovements] = useState<MoneyMovementView[]>([]);
  const [recordState, setRecordState] = useState<SettlementRecordFetchState>('loading');
  const [recordKey, setRecordKey] = useState(0);
  const counterpartyName = deal?.counterpartyTrust?.name ?? '';
  const actions = useWorkspaceActions(jobId, deal ?? null, address, counterpartyName, refresh);

  useEffect(() => {
    if (!address) {
      setRecordState('unavailable');
      return;
    }
    let cancelled = false;
    setRecordState('loading');
    api.directDealMovements(jobId, address)
      .then((result) => { if (!cancelled) { setMovements(result.movements); setRecordState('ready'); } })
      .catch(() => { if (!cancelled) setRecordState('error'); });
    return () => { cancelled = true; };
  }, [jobId, address, recordKey, deal?.updatedAt]);

  useEffect(() => {
    if (!deal?.view) return;
    return registerDealTools(deal);
  }, [deal]);

  if (fetchState !== 'success') {
    if (fetchState === 'error') {
      return <DealFetchError kind={errorKind} isRefetching={isRefetching} onRetry={() => { void refresh(); }} />;
    }
    return <WorkspaceSkeleton />;
  }
  if (!deal || !deal.view) {
    return <p className="mx-auto max-w-[720px] px-4 py-10 text-[15px] text-[var(--lp-dark)]">{copy.privateDeal}</p>;
  }

  return (
    <div className="product-surface mx-auto max-w-[720px] px-4 pb-24 pt-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--lp-border-light)] pb-4 text-[13px] text-[var(--lp-text-sub)]">
        <span className="font-semibold text-[var(--lp-dark)]">{copy.protectedDeal}</span>
        {deal.receiptReferences?.[0] ? <span className="mono tabular-nums">{deal.receiptReferences[0]}</span> : null}
      </header>
      <div className="divide-y divide-[var(--lp-border-light)] [&>*]:py-8">
        <MoneyBlock amountUsdc={deal.dealAmountUsdc} view={deal.view} counterpartyName={actions.displayName} onAction={actions.openPrimary} busy={actions.busy} />
        <ProgressLine view={deal.view} />
        {deal.counterpartyTrust ? (
          <TrustCard card={deal.counterpartyTrust} onOpenPassport={() => router.push(`/credit-passport/${actions.viewerIsBuyer ? deal.seller : deal.buyer}`)} />
        ) : null}
        <AgreementSection deal={deal} />
        {address ? (
          <section aria-labelledby="deal-conversation" className="space-y-3">
            <h2 id="deal-conversation" className="text-[20px] font-semibold text-[var(--lp-dark)]">{copy.conversation.title}</h2>
            <p className="text-[13px] text-[var(--lp-text-sub)]">{copy.conversation.evidence}</p>
            <ChatPanel jobId={jobId} caller={address} counterpartyLabel={actions.displayName} />
          </section>
        ) : null}
        <section aria-labelledby="deal-record" className="space-y-3">
          <h2 id="deal-record" className="text-[20px] font-semibold text-[var(--lp-dark)]">{copy.record.title}</h2>
          <SettlementRecord
            movements={movements}
            fetchState={recordState}
            fundTxHash={deal.fundTxHash}
            refundTxHash={deal.refundTxHash}
            onRetry={() => setRecordKey((key) => key + 1)}
            canShareReceipts={actions.viewerIsBuyer}
          />
        </section>
      </div>
      <ConfirmSheet
        open={!!actions.sheet}
        title={actions.sheet?.title ?? ''}
        consequence={actions.sheet?.consequence ?? ''}
        irreversible={actions.sheet?.irreversible ?? false}
        busy={actions.busy}
        error={actions.error}
        onConfirm={() => { void actions.confirm(); }}
        onClose={actions.close}
      >
        {actions.sheet?.action === 'fund' ? (
          <FundingQuoteRows
            quote={actions.sheet.quote}
            errorCode={actions.errorCode}
            viewerIsBuyer={actions.viewerIsBuyer}
            onFunded={actions.onFunded}
          />
        ) : undefined}
      </ConfirmSheet>
    </div>
  );
}
