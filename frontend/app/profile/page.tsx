'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { StickyTabStrip, type Tab } from '@/shared/components/skill';
import { useActivation } from '@/shared/hooks/useActivation';
import { ActivationModal } from '@/shared/components/ActivationModal';
import { shortAddress } from '@/shared/utils/format';
import { ArcFundCard } from '@/features/profile/components/ArcFundCard';
import { AgentWithdrawCard } from '@/features/profile/components/AgentWithdrawCard';
import { ConnectXButton } from '@/features/profile/components/ConnectXButton';
import { BalancesCard } from '@/features/balances/components/BalancesCard';
import { WalletsPanel } from '@/features/balances/components/WalletsPanel';
import { TelegramConnectButton } from '@/features/telegram/components/TelegramConnectButton';
import { ReputationBadge } from '@/features/reputation/components/ReputationBadge';
import { TierCelebration } from '@/features/reputation/components/TierCelebration';
import { ProfileTierCard } from '@/features/reputation/components/ProfileTierCard';
import { AgentResearchCard } from '@/features/reputation/components/AgentResearchCard';
import { AgentTrustEvidenceCard } from '@/features/reputation/components/AgentTrustEvidenceCard';
import { SmeCompanyBand } from '@/features/profile/components/SmeCompanyBand';
import { RegisterBusinessBand } from '@/features/profile/components/RegisterBusinessBand';
import { ProfileEmailButton } from '@/features/profile/components/ProfileEmailButton';
import { SME_TRADES_ENABLED } from '@/features/profile/config';
import { isBusinessAccount } from '@/features/account/accountKind';
import { AccountKindBadge } from '@/features/account/AccountKindBadge';
import { VerificationStatusCard } from '@/features/account/VerificationStatusCard';
import { ProfileOpenDealsPanel } from '@/features/notifications/components/ProfileOpenDealsPanel';
import { useOpenDeals } from '@/features/notifications/hooks/useOpenDeals';
import { ProfileDeck, type DeckPanel } from '@/shared/components/ProfileDeck';
import { MoneyStrip } from '@/features/balances/components/MoneyStrip';
import { PageTour } from '@/shared/guide/PageTour';
import { useGuide } from '@/shared/guide/GuideProvider';
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
  CTAPill,
  PageCard,
} from '@/shared/components/Bands';
import { Hint } from '@/shared/components/Hint';

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
  const navT = messages.nav;
  const walletsCopy = messages.walletsPanel;
  const router = useRouter();
  const { profile: loadedProfile, address, fetchState } = useUserProfile();
  const { method } = useAuth();
  const isCircleUser = method === 'circle';
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const activation = useActivation();
  const openDeals = useOpenDeals();
  const [activationOpen, setActivationOpen] = useState(false);
  // Wallets are the first landing surface so new users can see the available
  // wallets and reach the faucet before navigating into other profile areas.
  const [activeTab, setActiveTab] = useState<string>('wallets');
  const { active: activeTour } = useGuide();
  // Agent money is one surface with two modes, so only one card shows at a
  // time instead of two dense cards side by side.
  const [moneyMode, setMoneyMode] = useState<'add' | 'out'>('add');
  const [activeAgentSlide, setActiveAgentSlide] = useState(0);
  const agentCarouselRef = useRef<HTMLDivElement>(null);

  const TABS: Tab[] = [
    { id: 'wallets', label: t.tabs.wallets, hash: 'wallets' },
    { id: 'money', label: messages.moneyStrip.eyebrow, hash: 'money' },
    ...(openDeals.hasOpenDeals
      ? [{
          id: 'open-deals',
          label: t.tabs.openDeals,
          hash: 'open-deals',
          count: openDeals.totalCount,
          attention: openDeals.hasAction,
        }]
      : []),
    { id: 'agents', label: t.tabs.agents, hash: 'agents' },
    { id: 'identity', label: t.tabs.identity, hash: 'identity' },
    { id: 'preferences', label: t.tabs.preferences, hash: 'preferences' },
  ];

  useEffect(() => setProfile(loadedProfile), [loadedProfile]);

  // Deep links still work. The assistant sends people to /profile#wallets and
  // /profile#agents after an action, and QuickStartBand links #identity. Those
  // used to resolve as scroll anchors; with a deck they have to select a panel
  // instead, or the link lands on the page and shows the wrong thing.
  //
  // `company` maps to identity because the company band lives inside that
  // panel: a business's EDIT DETAILS points there.
  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.replace('#', '');
      if (!h) return;
      const key = h === 'company' ? 'identity' : h;
      if (['money', 'identity', 'open-deals', 'wallets', 'agents', 'preferences'].includes(key)) {
        setActiveTab(key === 'open-deals' && !openDeals.hasOpenDeals ? 'identity' : key);
      }
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, [openDeals.hasOpenDeals]);

  useEffect(() => {
    if (activeTab === 'open-deals' && !openDeals.hasOpenDeals) setActiveTab('identity');
  }, [activeTab, openDeals.hasOpenDeals]);

  // Keep the URL in step so the panel someone is looking at is the one they
  // share. replaceState rather than push: paging through four panels should not
  // bury the page they arrived from under four history entries.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash === `#${activeTab}`) return;
    window.history.replaceState(null, '', `#${activeTab}`);
  }, [activeTab]);

  // Tour steps point into different deck panels. Select the owning panel before
  // the overlay looks for its target so every spotlight lands on a real element.
  useEffect(() => {
    if (activeTour?.id !== PROFILE_TOUR_ID) return;
    const target = activeTour.steps[activeTour.index]?.target;
    const panel =
      target === 'profile-faucet' || target === 'profile-wallets' || target === 'profile-balances'
        ? 'wallets'
        : target === 'profile-agents'
          ? 'agents'
          : target === 'profile-preferences'
            ? 'preferences'
            : 'identity';
    setActiveTab(panel);
  }, [activeTour?.id, activeTour?.index, activeTour?.steps]);

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

  // Business accounts read as a company, not a person: the title comes from the
  // structured company name (the freeform displayName often has the whole
  // "Name, sector, region" string crammed in), with sector + region as chips.
  // Use the canonical predicate (accountKind OR accountType OR business.status),
  // not accountKind alone: business registration sets accountType, so the strict
  // accountKind check rendered every business as an individual.
  const isBusiness = isBusinessAccount(profile);
  const heroTitle =
    (isBusiness ? profile?.smeProfile?.companyName?.trim() : '') ||
    (profile ? profile.displayName : t.hero.fallbackName);
  // A length cap can't stop a long unbroken token (a 30-char handle is under
  // the limit), so bound how the name RENDERS: trim an over-long value with an
  // ellipsis so it can never dominate the hero. break-words handles the rest;
  // the full value stays on the title tooltip.
  const heroDisplay = heroTitle.length > 28 ? `${heroTitle.slice(0, 28).trimEnd()}…` : heroTitle;
  const bizSector = isBusiness ? profile?.smeProfile?.sector : undefined;
  const bizRegion = isBusiness ? profile?.smeProfile?.region?.trim() : undefined;
  // Everyone's primary EDIT DETAILS opens the same flow: the profile editor with
  // the agent ranges (budgets, deadlines, skills, milestones). A business gets a
  // second, lighter action to edit its company trade card (name, sector, region),
  // which ?edit=company opens in place. The individual editor hides the display-
  // name field for a business, so the two name surfaces never overlap.
  const editHref = '/profile/edit';

  /// The four panels of the deck.
  ///
  /// Content is the same as the old scrolling sections, with the full-bleed
  /// Band wrappers replaced by padding: a Band positions itself at left-1/2
  /// with w-bleed, which escapes a card. The AGENTS panel keeps its dark tone,
  /// carried by the card instead of by a section.
  const deckPanels: DeckPanel[] = [
    {
      key: 'money',
      label: messages.moneyStrip.eyebrow,
      content: <MoneyStrip embedded />,
    },
    {
      key: 'identity',
      label: t.tabs.identity,
      content: (
        <div data-guide="profile-identity">
        {/* SETUP is a desk ledger, not another dashboard. One compact header
            explains the job of the page; the numbered rows below carry the
            real account state and controls. */}
        <div className="border-b border-[var(--lp-border-light)] px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          <SectionTag>{t.tabs.identity}</SectionTag>
          <h2 className="mt-3 font-sans text-[28px] font-extrabold uppercase leading-none tracking-[-0.035em] text-[var(--lp-dark)] sm:text-[36px]">
            {t.tabs.identity}<Punc>.</Punc>
          </h2>
          <p className="mt-3 max-w-[52ch] text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
            {t.agentProfiles.body}
          </p>
        </div>

        {/* One-shot tier-up congrats. renders nothing unless a 48h window is open. */}
        <div className="px-4 pt-4 md:px-8">
          <TierCelebration address={address} />
        </div>

        {/* [:01] stays visible after activation so users can still read the
            desk state; only the corrective action decays. */}
        <div className="border-b border-[var(--lp-border-light)] px-4 py-4 sm:px-6 lg:px-8">
          <div className="grid gap-4 sm:grid-cols-[48px_minmax(0,1fr)_auto] sm:items-center">
            <span className="mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
              [:01]
            </span>
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

        {/* ROLE + AGENT DETAILS */}
        {profile ? (
          <>
            {(profile.buyer || profile.seller) && (
              <div className="px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
                        [:02]
                      </span>
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
                    [:{t.agentProfiles.headsUpEyebrow}:] {t.agentProfiles.headsUpBody}
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
          <RegisterBusinessBand address={address} />
        ) : null}
        {SME_TRADES_ENABLED && address && isBusiness ? (
          <SmeCompanyBand address={address} fallbackName={profile?.displayName} />
        ) : null}
        </div>
      ),
    },
    ...(openDeals.hasOpenDeals && address
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
        } satisfies DeckPanel]
      : []),
    {
      key: 'wallets',
      label: t.tabs.wallets,
      content: (
        <>
        {/* HOLDINGS */}
        <div className="px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          <div className="flex items-center gap-2">
            <SectionTag>{t.holdings.tag}</SectionTag>
            <Hint glow side="bottom" align="start">
              {isCircleUser ? walletsCopy.intro.circle : walletsCopy.intro.web3}
            </Hint>
          </div>
          <h2 className="mt-3 font-sans text-[28px] sm:text-[36px] font-extrabold uppercase tracking-[-0.035em] leading-none text-[var(--lp-dark)]">
            {t.holdings.headlinePrefix}<Accent>{t.holdings.headlineAccent}</Accent>
            <Punc>.</Punc>
          </h2>
          <div className="mt-5" data-guide="profile-wallets">
            <WalletsPanel address={address ?? undefined} />
          </div>
          {/* Multi-chain breakdown, folded by default: the same holdings spread
              across chains, kept with the wallet holdings instead of a separate
              band lower down. */}
          <div className="mt-5" data-guide="profile-balances">
            <BalancesCard buyerAgent={agents.buyer} sellerAgent={agents.seller} />
          </div>
        </div>
        </>
      ),
    },
    {
      key: 'agents',
      label: t.tabs.agents,
      content: (
        <>
        {/* FUND + WITHDRAW */}
        <div className="px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          <div className="flex items-center gap-2">
            <SectionTag>{t.agentTreasury.tag}</SectionTag>
            <Hint glow side="bottom" align="start">{t.agentTreasury.body}</Hint>
          </div>
          <h2 className="mt-3 font-sans text-[28px] sm:text-[36px] font-extrabold uppercase tracking-[-0.035em] leading-none text-[var(--lp-dark)]">
            Agent money<Punc>.</Punc>
          </h2>
          {activation.activated ? (
            <>
              {/* One surface, two modes: a toggle swaps between adding money and
                  cashing out, so the page shows a single card, not two. */}
              <div
                className="mt-8 grid w-full grid-cols-2 gap-1 p-1 sm:inline-grid sm:w-auto"
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
          <div className="flex items-center gap-2">
            <SectionTag>{t.preferences.tag}</SectionTag>
            <Hint glow side="bottom" align="start">{t.preferences.body}</Hint>
          </div>
          <h2 className="mt-3 font-sans text-[28px] sm:text-[36px] font-extrabold uppercase tracking-[-0.035em] leading-none text-[var(--lp-dark)]">
            {t.preferences.headline}<Punc>.</Punc>
          </h2>
          <div
            className="mt-6 overflow-hidden border-y border-[var(--lp-border-light)]"
            data-guide="profile-preferences"
          >
            <ContactRow index="01" label="Email">
              {address && <ProfileEmailButton address={address} tone="light" />}
            </ContactRow>
            <ContactRow index="02" label="Telegram">
              <TelegramConnectButton address={address ?? undefined} tone="light" />
            </ContactRow>
            <ContactRow index="03" label="X">
              <ConnectXButton tone="light" />
            </ContactRow>
          </div>
        </div>
        </>
      ),
    },
  ];

  // Keep the deck sequence aligned with the user's work sequence even though
  // the setup panel is defined earlier in this file for readability.
  const deckPanelsInOrder = ['wallets', 'money', 'open-deals', 'agents', 'identity', 'preferences']
    .map((key) => deckPanels.find((panel) => panel.key === key))
    .filter((panel): panel is DeckPanel => Boolean(panel));

  return (
    <FullBleed>
      <PageTour id={PROFILE_TOUR_ID} steps={buildProfileSteps(isCircleUser)} />
      {/* HERO */}
      <Band tone="dark" overlay={<GridOverlay />} compact>
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:items-start lg:gap-14">
          <div className="min-w-0">
            <div className="fade-up">
              <SectionTag tone="dark" dot={activation.activated ? 'live' : undefined}>
                {t.hero.sectionTag}
              </SectionTag>
            </div>
            <div className="fade-up fade-up-1">
              {/* Username/company in its natural case (not the display all-caps)
                  and allowed to wrap so a long handle never overflows. */}
              <HeroHeadline size="md" className="break-words">
                <span className="normal-case" title={heroTitle}>{heroDisplay}</span>
                <Punc>.</Punc>
              </HeroHeadline>
            </div>
            {isBusiness && (bizSector || bizRegion) && (
              <div className="fade-up fade-up-1 mt-3 flex flex-wrap items-center gap-2">
                {bizSector && (
                  <span
                    className="mono text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-1 bg-[var(--lp-workspace-soft)] text-[var(--lp-workspace-ink)]"
                    style={{ borderRadius: 3 }}
                  >
                    {bizSector}
                  </span>
                )}
                {bizRegion && (
                  <span
                    className="mono text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-1 bg-[var(--lp-workspace-soft)] text-[var(--lp-workspace-ink)]"
                    style={{ borderRadius: 3 }}
                  >
                    {bizRegion}
                  </span>
                )}
              </div>
            )}
            <div className="fade-up fade-up-2 mt-6 flex flex-wrap items-center gap-3">
              {/* Detailed here: an unverified business says so in the badge
                  rather than hiding it behind a hover title. */}
              {profile && <AccountKindBadge profile={profile} detailed tone="dark" />}
              {address && (
                <a
                  href={`/credit-passport/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden"
                >
                  {t.hero.publicPassport}
                </a>
              )}
              {profile && (
                <span className="hidden">
                  {t.hero.updatedPrefix} {new Date(profile.updatedAt).toLocaleDateString()}
                </span>
              )}
            </div>
            <div className="fade-up fade-up-3 mt-7 flex flex-wrap items-center gap-3">
              {profile ? (
                <>
                  <CTAPill href="/bridge" tone="dark">
                    {navT.topUpWithdraw}
                  </CTAPill>
                  <Link href={editHref} className="mono -mx-2 inline-flex min-h-11 items-center px-2 text-[11px] uppercase tracking-[0.12em] text-[var(--lp-workspace-muted)] transition-colors hover:text-[var(--lp-workspace-ink)]">
                    {t.hero.editDetailsCta}
                  </Link>
                  {/* Company trade card is the business's second edit surface;
                      ?edit=company opens the band in edit mode and scrolls to it. */}
                  {isBusiness && (
                    <Link
                      href="/profile?edit=company"
                      scroll={false}
                      className="mono -mx-2 inline-flex min-h-11 items-center px-2 text-[11px] uppercase tracking-[0.12em] text-[var(--lp-workspace-muted)] transition-colors hover:text-[var(--lp-workspace-ink)]"
                    >
                      {t.hero.editCompanyCta}
                    </Link>
                  )}
                </>
              ) : (
                <CTAPill href="/onboarding">{t.hero.setUpProfileCta}</CTAPill>
              )}
              {/* Email / X / Telegram connect live once, in the labeled
                  PREFERENCES band below; the hero stays identity + one action. */}
            </div>
          </div>
          <aside className="min-w-0 lg:pt-2" aria-label={t.tabs.identity}>
            <ProfileTierCard address={address} />
            {address && <VerificationStatusCard address={address} />}
          </aside>
          <div className="hidden">
            {/* The hero stays focused on identity + reputation. Agent status and
                its wallet addresses live in the ACTIVATION + AGENT DETAILS bands
                below (and the eyebrow's live dot already signals activation), so
                the old agent vignette here was redundant and crowded the top.
                Top up / Withdraw stays: the Arc money-movement utility, surfaced
                on the profile since it is no longer a nav item. */}
            <a
              href="/bridge"
              data-guide="profile-topup"
              className="group block p-5 border border-[var(--lp-workspace-border)] hover:border-[var(--lp-accent)] transition-colors"
              style={{
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                borderBottomLeftRadius: 16,
                borderBottomRightRadius: 4,
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-accent)]">
                  [:USDC:]
                </span>
                <span aria-hidden className="text-[var(--lp-workspace-faint)] group-hover:text-[var(--lp-accent)] transition-colors">
                  →
                </span>
              </div>
              <p className="mt-2 font-sans text-[18px] font-extrabold uppercase tracking-[-0.02em] leading-none text-[var(--lp-workspace-ink)]">
                {navT.topUpWithdraw}
              </p>
              <p className="mt-2 text-[13px] leading-snug text-[var(--lp-workspace-muted)]">{navT.topUpBlurb}</p>
            </a>
          </div>
        </div>
      </Band>

      {/* `display: contents` on the data-guide wrapper so the wrapper doesn't
          create a short sticky scope for the StickyTabStrip. Without this,
          position: sticky scoped to a parent that's only as tall as the
          strip itself. The strip released the instant the user scrolled,
          which read as "hides on scroll". Landing-page strip works because
          it sits directly under a full-height wrapper. The DOM node is
          preserved so the coachmark tour can still anchor to it.
          `onDark={false}` because the strip lives at the boundary between
          the profile hero (dark) and the cream content below. The default
          dark variant rendered as pure black where it overlapped the hero,
          which the user flagged as wrong. Cream-frosted surface reads as
          frosted on both backgrounds. */}
      {/* Wallets lead the profile deck so the first landing surface explains
          where balances live and how to reach the faucet. */}
      <div data-guide="profile-nav" className="contents">
        <StickyTabStrip
          tabs={TABS}
          active={activeTab}
          onChange={setActiveTab}
          onDark={false}
          contentMaxWidth={1040}
        />
      </div>

      {/* One controlled mode at a time. The sticky strip provides random access;
          the deck provides explicit previous/next controls and a guarded mobile
          swipe. Only the active panel mounts, so hidden wallet panels cannot run
          reads or capture gestures. */}
      <Band tone="light" compact>
        <ProfileDeck panels={deckPanelsInOrder} activeKey={activeTab} onChange={setActiveTab} />
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

function ContactRow({
  index,
  label,
  children,
}: {
  index: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-[88px] gap-3 border-b border-[var(--lp-border-light)] px-1 py-4 last:border-b-0 sm:grid-cols-[48px_minmax(0,1fr)_minmax(0,auto)] sm:items-center sm:gap-4 sm:px-0">
      <span className="mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
        [:{index}]
      </span>
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden className="size-1.5 shrink-0 bg-[var(--lp-accent)]" />
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
                [:{eyebrow}:]
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
