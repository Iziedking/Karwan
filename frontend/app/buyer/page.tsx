'use client';
import { useSearchParams } from 'next/navigation';
import { NewDealPanel } from '@/features/deals/components/NewDealPanel';
import { DealAmountProvider } from '@/features/balances/dealAmount';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { FullBleed, Band, PageCard } from '@/shared/components/Bands';
import { Hint } from '@/shared/components/Hint';
import { Icon } from '@/shared/components/Icon';
import Link from 'next/link';
import { marketViewHref } from '@/features/market/marketQuery';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useSearchV2 } from '@/features/search/useSearchV2';
import { DirectDealOnly, FindSellerPage } from '@/features/search/components/FindSellerPage';

export default function BuyerPage() {
  const bh = useTranslations().buyerHub;
  return (
    <AuthGuard gateTag={bh.signInGate.tag} gateBody={bh.signInGate.body}>
      <BuyerPageInner />
    </AuthGuard>
  );
}

function BuyerPageInner() {
  const v2 = useSearchV2();
  const search = useSearchParams();
  if (!v2) return <PersonalBuyerDesk />;
  const direct = search.get('mode') === 'direct' || !!search.get('seller') || !!search.get('sellerEmail');
  return direct ? <DirectDealOnly /> : <FindSellerPage />;
}

function PersonalBuyerDesk() {
  const creation = useTranslations().dealCreation;
  const bh = useTranslations().buyerHub;

  return (
    <FullBleed>
      <Band tone="light" compact>
        <h1 className="flex items-center gap-2 text-[clamp(2rem,4vw,3rem)] font-semibold leading-tight tracking-[-0.04em] text-[var(--lp-dark)]">{creation.title}<Hint side="bottom">{creation.intro}</Hint></h1>
      </Band>

      {/* ACTIVATE NOTICE. shared band, renders nothing once activated. Catches
          the dead end where a profile is saved but no agent was provisioned. */}

      {/* NEW DEAL + SIDE COLUMN */}
      <Band tone="light" compact>
        <div id="new-deal" className="scroll-mt-20" />
        <DealAmountProvider>
        <div className="mx-auto grid max-w-[640px] items-start gap-5">
          <div className="min-w-0">
            <PageCard>
              <div className="p-6 md:p-8">
                <NewDealPanel />
              </div>
            </PageCard>
          </div>
        </div>
        </DealAmountProvider>
      </Band>

      {/* Your requests live in Market, Yours (view 44); the desk only starts one. */}
      <Band tone="light" compact>
        <div className="mx-auto max-w-[640px]">
          <Link
            href={marketViewHref('yours', 'requests')}
            className="flex min-h-14 items-center justify-between gap-4 rounded-[16px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-5 text-[15px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
          >
            {bh.managedDeals.headline}
            <Icon name="arrow-right" size={16} directional />
          </Link>
        </div>
      </Band>
    </FullBleed>
  );
}
