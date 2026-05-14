'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { api, type ApiStatus } from '@/core/api';
import { DealsFeed } from '@/features/deals/components/DealsFeed';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { AnimatedNumber } from '@/shared/components/AnimatedNumber';
import {
  AppCanvas,
  Section,
  GridOverlay,
  Pill,
  EyebrowChip,
  AddressChip,
  ActionTile,
  StatTile,
  Skeleton,
  WalletGate,
} from '@/shared/components/AppUI';

interface NetStats {
  deals: number;
  settled: number;
  usdc: number;
}

export default function AppHome() {
  const router = useRouter();
  const { profile, isConnected, loading, fetchState } = useUserProfile();
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [stats, setStats] = useState<NetStats | null>(null);

  useEffect(() => {
    api.status().then(setStatus).catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    api
      .dealsFeed()
      .then((r) => {
        const settled = r.deals.filter((d) => d.onChain?.state === 2).length;
        const usdc = r.deals.reduce((s, d) => s + (Number(d.dealAmountUsdc) || 0), 0);
        setStats({ deals: r.deals.length, settled, usdc });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Only bounce to onboarding once confirmed (200 OK, no profile).
    if (isConnected && fetchState === 'success' && !profile) {
      router.replace('/onboarding');
    }
  }, [isConnected, fetchState, profile, router]);

  let body: ReactNode;

  if (!status) {
    body = (
      <Section tone="card">
        <EyebrowChip dot="warning">Backend</EyebrowChip>
        <h1 className="mt-4 font-sans font-bold tracking-[-0.02em] text-[clamp(1.75rem,3vw,2.5rem)]">
          The backend is offline.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-md">
          Couldn&apos;t reach the API at <span className="mono">{api.baseUrl}</span>. Start it and
          this page picks up automatically.
        </p>
      </Section>
    );
  } else if (!isConnected) {
    body = (
      <WalletGate
        title="Connect your wallet."
        body="Karwan identifies you by wallet address. Connect a browser wallet to enter the app and set up your buyer or seller profile."
        note="Circle Passkey sign-in ships next."
      >
        <ConnectButton />
      </WalletGate>
    );
  } else if (loading || !profile) {
    body = (
      <Section tone="card">
        <div className="space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-4 w-56" />
        </div>
      </Section>
    );
  } else {
    body = (
      <>
        {/* HEADER — a compact dark hero for the settlement desk */}
        <Section tone="dark" className="relative overflow-hidden">
          <GridOverlay />
          <div className="relative">
            <EyebrowChip dot="live" tone="dark">
              Agent active
            </EyebrowChip>
            <h1 className="mt-5 font-sans font-bold tracking-[-0.025em] leading-[1.02] text-[clamp(2rem,4vw,3.25rem)]">
              Welcome back, {profile.displayName}.
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-md">
              Post a brief and your buyer agent runs the auction, or open a direct deal with a
              counterparty you already have. You just approve.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Pill href="/buyer">Post a brief</Pill>
              <Pill href="/activity" variant="secondary" tone="dark">
                View activity →
              </Pill>
              <span className="ml-1">
                <AddressChip address={profile.address} tone="dark" />
              </span>
            </div>
          </div>
        </Section>

        {/* QUICK ACTIONS — three tiles, varied surfaces */}
        <div className="grid md:grid-cols-3 gap-4">
          <ActionTile
            href="/buyer"
            tone="card"
            eyebrow="Buyer"
            title="Post a brief"
            body="Describe the work. Your buyer agent posts it on chain and runs the negotiation."
          />
          <ActionTile
            href="/seller"
            tone="dark"
            eyebrow="Seller"
            title="See the agent work"
            body="Your seller agent watches the chain and bids on briefs that match your skills."
          />
          <ActionTile
            href="/activity"
            tone="accent"
            eyebrow="Activity"
            title="Watch chain events"
            body="A live feed of every event across all agents. Each row links to its transaction."
          />
        </div>

        {/* LIVE NETWORK STRIP */}
        <Section tone="dark">
          <div className="flex items-baseline justify-between gap-4">
            <EyebrowChip dot="live" tone="dark">
              Live network
            </EyebrowChip>
            <Link
              href="/activity"
              className="text-[13px] text-[var(--lp-text-muted)] hover:text-white transition-colors"
            >
              Full feed →
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatTile
              label="Direct deals"
              loading={!stats}
              value={<AnimatedNumber value={stats?.deals ?? 0} decimals={0} />}
            />
            <StatTile
              label="Settled in full"
              loading={!stats}
              value={<AnimatedNumber value={stats?.settled ?? 0} decimals={0} />}
            />
            <StatTile
              label="USDC through escrow"
              loading={!stats}
              value={<AnimatedNumber value={stats?.usdc ?? 0} decimals={2} />}
            />
            <StatTile label="Chain" value="5042002" hint="Arc Testnet" />
          </div>
        </Section>

        {/* DEALS FEED */}
        <Section tone="card" className="p-0 overflow-hidden">
          <div className="px-7 md:px-10 pt-7 md:pt-9">
            <EyebrowChip>Network</EyebrowChip>
            <h2 className="mt-3 font-sans font-bold tracking-[-0.02em] text-[clamp(1.5rem,2.4vw,2rem)]">
              Deals across Karwan
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-[var(--lp-text-sub)] max-w-xl">
              Every direct deal on the network, with its live escrow state.
            </p>
          </div>
          <div className="mt-6">
            <DealsFeed />
          </div>
        </Section>
      </>
    );
  }

  return <AppCanvas>{body}</AppCanvas>;
}
