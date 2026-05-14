'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Card } from '@/shared/components/Card';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { shortAddress } from '@/shared/utils/format';
import { RoleToggle } from '@/features/profile/components/RoleToggle';
import { ArcFundCard } from '@/features/profile/components/ArcFundCard';
import { ConnectXButton } from '@/features/profile/components/ConnectXButton';
import { ReputationBadge } from '@/features/reputation/components/ReputationBadge';
import { api, type UserProfile } from '@/core/api';

export default function ProfilePage() {
  const router = useRouter();
  const { profile: loadedProfile, isConnected, fetchState } = useUserProfile();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [agents, setAgents] = useState<{ buyer?: string; seller?: string }>({});

  useEffect(() => setProfile(loadedProfile), [loadedProfile]);

  useEffect(() => {
    let cancelled = false;
    api
      .status()
      .then((s) => {
        if (cancelled) return;
        setAgents({
          buyer: s.agents.buyer.address,
          seller: s.agents.seller.address,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isConnected) {
    return (
      <div className="max-w-xl mx-auto fade-up text-center space-y-6 py-12">
        <h1 className="display text-[36px]">Connect your wallet</h1>
        <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed">
          Karwan profiles are keyed by wallet address.
        </p>
        <div className="flex justify-center">
          <ConnectButton />
        </div>
      </div>
    );
  }

  if (fetchState === 'error') {
    return (
      <Card>
        <p className="text-[13px] text-[var(--color-ink-dim)]">
          Could not load your profile. Try again in a moment.
        </p>
      </Card>
    );
  }

  if (fetchState === 'idle' || fetchState === 'loading') {
    return <p className="text-[13px] text-[var(--color-ink-faint)] fade-up">Loading your profile…</p>;
  }

  if (!profile) {
    return (
      <div className="max-w-xl mx-auto fade-up text-center space-y-5 py-10">
        <h1 className="display text-[32px]">No profile yet</h1>
        <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed">
          You haven't set up an agent profile for this wallet. It only takes a minute.
        </p>
        <Link
          href="/onboarding"
          style={{ backgroundColor: '#0c0e10', color: '#ffffff' }}
          className="inline-flex px-4 py-2 rounded-md text-[13px] font-semibold hover:opacity-90 transition-opacity"
        >
          Set up profile →
        </Link>
      </div>
    );
  }

  const created = new Date(profile.createdAt).toLocaleDateString();
  const updated = new Date(profile.updatedAt).toLocaleDateString();

  const defaultAgent: 'buyer' | 'seller' =
    profile.role === 'seller' ? 'seller' : 'buyer';

  return (
    <div className="space-y-8 fade-up max-w-4xl">
      <header className="grid md:grid-cols-[1fr_auto] gap-4 items-end pb-3 border-b border-[var(--color-line)]">
        <div>
          <p className="eyebrow">Profile</p>
          <h1 className="display text-[44px] leading-[1.02] mt-1">{profile.displayName}</h1>
          <p className="text-[11px] mono text-[var(--color-ink-faint)] mt-2">
            {shortAddress(profile.address)} · created {created} · updated {updated}
          </p>
        </div>
        <div className="flex items-center gap-2 w-fit">
          <ConnectXButton />
          <button
            type="button"
            onClick={() => router.push('/onboarding')}
            className="px-3.5 py-1.5 rounded-md text-[12px] font-semibold tracking-tight border border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)] hover:border-[var(--color-ink-dim)] transition-colors inline-flex items-center gap-1.5"
          >
            Edit details
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M11.5 2.5l2 2L6 12l-3 1 1-3 7.5-7.5z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </header>

      <section>
        <RoleToggle profile={profile} onUpdate={setProfile} />
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        {profile.buyer && (
          <Card noPadding>
            <div className="px-5 pt-5 pb-3 border-b border-[var(--color-line)] flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Agent</p>
                <h3 className="display text-[20px] leading-tight mt-0.5">Buyer</h3>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                {agents.buyer && (
                  <span className="text-[10px] mono text-[var(--color-ink-faint)]">
                    {shortAddress(agents.buyer)}
                  </span>
                )}
                <ReputationBadge address={agents.buyer} size="sm" withDetail />
              </div>
            </div>
            <div className="px-5 py-3">
              <Row label="Max budget" value={`${profile.buyer.maxBudgetUsdc} USDC`} mono />
              <Row
                label="Deadline range"
                value={`${profile.buyer.minDeadlineDays} – ${profile.buyer.maxDeadlineDays} days`}
                mono
              />
              <Row
                label="Bid window"
                value={`${profile.buyer.bidCollectionSeconds}s`}
                mono
              />
              <Row
                label="Milestones"
                value={profile.buyer.milestonePcts.join(' / ') || '—'}
                mono
              />
            </div>
          </Card>
        )}

        {profile.seller && (
          <Card noPadding>
            <div className="px-5 pt-5 pb-3 border-b border-[var(--color-line)] flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Agent</p>
                <h3 className="display text-[20px] leading-tight mt-0.5">Seller</h3>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                {agents.seller && (
                  <span className="text-[10px] mono text-[var(--color-ink-faint)]">
                    {shortAddress(agents.seller)}
                  </span>
                )}
                <ReputationBadge address={agents.seller} size="sm" withDetail />
              </div>
            </div>
            <div className="px-5 py-3">
              <Row label="Skills" value={profile.seller.skills.join(', ') || '—'} />
              <Row
                label="Bio"
                value={profile.seller.bio || '—'}
              />
              <Row
                label="Budget range"
                value={`${profile.seller.minBudgetUsdc} – ${profile.seller.maxBudgetUsdc} USDC`}
                mono
              />
              <Row
                label="Delivery window"
                value={`${profile.seller.minDeadlineDays} – ${profile.seller.maxDeadlineDays} days`}
                mono
              />
            </div>
          </Card>
        )}
      </section>

      <section>
        <ArcFundCard
          buyerAgent={agents.buyer}
          sellerAgent={agents.seller}
          defaultAgent={defaultAgent}
        />
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="py-2.5 border-b border-[var(--color-line)] last:border-0 flex items-baseline justify-between gap-4">
      <span className="eyebrow shrink-0">{label}</span>
      <span
        className={`text-right ${mono ? 'mono text-[12px]' : 'text-[13px]'} text-[var(--color-ink)] truncate`}
      >
        {value}
      </span>
    </div>
  );
}
