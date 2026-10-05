'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type MoneyMovementView } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { ConnectWalletButton } from '@/shared/components/ConnectWallet';
import { type SettlementRecordFetchState } from '../components/SettlementRecord';
import { useDirectDeal, type DealErrorKind } from '../hooks/useDirectDeals';
import { ConfirmSheet } from './ConfirmSheet';
import { FundingQuoteRows } from './FundingQuoteRows';
import { DealHero } from './DealHero';
import { useWorkspaceActions } from './useWorkspaceActions';
import { registerDealTools } from './webmcp';
import { V3EscrowPanel } from '../v3/V3EscrowPanel';
import { HighSignalVerificationCard } from '../components/HighSignalVerificationCard';
import { ProtectionSection } from './ProtectionSection';
import { ChatPanel } from '@/features/chat/components/ChatPanel';
import { shortAddress } from '@/shared/utils/format';
import { DESKTOP_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';

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
  const auth = useAuth();
  const address = auth.address ?? null;
  const { deal, fetchState, refresh, errorKind, isRefetching } = useDirectDeal(jobId);
  const [movements, setMovements] = useState<MoneyMovementView[]>([]);
  const [recordState, setRecordState] = useState<SettlementRecordFetchState>('loading');
  const [recordKey, setRecordKey] = useState(0);
  const [fundingBusy, setFundingBusy] = useState(false);
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const counterpartyName = deal?.counterpartyTrust?.name ?? '';
  const actions = useWorkspaceActions(jobId, deal ?? null, address, counterpartyName, refresh);
  const fundingRecovery = actions.sheet?.action === 'fund' &&
    actions.errorCode === 'INSUFFICIENT_AGENT_BALANCE' && actions.viewerIsBuyer;

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
    <div className="product-surface mx-auto max-w-[560px] px-4 pb-16 pt-4 sm:px-6 lg:grid lg:max-w-[1080px] lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] lg:items-start lg:gap-10">
      <div className="min-w-0">
      <DealHero
        deal={deal}
        view={deal.view}
        address={address}
        viewerIsBuyer={actions.viewerIsBuyer}
        displayName={actions.displayName}
        busy={actions.busy || fundingBusy}
        onPrimary={actions.openPrimary}
        onChanged={() => { void refresh(); }}
        movements={movements}
        recordState={recordState}
        onRetryRecord={() => setRecordKey((key) => key + 1)}
      />
      {address && deal.verificationPolicy === 'high_signal' ? (
        <div className="mt-6 empty:hidden">
          <HighSignalVerificationCard deal={deal} caller={address} onRefresh={() => { void refresh(); }} />
        </div>
      ) : null}
      <ProtectionSection deal={deal} viewerIsBuyer={actions.viewerIsBuyer} />
      <div className="mt-6 empty:hidden">
        <V3EscrowPanel deal={deal} address={address} onChanged={() => { void refresh(); }} />
      </div>
      </div>
      {desktop && address ? (
        <aside aria-label={copy.simple.messages} className="sticky top-24 mt-4 flex h-[calc(100vh-8rem)] min-h-[480px] flex-col overflow-hidden rounded-[20px] bg-[var(--lp-card)] p-4">
          <ChatPanel
            jobId={deal.jobId}
            caller={address}
            counterpartyLabel={counterpartyName || shortAddress(actions.viewerIsBuyer ? deal.seller : deal.buyer)}
            counterpartyAddress={actions.viewerIsBuyer ? deal.seller : deal.buyer}
          />
        </aside>
      ) : null}
      <ConfirmSheet
        open={!!actions.sheet}
        title={actions.sheet?.title ?? ''}
        consequence={actions.sheet?.consequence ?? ''}
        irreversible={actions.sheet?.irreversible ?? false}
        busy={actions.busy || fundingBusy}
        confirmVariant={fundingRecovery ? 'secondary' : 'primary'}
        error={actions.error}
        onConfirm={() => { if (!fundingBusy) void actions.confirm(); }}
        onClose={() => { if (!fundingBusy) actions.close(); }}
      >
        {actions.sheet?.action === 'fund' ? (
          <FundingQuoteRows
            quote={actions.sheet.quote}
            errorCode={actions.errorCode}
            viewerIsBuyer={actions.viewerIsBuyer}
            onFunded={actions.onFunded}
            onBusyChange={setFundingBusy}
          />
        ) : undefined}
      </ConfirmSheet>
    </div>
  );
}
