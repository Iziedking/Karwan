'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, type SellerActiveBid } from '@/core/api';
import { BidsTable } from '@/features/seller/components/BidsTable';
import { ListingComposer } from '@/features/seller/components/ListingComposer';
import { BalanceSidecar } from '@/features/balances/components/BalanceSidecar';
import { DealAmountProvider } from '@/features/balances/dealAmount';
import { AuthGuard } from '@/shared/components/AuthGuard';
import {
  FullBleed,
  Band,
  PageCard,
} from '@/shared/components/Bands';
import { Hint } from '@/shared/components/Hint';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { TRADE_ENTRY_COPY } from '@/features/home/tradeEntry';
import { useSearchV2 } from '@/features/search/useSearchV2';
import { SellerDesk } from '@/features/search/components/SellerDesk';

type FetchState = 'idle' | 'loading' | 'ready' | 'error';

export default function SellerPage() {
  const sh = useTranslations().sellerHub;
  return (
    <AuthGuard gateTag={sh.signInGate.tag} gateBody={sh.signInGate.body}>
      <SellerPageInner />
    </AuthGuard>
  );
}

function SellerPageInner() {
  const { locale } = useLocale();
  const entry = TRADE_ENTRY_COPY[locale];
  const auth = useAuth();
  const address = auth.address;
  const [activeBids, setActiveBids] = useState<SellerActiveBid[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const sh = useTranslations().sellerHub;
  const v2 = useSearchV2();

  useEffect(() => {
    if (!address) {
      setActiveBids([]);
      setFetchState('idle');
      return;
    }
    let cancelled = false;
    setFetchState('loading');
    api
      .seller(address)
      .then((d) => {
        if (cancelled) return;
        setActiveBids(d.activeBids ?? []);
        setFetchState('ready');
      })
      .catch(() => {
        if (!cancelled) setFetchState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [address]);


if (v2) return <SellerDesk />;

  return (
    <FullBleed>
      <Band tone="light" compact>
        <h1 className="flex items-center gap-2 text-[clamp(2rem,4vw,3rem)] font-semibold leading-tight tracking-[-0.04em] text-[var(--lp-dark)]">{entry.sellTitle}<Hint side="bottom">{entry.sellBody}</Hint></h1>
      </Band>

      {/* ACTIVATE NOTICE. shared band, renders nothing once activated. Catches
          the dead end where a seller profile is saved but no agent was ever
          provisioned, so the seller agent silently never bids. */}

      {/* POST LISTING */}
      <Band tone="light" compact>
        <div id="post-listing" className="scroll-mt-20" />
        <DealAmountProvider>
        <div className="mx-auto grid max-w-[1120px] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="lg:order-2">
            <BalanceSidecar agent="seller" />
          </div>
          <div className="min-w-0 lg:order-1">
            <PageCard>
              <div className="p-6 md:p-8">
                <ListingComposer />
              </div>
            </PageCard>
          </div>
        </div>
        </DealAmountProvider>
      </Band>

      {/* ACTIVE BIDS */}
      <Band tone="light" compact>
        <div className="flex items-center gap-2">
          <h2 className="flex items-baseline gap-2 text-[17px] font-semibold text-[var(--lp-dark)]">
            {sh.activeBids.tag}
            {activeBids.length > 0 ? <span className="text-[15px] font-medium tabular-nums text-[var(--lp-text-muted)]">{activeBids.length}</span> : null}
          </h2>
          <Hint side="bottom" align="start">{sh.activeBids.lede}</Hint>
        </div>
        <div className="mt-4 overflow-hidden rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)]">
          {fetchState === 'error' ? (
            <p role="status" className="p-6 text-[15px] font-medium text-[var(--lp-text-sub)]">
              {sh.activeBids.errorMessage}
            </p>
          ) : fetchState === 'loading' || fetchState === 'idle' ? (
            <div className="space-y-3 p-6">
              <div className="h-14 animate-pulse rounded-[12px] bg-[var(--lp-light)] motion-reduce:animate-none" />
              <div className="h-14 animate-pulse rounded-[12px] bg-[var(--lp-light)] motion-reduce:animate-none" />
            </div>
          ) : activeBids.length === 0 ? (
            <p className="p-6 text-[15px] font-medium text-[var(--lp-text-sub)]">
              {sh.activeBids.emptyMessage}
            </p>
          ) : (
            <BidsTable
              bids={activeBids}
              onAbandon={(jobId) =>
                setActiveBids((prev) => prev.filter((b) => b.jobId !== jobId))
              }
            />
          )}
        </div>
      </Band>
    </FullBleed>
  );
}
