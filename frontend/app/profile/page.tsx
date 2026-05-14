'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Card } from '@/shared/components/Card';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useActivation } from '@/shared/hooks/useActivation';
import { ActivationModal } from '@/shared/components/ActivationModal';
import { shortAddress } from '@/shared/utils/format';
import { RoleToggle } from '@/features/profile/components/RoleToggle';
import { ArcFundCard } from '@/features/profile/components/ArcFundCard';
import { AgentWithdrawCard } from '@/features/profile/components/AgentWithdrawCard';
import { ConnectXButton } from '@/features/profile/components/ConnectXButton';
import { ReputationBadge } from '@/features/reputation/components/ReputationBadge';
import { type UserProfile } from '@/core/api';

export default function ProfilePage() {
  const router = useRouter();
  const { profile: loadedProfile, address, isConnected, fetchState } = useUserProfile();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const activation = useActivation();
  const [activationOpen, setActivationOpen] = useState(false);

  useEffect(() => setProfile(loadedProfile), [loadedProfile]);

  const agents = {
    buyer: activation.agents?.buyer,
    seller: activation.agents?.seller,
  };

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

  const defaultAgent: 'buyer' | 'seller' =
    profile?.role === 'seller' ? 'seller' : 'buyer';

  return (
    <div className="space-y-8 fade-up max-w-4xl">
      {profile ? (
        <header className="grid md:grid-cols-[1fr_auto] gap-4 items-end pb-3 border-b border-[var(--color-line)]">
          <div>
            <p className="eyebrow">Profile</p>
            <h1 className="display text-[44px] leading-[1.02] mt-1">{profile.displayName}</h1>
            <p className="text-[11px] mono text-[var(--color-ink-faint)] mt-2">
              {shortAddress(profile.address)} · created{' '}
              {new Date(profile.createdAt).toLocaleDateString()} · updated{' '}
              {new Date(profile.updatedAt).toLocaleDateString()}
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
      ) : (
        <header className="pb-3 border-b border-[var(--color-line)]">
          <p className="eyebrow">Account</p>
          <h1 className="display text-[44px] leading-[1.02] mt-1">Your wallet</h1>
          <p className="text-[11px] mono text-[var(--color-ink-faint)] mt-2">
            {address ? shortAddress(address) : ''}
          </p>
        </header>
      )}

      <section>
        {activation.loading ? (
          <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] px-5 py-4">
            <p className="text-[12px] text-[var(--color-ink-faint)]">
              Checking your agent wallets…
            </p>
          </div>
        ) : activation.activated ? (
          <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] px-5 py-4 flex items-center gap-3">
            <span
              className="inline-flex items-center justify-center w-6 h-6 rounded-md shrink-0"
              style={{ background: 'var(--color-positive)', color: 'var(--color-surface)' }}
              aria-hidden
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <p className="text-[12.5px] text-[var(--color-ink-dim)] flex-1 leading-snug">
              <span className="text-[var(--color-ink)] font-medium">Agents active.</span> Your
              buyer and seller agent wallets sign every on-chain action. Fund them from your Arc
              balance below.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] px-5 py-4 flex items-center gap-3">
            <span
              className="inline-flex items-center justify-center w-6 h-6 rounded-md shrink-0"
              style={{ background: 'var(--color-ink)', color: 'var(--color-surface)' }}
              aria-hidden
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <rect x="3" y="7" width="10" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
            <p className="text-[12.5px] text-[var(--color-ink-dim)] flex-1 leading-snug">
              <span className="text-[var(--color-ink)] font-medium">Activate your agents</span> to
              get a buyer and seller Circle wallet for this address. Direct deals run on them.
            </p>
            <button
              type="button"
              onClick={() => setActivationOpen(true)}
              style={{ backgroundColor: 'var(--color-ink)', color: 'var(--color-surface)' }}
              className="text-[12px] font-semibold rounded-md px-3 py-1.5 hover:opacity-90 transition-opacity shrink-0"
            >
              Activate agents
            </button>
          </div>
        )}
      </section>

      {profile ? (
        <>
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
        </>
      ) : (
        <section>
          <Card noPadding>
            <div className="px-5 py-5 space-y-3">
              <h3 className="display text-[20px]">Set up a profile</h3>
              <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed">
                A profile gives you a display name and lets your agents run managed deals, where
                they post briefs and bid in the auction. It stays optional: direct deals and the
                agent wallets below work without one.
              </p>
              <Link
                href="/onboarding"
                style={{ backgroundColor: '#0c0e10', color: '#ffffff' }}
                className="inline-flex px-4 py-2 rounded-md text-[13px] font-semibold hover:opacity-90 transition-opacity"
              >
                Set up profile
              </Link>
            </div>
          </Card>
        </section>
      )}

      <section className="grid lg:grid-cols-2 gap-4 items-start">
        <ArcFundCard
          buyerAgent={agents.buyer}
          sellerAgent={agents.seller}
          defaultAgent={defaultAgent}
        />
        {activation.activated && (
          <AgentWithdrawCard
            buyerAgent={agents.buyer}
            sellerAgent={agents.seller}
            defaultAgent={defaultAgent}
          />
        )}
      </section>

      <ActivationModal
        open={activationOpen}
        onClose={() => setActivationOpen(false)}
        activate={activation.activate}
        activating={activation.activating}
        error={activation.error}
        activated={activation.activated}
        agents={activation.agents}
      />
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
