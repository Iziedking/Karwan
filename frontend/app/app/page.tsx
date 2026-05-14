'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { api, type ApiStatus } from '@/core/api';
import { Card } from '@/shared/components/Card';
import { BalancesCard } from '@/features/balances/components/BalancesCard';
import { LivePulseStrip } from '@/features/activity/components/LivePulseStrip';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { shortAddress } from '@/shared/utils/format';

export default function AppHome() {
  const router = useRouter();
  const { profile, isConnected, loading, fetchState } = useUserProfile();
  const [status, setStatus] = useState<ApiStatus | null>(null);

  useEffect(() => {
    api.status().then(setStatus).catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    // Only bounce to onboarding once we've confirmed (200 OK with no profile) that
    // this wallet has no profile yet. Network errors leave us here so we can show
    // the "Backend offline" card instead of ping-ponging between routes.
    if (isConnected && fetchState === 'success' && !profile) {
      router.replace('/onboarding');
    }
  }, [isConnected, fetchState, profile, router]);

  if (!status) {
    return (
      <Card title="Backend offline">
        <p className="text-sm text-[var(--color-ink-dim)]">
          Could not reach the backend at{' '}
          <span className="mono">{api.baseUrl}</span>.
        </p>
      </Card>
    );
  }

  if (!isConnected) {
    return <SignInPrompt />;
  }

  if (loading || !profile) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-ink-dim)]">Loading your profile…</p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <header className="fade-up flex flex-wrap items-end justify-between gap-4 pb-2">
        <div>
          <h1 className="text-[28px] tracking-tight font-semibold">{profile.displayName}</h1>
          <p className="text-[12px] mono text-[var(--color-ink-faint)] mt-1">
            {shortAddress(profile.address)} · role: {profile.role}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--color-positive-soft)] text-[var(--color-positive)] text-[12px] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-positive)]" />
          Agent active
        </span>
      </header>

      <section className="fade-up fade-up-1 grid md:grid-cols-3 gap-4">
        {(profile.role === 'buyer' || profile.role === 'both') && (
          <ActionCard
            href="/buyer"
            eyebrow="Buyer"
            title="Post a brief"
            body="Describe what you need built. Your buyer agent posts it on chain and handles the negotiation."
            cta="Post a brief"
          />
        )}
        {(profile.role === 'seller' || profile.role === 'both') && (
          <ActionCard
            href="/seller"
            eyebrow="Seller"
            title="See the agent at work"
            body="Your seller agent is watching the chain. Briefs that match your skills get bids on your behalf."
            cta="Open seller view"
          />
        )}
        <ActionCard
          href="/activity"
          eyebrow="Activity"
          title="Watch chain events"
          body="Live SSE feed of every event across all agents. Each row links to its transaction."
          cta="Open activity feed"
        />
      </section>

      <section className="fade-up fade-up-2">
        <BalancesCard />
      </section>

      <section className="fade-up fade-up-3 space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">Live</span>
            <h2 className="text-[20px] tracking-tight font-semibold mt-1">Today on chain</h2>
          </div>
          <Link
            href="/activity"
            className="text-[12px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] transition-colors"
          >
            See full feed →
          </Link>
        </div>
        <LivePulseStrip />
      </section>
    </div>
  );
}

function SignInPrompt() {
  return (
    <div className="max-w-xl mx-auto fade-up text-center space-y-6 py-12">
      <h1 className="text-[28px] tracking-tight font-semibold">Connect your wallet</h1>
      <p className="text-sm text-[var(--color-ink-dim)] leading-relaxed">
        Karwan identifies you by wallet address. Connect a browser wallet to enter the app and configure your buyer or seller profile.
      </p>
      <div className="flex justify-center">
        <ConnectButton />
      </div>
      <p className="text-[11px] text-[var(--color-ink-faint)]">
        Circle Passkey sign-in ships next.
      </p>
    </div>
  );
}

function ActionCard({
  href,
  eyebrow,
  title,
  body,
  cta = 'Open',
}: {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  cta?: string;
}) {
  const router = useRouter();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          router.push(href);
        }
      }}
      className="group cursor-pointer rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 hover:-translate-y-0.5 hover:border-[var(--color-ink)] hover:shadow-[var(--shadow-card-hover)] transition-[transform,border-color,box-shadow] duration-200 flex flex-col"
    >
      <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">{eyebrow}</p>
      <h3 className="text-[17px] font-semibold tracking-tight mt-1.5">{title}</h3>
      <p className="text-[13px] text-[var(--color-ink-dim)] mt-2 leading-relaxed flex-1">{body}</p>
      <Link
        href={href}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 self-start mt-4 text-[12px] font-medium text-[var(--color-ink)] group-hover:text-[var(--color-accent)] transition-colors"
      >
        {cta}
        <span aria-hidden className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">
          →
        </span>
      </Link>
    </div>
  );
}

