'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { StickyTabStrip, type Tab } from '@/shared/components/skill';
import { useActivation } from '@/shared/hooks/useActivation';
import { ActivationModal } from '@/shared/components/ActivationModal';
import { shortAddress } from '@/shared/utils/format';
import { RoleToggle } from '@/features/profile/components/RoleToggle';
import { ArcFundCard } from '@/features/profile/components/ArcFundCard';
import { AgentWithdrawCard } from '@/features/profile/components/AgentWithdrawCard';
import { ConnectXButton } from '@/features/profile/components/ConnectXButton';
import { BalancesCard } from '@/features/balances/components/BalancesCard';
import { WalletsPanel } from '@/features/balances/components/WalletsPanel';
import { TelegramConnectButton } from '@/features/telegram/components/TelegramConnectButton';
import { ReputationBadge } from '@/features/reputation/components/ReputationBadge';
import { TierCelebration } from '@/features/reputation/components/TierCelebration';
import { ProfileTierCard } from '@/features/reputation/components/ProfileTierCard';
import { StakeCard } from '@/features/reputation/components/StakeCard';
import { PendingMatchesBand } from '@/features/notifications/components/PendingMatchesBand';
import { PendingDealsBand } from '@/features/notifications/components/PendingDealsBand';
import { PageTour } from '@/shared/guide/PageTour';
import { PROFILE_TOUR_ID, buildProfileSteps } from '@/shared/guide/tours';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
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

export default function ProfilePage() {
  const t = useTranslations().profile;
  return (
    <AuthGuard gateTag={t.signInGate.tag} gateBody={t.signInGate.body}>
      <ProfilePageInner />
    </AuthGuard>
  );
}

function ProfilePageInner() {
  const t = useTranslations().profile;
  const router = useRouter();
  const { profile: loadedProfile, address, isConnected, fetchState } = useUserProfile();
  const { method } = useAuth();
  const isCircleUser = method === 'circle';
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const activation = useActivation();
  const [activationOpen, setActivationOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('identity');

  const TABS: Tab[] = [
    { id: 'identity', label: t.tabs.identity, hash: 'identity' },
    { id: 'wallets', label: t.tabs.wallets, hash: 'wallets' },
    { id: 'agents', label: t.tabs.agents, hash: 'agents' },
    { id: 'stake', label: t.tabs.stake, hash: 'stake' },
    { id: 'preferences', label: t.tabs.preferences, hash: 'preferences' },
  ];

  useEffect(() => setProfile(loadedProfile), [loadedProfile]);

  // Drive tab active state from scroll position.
  useEffect(() => {
    if (!isConnected) return;
    const ids = ['identity', 'wallets', 'agents', 'stake', 'preferences'];
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

  if (fetchState === 'error') {
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <div className="max-w-[44ch]">
            <SectionTag tone="dark">{t.loadError.tag}</SectionTag>
            <HeroHeadline size="md">
              {t.loadError.title}
              <Punc>.</Punc>
            </HeroHeadline>
            <p className="mt-6 text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
              {t.loadError.body}
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
                {t.hero.sectionTag}
              </SectionTag>
            </div>
            <div className="fade-up fade-up-1">
              <HeroHeadline>
                {profile ? profile.displayName : t.hero.fallbackName}
                <Punc>.</Punc>
              </HeroHeadline>
            </div>
            <div className="fade-up fade-up-2 mt-6 flex flex-wrap items-center gap-3">
              {address && <AddressPill address={shortAddress(address)} tone="dark" />}
              {address && (
                <a
                  href={`/credit-passport/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-accent)] hover:underline"
                >
                  {t.hero.publicPassport}
                </a>
              )}
              {profile && (
                <span className="mono text-[11px] uppercase tracking-[0.12em] text-white/45">
                  {t.hero.updatedPrefix} {new Date(profile.updatedAt).toLocaleDateString()}
                </span>
              )}
            </div>
            <div className="fade-up fade-up-3 mt-7 flex flex-wrap items-center gap-3">
              {profile ? (
                <CTAPill href="/onboarding?edit=1" variant="secondary" tone="dark">
                  {t.hero.editDetailsCta}
                </CTAPill>
              ) : (
                <CTAPill href="/onboarding">{t.hero.setUpProfileCta}</CTAPill>
              )}
              <div className="flex items-center gap-2">
                <ConnectXButton />
                <TelegramConnectButton address={address ?? undefined} />
              </div>
            </div>
            {/* Persistent tier card. your reputation right at the top of the profile. */}
            <ProfileTierCard address={address} />
          </div>
          <div className="hidden lg:block fade-up fade-up-4">
            <AgentStatusVignette
              activated={activation.activated}
              loading={activation.loading}
              buyer={agents.buyer}
              seller={agents.seller}
              buyerName={activation.agents?.buyerName}
              sellerName={activation.agents?.sellerName}
            />
          </div>
        </div>
      </Band>

      {/* `display: contents` on the data-guide wrapper so the wrapper doesn't
          create a short sticky scope for the StickyTabStrip. Without this,
          position: sticky scoped to a parent that's only as tall as the
          strip itself — the strip released the instant the user scrolled,
          which read as "hides on scroll". Landing-page strip works because
          it sits directly under a full-height wrapper. The DOM node is
          preserved so the coachmark tour can still anchor to it. */}
      <div data-guide="profile-nav" className="contents">
        <StickyTabStrip tabs={TABS} active={activeTab} onChange={setActiveTab} />
      </div>

      {/* PENDING MATCHES + DEALS AWAITING ACTION. At-a-glance surfaces only.
          The full book lives on /app home; profile keeps the action surfaces. */}
      <PendingMatchesBand tone="light" />
      <PendingDealsBand tone="light" />

      {/* IDENTITY section anchor. Also contains ACTIVATION + ROLE blocks below. */}
      <div id="identity" aria-hidden style={{ scrollMarginTop: 80 }} />

      {/* ACTIVATION */}
      <Band tone="light" compact>
        {/* One-shot tier-up congrats. renders nothing unless a 48h window is open. */}
        <TierCelebration address={address} />
        <div className="grid md:grid-cols-[1fr_auto] gap-6 items-end" data-guide="profile-identity">
          <div className="max-w-[52ch]">
            <SectionTag dot={activation.activated ? 'live' : undefined}>
              {activation.activated ? t.activation.activatedTag : t.activation.inactiveTag}
            </SectionTag>
            <HeroHeadline size="md">
              {activation.activated ? (
                <>
                  {t.activation.activatedHeadlinePrefix}
                  <Accent>{t.activation.activatedHeadlineAccent}</Accent>
                  <Punc>.</Punc>
                </>
              ) : (
                <>
                  {t.activation.inactiveHeadlinePrefix}
                  <Accent>{t.activation.inactiveHeadlineAccent}</Accent>
                  <Punc>.</Punc>
                </>
              )}
            </HeroHeadline>
            <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)]">
              {activation.activated ? t.activation.activatedBody : t.activation.inactiveBody}
            </p>
          </div>
          {!activation.activated && !activation.loading && (
            <CTAPill onClick={() => setActivationOpen(true)}>{t.activation.cta}</CTAPill>
          )}
        </div>
      </Band>

      {/* ROLE + AGENT DETAILS */}
      {profile ? (
        <>
          <Band tone="light" compact>
            <SectionTag>{t.accountType.tag}</SectionTag>
            <HeroHeadline size="md">
              {t.accountType.headlinePrefix}<Accent>{t.accountType.headlineAccent}</Accent>
              <Punc>.</Punc>
            </HeroHeadline>
            <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[46ch]">
              {t.accountType.body}
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
              <SectionTag>{t.agentProfiles.tag}</SectionTag>
              <HeroHeadline size="md">
                {t.agentProfiles.headlinePrefix}<Accent>{t.agentProfiles.headlineAccent}</Accent>
                <Punc>.</Punc>
              </HeroHeadline>
              <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[46ch]">
                {t.agentProfiles.body}
              </p>
              {!activation.activated && (
                <p
                  className="mt-3 mono text-[11px] uppercase tracking-[0.12em] leading-relaxed max-w-[52ch]"
                  style={{ color: '#b25425' }}
                >
                  [:{t.agentProfiles.headsUpEyebrow}:] {t.agentProfiles.headsUpBody}
                </p>
              )}
              <div className="mt-10 grid md:grid-cols-2 gap-5">
                {profile.buyer && (
                  <AgentBlock
                    eyebrow={t.agentProfiles.buyerEyebrow}
                    fallbackName={t.agentProfiles.buyerFallback}
                    name={activation.agents?.buyerName}
                    agentAddress={agents.buyer}
                    rows={[
                      { label: t.agentProfiles.rows.maxBudget, value: `${profile.buyer.maxBudgetUsdc} USDC`, mono: true },
                      {
                        label: t.agentProfiles.rows.deadline,
                        value: `${profile.buyer.minDeadlineDays}-${profile.buyer.maxDeadlineDays} ${t.agentProfiles.daysSuffix}`,
                        mono: true,
                      },
                      { label: t.agentProfiles.rows.bidWindow, value: `${profile.buyer.bidCollectionSeconds}s`, mono: true },
                      {
                        label: t.agentProfiles.rows.milestones,
                        value: profile.buyer.milestonePcts.join(' / ') || '-',
                        mono: true,
                      },
                    ]}
                  />
                )}
                {profile.seller && (
                  <AgentBlock
                    eyebrow={t.agentProfiles.sellerEyebrow}
                    fallbackName={t.agentProfiles.sellerFallback}
                    name={activation.agents?.sellerName}
                    agentAddress={agents.seller}
                    rows={[
                      { label: t.agentProfiles.rows.skills, value: profile.seller.skills.join(', ') || '-' },
                      { label: t.agentProfiles.rows.bio, value: profile.seller.bio || '-' },
                      {
                        label: t.agentProfiles.rows.budget,
                        value: `${profile.seller.minBudgetUsdc}-${profile.seller.maxBudgetUsdc} USDC`,
                        mono: true,
                      },
                      {
                        label: t.agentProfiles.rows.delivery,
                        value: `${profile.seller.minDeadlineDays}-${profile.seller.maxDeadlineDays} ${t.agentProfiles.daysSuffix}`,
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
          <SectionTag>{t.noProfile.tag}</SectionTag>
          <HeroHeadline size="md">
            {t.noProfile.headlinePrefix}<Accent>{t.noProfile.headlineAccent}</Accent>
            <Punc>.</Punc>
          </HeroHeadline>
          <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[52ch]">
            {t.noProfile.body}
          </p>
          <div className="mt-7">
            <CTAPill href="/onboarding">{t.noProfile.cta}</CTAPill>
          </div>
        </Band>
      )}

      {/* WALLETS anchor */}
      <div id="wallets" aria-hidden style={{ scrollMarginTop: 80 }} />

      {/* HOLDINGS */}
      <Band tone="light" compact>
        <SectionTag>{t.holdings.tag}</SectionTag>
        <HeroHeadline size="md">
          {t.holdings.headlinePrefix}<Accent>{t.holdings.headlineAccent}</Accent>
          <Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[46ch]">
          {t.holdings.body}
        </p>
        <div className="mt-10">
          <WalletsPanel address={address ?? undefined} />
        </div>
        <div className="mt-5" data-guide="profile-wallets">
          <BalancesCard buyerAgent={agents.buyer} sellerAgent={agents.seller} />
        </div>
      </Band>

      {/* AGENTS anchor */}
      <div id="agents" aria-hidden style={{ scrollMarginTop: 80 }} />

      {/* FUND + WITHDRAW */}
      <Band tone="dark" compact>
        <SectionTag tone="dark">{t.agentTreasury.tag}</SectionTag>
        <HeroHeadline size="md">
          {t.agentTreasury.headlineFund}<Punc>.</Punc> {t.agentTreasury.headlineWithdraw}<Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[46ch]">
          {t.agentTreasury.body}
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
        <SectionTag>{t.stake.tag}</SectionTag>
        <HeroHeadline size="md">
          {t.stake.headlinePrefix}<Accent>{t.stake.headlineAccent}</Accent>
          <Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[46ch]">
          {t.stake.body}
        </p>
        <div className="mt-10" data-guide="profile-stake">
          <StakeCard tour={false} />
        </div>
      </Band>

      {/* PREFERENCES anchor */}
      <div id="preferences" aria-hidden style={{ scrollMarginTop: 80 }} />

      {/* PREFERENCES. Reach pipes the agent uses to ping you. */}
      <Band tone="light" compact>
        <SectionTag>{t.preferences.tag}</SectionTag>
        <HeroHeadline size="md">
          {t.preferences.headline}<Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[46ch]">
          {t.preferences.body}
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
        renameAgents={activation.renameAgents}
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
  eyebrow,
  fallbackName,
  name,
  agentAddress,
  rows,
}: {
  eyebrow: string;
  fallbackName: string;
  name?: string;
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
              [:{eyebrow}:]
            </span>
            <h3 className="mt-2 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] leading-none text-[var(--lp-dark)]">
              {name || fallbackName}
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
                className={`text-end text-[13px] text-[var(--lp-dark)] truncate ${
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
  buyerName,
  sellerName,
}: {
  activated: boolean;
  loading: boolean;
  buyer?: string;
  seller?: string;
  buyerName?: string;
  sellerName?: string;
}) {
  const t = useTranslations().profile.agentStatus;
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
            {t.eyebrow}
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
            t.checking
          ) : (
            <>
              {t.walletsPrefix}{' '}
              <span style={{ color: activated ? 'var(--lp-accent)' : 'rgba(255,255,255,0.5)' }}>
                {activated ? t.walletsLive : t.walletsIdle}
              </span>
            </>
          )}
        </p>
        <p className="mt-1.5 text-[12px] text-white/55 leading-relaxed">
          {activated ? t.activatedBody : t.inactiveBody}
        </p>
      </div>
      <div className="grid grid-cols-2 divide-x divide-white/[0.08]">
        <div className="px-4 py-4 min-w-0">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-white/45 truncate">
            {buyerName || t.buyerFallback}
          </p>
          <p className="mt-1.5 mono text-[12px] tabular-nums text-white truncate">
            {buyer ? shortAddress(buyer) : '-'}
          </p>
        </div>
        <div className="px-4 py-4 min-w-0">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-white/45 truncate">
            {sellerName || t.sellerFallback}
          </p>
          <p className="mt-1.5 mono text-[12px] tabular-nums text-white truncate">
            {seller ? shortAddress(seller) : '-'}
          </p>
        </div>
      </div>
    </div>
  );
}
