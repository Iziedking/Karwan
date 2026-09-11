'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { useActivation } from '@/shared/hooks/useActivation';
import { ActivationModal } from '@/shared/components/ActivationModal';
import { shortAddress } from '@/shared/utils/format';
import { ArcFundCard } from '@/features/profile/components/ArcFundCard';
import { AgentWithdrawCard } from '@/features/profile/components/AgentWithdrawCard';
import { ConnectXButton } from '@/features/profile/components/ConnectXButton';
import { WalletsPanel } from '@/features/balances/components/WalletsPanel';
import { TelegramConnectButton } from '@/features/telegram/components/TelegramConnectButton';
import { ReputationBadge } from '@/features/reputation/components/ReputationBadge';
import { TierCelebration } from '@/features/reputation/components/TierCelebration';
import { AgentResearchCard } from '@/features/reputation/components/AgentResearchCard';
import { AgentTrustEvidenceCard } from '@/features/reputation/components/AgentTrustEvidenceCard';
import { SmeCompanyBand } from '@/features/profile/components/SmeCompanyBand';
import { RegisterBusinessBand } from '@/features/profile/components/RegisterBusinessBand';
import { ProfileEmailButton } from '@/features/profile/components/ProfileEmailButton';
import { SME_TRADES_ENABLED } from '@/features/profile/config';
import { ProfileOpenDealsPanel } from '@/features/notifications/components/ProfileOpenDealsPanel';
import { useOpenDeals } from '@/features/notifications/hooks/useOpenDeals';
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
  CTAPill,
} from '@/shared/components/Bands';
import { Hint } from '@/shared/components/Hint';
import { ProfileAccountHub } from '@/features/profile/components/ProfileAccountHub';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';

type ProfileSection = 'wallets' | 'open-deals' | 'agents' | 'identity' | 'preferences';

const PROFILE_SECTION_BY_PATH: Record<string, ProfileSection> = {
  '/profile/wallets': 'wallets',
  '/profile/open-deals': 'open-deals',
  '/profile/agent-funds': 'agents',
  '/profile/setup': 'identity',
  '/profile/contact': 'preferences',
};

const PROFILE_ROUTE_BY_PANEL = {
  wallets: '/profile/wallets',
  money: '/account',
  'open-deals': '/profile/open-deals',
  agents: '/profile/agent-funds',
  identity: '/profile/setup',
  preferences: '/profile/contact',
} as const;

const PROFILE_HASH_ROUTE: Record<string, string> = {
  wallets: PROFILE_ROUTE_BY_PANEL.wallets,
  money: PROFILE_ROUTE_BY_PANEL.money,
  'open-deals': PROFILE_ROUTE_BY_PANEL['open-deals'],
  agents: PROFILE_ROUTE_BY_PANEL.agents,
  identity: PROFILE_ROUTE_BY_PANEL.identity,
  company: `${PROFILE_ROUTE_BY_PANEL.identity}?edit=company`,
  preferences: PROFILE_ROUTE_BY_PANEL.preferences,
};

const PROFILE_SECTION_TITLE: Record<ProfileSection, string> = {
  wallets: 'Wallets',
  'open-deals': 'Open deals',
  agents: 'Agent funds',
  identity: 'Account setup',
  preferences: 'Contact details',
};

type ProfilePanel = {
  key: ProfileSection;
  label: string;
  content: React.ReactNode;
};

export default function ProfilePage() {
  const t = useTranslations().profile;
  return (
    <AuthGuard gateTag={t.signInGate.tag} gateBody={t.signInGate.body}>
      <ProfilePageInner />
    </AuthGuard>
  );
}

function ProfilePageInner() {
  const messages = useTranslations();
  const t = messages.profile;
  const router = useRouter();
  const pathname = usePathname();
  const activeSection = PROFILE_SECTION_BY_PATH[pathname] ?? null;
  const { profile: loadedProfile, address, fetchState } = useUserProfile();
  const { isBusinessWorkspace } = useWorkspaceContext();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const activation = useActivation();
  const openDeals = useOpenDeals();
  const [activationOpen, setActivationOpen] = useState(false);
  const [moneyMode, setMoneyMode] = useState<'add' | 'out'>('add');
  const [activeAgentSlide, setActiveAgentSlide] = useState(0);
  const agentCarouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => setProfile(loadedProfile), [loadedProfile]);

  // Preserve existing assistant, email, and bookmark links while removing the
  // hash-controlled profile deck. Each old destination now resolves to a real
  // page with normal browser history and document scrolling.
  useEffect(() => {
    if (pathname !== '/profile') return;
    const hash = window.location.hash.slice(1);
    const destination = PROFILE_HASH_ROUTE[hash];
    if (destination) router.replace(destination);
  }, [pathname, router]);

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
            <div className="h-3 w-32 rounded bg-[var(--lp-workspace-soft)] animate-pulse motion-reduce:animate-none" />
            <div className="h-12 w-64 rounded bg-[var(--lp-workspace-soft)] animate-pulse motion-reduce:animate-none" />
            <div className="h-3 w-48 rounded bg-[var(--lp-workspace-soft)] animate-pulse motion-reduce:animate-none" />
          </div>
        </Band>
      </FullBleed>
    );
  }

  const isBusiness = isBusinessWorkspace;

  const profilePanels: ProfilePanel[] = [
    {
      key: 'identity',
      label: t.tabs.identity,
      content: (
        <div data-guide="profile-identity">
        {/* One-shot tier-up congrats. renders nothing unless a 48h window is open. */}
        <div className="px-4 pt-5 md:px-8">
          <TierCelebration address={address} />
        </div>

        {/* [:01] stays visible after activation so users can still read the
            desk state; only the corrective action decays. */}
        <div className="border-b border-[var(--lp-border-light)] px-4 py-4 sm:px-6 lg:px-8">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <p className="mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--lp-dark)]">
                {t.agentStatus.eyebrow}
              </p>
              <p className="mt-1.5 max-w-[58ch] text-[13px] leading-relaxed text-[var(--lp-text-sub)]">
                {activation.loading
                  ? t.agentStatus.checking
                  : activation.activated
                    ? `${t.agentStatus.buyerFallback} / ${t.agentStatus.sellerFallback} · ${t.agentStatus.walletsLive}`
                    : t.activation.inactiveBody}
              </p>
            </div>
            <div className="flex min-h-11 items-center sm:justify-end">
              {!activation.loading && !activation.activated ? (
                <CTAPill onClick={() => setActivationOpen(true)}>{t.activation.cta}</CTAPill>
              ) : !activation.loading ? (
                <span className="mono inline-flex min-h-11 items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--lp-accent-deep)]">
                  <span aria-hidden className="size-1.5 bg-[var(--lp-accent)]" />
                  {t.agentStatus.walletsLive}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Business setup is the first required action for a business workspace.
            Keep it above agent preferences and company trade details so the
            registration path is visible as soon as the workspace opens. */}
        {SME_TRADES_ENABLED && address && isBusiness ? (
          <div data-guide="profile-business-verification">
            <RegisterBusinessBand address={address} />
          </div>
        ) : null}

        {/* ROLE + AGENT DETAILS */}
        {profile ? (
          <>
            {(profile.buyer || profile.seller) && (
              <div className="px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2">
                      <SectionTag>{t.agentProfiles.tag}</SectionTag>
                      <Hint glow side="bottom" align="start">
                        {t.agentProfiles.body}
                      </Hint>
                    </div>
                    <h2 className="mt-3 font-sans text-[28px] sm:text-[34px] font-extrabold uppercase tracking-[-0.035em] leading-[0.95] text-[var(--lp-dark)]">
                      {t.agentProfiles.headlinePrefix}<Accent>{t.agentProfiles.headlineAccent}</Accent><Punc>.</Punc>
                    </h2>
                    <p className="mt-2 max-w-[52ch] text-[13px] leading-relaxed text-[var(--lp-text-sub)]">
                      {t.agentProfiles.body}
                    </p>
                  </div>
                  {/* The ranges editor is the same for a business and an individual.
                      A business's hero EDIT DETAILS opens the company trade card, so
                      this is the entry point that reaches the agent ranges for them
                      (and a handy second one for individuals). */}
                  <CTAPill href="/profile/edit" variant="secondary" tone="light">
                    {t.agentProfiles.editRanges}
                  </CTAPill>
                </div>
                {!activation.activated && (
                  <p
                    className="mt-3 mono text-[11px] uppercase tracking-[0.12em] leading-relaxed max-w-[52ch]"
                    style={{ color: '#b25425' }}
                  >
                    {t.agentProfiles.headsUpEyebrow}: {t.agentProfiles.headsUpBody}
                  </p>
                )}
                <div
                  className={`mt-5 hidden items-start gap-3 sm:gap-4 md:grid ${
                    profile.buyer && profile.seller
                      ? 'lg:grid-cols-2'
                      : 'mx-auto w-full max-w-[760px] grid-cols-1'
                  }`}
                >
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
                        {
                          label: isBusiness
                            ? t.agentProfiles.rows.supplies
                            : t.agentProfiles.rows.skills,
                          value: profile.seller.skills.join(', ') || '-',
                        },
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
                <div className="mt-5 md:hidden">
                  <div
                    ref={agentCarouselRef}
                    data-deck-swipe-lock
                    className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    onScroll={(event) => {
                      const slideWidth = event.currentTarget.clientWidth + 12;
                      const next = Math.round(event.currentTarget.scrollLeft / slideWidth);
                      setActiveAgentSlide(Math.max(0, Math.min(1, next)));
                    }}
                    aria-label="Agent profiles"
                  >
                    {profile.buyer && (
                      <div className="min-w-full snap-start">
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
                            {
                              label: t.agentProfiles.rows.milestones,
                              value: profile.buyer.milestonePcts.join(' / ') || '-',
                              mono: true,
                            },
                          ]}
                        />
                      </div>
                    )}
                    {profile.seller && (
                      <div className="min-w-full snap-start">
                        <AgentBlock
                          eyebrow={t.agentProfiles.sellerEyebrow}
                          fallbackName={t.agentProfiles.sellerFallback}
                          name={activation.agents?.sellerName}
                          agentAddress={agents.seller}
                          rows={[
                            {
                              label: isBusiness
                                ? t.agentProfiles.rows.supplies
                                : t.agentProfiles.rows.skills,
                              value: profile.seller.skills.join(', ') || '-',
                            },
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
                      </div>
                    )}
                  </div>
                  {profile.buyer && profile.seller && (
                    <div className="mt-3 flex items-center justify-center gap-1" aria-label="Agent profile position">
                      {[t.agentProfiles.buyerFallback, t.agentProfiles.sellerFallback].map((label, index) => (
                        <button
                          key={label}
                          type="button"
                          className="flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)]"
                          aria-label={`Show ${label.toLowerCase()} profile`}
                          aria-current={activeAgentSlide === index ? 'true' : undefined}
                          onClick={() => {
                            const carousel = agentCarouselRef.current;
                            if (!carousel) return;
                            carousel.scrollTo({ left: index * (carousel.clientWidth + 12), behavior: 'smooth' });
                            setActiveAgentSlide(index);
                          }}
                        >
                          <span
                            className={`h-2 w-2 rounded-full transition-colors duration-200 ${
                              activeAgentSlide === index ? 'bg-[var(--lp-accent)]' : 'bg-[var(--lp-text-muted)]/45'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="px-4 py-5 md:px-8 md:py-7">
            <SectionTag>{t.noProfile.tag}</SectionTag>
            <HeroHeadline size="md" as="h2">
              {t.noProfile.headlinePrefix}<Accent>{t.noProfile.headlineAccent}</Accent>
              <Punc>.</Punc>
            </HeroHeadline>
            <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[52ch]">
              {t.noProfile.body}
            </p>
            <div className="mt-7">
              <CTAPill href="/onboarding">{t.noProfile.cta}</CTAPill>
            </div>
          </div>
        )}

        {/* BUSINESS + COMPANY PROFILE. Only for accounts that chose the business
            kind at onboarding; an individual account never sees these. Gated by
            the SME rail too. Register-as-business gates the verified tag; the
            company band holds the trade card. Independent components so editing
            one re-renders nothing else on this page. */}
        {/* Company section anchor: a business's EDIT DETAILS scrolls here. */}
        <div id="company" aria-hidden style={{ scrollMarginTop: 80 }} />
        {SME_TRADES_ENABLED && address && isBusiness ? (
          <SmeCompanyBand address={address} fallbackName={profile?.displayName} />
        ) : null}
        </div>
      ),
    },
    ...(address
      ? [{
          key: 'open-deals',
          label: t.tabs.openDeals,
          content: (
            <ProfileOpenDealsPanel
              address={address}
              matches={openDeals.matches}
              directDeals={openDeals.directDeals}
              fetchState={openDeals.fetchState}
              onRetry={openDeals.refresh}
            />
          ),
        } satisfies ProfilePanel]
      : []),
    {
      key: 'wallets',
      label: t.tabs.wallets,
      content: (
        <div className="px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          <div data-guide="profile-wallets">
            <WalletsPanel address={address ?? undefined} />
          </div>
        </div>
      ),
    },
    {
      key: 'agents',
      label: t.tabs.agents,
      content: (
        <>
        {/* FUND + WITHDRAW */}
        <div className="px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          {activation.activated ? (
            <>
              {/* One surface, two modes: a toggle swaps between adding money and
                  cashing out, so the page shows a single card, not two. */}
              <div
                className="grid w-full grid-cols-2 gap-1 p-1 sm:inline-grid sm:w-auto"
                style={{
                  background: 'var(--lp-light)',
                  border: '1px solid var(--lp-border-light)',
                  borderTopLeftRadius: 9,
                  borderTopRightRadius: 9,
                  borderBottomLeftRadius: 9,
                  borderBottomRightRadius: 2,
                }}
              >
                {(['add', 'out'] as const).map((mode) => {
                  const on = moneyMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setMoneyMode(mode)}
                      aria-pressed={on}
                      className={`min-w-0 px-2.5 py-2 mono text-[10px] font-bold uppercase tracking-[0.07em] leading-tight transition-colors sm:px-4 sm:py-1.5 sm:text-[11px] sm:tracking-[0.1em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] ${
                        on ? 'bg-[var(--lp-accent)] text-[var(--lp-band-dark)]' : 'text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)]'
                      }`}
                      style={{
                        borderTopLeftRadius: 7,
                        borderTopRightRadius: 7,
                        borderBottomLeftRadius: 7,
                        borderBottomRightRadius: 2,
                      }}
                    >
                      {mode === 'add' ? t.agentTreasury.headlineFund : t.agentTreasury.headlineWithdraw}
                    </button>
                  );
                })}
              </div>
              {/* The split surfaces share one row so the Agent Funds page reads as
                  one composed workspace. The shared deck frame handles any
                  taller content with an internal scroll instead of changing card
                  height between panels. */}
              <div className="mt-4 grid min-w-0 grid-cols-1 items-stretch gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
                <div className="min-w-0 h-full" data-guide="profile-agents">
                  {moneyMode === 'add' ? (
                    <ArcFundCard
                      buyerAgent={agents.buyer}
                      sellerAgent={agents.seller}
                      defaultAgent={defaultAgent}
                    />
                  ) : (
                    <AgentWithdrawCard
                      buyerAgent={agents.buyer}
                      sellerAgent={agents.seller}
                      defaultAgent={defaultAgent}
                    />
                  )}
                </div>
                <div className="min-w-0 h-full">
                  <AgentResearchCard />
                  <div className="mt-4">
                    <AgentTrustEvidenceCard />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="mt-10 max-w-[640px]" data-guide="profile-agents">
              <ArcFundCard
                buyerAgent={agents.buyer}
                sellerAgent={agents.seller}
                defaultAgent={defaultAgent}
              />
            </div>
          )}
        </div>
        </>
      ),
    },
    {
      key: 'preferences',
      label: t.tabs.preferences,
      content: (
        <>
        {/* PREFERENCES. Reach pipes the agent uses to ping you. */}
        <div className="px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          <div
            className="overflow-hidden border-y border-[var(--lp-border-light)]"
            data-guide="profile-preferences"
          >
            <ContactRow label="Email">
              {address && <ProfileEmailButton address={address} tone="light" />}
            </ContactRow>
            <ContactRow label="Telegram">
              <TelegramConnectButton address={address ?? undefined} tone="light" />
            </ContactRow>
            <ContactRow label="X">
              <ConnectXButton tone="light" />
            </ContactRow>
          </div>
        </div>
        </>
      ),
    },
  ];

  const activePanel = activeSection
    ? profilePanels.find((panel) => panel.key === activeSection)
    : null;

  if (!activeSection && !profile) {
    return (
      <main className="product-surface min-h-[calc(100vh-72px)] bg-[var(--lp-light)] px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-[760px]">
          <h1 className="text-[clamp(2.25rem,5vw,4rem)] font-semibold leading-none tracking-[-0.05em] text-[var(--lp-dark)]">
            Set up your profile
          </h1>
          <p className="mt-3 text-[15px] text-[var(--lp-text-sub)]">Create your profile before you start trading.</p>
          <Link
            href="/onboarding"
            className="mt-6 inline-flex min-h-11 items-center rounded-full bg-[var(--lp-accent)] px-5 text-[14px] font-bold text-[var(--lp-band-dark)]"
          >
            Continue
          </Link>
        </div>
      </main>
    );
  }

  if (!activeSection && profile && address) {
    return (
      <ProfileAccountHub
        profile={profile}
        address={address}
        hasOpenDeals={openDeals.hasOpenDeals}
        hasAction={openDeals.hasAction}
      />
    );
  }

  if (!activePanel) return null;

  return (
    <main className="profile-route product-surface min-h-[calc(100vh-72px)] bg-[var(--lp-light)] px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
      <div className="mx-auto max-w-[1120px]">
        <header className="border-b border-[var(--lp-border-light)] pb-5 sm:pb-6">
          <h1 className="text-[clamp(2.25rem,5vw,4.25rem)] font-semibold leading-[0.98] tracking-[-0.055em] text-[var(--lp-dark)]">
            {PROFILE_SECTION_TITLE[activeSection]}
          </h1>
        </header>
        <section className="mt-5 overflow-hidden rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] shadow-[0_18px_50px_-42px_rgba(0,0,0,0.38)]">
          {activePanel.content}
        </section>
      </div>

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
    </main>
  );
}

type AgentRow = { label: string; value: string; mono?: boolean };

function ContactRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-[76px] gap-3 border-b border-[var(--lp-border-light)] px-1 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,auto)] sm:items-center sm:gap-4 sm:px-0">
      <div className="flex min-w-0 items-center gap-3">
        <span className="font-sans text-[17px] font-extrabold uppercase tracking-[-0.02em] text-[var(--lp-dark)]">
          {label}
        </span>
      </div>
      <div className="flex min-h-11 min-w-0 max-w-full items-center sm:justify-end [&>*]:max-w-full">
        {children}
      </div>
    </div>
  );
}

// Keep each range card content-sized so the shorter buyer profile does not
// inherit the seller card's height and leave a large empty panel behind.
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
  const [expanded, setExpanded] = useState(false);
  const summaryRows = rows.filter((row) => row.mono).slice(0, 2);
  const detailsId = `agent-details-${eyebrow.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return (
    <div
      className="group relative overflow-hidden transition-[border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-px"
      style={{
        background: 'var(--lp-card)',
        border: '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        borderBottomLeftRadius: 16,
        borderBottomRightRadius: 4,
        boxShadow: '0 1px 0 rgba(0,0,0,0.04), 0 10px 24px -20px rgba(0,0,0,0.20)',
      }}
    >
      <div className="border-b border-[var(--lp-border-light)] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[var(--lp-accent)]" />
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded((value) => !value)}
            className="group/trigger flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2"
          >
            <span className="min-w-0">
              <span className="block mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
                {eyebrow}
              </span>
              <span className="mt-1 block truncate font-sans text-[18px] font-extrabold uppercase tracking-[-0.025em] leading-none text-[var(--lp-dark)]">
                {name || fallbackName}
              </span>
            </span>
            <span
              aria-hidden
              className={`shrink-0 text-[18px] text-[var(--lp-text-muted)] transition-transform duration-200 motion-reduce:transition-none ${
                expanded ? 'rotate-90' : ''
              }`}
            >
              ›
            </span>
          </button>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {agentAddress && (
              <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                {shortAddress(agentAddress)}
              </span>
            )}
            <ReputationBadge address={agentAddress} size="sm" withDetail />
          </div>
        </div>
        {summaryRows.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 ps-[15px]">
            {summaryRows.map((row) => (
              <span key={row.label} className="mono text-[10px] uppercase tracking-[0.1em] text-[var(--lp-text-muted)]">
                {row.value}
              </span>
            ))}
          </div>
        )}
      </div>
      <div
        id={detailsId}
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
          expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
        aria-hidden={!expanded}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="grid gap-2 p-4 sm:grid-cols-2 sm:p-5">
            {rows.map((r) => (
              <div
                key={r.label}
                className="min-w-0 rounded-[10px] border border-[var(--lp-border-light)] bg-[var(--lp-light)] px-3 py-2.5"
              >
                <span className="block mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                  {r.label}
                </span>
                <span
                  className={`mt-1 block text-start text-[13px] leading-snug text-[var(--lp-dark)] break-words ${
                    r.mono ? 'font-sans tabular-nums font-semibold tracking-[-0.01em]' : 'font-sans'
                  }`}
                >
                  {r.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
