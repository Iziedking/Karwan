'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { SignInGate } from '@/shared/components/SignInGate';
import { StickyTabStrip, type Tab } from '@/shared/components/skill';
import { useActivation } from '@/shared/hooks/useActivation';
import { ActivationModal } from '@/shared/components/ActivationModal';
import { shortAddress } from '@/shared/utils/format';
import { RoleToggle } from '@/features/profile/components/RoleToggle';
import { ArcFundCard } from '@/features/profile/components/ArcFundCard';
import { AgentWithdrawCard } from '@/features/profile/components/AgentWithdrawCard';
import { ConnectXButton } from '@/features/profile/components/ConnectXButton';
import { BalancesCard } from '@/features/balances/components/BalancesCard';
import { BridgeCard } from '@/features/bridge/components/BridgeCard';
import { TelegramConnectButton } from '@/features/telegram/components/TelegramConnectButton';
import { ReputationBadge } from '@/features/reputation/components/ReputationBadge';
import { StakeCard } from '@/features/reputation/components/StakeCard';
import { PendingMatchesBand } from '@/features/notifications/components/PendingMatchesBand';
import { PageTour } from '@/shared/guide/PageTour';
import { PROFILE_TOUR_ID, buildProfileSteps } from '@/shared/guide/tours';
import { useAuth } from '@/shared/hooks/useAuth';
import { type UserProfile } from '@/core/api';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  Accent,
  AddressPill,
  CTAPill,
  PageCard,
} from '@/shared/components/Bands';

const TABS: Tab[] = [
  { id: 'identity', label: 'IDENTITY', hash: 'identity' },
  { id: 'wallets', label: 'WALLETS', hash: 'wallets' },
  { id: 'agents', label: 'AGENTS', hash: 'agents' },
  { id: 'stake', label: 'STAKE', hash: 'stake' },
  { id: 'preferences', label: 'PREFERENCES', hash: 'preferences' },
];

export default function ProfilePage() {
  const router = useRouter();
  const { profile: loadedProfile, address, isConnected, fetchState } = useUserProfile();
  const { method } = useAuth();
  const isCircleUser = method === 'circle';
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const activation = useActivation();
  const [activationOpen, setActivationOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('identity');

  useEffect(() => setProfile(loadedProfile), [loadedProfile]);

  // Drive tab active state from scroll position.
  useEffect(() => {
    if (!isConnected) return;
    const ids = TABS.map((t) => t.hash).filter(Boolean) as string[];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActiveTab(visible[0].target.id);
      },
      { threshold: [0.2, 0.5, 0.8], rootMargin: '-100px 0px -40% 0px' },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [isConnected]);

  const agents = {
    buyer: activation.agents?.buyer,
    seller: activation.agents?.seller,
  };
  const defaultAgent: 'buyer' | 'seller' = profile?.role === 'seller' ? 'seller' : 'buyer';

  if (!isConnected) {
    return (
      <SignInGate
        variant="page"
        tag="PROFILE"
        body="Profiles are keyed to your wallet. Sign in to set up buyer and seller agents."
      />
    );
  }

  if (fetchState === 'error') {
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <div className="max-w-[44ch]">
            <SectionTag tone="dark">PROFILE</SectionTag>
            <HeroHeadline size="md">
              Could not load profile
              <Punc>.</Punc>
            </HeroHeadline>
            <p className="mt-6 text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
              Try again in a moment.
            </p>
          </div>
        </Band>
      </FullBleed>
    );
  }

  if (fetchState === 'idle' || fetchState === 'loading') {
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <div className="space-y-4 max-w-[44ch]">
            <div className="h-3 w-32 rounded bg-white/[0.08] animate-pulse motion-reduce:animate-none" />
            <div className="h-12 w-64 rounded bg-white/[0.08] animate-pulse motion-reduce:animate-none" />
            <div className="h-3 w-48 rounded bg-white/[0.08] animate-pulse motion-reduce:animate-none" />
          </div>
        </Band>
      </FullBleed>
    );
  }

  return (
    <FullBleed>
      <PageTour id={PROFILE_TOUR_ID} steps={buildProfileSteps(isCircleUser)} />
      {/* HERO */}
      <Band tone="dark" overlay={<GridOverlay />}>
        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-12 items-center">
          <div className="min-w-0">
            <div className="fade-up">
              <SectionTag tone="dark" dot={activation.activated ? 'live' : undefined}>
                PROFILE
              </SectionTag>
            </div>
            <div className="fade-up fade-up-1">
              <HeroHeadline>
                {profile ? profile.displayName : 'Your wallet'}
                <Punc>.</Punc>
              </HeroHeadline>
            </div>
            <div className="fade-up fade-up-2 mt-6 flex flex-wrap items-center gap-3">
              {address && <AddressPill address={shortAddress(address)} tone="dark" />}
              {profile && (
                <span className="mono text-[11px] uppercase tracking-[0.12em] text-white/45">
                  Updated {new Date(profile.updatedAt).toLocaleDateString()}
                </span>
              )}
            </div>
            <div className="fade-up fade-up-3 mt-7 flex flex-wrap items-center gap-3">
              {profile ? (
                <CTAPill href="/onboarding?edit=1" variant="secondary" tone="dark">
                  Edit details
                </CTAPill>
              ) : (
                <CTAPill href="/onboarding">Set up profile</CTAPill>
              )}
              <div className="flex items-center gap-2">
                <ConnectXButton />
                <TelegramConnectButton address={address ?? undefined} />
              </div>
            </div>
          </div>
          <div className="hidden lg:block fade-up fade-up-4">
            <AgentStatusVignette
              activated={activation.activated}
              loading={activation.loading}
              buyer={agents.buyer}
              seller={agents.seller}
            />
          </div>
        </div>
      </Band>

      <div data-guide="profile-nav">
        <StickyTabStrip tabs={TABS} active={activeTab} onChange={setActiveTab} />
      </div>

      {/* PENDING MATCHES. high-priority surface; renders nothing when empty. */}
      <PendingMatchesBand tone="light" headline="Pending matches" />

      {/* IDENTITY section anchor. Also contains ACTIVATION + ROLE blocks below. */}
      <div id="identity" aria-hidden style={{ scrollMarginTop: 80 }} />

      {/* ACTIVATION */}
      <Band tone="light" compact>
        <div className="grid md:grid-cols-[1fr_auto] gap-6 items-end" data-guide="profile-identity">
          <div className="max-w-[52ch]">
            <SectionTag dot={activation.activated ? 'live' : undefined}>
              {activation.activated ? 'AGENT WALLETS' : 'NOT ACTIVATED'}
            </SectionTag>
            <HeroHeadline size="md">
              {activation.activated ? (
                <>
                  Agents <Accent>active</Accent>
                  <Punc>.</Punc>
                </>
              ) : (
                <>
                  Activate to <Accent>begin</Accent>
                  <Punc>.</Punc>
                </>
              )}
            </HeroHeadline>
            <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)]">
              {activation.activated
                ? 'Buyer and seller wallets sign every on-chain action. Fund or withdraw below.'
                : 'Activation provisions buyer and seller Circle wallets for this address.'}
            </p>
          </div>
          {!activation.activated && !activation.loading && (
            <CTAPill onClick={() => setActivationOpen(true)}>Activate agents</CTAPill>
          )}
        </div>
      </Band>

      {/* ROLE + AGENT DETAILS */}
      {profile ? (
        <>
          <Band tone="light" compact>
            <SectionTag>ACCOUNT TYPE</SectionTag>
            <HeroHeadline size="md">
              Pick your <Accent>role</Accent>
              <Punc>.</Punc>
            </HeroHeadline>
            <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[46ch]">
              Switch any time. Run both at once.
            </p>
            <div className="mt-8">
              <PageCard>
                <div className="p-6 md:p-8">
                  <RoleToggle profile={profile} onUpdate={setProfile} />
                </div>
              </PageCard>
            </div>
          </Band>

          {(profile.buyer || profile.seller) && (
            <Band tone="light" compact>
              <SectionTag>AGENT PROFILES</SectionTag>
              <HeroHeadline size="md">
                Agent <Accent>ranges</Accent>
                <Punc>.</Punc>
              </HeroHeadline>
              <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[46ch]">
                Ranges agents respect on every brief.
              </p>
              <div className="mt-10 grid md:grid-cols-2 gap-5">
                {profile.buyer && (
                  <AgentBlock
                    role="Buyer"
                    agentAddress={agents.buyer}
                    rows={[
                      { label: 'Max budget', value: `${profile.buyer.maxBudgetUsdc} USDC`, mono: true },
                      {
                        label: 'Deadline',
                        value: `${profile.buyer.minDeadlineDays}-${profile.buyer.maxDeadlineDays} days`,
                        mono: true,
                      },
                      { label: 'Bid window', value: `${profile.buyer.bidCollectionSeconds}s`, mono: true },
                      {
                        label: 'Milestones',
                        value: profile.buyer.milestonePcts.join(' / ') || '-',
                        mono: true,
                      },
                    ]}
                  />
                )}
                {profile.seller && (
                  <AgentBlock
                    role="Seller"
                    agentAddress={agents.seller}
                    rows={[
                      { label: 'Skills', value: profile.seller.skills.join(', ') || '-' },
                      { label: 'Bio', value: profile.seller.bio || '-' },
                      {
                        label: 'Budget',
                        value: `${profile.seller.minBudgetUsdc}-${profile.seller.maxBudgetUsdc} USDC`,
                        mono: true,
                      },
                      {
                        label: 'Delivery',
                        value: `${profile.seller.minDeadlineDays}-${profile.seller.maxDeadlineDays} days`,
                        mono: true,
                      },
                    ]}
                  />
                )}
              </div>
            </Band>
          )}
        </>
      ) : (
        <Band tone="light" compact>
          <SectionTag>NO PROFILE YET</SectionTag>
          <HeroHeadline size="md">
            Set one <Accent>up</Accent>
            <Punc>.</Punc>
          </HeroHeadline>
          <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[52ch]">
            A profile sets your display name and unlocks managed deals. Direct deals and agent wallets work without one.
          </p>
          <div className="mt-7">
            <CTAPill href="/onboarding">Set up profile</CTAPill>
          </div>
        </Band>
      )}

      {/* WALLETS anchor */}
      <div id="wallets" aria-hidden style={{ scrollMarginTop: 80 }} />

      {/* HOLDINGS + BRIDGE */}
      <Band tone="light" compact>
        <SectionTag>HOLDINGS</SectionTag>
        <HeroHeadline size="md">
          Move <Accent>USDC</Accent>
          <Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[46ch]">
          Wallet balances. Base to Arc bridge.
        </p>
        <div className="mt-10 grid lg:grid-cols-2 gap-5" data-guide="profile-wallets">
          <BalancesCard buyerAgent={agents.buyer} sellerAgent={agents.seller} />
          <BridgeCard mintRecipient={agents.buyer as `0x${string}` | undefined} tour={false} />
        </div>
      </Band>

      {/* AGENTS anchor */}
      <div id="agents" aria-hidden style={{ scrollMarginTop: 80 }} />

      {/* FUND + WITHDRAW */}
      <Band tone="dark" compact>
        <SectionTag tone="dark">AGENT TREASURY</SectionTag>
        <HeroHeadline size="md">
          Fund<Punc>.</Punc> Withdraw<Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[46ch]">
          Top up the wallet that signs your deals. Sweep it back any time.
        </p>
        <div className="mt-10 grid lg:grid-cols-2 gap-5" data-guide="profile-agents">
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
      </Band>

      {/* STAKING anchor */}
      <div id="stake" aria-hidden style={{ scrollMarginTop: 80 }} />

      {/* STAKE — vault deposits + cool-down + tier badge. */}
      <Band tone="light" compact>
        <SectionTag>STAKE</SectionTag>
        <HeroHeadline size="md">
          Earn <Accent>reputation</Accent>
          <Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[46ch]">
          Deposit USDC into KarwanVault. The longer it sits, the more reputation it earns. 7-day cool-down on withdrawal.
        </p>
        <div className="mt-10" data-guide="profile-stake">
          <StakeCard tour={false} />
        </div>
      </Band>

      {/* PREFERENCES anchor */}
      <div id="preferences" aria-hidden style={{ scrollMarginTop: 80 }} />

      {/* PREFERENCES. Reach pipes the agent uses to ping you. */}
      <Band tone="light" compact>
        <SectionTag>PREFERENCES</SectionTag>
        <HeroHeadline size="md">
          Reach pipes<Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[46ch]">
          Connect Telegram and X so the agent can ping you when a deal needs you.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <TelegramConnectButton address={address ?? undefined} tone="light" />
          <ConnectXButton tone="light" />
        </div>
      </Band>


      <ActivationModal
        open={activationOpen}
        onClose={() => setActivationOpen(false)}
        activate={activation.activate}
        activating={activation.activating}
        error={activation.error}
        activated={activation.activated}
        agents={activation.agents}
      />
    </FullBleed>
  );
}

type AgentRow = { label: string; value: string; mono?: boolean };

function AgentBlock({
  role,
  agentAddress,
  rows,
}: {
  role: 'Buyer' | 'Seller';
  agentAddress: string | undefined;
  rows: AgentRow[];
}) {
  return (
    <div
      className="group relative overflow-hidden transition-[transform,box-shadow] duration-300 ease-out card-shimmer hover:-translate-y-1"
      style={{
        background: 'var(--lp-card)',
        border: '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        borderBottomLeftRadius: 22,
        borderBottomRightRadius: 5,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 12px 32px -16px rgba(0,0,0,0.10)',
      }}
    >
      <div className="p-6 md:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              [:AGENT:]
            </span>
            <h3 className="mt-2 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] leading-none text-[var(--lp-dark)]">
              {role}
            </h3>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {agentAddress && (
              <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                {shortAddress(agentAddress)}
              </span>
            )}
            <ReputationBadge address={agentAddress} size="sm" withDetail />
          </div>
        </div>
        <div className="mt-5 divide-y divide-[var(--lp-border-light)]">
          {rows.map((r) => (
            <div
              key={r.label}
              className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
            >
              <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] shrink-0">
                {r.label}
              </span>
              <span
                className={`text-right text-[13px] text-[var(--lp-dark)] truncate ${
                  r.mono ? 'mono tabular-nums font-medium' : 'font-sans'
                }`}
              >
                {r.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentStatusVignette({
  activated,
  loading,
  buyer,
  seller,
}: {
  activated: boolean;
  loading: boolean;
  buyer?: string;
  seller?: string;
}) {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        background: 'var(--surface-1)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        borderBottomLeftRadius: 22,
        borderBottomRightRadius: 4,
      }}
    >
      <div className="px-6 pt-6 pb-5 border-b border-white/[0.08]">
        <div className="flex items-center justify-between">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-white/55">
            Agent status
          </span>
          {activated ? (
            <span
              aria-hidden
              data-instrument-blink
              className="w-[7px] h-[7px]"
              style={{
                background: 'var(--lp-accent)',
                animation: 'instrumentBlink 1.6s ease-in-out infinite',
              }}
            />
          ) : (
            <span aria-hidden className="w-[7px] h-[7px] rounded-full bg-white/30" />
          )}
        </div>
        <p className="mt-4 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] text-white">
          {loading ? (
            'Checking...'
          ) : (
            <>
              Wallets{' '}
              <span style={{ color: activated ? 'var(--lp-accent)' : 'rgba(255,255,255,0.5)' }}>
                {activated ? 'live' : 'idle'}
              </span>
            </>
          )}
        </p>
        <p className="mt-1.5 text-[12px] text-white/55 leading-relaxed">
          {activated
            ? 'Buyer and seller wallets provisioned. Signing on chain.'
            : 'Activate below to provision agent wallets.'}
        </p>
      </div>
      <div className="grid grid-cols-2 divide-x divide-white/[0.08]">
        <div className="px-4 py-4 min-w-0">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-white/45">Buyer agent</p>
          <p className="mt-1.5 mono text-[12px] tabular-nums text-white truncate">
            {buyer ? shortAddress(buyer) : '-'}
          </p>
        </div>
        <div className="px-4 py-4 min-w-0">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-white/45">Seller agent</p>
          <p className="mt-1.5 mono text-[12px] tabular-nums text-white truncate">
            {seller ? shortAddress(seller) : '-'}
          </p>
        </div>
      </div>
    </div>
  );
}
