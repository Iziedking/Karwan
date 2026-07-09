'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
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
import { AgentResearchCard } from '@/features/reputation/components/AgentResearchCard';
import { SmeCompanyBand } from '@/features/profile/components/SmeCompanyBand';
import { RegisterBusinessBand } from '@/features/profile/components/RegisterBusinessBand';
import { ProfileEmailButton } from '@/features/profile/components/ProfileEmailButton';
import { SME_TRADES_ENABLED } from '@/features/profile/config';
import { isBusinessAccount } from '@/features/account/accountKind';
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
  const t = useTranslations().profile;
  const navT = useTranslations().nav;
  const router = useRouter();
  const { profile: loadedProfile, address, isConnected, fetchState } = useUserProfile();
  const { method } = useAuth();
  const isCircleUser = method === 'circle';
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const activation = useActivation();
  const [activationOpen, setActivationOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('identity');
  // Agent money is one surface with two modes, so only one card shows at a
  // time instead of two dense cards side by side.
  const [moneyMode, setMoneyMode] = useState<'add' | 'out'>('add');

  const TABS: Tab[] = [
    { id: 'identity', label: t.tabs.identity, hash: 'identity' },
    { id: 'wallets', label: t.tabs.wallets, hash: 'wallets' },
    { id: 'agents', label: t.tabs.agents, hash: 'agents' },
    { id: 'preferences', label: t.tabs.preferences, hash: 'preferences' },
  ];

  useEffect(() => setProfile(loadedProfile), [loadedProfile]);

  // Drive tab active state from scroll position.
  useEffect(() => {
    if (!isConnected) return;
    const ids = ['identity', 'wallets', 'agents', 'preferences'];
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
              {/* Username/company in its natural case (not the display all-caps)
                  and allowed to wrap so a long handle never overflows. */}
              <HeroHeadline className="break-words">
                <span className="normal-case" title={heroTitle}>{heroDisplay}</span>
                <Punc>.</Punc>
              </HeroHeadline>
            </div>
            {isBusiness && (bizSector || bizRegion) && (
              <div className="fade-up fade-up-1 mt-3 flex flex-wrap items-center gap-2">
                {bizSector && (
                  <span
                    className="mono text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-1 bg-white/[0.08] text-white/80"
                    style={{ borderRadius: 3 }}
                  >
                    {bizSector}
                  </span>
                )}
                {bizRegion && (
                  <span
                    className="mono text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-1 bg-white/[0.08] text-white/80"
                    style={{ borderRadius: 3 }}
                  >
                    {bizRegion}
                  </span>
                )}
              </div>
            )}
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
                <>
                  <CTAPill href={editHref} variant="secondary" tone="dark">
                    {t.hero.editDetailsCta}
                  </CTAPill>
                  {/* Company trade card is the business's second edit surface;
                      ?edit=company opens the band in edit mode and scrolls to it. */}
                  {isBusiness && (
                    <Link
                      href="/profile?edit=company"
                      scroll={false}
                      className="mono text-[11px] uppercase tracking-[0.12em] text-white/55 hover:text-white transition-colors"
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
            {/* Persistent tier card. your reputation right at the top of the profile. */}
            <ProfileTierCard address={address} />
          </div>
          <div className="fade-up fade-up-4 mt-8 lg:mt-0">
            {/* The hero stays focused on identity + reputation. Agent status and
                its wallet addresses live in the ACTIVATION + AGENT DETAILS bands
                below (and the eyebrow's live dot already signals activation), so
                the old agent vignette here was redundant and crowded the top.
                Top up / Withdraw stays: the Arc money-movement utility, surfaced
                on the profile since it is no longer a nav item. */}
            <a
              href="/bridge"
              data-guide="profile-topup"
              className="group block p-5 border border-white/15 hover:border-[var(--lp-accent)] transition-colors"
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
                <span aria-hidden className="text-white/40 group-hover:text-[var(--lp-accent)] transition-colors">
                  →
                </span>
              </div>
              <p className="mt-2 font-sans text-[18px] font-extrabold uppercase tracking-[-0.02em] leading-none text-white">
                {navT.topUpWithdraw}
              </p>
              <p className="mt-2 text-[13px] leading-snug text-white/55">{navT.topUpBlurb}</p>
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
      <div data-guide="profile-nav" className="contents">
        <StickyTabStrip
          tabs={TABS}
          active={activeTab}
          onChange={setActiveTab}
          onDark={false}
        />
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
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <SectionTag>{t.agentProfiles.tag}</SectionTag>
                {/* The ranges editor is the same for a business and an individual.
                    A business's hero EDIT DETAILS opens the company trade card, so
                    this is the entry point that reaches the agent ranges for them
                    (and a handy second one for individuals). */}
                <CTAPill href="/profile/edit" variant="secondary" tone="light">
                  {t.agentProfiles.editRanges}
                </CTAPill>
              </div>
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

      {/* WALLETS anchor */}
      <div id="wallets" aria-hidden style={{ scrollMarginTop: 80 }} />

      {/* HOLDINGS */}
      <Band tone="light" compact>
        <div className="flex items-center gap-2">
          <SectionTag>{t.holdings.tag}</SectionTag>
          <Hint glow side="bottom" align="start">{t.holdings.body}</Hint>
        </div>
        <HeroHeadline size="md">
          {t.holdings.headlinePrefix}<Accent>{t.holdings.headlineAccent}</Accent>
          <Punc>.</Punc>
        </HeroHeadline>
        <div className="mt-10" data-guide="profile-wallets">
          <WalletsPanel address={address ?? undefined} />
        </div>
        {/* Multi-chain breakdown, folded by default: the same holdings spread
            across chains, kept with the wallet holdings instead of a separate
            band lower down. */}
        <div className="mt-5" data-guide="profile-balances">
          <BalancesCard buyerAgent={agents.buyer} sellerAgent={agents.seller} />
        </div>
      </Band>

      {/* AGENTS anchor */}
      <div id="agents" aria-hidden style={{ scrollMarginTop: 80 }} />

      {/* FUND + WITHDRAW */}
      <Band tone="dark" compact>
        <div className="flex items-center gap-2">
          <SectionTag tone="dark">{t.agentTreasury.tag}</SectionTag>
          <Hint glow side="bottom" align="start">{t.agentTreasury.body}</Hint>
        </div>
        <HeroHeadline size="md">
          {t.agentTreasury.headlineFund}<Punc>.</Punc> {t.agentTreasury.headlineWithdraw}<Punc>.</Punc>
        </HeroHeadline>
        {activation.activated ? (
          <>
            {/* One surface, two modes: a toggle swaps between adding money and
                cashing out, so the page shows a single card, not two. */}
            <div
              className="mt-8 inline-flex p-1 gap-1"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.14)',
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
                    className={`px-4 py-1.5 mono text-[11px] font-bold uppercase tracking-[0.1em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] ${
                      on ? 'bg-[var(--lp-accent)] text-[var(--lp-band-dark)]' : 'text-white/60 hover:text-white'
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
            <div className="mt-5 max-w-[640px]" data-guide="profile-agents">
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
            <div className="mt-5 max-w-[640px]">
              <AgentResearchCard />
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
      </Band>

      {/* PREFERENCES anchor */}
      <div id="preferences" aria-hidden style={{ scrollMarginTop: 80 }} />

      {/* PREFERENCES. Reach pipes the agent uses to ping you. */}
      <Band tone="light" compact>
        <div className="flex items-center gap-2">
          <SectionTag>{t.preferences.tag}</SectionTag>
          <Hint glow side="bottom" align="start">{t.preferences.body}</Hint>
        </div>
        <HeroHeadline size="md">
          {t.preferences.headline}<Punc>.</Punc>
        </HeroHeadline>
        <div className="mt-8 flex flex-wrap items-center gap-3" data-guide="profile-preferences">
          {address && <ProfileEmailButton address={address} tone="light" />}
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

