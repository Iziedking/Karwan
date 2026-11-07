'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, type SellerActiveBid } from '@/core/api';
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
  // Your agent's offers on requests sit in Your offers, under the posted offer
  // each came from: one list, not a second table (owner, 7 Nov 2026).
  const [activeBids, setActiveBids] = useState<SellerActiveBid[]>([]);
  const v2 = useSearchV2();

  useEffect(() => {
    if (!address) {
      setActiveBids([]);
      return;
    }
    let cancelled = false;
    api
      .seller(address)
      .then((d) => {
        if (!cancelled) setActiveBids((d.activeBids ?? []).filter((b) => !b.finalized));
      })
      .catch(() => {});
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
                <ListingComposer bids={activeBids} onWithdrawn={(jobId) => setActiveBids((prev) => prev.filter((b) => b.jobId !== jobId))} />
              </div>
            </PageCard>
          </div>
        </div>
        </DealAmountProvider>
      </Band>

    </FullBleed>
  );
}
