'use client';

import { useEffect, useRef, useState } from 'react';
import type { DiscoveryScope } from '@/features/discovery/model';
import { TRADE_ENTRY_COPY } from '@/features/home/tradeEntry';
import { ListingsBrowse } from '@/features/listings/components/ListingsBrowse';
import { useAuth } from '@/shared/hooks/useAuth';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { shouldAskTradesAs } from '../entryQuestion';
import type { MarketView, YoursList } from '../marketQuery';
import { EntryQuestion } from './EntryQuestion';
import { BUSINESS_ACCOUNTS_OPEN } from '@/features/account/businessOpen';
import { StartTradeSheet } from './StartTradeSheet';
import { YourTrades } from './YourTrades';
import { OpenContests } from '@/features/contests/components/OpenContests';
import { OpenWorkRequests } from '@/features/work/components/OpenWorkRequests';

/// The one market (view 17): Start a trade, then Your trades when signed in,
/// then Find, on one scrolling page for every account. A requests or offers
/// list opens on its own.
export function MarketPage({ view, scope, list }: { view: MarketView; scope: DiscoveryScope; list: YoursList }) {
  const { locale } = useLocale();
  const { isAuthenticated, address } = useAuth();
  const { profile, fetchState } = useUserProfile();
  const { workspaces } = useWorkspaceContext();
  const askTradesAs = shouldAskTradesAs({
    signedIn: isAuthenticated && !!address,
    hasBusinessWorkspace: workspaces.some((workspace) => workspace.kind === 'business'),
    answer: profile?.settings?.tradesAs,
    profileLoaded: fetchState === 'success' && !!profile,
    businessOpen: BUSINESS_ACCOUNTS_OPEN,
  });
  const [startOpen, setStartOpen] = useState(false);
  const yoursRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (view === 'yours' && list === 'all') yoursRef.current?.scrollIntoView({ block: 'start' });
  }, [view, list]);

  if (view === 'yours' && list !== 'all') return <YourTrades list={list} />;

  return (
    <>
      <ListingsBrowse
        initialScope={scope}
        action={
          <button
            type="button"
            onClick={() => setStartOpen(true)}
            className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-[var(--action)] px-5 text-[15px] font-semibold text-[var(--on-action)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] focus-visible:ring-offset-2"
          >
            {TRADE_ENTRY_COPY[locale].title}
          </button>
        }
        beforeSearch={
          <>
            {isAuthenticated ? (
              <div ref={yoursRef} className="scroll-mt-28">
                {askTradesAs && address ? <EntryQuestion address={address} /> : null}
                <YourTrades list="all" />
              </div>
            ) : null}
            <OpenContests />
            <OpenWorkRequests />
          </>
        }
      />
      <StartTradeSheet open={startOpen} onClose={() => setStartOpen(false)} />
    </>
  );
}
