'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, type SellerActiveBid } from '@/core/api';
import { useActivation } from '@/shared/hooks/useActivation';
import { BidsTable } from '@/features/seller/components/BidsTable';
import { ListingComposer } from '@/features/seller/components/ListingComposer';
import { BalanceSidecar } from '@/features/balances/components/BalanceSidecar';
import { DealAmountProvider } from '@/features/balances/dealAmount';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { ActivateAgentsNotice } from '@/shared/components/ActivateAgentsNotice';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  Accent,
  CTAPill,
  PageCard,
} from '@/shared/components/Bands';
import { Hint } from '@/shared/components/Hint';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
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
  const { isBusinessWorkspace } = useWorkspaceContext();
  const { activated } = useActivation();
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
        setActiveBids(d.activeBids);
        setFetchState('ready');
      })
      .catch(() => {
        if (!cancelled) setFetchState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [address]);


  // The P2P seller desk is the personal workspace lane. A business workspace
  // publishes through Supply so the selected context is explicit and the
  // availability record stays attached to the business workspace.
  if (isBusinessWorkspace) {
    return (
      <FullBleed>
        <Band tone="dark" compact overlay={<GridOverlay />}>
          <div className="max-w-[46ch]">
            <SectionTag tone="dark">SUPPLY</SectionTag>
            <HeroHeadline size="md">
              Your selling lives on <Accent>Supply</Accent>
              <Punc>.</Punc>
            </HeroHeadline>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <CTAPill href="/supply" tone="dark">
                Go to Supply
              </CTAPill>
              <CTAPill href="/buyer" variant="secondary" tone="dark">
                Your B2B desk
              </CTAPill>
            </div>
          </div>
        </Band>
      </FullBleed>
    );
  }

  if (v2) return <SellerDesk />;

  return (
    <FullBleed>
      <Band tone="light" compact>
        <h1 className="flex items-center gap-2 text-[clamp(2rem,4vw,3rem)] font-semibold leading-tight tracking-[-0.04em] text-[var(--lp-dark)]">{entry.sellTitle}<Hint side="bottom">{entry.sellBody}</Hint></h1>
      </Band>

      {/* ACTIVATE NOTICE. shared band, renders nothing once activated. Catches
          the dead end where a seller profile is saved but no agent was ever
          provisioned, so the seller agent silently never bids. */}
      <ActivateAgentsNotice role="seller" tone="light" />

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
      <Band tone="dark" compact>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-[46ch]">
            <div className="flex items-center gap-2">
              <SectionTag tone="dark" dot={activated ? 'live' : undefined}>
                {sh.activeBids.tag}
              </SectionTag>
              <Hint glow side="bottom" align="start">{sh.activeBids.lede}</Hint>
            </div>
            <HeroHeadline size="md">
              {sh.activeBids.headline}
              {activeBids.length > 0 && (
                <>
                  <Punc>.</Punc>
                  <span className="ms-3 text-[var(--lp-workspace-muted)] font-sans font-extrabold">
                    {activeBids.length}
                  </span>
                </>
              )}
              {activeBids.length === 0 && <Punc>.</Punc>}
            </HeroHeadline>
          </div>
        </div>
        <div className="mt-10">
          <div
            className="overflow-hidden"
            style={{
              background: 'var(--lp-workspace-raised)',
              border: '1px solid var(--lp-workspace-border)',
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              borderBottomLeftRadius: 22,
              borderBottomRightRadius: 5,
            }}
          >
            {fetchState === 'error' ? (
              <p className="p-8 text-center text-[14px] text-[#ff8a7a]">
                {sh.activeBids.errorMessage}
              </p>
            ) : fetchState === 'loading' || fetchState === 'idle' ? (
              <div className="p-8 space-y-3">
                <div className="h-14 rounded-md bg-[var(--lp-workspace-soft)] animate-pulse motion-reduce:animate-none" />
                <div className="h-14 rounded-md bg-[var(--lp-workspace-soft)] animate-pulse motion-reduce:animate-none" />
              </div>
            ) : activeBids.length === 0 ? (
              <p className="p-8 text-center text-[14px] text-[var(--lp-workspace-muted)]">
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
        </div>
      </Band>
    </FullBleed>
  );
}
