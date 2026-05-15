'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
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
import {
  AppCanvas,
  Section,
  GridOverlay,
  Pill,
  EyebrowChip,
  AddressChip,
  Skeleton,
  WalletGate,
} from '@/shared/components/AppUI';

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
  const defaultAgent: 'buyer' | 'seller' = profile?.role === 'seller' ? 'seller' : 'buyer';

  if (!isConnected) {
    return (
      <AppCanvas>
        <WalletGate
          title="Connect your wallet."
          body="Karwan profiles are keyed by wallet address. Connect a browser wallet to set up your buyer or seller profile."
        >
          <ConnectButton />
        </WalletGate>
      </AppCanvas>
    );
  }

  if (fetchState === 'error') {
    return (
      <AppCanvas>
        <Section>
          <EyebrowChip dot="warning">Profile</EyebrowChip>
          <p className="mt-4 text-[14px] text-[var(--lp-text-sub)]">
            Could not load your profile. Try again in a moment.
          </p>
        </Section>
      </AppCanvas>
    );
  }

  if (fetchState === 'idle' || fetchState === 'loading') {
    return (
      <AppCanvas>
        <Section>
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        </Section>
      </AppCanvas>
    );
  }

  return (
    <AppCanvas>
      {/* HEADER */}
      <Section tone="dark" className="relative overflow-hidden">
        <GridOverlay />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div>
            <EyebrowChip tone="dark">Profile</EyebrowChip>
            <h1 className="mt-4 font-sans font-bold tracking-[-0.025em] text-[clamp(2rem,4vw,3rem)]">
              {profile ? profile.displayName : 'Your wallet'}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {address && <AddressChip address={address} tone="dark" />}
              {profile && (
                <span className="mono text-[11px] text-[var(--lp-text-sub)]">
                  updated {new Date(profile.updatedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
          {profile && (
            <div className="flex items-center gap-2">
              <ConnectXButton />
              <Pill variant="secondary" tone="dark" onClick={() => router.push('/onboarding')}>
                Edit details
              </Pill>
            </div>
          )}
        </div>
      </Section>

      {/* ACTIVATION BANNER */}
      <Section className="py-5 md:py-6">
        {activation.loading ? (
          <p className="mono text-[12px] text-[var(--lp-text-sub)]">Checking your agent wallets…</p>
        ) : activation.activated ? (
          <div className="flex items-center gap-3">
            <EyebrowChip dot="live">Agents active</EyebrowChip>
            <p className="text-[13px] text-[var(--lp-text-sub)]">
              Your buyer and seller agent wallets sign every on-chain action. Fund or withdraw
              below.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <EyebrowChip dot="warning">Not activated</EyebrowChip>
              <p className="text-[13px] text-[var(--lp-text-sub)]">
                Activate to get a buyer and seller Circle wallet for this address.
              </p>
            </div>
            <Pill onClick={() => setActivationOpen(true)}>Activate agents</Pill>
          </div>
        )}
      </Section>

      {profile ? (
        <>
          <Section>
            <EyebrowChip>Account type</EyebrowChip>
            <div className="mt-4">
              <RoleToggle profile={profile} onUpdate={setProfile} />
            </div>
          </Section>

          <div className="grid md:grid-cols-2 gap-4">
            {profile.buyer && (
              <Section>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <EyebrowChip>Agent</EyebrowChip>
                    <h3 className="mt-2 font-sans text-[20px] font-bold tracking-[-0.01em]">
                      Buyer
                    </h3>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {agents.buyer && (
                      <span className="mono text-[10px] text-[var(--lp-text-sub)]">
                        {shortAddress(agents.buyer)}
                      </span>
                    )}
                    <ReputationBadge address={agents.buyer} size="sm" withDetail />
                  </div>
                </div>
                <div className="mt-3">
                  <Row label="Max budget" value={`${profile.buyer.maxBudgetUsdc} USDC`} mono />
                  <Row
                    label="Deadline range"
                    value={`${profile.buyer.minDeadlineDays} – ${profile.buyer.maxDeadlineDays} days`}
                    mono
                  />
                  <Row label="Bid window" value={`${profile.buyer.bidCollectionSeconds}s`} mono />
                  <Row
                    label="Milestones"
                    value={profile.buyer.milestonePcts.join(' / ') || '—'}
                    mono
                  />
                </div>
              </Section>
            )}

            {profile.seller && (
              <Section>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <EyebrowChip>Agent</EyebrowChip>
                    <h3 className="mt-2 font-sans text-[20px] font-bold tracking-[-0.01em]">
                      Seller
                    </h3>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {agents.seller && (
                      <span className="mono text-[10px] text-[var(--lp-text-sub)]">
                        {shortAddress(agents.seller)}
                      </span>
                    )}
                    <ReputationBadge address={agents.seller} size="sm" withDetail />
                  </div>
                </div>
                <div className="mt-3">
                  <Row label="Skills" value={profile.seller.skills.join(', ') || '—'} />
                  <Row label="Bio" value={profile.seller.bio || '—'} />
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
              </Section>
            )}
          </div>
        </>
      ) : (
        <Section>
          <EyebrowChip>Profile</EyebrowChip>
          <h2 className="mt-3 font-sans font-bold tracking-[-0.02em] text-[clamp(1.4rem,2.2vw,1.9rem)]">
            Set up a profile
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--lp-text-sub)] max-w-xl">
            A profile gives you a display name and lets your agents run managed deals, where they
            post briefs and bid in the auction. It stays optional: direct deals and the agent
            wallets below work without one.
          </p>
          <div className="mt-5">
            <Pill href="/onboarding">Set up profile</Pill>
          </div>
        </Section>
      )}

      {/* FUND + WITHDRAW */}
      <div className="grid lg:grid-cols-2 gap-4">
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
      </div>

      <ActivationModal
        open={activationOpen}
        onClose={() => setActivationOpen(false)}
        activate={activation.activate}
        activating={activation.activating}
        error={activation.error}
        activated={activation.activated}
        agents={activation.agents}
      />
    </AppCanvas>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-black/[0.06] py-2.5 last:border-0">
      <span className="text-[12px] font-medium text-[var(--lp-text-sub)] shrink-0">{label}</span>
      <span
        className={`text-right font-sans text-[13px] text-[var(--lp-dark)] truncate ${
          mono ? 'tabular-nums font-semibold' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}
